use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use rand::seq::IndexedRandom;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, info};

use crate::{
    matches::{self, Audience, Delivery, GameKind, Match, MatchSetup},
    protocol::ServerMessage,
};

// Ambiguous glyphs (0/O, 1/I/L) are left out so codes survive being read aloud.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 6;
const MAX_ROOMS: usize = 2_000;
const RECONNECT_GRACE: Duration = Duration::from_secs(30);
const IDLE_LIMIT: Duration = Duration::from_secs(10 * 60);
const HOUSEKEEPING: Duration = Duration::from_secs(1);
const COMMAND_QUEUE: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomError {
    NotFound,
    Full,
    InProgress,
    TooMany,
    UnknownGame,
    InvalidOptions,
    NotHost,
    NotReady,
    PlayerCount,
    NotInRoom,
}

impl RoomError {
    pub fn code(self) -> &'static str {
        match self {
            RoomError::NotFound => "room_not_found",
            RoomError::Full => "room_full",
            RoomError::InProgress => "room_in_progress",
            RoomError::TooMany => "server_busy",
            RoomError::UnknownGame => "unknown_game",
            RoomError::InvalidOptions => "invalid_options",
            RoomError::NotHost => "not_host",
            RoomError::NotReady => "not_ready",
            RoomError::PlayerCount => "player_count",
            RoomError::NotInRoom => "not_in_room",
        }
    }
}

#[derive(Clone)]
pub struct PlayerLink {
    pub id: String,
    pub nickname: String,
    pub tx: mpsc::Sender<ServerMessage>,
}

pub enum RoomCommand {
    Join {
        link: PlayerLink,
        reply: oneshot::Sender<Result<(), RoomError>>,
    },
    Leave {
        player_id: String,
    },
    Disconnected {
        player_id: String,
    },
    Ready {
        player_id: String,
        ready: bool,
    },
    Start {
        player_id: String,
    },
    Input {
        player_id: String,
        payload: Value,
    },
}

#[derive(Clone)]
pub struct RoomHandle {
    pub code: String,
    pub tx: mpsc::Sender<RoomCommand>,
}

#[derive(Clone, Default)]
pub struct Registry {
    rooms: Arc<Mutex<HashMap<String, RoomHandle>>>,
}

impl Registry {
    pub fn create(&self, slug: &str, options: Value) -> Result<RoomHandle, RoomError> {
        let game = GameKind::from_slug(slug).ok_or(RoomError::UnknownGame)?;
        matches::validate_options(game, &options).map_err(|_| RoomError::InvalidOptions)?;

        let mut rooms = self.rooms.lock().expect("room registry lock");
        if rooms.len() >= MAX_ROOMS {
            return Err(RoomError::TooMany);
        }
        let code = loop {
            let candidate = new_code();
            if !rooms.contains_key(&candidate) {
                break candidate;
            }
        };
        let (tx, rx) = mpsc::channel(COMMAND_QUEUE);
        let handle = RoomHandle {
            code: code.clone(),
            tx,
        };
        rooms.insert(code.clone(), handle.clone());
        drop(rooms);

        let room = Room::new(code, game, options, self.clone());
        tokio::spawn(room.run(rx));
        Ok(handle)
    }

    pub fn find(&self, code: &str) -> Option<RoomHandle> {
        let code = code.trim().to_ascii_uppercase();
        self.rooms
            .lock()
            .expect("room registry lock")
            .get(&code)
            .cloned()
    }

    fn remove(&self, code: &str) {
        self.rooms.lock().expect("room registry lock").remove(code);
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.rooms.lock().unwrap().len()
    }
}

fn new_code() -> String {
    let mut rng = rand::rng();
    (0..CODE_LENGTH)
        .map(|_| char::from(*CODE_ALPHABET.choose(&mut rng).unwrap_or(&b'A')))
        .collect()
}

