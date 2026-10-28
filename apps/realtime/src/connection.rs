use std::{
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::extract::ws::{Message, Utf8Bytes, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};
use tracing::debug;

use crate::{
    identity::{AccountClaim, TicketVerifier, TokenSigner, new_player_id, normalize_nickname},
    matches::GameKind,
    protocol::{ClientMessage, ServerMessage, parse_frame},
    rooms::{PartyMember, PlayerLink, Registry, RoomCommand, RoomError, RoomHandle},
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
    pub tickets: Option<TicketVerifier>,
}

struct Session {
    player_id: String,
    nickname: String,
    account: Option<AccountClaim>,
    party: Option<String>,
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
                let now = unix_secs();
                let account = match hello.ticket.as_deref() {
                    None => None,
                    Some(ticket) => {
                        match state.tickets.as_ref().and_then(|t| t.verify(ticket, now)) {
                            Some(claim) => Some(claim),
                            None => {
                                let _ = tx.try_send(ServerMessage::error("invalid_ticket"));
                                continue;
                            }
                        }
                    }
                };
                let requested = account
                    .as_ref()
                    .map_or(hello.nickname.as_str(), |claim| claim.username.as_str());
                let nickname = match normalize_nickname(requested) {
                    Ok(nickname) => nickname,
                    Err(_) => {
                        let _ = tx.try_send(ServerMessage::error("invalid_nickname"));
                        continue;
                    }
                };
                let player_id = hello
                    .resume_token
                    .as_deref()
                    .and_then(|token| state.signer.verify(token, now))
                    .unwrap_or_else(new_player_id);
                let token = state.signer.issue(&player_id, now);
                let _ = tx.try_send(ServerMessage::new(
                    "hello",
                    json!({
                        "playerId": player_id,
                        "nickname": nickname,
                        "resumeToken": token,
                        "account": account.as_ref().map(|claim| &claim.username),
                    }),
                ));
                session = Some(Session {
                    player_id,
                    nickname,
                    account,
                    party: None,
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
                let solo = create.options.get("solo").and_then(Value::as_bool) == Some(true);
                if create.game == GameKind::Siper.slug() && !solo && session.account.is_none() {
                    let _ = tx.try_send(ServerMessage::error(RoomError::AccountRequired.code()));
                    continue;
                }
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
                if needs_account(&handle) && session.account.is_none() {
                    let _ = tx.try_send(ServerMessage::error(RoomError::AccountRequired.code()));
                    continue;
                }
                if session
                    .room
                    .as_ref()
                    .is_some_and(|room| room.code != handle.code)
                {
                    leave_room(session).await;
                }
                enter_room(session, handle, &tx).await;
            }
            (Some(_), ClientMessage::RoomList(list)) => {
                let rooms = state.registry.list(&list.game);
                let _ = tx.try_send(ServerMessage::new(
                    "room.list",
                    json!({ "game": list.game, "rooms": rooms }),
                ));
            }
            (Some(session), ClientMessage::MatchQuick(quick)) => {
                if session.account.is_none() {
                    let _ = tx.try_send(ServerMessage::error(RoomError::AccountRequired.code()));
                    continue;
                }
                let leading = session.party.clone().filter(|party| {
                    state.registry.party_leader(party).as_deref()
                        == Some(session.player_id.as_str())
                });
                let seats = leading
                    .as_deref()
                    .map_or(1, |party| state.registry.party_size(party));
                leave_room(session).await;
                match state.registry.quick(&quick.game, &quick.mode, seats) {
                    Ok(handle) => {
                        let code = handle.code.clone();
                        enter_room(session, handle, &tx).await;
                        if let Some(party) = leading {
                            state
                                .registry
                                .party_follow(&party, &session.player_id, &code);
                        }
                    }
                    Err(error) => {
                        let _ = tx.try_send(ServerMessage::error(error.code()));
                    }
                }
            }
            (Some(session), ClientMessage::PartyCreate) => {
                if session.account.is_none() {
                    let _ = tx.try_send(ServerMessage::error(RoomError::AccountRequired.code()));
                    continue;
                }
                leave_party(&state.registry, session);
                let code = state.registry.party_create(party_member(session, &tx));
                session.party = Some(code);
            }
            (Some(session), ClientMessage::PartyJoin(join)) => {
                if session.account.is_none() {
                    let _ = tx.try_send(ServerMessage::error(RoomError::AccountRequired.code()));
                    continue;
                }
                leave_party(&state.registry, session);
                match state
                    .registry
                    .party_join(&join.code, party_member(session, &tx))
                {
                    Ok(code) => session.party = Some(code),
                    Err(error) => {
                        let _ = tx.try_send(ServerMessage::error(error.code()));
                    }
                }
            }
            (Some(session), ClientMessage::PartyLeave) => {
                leave_party(&state.registry, session);
                let _ = tx.try_send(ServerMessage::new("party.state", Value::Null));
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
                    ClientMessage::RoomTeam(pick) => RoomCommand::Team {
                        player_id,
                        team: pick.team,
                    },
                    ClientMessage::Chat(chat) => RoomCommand::Chat {
                        player_id,
                        text: chat.text,
                        team: chat.team,
                    },
                    _ => continue,
                };
                if room.tx.send(command).await.is_err() {
                    session.room = None;
                    let _ = tx.try_send(ServerMessage::error("room_closed"));
                }
            }
        }
    }

    if let Some(session) = session.as_mut() {
        leave_party(&state.registry, session);
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
        account: session.account.clone(),
        party: session.party.clone(),
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

// Siper is played under account names; only private bot matches are open to guests.
fn needs_account(handle: &RoomHandle) -> bool {
    handle.game == GameKind::Siper && !handle.solo
}

fn party_member(session: &Session, tx: &mpsc::Sender<ServerMessage>) -> PartyMember {
    PartyMember {
        id: session.player_id.clone(),
        nickname: session.nickname.clone(),
        tx: tx.clone(),
    }
}

fn leave_party(registry: &Registry, session: &mut Session) {
    if let Some(party) = session.party.take() {
        registry.party_leave(&party, &session.player_id);
    }
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}
