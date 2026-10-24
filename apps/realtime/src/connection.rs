use std::{
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::extract::ws::{Message, Utf8Bytes, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{mpsc, oneshot};
use tracing::debug;

use crate::{
    identity::{TokenSigner, new_player_id, normalize_nickname},
    protocol::{ClientMessage, ServerMessage, parse_frame},
    rooms::{PlayerLink, Registry, RoomCommand, RoomError, RoomHandle},
};

const OUTBOUND_QUEUE: usize = 512;
const HELLO_TIMEOUT: Duration = Duration::from_secs(10);
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);
// Real-time games send paddle/kart input at up to 60 Hz; anything well past
// that is a broken or hostile client.
const BUCKET_CAPACITY: f64 = 120.0;
const BUCKET_REFILL_PER_SEC: f64 = 90.0;

pub struct AppState {
    pub registry: Registry,
    pub signer: TokenSigner,
}

struct Session {
    player_id: String,
    nickname: String,
    room: Option<RoomHandle>,
}

struct RateLimit {
    tokens: f64,
    updated: Instant,
}

impl RateLimit {
    fn new() -> Self {
        Self {
            tokens: BUCKET_CAPACITY,
            updated: Instant::now(),
        }
    }

    fn allow(&mut self, now: Instant) -> bool {
        let refill = (now - self.updated).as_secs_f64() * BUCKET_REFILL_PER_SEC;
        self.tokens = (self.tokens + refill).min(BUCKET_CAPACITY);
        self.updated = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

pub async fn run(socket: WebSocket, state: Arc<AppState>) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<ServerMessage>(OUTBOUND_QUEUE);

    let writer = tokio::spawn(async move {
        let mut seq = 0u64;
        while let Some(message) = rx.recv().await {
            seq += 1;
            let frame = Message::Text(Utf8Bytes::from(message.encode(seq)));
            if sink.send(frame).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    let mut session: Option<Session> = None;
    let mut limit = RateLimit::new();
    let mut last_seq = 0u64;
    let opened = Instant::now();

    loop {
        let timeout = if session.is_some() {
            IDLE_TIMEOUT
        } else {
            HELLO_TIMEOUT.saturating_sub(opened.elapsed())
        };
        let frame = match tokio::time::timeout(timeout, stream.next()).await {
            Ok(Some(Ok(frame))) => frame,
            Ok(Some(Err(_)) | None) | Err(_) => break,
        };
        let text = match frame {
            Message::Text(text) => text,
            Message::Close(_) => break,
            Message::Binary(_) => {
                let _ = tx.try_send(ServerMessage::error("bad_frame"));
                continue;
            }
            Message::Ping(_) | Message::Pong(_) => continue,
        };
        if !limit.allow(Instant::now()) {
            let _ = tx.try_send(ServerMessage::error("rate_limited"));
            continue;
        }

        let (seq, message) = match parse_frame(&text) {
            Ok(parsed) => parsed,
            Err(error) => {
                let _ = tx.try_send(ServerMessage::error(error.code()));
                continue;
            }
        };
        // Replayed or reordered frames are ignored; seq 0 means the client opted out.
        if seq != 0 {
            if seq <= last_seq {
                continue;
            }
            last_seq = seq;
        }

        match (&mut session, message) {
            (None, ClientMessage::Hello(hello)) => {
                let nickname = match normalize_nickname(&hello.nickname) {
                    Ok(nickname) => nickname,
                    Err(_) => {
                        let _ = tx.try_send(ServerMessage::error("invalid_nickname"));
                        continue;
                    }
                };
                let now = unix_secs();
                let player_id = hello
                    .resume_token
                    .as_deref()
                    .and_then(|token| state.signer.verify(token, now))
                    .unwrap_or_else(new_player_id);
                let token = state.signer.issue(&player_id, now);
                let _ = tx.try_send(ServerMessage::new(
                    "hello",
                    json!({ "playerId": player_id, "nickname": nickname, "resumeToken": token }),
                ));
                session = Some(Session {
                    player_id,
                    nickname,
                    room: None,
                });
            }
            (None, _) => {
                let _ = tx.try_send(ServerMessage::error("hello_required"));
            }
            (Some(_), ClientMessage::Hello(_)) => {
                let _ = tx.try_send(ServerMessage::error("already_greeted"));
            }
            (Some(_), ClientMessage::Ping(ping)) => {
                let server = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or_default();
                let _ = tx.try_send(ServerMessage::new(
                    "pong",
                    json!({ "t": ping.t, "server": server }),
                ));
            }
            (Some(session), ClientMessage::RoomCreate(create)) => {
                leave_room(session).await;
                match state.registry.create(&create.game, create.options) {
                    Ok(handle) => enter_room(session, handle, &tx).await,
                    Err(error) => {
                        let _ = tx.try_send(ServerMessage::error(error.code()));
                    }
                }
            }
            (Some(session), ClientMessage::RoomJoin(join)) => {
                let Some(handle) = state.registry.find(&join.code) else {
                    let _ = tx.try_send(ServerMessage::error(RoomError::NotFound.code()));
                    continue;
                };
                if session
                    .room
                    .as_ref()
                    .is_some_and(|room| room.code != handle.code)
                {
                    leave_room(session).await;
                }
                enter_room(session, handle, &tx).await;
            }
            (Some(session), ClientMessage::RoomLeave) => {
                leave_room(session).await;
                let _ = tx.try_send(ServerMessage::new("room.left", json!({})));
            }
            (Some(session), message) => {
                let Some(room) = &session.room else {
                    let _ = tx.try_send(ServerMessage::error(RoomError::NotInRoom.code()));
                    continue;
                };
                let player_id = session.player_id.clone();
                let command = match message {
                    ClientMessage::MatchReady(ready) => RoomCommand::Ready {
                        player_id,
                        ready: ready.ready,
                    },
                    ClientMessage::MatchStart => RoomCommand::Start { player_id },
                    ClientMessage::Input(payload) => RoomCommand::Input { player_id, payload },
                    _ => continue,
                };
                if room.tx.send(command).await.is_err() {
                    session.room = None;
                    let _ = tx.try_send(ServerMessage::error("room_closed"));
                }
            }
        }
    }

    if let Some(session) = session
        && let Some(room) = session.room
    {
        let _ = room
            .tx
            .send(RoomCommand::Disconnected {
                player_id: session.player_id.clone(),
            })
            .await;
        debug!(player = %session.player_id, "connection closed");
    }
    drop(tx);
    let _ = writer.await;
}

async fn enter_room(session: &mut Session, handle: RoomHandle, tx: &mpsc::Sender<ServerMessage>) {
    let (reply, response) = oneshot::channel();
    let link = PlayerLink {
        id: session.player_id.clone(),
        nickname: session.nickname.clone(),
        tx: tx.clone(),
    };
    if handle
        .tx
        .send(RoomCommand::Join { link, reply })
        .await
        .is_err()
    {
        let _ = tx.try_send(ServerMessage::error(RoomError::NotFound.code()));
        return;
    }
    match response.await {
        Ok(Ok(())) => session.room = Some(handle),
        Ok(Err(error)) => {
            let _ = tx.try_send(ServerMessage::error(error.code()));
        }
        Err(_) => {
            let _ = tx.try_send(ServerMessage::error(RoomError::NotFound.code()));
        }
    }
}

async fn leave_room(session: &mut Session) {
    if let Some(room) = session.room.take() {
        let _ = room
            .tx
            .send(RoomCommand::Leave {
                player_id: session.player_id.clone(),
            })
            .await;
    }
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}