struct Member {
    id: String,
    nickname: String,
    tx: Option<mpsc::Sender<ServerMessage>>,
    ready: bool,
    seat: Option<usize>,
    disconnected_at: Option<Instant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberView<'a> {
    id: &'a str,
    nickname: &'a str,
    ready: bool,
    connected: bool,
    seat: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomView<'a> {
    code: &'a str,
    game: &'static str,
    options: &'a Value,
    host_id: &'a str,
    phase: &'static str,
    min_players: usize,
    max_players: usize,
    members: Vec<MemberView<'a>>,
}

struct Room {
    code: String,
    game: GameKind,
    options: Value,
    registry: Registry,
    members: Vec<Member>,
    host_id: String,
    active: Option<Box<dyn Match>>,
    round: u32,
    next_tick: Option<Instant>,
    last_activity: Instant,
}

impl Room {
    fn new(code: String, game: GameKind, options: Value, registry: Registry) -> Self {
        Self {
            code,
            game,
            options,
            registry,
            members: Vec::new(),
            host_id: String::new(),
            active: None,
            round: 0,
            next_tick: None,
            last_activity: Instant::now(),
        }
    }

    async fn run(mut self, mut rx: mpsc::Receiver<RoomCommand>) {
        info!(code = %self.code, game = self.game.slug(), "room opened");
        let mut housekeeping = tokio::time::interval(HOUSEKEEPING);
        loop {
            let tick_at = self.next_tick;
            tokio::select! {
                command = rx.recv() => match command {
                    Some(command) => self.handle(command, Instant::now()),
                    None => break,
                },
                _ = housekeeping.tick() => {
                    if !self.housekeep(Instant::now()) {
                        break;
                    }
                }
                () = sleep_until(tick_at) => self.tick(Instant::now()),
            }
        }
        self.registry.remove(&self.code);
        info!(code = %self.code, "room closed");
    }

    fn handle(&mut self, command: RoomCommand, now: Instant) {
        self.last_activity = now;
        match command {
            RoomCommand::Join { link, reply } => {
                let result = self.join(link, now);
                // The joining connection may already be gone; nothing to do then.
                let _ = reply.send(result);
            }
            RoomCommand::Leave { player_id } => self.remove_member(&player_id, now),
            RoomCommand::Disconnected { player_id } => {
                if let Some(member) = self.member_mut(&player_id) {
                    member.tx = None;
                    member.disconnected_at = Some(now);
                    self.broadcast_state();
                }
            }
            RoomCommand::Ready { player_id, ready } => {
                if self.active.is_none()
                    && let Some(member) = self.member_mut(&player_id)
                {
                    member.ready = ready;
                    self.broadcast_state();
                }
            }
            RoomCommand::Start { player_id } => {
                if let Err(error) = self.start(&player_id, now) {
                    self.send_to(&player_id, ServerMessage::error(error.code()));
                }
            }
            RoomCommand::Input { player_id, payload } => self.input(&player_id, payload, now),
        }
    }

    fn join(&mut self, link: PlayerLink, now: Instant) -> Result<(), RoomError> {
        if let Some(index) = self.members.iter().position(|m| m.id == link.id) {
            let member = &mut self.members[index];
            member.tx = Some(link.tx);
            member.nickname = link.nickname;
            member.disconnected_at = None;
            let resumed = match (&self.active, member.seat) {
                (Some(active), Some(seat)) => Some((seat, active.sync(seat, now))),
                _ => None,
            };
            self.broadcast_state();
            if let Some((seat, deliveries)) = resumed {
                self.send_to(&link.id, self.match_start(seat));
                self.deliver(deliveries);
            }
            return Ok(());
        }
        if self.active.is_some() {
            return Err(RoomError::InProgress);
        }
        if self.members.len() >= self.game.players().1 {
            return Err(RoomError::Full);
        }
        if self.members.is_empty() {
            self.host_id = link.id.clone();
        }
        self.members.push(Member {
            id: link.id,
            nickname: link.nickname,
            tx: Some(link.tx),
            ready: false,
            seat: None,
            disconnected_at: None,
        });
        self.broadcast_state();
        Ok(())
    }

    fn remove_member(&mut self, player_id: &str, now: Instant) {
        let Some(index) = self.members.iter().position(|m| m.id == player_id) else {
            return;
        };
        let member = self.members.remove(index);
        let forfeited = match (self.active.as_mut(), member.seat) {
            (Some(active), Some(seat)) => active.forfeit(seat, now),
            _ => Vec::new(),
        };
        self.deliver(forfeited);
        if self.host_id == member.id
            && let Some(next) = self.members.first()
        {
            self.host_id = next.id.clone();
        }
        self.settle();
        self.broadcast_state();
    }

    fn start(&mut self, player_id: &str, now: Instant) -> Result<(), RoomError> {
        if player_id != self.host_id {
            return Err(RoomError::NotHost);
        }
        if self.active.is_some() {
            return Err(RoomError::InProgress);
        }
        let (min, max) = self.game.players();
        if !(min..=max).contains(&self.members.len()) {
            return Err(RoomError::PlayerCount);
        }
        if self
            .members
            .iter()
            .any(|m| m.tx.is_none() || (!m.ready && m.id != self.host_id))
        {
            return Err(RoomError::NotReady);
        }

        let setup = MatchSetup {
            seats: self.members.len(),
            round: self.round,
            options: self.options.clone(),
        };
        let mut active =
            matches::create(self.game, &setup).map_err(|_| RoomError::InvalidOptions)?;
        for (seat, member) in self.members.iter_mut().enumerate() {
            member.seat = Some(seat);
        }
        let deliveries = active.start(now);
        self.next_tick = active.tick_interval().map(|interval| now + interval);
        self.active = Some(active);

        self.broadcast_state();
        for seat in 0..self.members.len() {
            let id = self.members[seat].id.clone();
            self.send_to(&id, self.match_start(seat));
        }
        self.deliver(deliveries);
        info!(code = %self.code, players = self.members.len(), "match started");
        Ok(())
    }

    fn input(&mut self, player_id: &str, payload: Value, now: Instant) {
        let Some(seat) = self.member(player_id).and_then(|m| m.seat) else {
            self.send_to(player_id, ServerMessage::error("not_playing"));
            return;
        };
        let Some(active) = self.active.as_mut() else {
            self.send_to(player_id, ServerMessage::error("not_playing"));
            return;
        };
        match active.input(seat, payload, now) {
            Ok(deliveries) => {
                self.deliver(deliveries);
                self.settle();
            }
            Err(reject) => self.send_to(player_id, ServerMessage::error(reject.code())),
        }
    }

    fn tick(&mut self, now: Instant) {
        let Some(active) = self.active.as_mut() else {
            self.next_tick = None;
            return;
        };
        let deliveries = active.tick(now);
        self.next_tick = active.tick_interval().map(|interval| now + interval);
        self.deliver(deliveries);
        self.settle();
    }

    // Returns false once the room should close.
    fn housekeep(&mut self, now: Instant) -> bool {
        let expired: Vec<String> = self
            .members
            .iter()
            .filter(|m| {
                m.disconnected_at
                    .is_some_and(|at| now - at >= RECONNECT_GRACE)
            })
            .map(|m| m.id.clone())
            .collect();
        for id in expired {
            debug!(code = %self.code, player = %id, "reconnect grace expired");
            self.remove_member(&id, now);
        }
        let idle = self.active.is_none() && now - self.last_activity >= IDLE_LIMIT;
        if idle {
            for member in &self.members {
                if let Some(tx) = &member.tx {
                    let _ = tx.try_send(ServerMessage::error("room_closed"));
                }
            }
        }
        !self.members.is_empty() && !idle
    }

    // Ends the match once the game reports an outcome and returns the room to its lobby.
    fn settle(&mut self) {
        let Some(outcome) = self.active.as_ref().and_then(|active| active.outcome()) else {
            return;
        };
        self.active = None;
        self.next_tick = None;
        self.round += 1;
        self.broadcast(ServerMessage::new("match.finish", &outcome));
        for member in &mut self.members {
            member.ready = false;
            member.seat = None;
        }
        self.broadcast_state();
        info!(code = %self.code, reason = outcome.reason, "match finished");
    }

    fn match_start(&self, seat: usize) -> ServerMessage {
        let players: Vec<_> = self
            .members
            .iter()
            .filter_map(|m| {
                m.seat.map(
                    |seat| serde_json::json!({ "id": m.id, "nickname": m.nickname, "seat": seat }),
                )
            })
            .collect();
        ServerMessage::new(
            "match.start",
            serde_json::json!({
                "seat": seat,
                "round": self.round,
                "players": players,
                "options": self.options,
            }),
        )
    }

    fn deliver(&mut self, deliveries: Vec<Delivery>) {
        for delivery in deliveries {
            let message = ServerMessage {
                kind: delivery.kind,
                payload: delivery.payload,
            };
            let targets: Vec<String> = self
                .members
                .iter()
                .filter(|m| match (delivery.audience, m.seat) {
                    (Audience::All, Some(_)) => true,
                    (Audience::Seat(seat), Some(s)) => s == seat,
                    (Audience::AllExcept(seat), Some(s)) => s != seat,
                    _ => false,
                })
                .map(|m| m.id.clone())
                .collect();
            for id in targets {
                self.send_to(&id, message.clone());
            }
        }
    }

    fn broadcast_state(&mut self) {
        let (min, max) = self.game.players();
        let view = RoomView {
            code: &self.code,
            game: self.game.slug(),
            options: &self.options,
            host_id: &self.host_id,
            phase: if self.active.is_some() {
                "playing"
            } else {
                "lobby"
            },
            min_players: min,
            max_players: max,
            members: self
                .members
                .iter()
                .map(|m| MemberView {
                    id: &m.id,
                    nickname: &m.nickname,
                    ready: m.ready,
                    connected: m.tx.is_some(),
                    seat: m.seat,
                })
                .collect(),
        };
        let message = ServerMessage::new("room.state", view);
        self.broadcast(message);
    }

    fn broadcast(&mut self, message: ServerMessage) {
        let ids: Vec<String> = self.members.iter().map(|m| m.id.clone()).collect();
        for id in ids {
            self.send_to(&id, message.clone());
        }
    }

    // A full outbound queue means the client stopped reading; treat it as gone
    // rather than letting one slow socket stall the room.
    fn send_to(&mut self, player_id: &str, message: ServerMessage) {
        let Some(member) = self.member_mut(player_id) else {
            return;
        };
        let Some(tx) = &member.tx else {
            return;
        };
        if tx.try_send(message).is_err() {
            member.tx = None;
            member.disconnected_at = Some(Instant::now());
        }
    }

    fn member(&self, player_id: &str) -> Option<&Member> {
        self.members.iter().find(|m| m.id == player_id)
    }

    fn member_mut(&mut self, player_id: &str) -> Option<&mut Member> {
        self.members.iter_mut().find(|m| m.id == player_id)
    }
}

async fn sleep_until(at: Option<Instant>) {
    match at {
        Some(at) => tokio::time::sleep_until(tokio::time::Instant::from_std(at)).await,
        None => std::future::pending().await,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn link(id: &str) -> (PlayerLink, mpsc::Receiver<ServerMessage>) {
        let (tx, rx) = mpsc::channel(64);
        (
            PlayerLink {
                id: id.to_owned(),
                nickname: format!("p-{id}"),
                tx,
            },
            rx,
        )
    }

    async fn join(handle: &RoomHandle, link: PlayerLink) -> Result<(), RoomError> {
        let (reply, response) = oneshot::channel();
        handle
            .tx
            .send(RoomCommand::Join { link, reply })
            .await
            .unwrap();
        response.await.unwrap()
    }

    async fn next_of(rx: &mut mpsc::Receiver<ServerMessage>, kind: &str) -> ServerMessage {
        loop {
            let message = rx.recv().await.unwrap();
            if message.kind == kind {
                return message;
            }
        }
    }

    #[test]
    fn codes_use_the_unambiguous_alphabet() {
        let code = new_code();
        assert_eq!(code.len(), CODE_LENGTH);
        assert!(code.bytes().all(|b| CODE_ALPHABET.contains(&b)));
    }

    #[tokio::test]
    async fn create_rejects_unknown_games_and_bad_options() {
        let registry = Registry::default();
        assert_eq!(
            registry.create("pong", Value::Null).err(),
            Some(RoomError::UnknownGame)
        );
        assert_eq!(
            registry
                .create("chess-arena", json!({ "minutes": 60 }))
                .err(),
            Some(RoomError::InvalidOptions)
        );
    }

    #[tokio::test]
    async fn full_connect_four_round_trip() {
        let registry = Registry::default();
        let handle = registry.create("connect-four", Value::Null).unwrap();
        let (host, mut host_rx) = link("a");
        let (guest, mut guest_rx) = link("b");
        let (third, _third_rx) = link("c");
        join(&handle, host).await.unwrap();
        join(&handle, guest).await.unwrap();
        assert_eq!(join(&handle, third).await, Err(RoomError::Full));
        assert!(registry.find(&handle.code.to_lowercase()).is_some());

        handle
            .tx
            .send(RoomCommand::Start {
                player_id: "a".into(),
            })
            .await
            .unwrap();
        assert_eq!(
            next_of(&mut host_rx, "error").await.payload["code"],
            "not_ready"
        );

        for (player_id, ready) in [("b", true)] {
            handle
                .tx
                .send(RoomCommand::Ready {
                    player_id: player_id.into(),
                    ready,
                })
                .await
                .unwrap();
        }
        handle
            .tx
            .send(RoomCommand::Start {
                player_id: "a".into(),
            })
            .await
            .unwrap();
        let start = next_of(&mut guest_rx, "match.start").await;
        assert_eq!(start.payload["seat"], 1);

        // Seat 0 opens round 0; play a vertical four in column 0.
        for (player_id, column) in [
            ("a", 0),
            ("b", 1),
            ("a", 0),
            ("b", 1),
            ("a", 0),
            ("b", 1),
            ("a", 0),
        ] {
            handle
                .tx
                .send(RoomCommand::Input {
                    player_id: player_id.into(),
                    payload: json!({ "column": column }),
                })
                .await
                .unwrap();
        }
        let finish = next_of(&mut guest_rx, "match.finish").await;
        assert_eq!(finish.payload["placements"], json!([1, 2]));
        let state = next_of(&mut host_rx, "room.state").await;
        assert!(state.payload["phase"].is_string());
    }

    #[tokio::test]
    async fn leaving_mid_match_forfeits_and_hands_over_host() {
        let registry = Registry::default();
        let handle = registry.create("connect-four", Value::Null).unwrap();
        let (host, _host_rx) = link("a");
        let (guest, mut guest_rx) = link("b");
        join(&handle, host).await.unwrap();
        join(&handle, guest).await.unwrap();
        handle
            .tx
            .send(RoomCommand::Ready {
                player_id: "b".into(),
                ready: true,
            })
            .await
            .unwrap();
        handle
            .tx
            .send(RoomCommand::Start {
                player_id: "a".into(),
            })
            .await
            .unwrap();
        handle
            .tx
            .send(RoomCommand::Leave {
                player_id: "a".into(),
            })
            .await
            .unwrap();
        let finish = next_of(&mut guest_rx, "match.finish").await;
        assert_eq!(finish.payload["reason"], "forfeit");
        assert_eq!(finish.payload["placements"], json!([2, 1]));
        loop {
            let state = next_of(&mut guest_rx, "room.state").await;
            if state.payload["members"].as_array().unwrap().len() == 1 {
                assert_eq!(state.payload["hostId"], "b");
                break;
            }
        }
        assert_eq!(registry.len(), 1);
    }
}
