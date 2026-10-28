use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use rand::{RngExt, seq::IndexedRandom};
use serde::Serialize;
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, info};

use crate::{
    identity::AccountClaim,
    matches::{self, Audience, Delivery, GameKind, Match, MatchSetup, Reject, SeatInfo},
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
const LISTED_ROOMS: usize = 50;
const CHAT_LIMIT: usize = 160;
const CHAT_COOLDOWN: Duration = Duration::from_millis(700);
// Quick-match rooms roll straight into the next match after the result screen.
const QUICK_RESTART: Duration = Duration::from_secs(12);
const QUICK_MAPS: [&str; 3] = ["liman", "carsi", "santral"];
const PARTY_LIMIT: usize = 5;

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
    TeamsUneven,
    TeamFull,
    AccountRequired,
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
            RoomError::TeamsUneven => "teams_uneven",
            RoomError::TeamFull => "team_full",
            RoomError::AccountRequired => "account_required",
        }
    }
}

#[derive(Clone)]
pub struct PlayerLink {
    pub id: String,
    pub nickname: String,
    pub tx: mpsc::Sender<ServerMessage>,
    pub account: Option<AccountClaim>,
    pub party: Option<String>,
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
    Team {
        player_id: String,
        team: Option<u8>,
    },
    Chat {
        player_id: String,
        text: String,
        team: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomInfo {
    pub code: String,
    pub game: &'static str,
    pub mode: Option<String>,
    pub map: Option<String>,
    pub players: usize,
    pub max_players: usize,
    pub phase: &'static str,
    pub quick: bool,
    #[serde(skip)]
    pub listed: bool,
}

#[derive(Clone)]
pub struct RoomHandle {
    pub code: String,
    pub tx: mpsc::Sender<RoomCommand>,
    pub game: GameKind,
    pub solo: bool,
    info: Arc<Mutex<RoomInfo>>,
}

impl RoomHandle {
    pub fn info(&self) -> RoomInfo {
        self.info.lock().expect("room info lock").clone()
    }
}

#[derive(Clone)]
pub struct PartyMember {
    pub id: String,
    pub nickname: String,
    pub tx: mpsc::Sender<ServerMessage>,
}

pub struct Party {
    pub leader: String,
    pub members: Vec<PartyMember>,
}

#[derive(Clone, Default)]
pub struct Registry {
    rooms: Arc<Mutex<HashMap<String, RoomHandle>>>,
    parties: Arc<Mutex<HashMap<String, Party>>>,
    reporter: Option<mpsc::Sender<Value>>,
}

fn flag(options: &Value, key: &str) -> bool {
    options.get(key).and_then(Value::as_bool).unwrap_or(false)
}

impl Registry {
    pub fn with_reporter(reporter: mpsc::Sender<Value>) -> Self {
        Self {
            reporter: Some(reporter),
            ..Self::default()
        }
    }

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
        let solo = flag(&options, "solo");
        let quick = flag(&options, "quick");
        let text = |key: &str| options.get(key).and_then(Value::as_str).map(str::to_owned);
        let info = Arc::new(Mutex::new(RoomInfo {
            code: code.clone(),
            game: game.slug(),
            mode: text("mode"),
            map: text("map"),
            players: 0,
            max_players: if solo { 1 } else { game.players().1 },
            phase: "lobby",
            quick,
            listed: !solo,
        }));
        let (tx, rx) = mpsc::channel(COMMAND_QUEUE);
        let handle = RoomHandle {
            code: code.clone(),
            tx,
            game,
            solo,
            info: info.clone(),
        };
        rooms.insert(code.clone(), handle.clone());
        drop(rooms);

        let room = Room::new(code, game, options, self.clone(), info);
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

    pub fn list(&self, slug: &str) -> Vec<RoomInfo> {
        let mut listed: Vec<RoomInfo> = self
            .rooms
            .lock()
            .expect("room registry lock")
            .values()
            .map(RoomHandle::info)
            .filter(|info| info.listed && info.game == slug && info.players > 0)
            .collect();
        listed.sort_by(|a, b| b.players.cmp(&a.players).then(a.code.cmp(&b.code)));
        listed.truncate(LISTED_ROOMS);
        listed
    }

    // An open quick-match room for the mode, or a fresh one with bots in the empty seats.
    pub fn quick(&self, slug: &str, mode: &str, room_for: usize) -> Result<RoomHandle, RoomError> {
        let existing = self
            .rooms
            .lock()
            .expect("room registry lock")
            .values()
            .find(|handle| {
                let info = handle.info();
                info.quick
                    && info.game == slug
                    && info.mode.as_deref() == Some(mode)
                    && info.players + room_for <= info.max_players
                    && info.players > 0
            })
            .cloned();
        if let Some(handle) = existing {
            return Ok(handle);
        }
        let map = QUICK_MAPS
            .choose(&mut rand::rng())
            .copied()
            .unwrap_or("liman");
        self.create(
            slug,
            json!({ "mode": mode, "map": map, "bots": "normal", "quick": true }),
        )
    }

    fn remove(&self, code: &str) {
        self.rooms.lock().expect("room registry lock").remove(code);
    }

    pub fn party_create(&self, leader: PartyMember) -> String {
        let mut parties = self.parties.lock().expect("party lock");
        let code = loop {
            let candidate = new_code();
            if !parties.contains_key(&candidate) {
                break candidate;
            }
        };
        parties.insert(
            code.clone(),
            Party {
                leader: leader.id.clone(),
                members: vec![leader],
            },
        );
        drop(parties);
        self.party_broadcast(&code);
        code
    }

    pub fn party_join(&self, code: &str, member: PartyMember) -> Result<String, RoomError> {
        let code = code.trim().to_ascii_uppercase();
        let mut parties = self.parties.lock().expect("party lock");
        let party = parties.get_mut(&code).ok_or(RoomError::NotFound)?;
        if !party.members.iter().any(|m| m.id == member.id) {
            if party.members.len() >= PARTY_LIMIT {
                return Err(RoomError::Full);
            }
            party.members.push(member);
        }
        drop(parties);
        self.party_broadcast(&code);
        Ok(code)
    }

    pub fn party_leave(&self, code: &str, player_id: &str) {
        let mut parties = self.parties.lock().expect("party lock");
        let Some(party) = parties.get_mut(code) else {
            return;
        };
        party.members.retain(|m| m.id != player_id);
        if party.members.is_empty() {
            parties.remove(code);
            return;
        }
        if party.leader == player_id {
            party.leader = party.members[0].id.clone();
        }
        drop(parties);
        self.party_broadcast(code);
    }

    pub fn party_leader(&self, code: &str) -> Option<String> {
        self.parties
            .lock()
            .expect("party lock")
            .get(code)
            .map(|party| party.leader.clone())
    }

    pub fn party_size(&self, code: &str) -> usize {
        self.parties
            .lock()
            .expect("party lock")
            .get(code)
            .map_or(1, |party| party.members.len())
    }

    // Everyone else in the party is told which room to follow the leader into.
    pub fn party_follow(&self, code: &str, leader: &str, room: &str) {
        let parties = self.parties.lock().expect("party lock");
        let Some(party) = parties.get(code) else {
            return;
        };
        for member in party.members.iter().filter(|m| m.id != leader) {
            let _ = member
                .tx
                .try_send(ServerMessage::new("party.follow", json!({ "code": room })));
        }
    }

    fn party_broadcast(&self, code: &str) {
        let parties = self.parties.lock().expect("party lock");
        let Some(party) = parties.get(code) else {
            return;
        };
        let state = ServerMessage::new(
            "party.state",
            json!({
                "code": code,
                "leader": party.leader,
                "members": party.members.iter().map(|m| json!({ "id": m.id, "nickname": m.nickname })).collect::<Vec<_>>(),
            }),
        );
        for member in &party.members {
            let _ = member.tx.try_send(state.clone());
        }
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

fn new_match_id() -> String {
    let bytes: [u8; 16] = rand::rng().random();
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct Member {
    id: String,
    nickname: String,
    tx: Option<mpsc::Sender<ServerMessage>>,
    ready: bool,
    seat: Option<usize>,
    team: Option<u8>,
    account: Option<AccountClaim>,
    party: Option<String>,
    last_chat: Option<Instant>,
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
    team: Option<u8>,
    username: Option<&'a str>,
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
    solo: bool,
    quick: bool,
    members: Vec<MemberView<'a>>,
}

struct Room {
    code: String,
    game: GameKind,
    options: Value,
    registry: Registry,
    info: Arc<Mutex<RoomInfo>>,
    solo: bool,
    quick: bool,
    members: Vec<Member>,
    host_id: String,
    active: Option<Box<dyn Match>>,
    round: u32,
    next_tick: Option<Instant>,
    restart_at: Option<Instant>,
    last_activity: Instant,
}

impl Room {
    fn new(
        code: String,
        game: GameKind,
        options: Value,
        registry: Registry,
        info: Arc<Mutex<RoomInfo>>,
    ) -> Self {
        Self {
            code,
            game,
            solo: flag(&options, "solo"),
            quick: flag(&options, "quick"),
            options,
            registry,
            info,
            members: Vec::new(),
            host_id: String::new(),
            active: None,
            round: 0,
            next_tick: None,
            restart_at: None,
            last_activity: Instant::now(),
        }
    }

    fn max_players(&self) -> usize {
        if self.solo { 1 } else { self.game.players().1 }
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
            RoomCommand::Team { player_id, team } => {
                if let Err(error) = self.pick_team(&player_id, team) {
                    self.send_to(&player_id, ServerMessage::error(error.code()));
                }
            }
            RoomCommand::Chat {
                player_id,
                text,
                team,
            } => self.chat(&player_id, &text, team, now),
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
        if self.members.len() >= self.max_players() {
            return Err(RoomError::Full);
        }
        if let Some(active) = self.active.as_mut() {
            // Drop-in: take over a seat a bot was keeping warm, next to party mates if possible.
            let mate_team = link.party.as_ref().and_then(|party| {
                self.members
                    .iter()
                    .filter(|m| m.party.as_ref() == Some(party))
                    .find_map(|m| m.seat.and_then(|seat| active.team_of(seat)))
            });
            let (seat, deliveries) = active
                .admit(&link.nickname, mate_team, now)
                .ok_or(RoomError::InProgress)?;
            let id = link.id.clone();
            self.add_member(link, Some(seat));
            self.broadcast_state();
            self.send_to(&id, self.match_start(seat));
            self.deliver(deliveries);
            let sync = self
                .active
                .as_ref()
                .map(|active| active.sync(seat, now))
                .unwrap_or_default();
            self.deliver(sync);
            return Ok(());
        }
        let id = link.id.clone();
        self.add_member(link, None);
        self.broadcast_state();
        if self.quick && self.active.is_none() && self.restart_at.is_none() {
            let host = self.host_id.clone();
            if let Err(error) = self.start(&host, now) {
                self.send_to(&id, ServerMessage::error(error.code()));
            }
        }
        Ok(())
    }

    fn add_member(&mut self, link: PlayerLink, seat: Option<usize>) {
        if self.members.is_empty() {
            self.host_id = link.id.clone();
        }
        self.members.push(Member {
            id: link.id,
            nickname: link.nickname,
            tx: Some(link.tx),
            ready: false,
            seat,
            team: None,
            account: link.account,
            party: link.party,
            last_chat: None,
            disconnected_at: None,
        });
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
        self.settle(now);
        self.broadcast_state();
    }

    fn pick_team(&mut self, player_id: &str, team: Option<u8>) -> Result<(), RoomError> {
        if self.active.is_some() {
            return Err(RoomError::InProgress);
        }
        if team.is_some_and(|team| team > 1) {
            return Err(RoomError::InvalidOptions);
        }
        let half = self.game.players().1 / 2;
        if let Some(team) = team
            && self
                .members
                .iter()
                .filter(|m| m.id != player_id && m.team == Some(team))
                .count()
                >= half
        {
            return Err(RoomError::TeamFull);
        }
        let member = self.member_mut(player_id).ok_or(RoomError::NotInRoom)?;
        member.team = team;
        member.ready = false;
        self.broadcast_state();
        Ok(())
    }

    fn chat(&mut self, player_id: &str, text: &str, team_only: bool, now: Instant) {
        let text = text.trim();
        if text.is_empty() || text.chars().count() > CHAT_LIMIT {
            self.send_to(player_id, ServerMessage::error("chat_invalid"));
            return;
        }
        let Some(sender) = self.member_mut(player_id) else {
            return;
        };
        if sender
            .last_chat
            .is_some_and(|at| now.duration_since(at) < CHAT_COOLDOWN)
        {
            self.send_to(player_id, ServerMessage::error("chat_too_fast"));
            return;
        }
        sender.last_chat = Some(now);
        let (nickname, seat, lobby_team) = (sender.nickname.clone(), sender.seat, sender.team);
        let side = match (&self.active, seat) {
            (Some(active), Some(seat)) => active.team_of(seat),
            _ => lobby_team,
        };
        let team_only = team_only && side.is_some();
        let message = ServerMessage::new(
            "chat",
            json!({
                "from": nickname,
                "text": playnex_chat_filter::censor(text),
                "team": team_only,
                "side": side,
            }),
        );
        let recipients: Vec<String> = self
            .members
            .iter()
            .filter(|m| {
                if !team_only {
                    return true;
                }
                let theirs = match (&self.active, m.seat) {
                    (Some(active), Some(seat)) => active.team_of(seat),
                    _ => m.team,
                };
                theirs == side
            })
            .map(|m| m.id.clone())
            .collect();
        for id in recipients {
            self.send_to(&id, message.clone());
        }
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
        if !self.quick
            && self
                .members
                .iter()
                .any(|m| m.tx.is_none() || (!m.ready && m.id != self.host_id))
        {
            return Err(RoomError::NotReady);
        }

        let setup = MatchSetup {
            seats: self.members.len(),
            players: self
                .members
                .iter()
                .map(|m| SeatInfo {
                    nickname: m.nickname.clone(),
                    team: m.team,
                    skin: m.account.as_ref().and_then(|a| a.skin.clone()),
                    outfit: m.account.as_ref().and_then(|a| a.outfit.clone()),
                })
                .collect(),
            round: self.round,
            options: self.options.clone(),
        };
        let mut active = matches::create(self.game, &setup).map_err(|reject| match reject {
            Reject::TeamsUneven => RoomError::TeamsUneven,
            _ => RoomError::InvalidOptions,
        })?;
        for (seat, member) in self.members.iter_mut().enumerate() {
            member.seat = Some(seat);
        }
        let deliveries = active.start(now);
        self.next_tick = active.tick_interval().map(|interval| now + interval);
        self.active = Some(active);
        self.restart_at = None;

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
                self.settle(now);
            }
            Err(reject) => self.send_to(player_id, ServerMessage::error(reject.code())),
        }
    }

    fn tick(&mut self, now: Instant) {
        let Some(active) = self.active.as_mut() else {
            self.next_tick = None;
            if self.restart_at.is_some_and(|at| now >= at) {
                self.restart_at = None;
                let host = self.host_id.clone();
                if !self.members.is_empty()
                    && let Err(error) = self.start(&host, now)
                {
                    debug!(code = %self.code, error = error.code(), "quick restart failed");
                }
            }
            return;
        };
        let deliveries = active.tick(now);
        self.next_tick = active.tick_interval().map(|interval| now + interval);
        self.deliver(deliveries);
        self.settle(now);
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
    fn settle(&mut self, now: Instant) {
        let Some(outcome) = self.active.as_ref().and_then(|active| active.outcome()) else {
            return;
        };
        if let Some(active) = self.active.take() {
            self.report(active.as_ref());
            if let Some(options) = active.next_options(&self.options) {
                self.options = options;
            }
        }
        self.next_tick = None;
        self.round += 1;
        self.broadcast(ServerMessage::new("match.finish", &outcome));
        for member in &mut self.members {
            member.ready = false;
            member.seat = None;
        }
        if self.quick {
            self.restart_at = Some(now + QUICK_RESTART);
            self.next_tick = self.restart_at;
        }
        self.broadcast_state();
        info!(code = %self.code, reason = outcome.reason, "match finished");
    }

    // Results of signed-in players go to the API; bots and guests stay anonymous.
    fn report(&self, active: &dyn Match) {
        let Some(reporter) = &self.registry.reporter else {
            return;
        };
        let Some(mut report) = active.report() else {
            return;
        };
        let accounts: Vec<Value> = self
            .members
            .iter()
            .filter_map(|m| {
                let account = m.account.as_ref()?;
                Some(json!({ "seat": m.seat?, "userId": account.id, "username": account.username }))
            })
            .collect();
        if accounts.is_empty() {
            return;
        }
        report["id"] = Value::String(new_match_id());
        report["accounts"] = Value::Array(accounts);
        if reporter.try_send(report).is_err() {
            debug!(code = %self.code, "match report queue full; result dropped");
        }
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
        let (min, _) = self.game.players();
        let phase = if self.active.is_some() {
            "playing"
        } else {
            "lobby"
        };
        {
            let mut info = self.info.lock().expect("room info lock");
            info.players = self.members.len();
            info.phase = phase;
            info.map = self
                .options
                .get("map")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
        let view = RoomView {
            code: &self.code,
            game: self.game.slug(),
            options: &self.options,
            host_id: &self.host_id,
            phase,
            min_players: min,
            max_players: self.max_players(),
            solo: self.solo,
            quick: self.quick,
            members: self
                .members
                .iter()
                .map(|m| MemberView {
                    id: &m.id,
                    nickname: &m.nickname,
                    ready: m.ready,
                    connected: m.tx.is_some(),
                    seat: m.seat,
                    team: m.team,
                    username: m.account.as_ref().map(|a| a.username.as_str()),
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
                account: None,
                party: None,
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
    async fn siper_bot_rooms_start_alone_and_stay_private() {
        let registry = Registry::default();
        let handle = registry
            .create(
                "siper",
                json!({ "mode": "tdm", "bots": "easy", "solo": true }),
            )
            .unwrap();
        let (host, mut host_rx) = link("a");
        let (other, _other_rx) = link("b");
        join(&handle, host).await.unwrap();
        assert_eq!(join(&handle, other).await, Err(RoomError::Full));
        assert!(
            registry.list("siper").is_empty(),
            "private rooms are not listed"
        );
        handle
            .tx
            .send(RoomCommand::Start {
                player_id: "a".into(),
            })
            .await
            .unwrap();
        let start = next_of(&mut host_rx, "match.start").await;
        assert_eq!(start.payload["seat"], 0);
        let roster = next_of(&mut host_rx, "event").await;
        assert_eq!(roster.payload["t"], "roster");
        assert_eq!(roster.payload["players"].as_array().unwrap().len(), 10);
    }

    #[tokio::test]
    async fn quick_rooms_start_on_join_and_take_drop_ins() {
        let registry = Registry::default();
        let handle = registry.quick("siper", "ffa", 1).unwrap();
        let (first, mut first_rx) = link("a");
        join(&handle, first).await.unwrap();
        next_of(&mut first_rx, "match.start").await;
        let again = registry.quick("siper", "ffa", 1).unwrap();
        assert_eq!(again.code, handle.code, "the open room is reused");
        let (second, mut second_rx) = link("b");
        join(&handle, second).await.unwrap();
        let start = next_of(&mut second_rx, "match.start").await;
        assert!(start.payload["seat"].as_u64().unwrap() > 0);
        assert_eq!(registry.list("siper").len(), 1);
    }

    #[tokio::test]
    async fn chat_is_filtered_and_team_chat_stays_on_the_team() {
        let registry = Registry::default();
        let handle = registry.create("siper", json!({ "mode": "tdm" })).unwrap();
        let (a, mut a_rx) = link("a");
        let (b, mut b_rx) = link("b");
        let (c, mut c_rx) = link("c");
        for player in [a, b, c] {
            join(&handle, player).await.unwrap();
        }
        for (id, team) in [("a", 0), ("b", 0), ("c", 1)] {
            handle
                .tx
                .send(RoomCommand::Team {
                    player_id: id.into(),
                    team: Some(team),
                })
                .await
                .unwrap();
        }
        handle
            .tx
            .send(RoomCommand::Chat {
                player_id: "a".into(),
                text: "siktir git".into(),
                team: true,
            })
            .await
            .unwrap();
        let heard = next_of(&mut b_rx, "chat").await;
        assert_eq!(heard.payload["text"], "****** git");
        assert_eq!(heard.payload["team"], true);
        next_of(&mut a_rx, "chat").await;
        handle
            .tx
            .send(RoomCommand::Chat {
                player_id: "c".into(),
                text: "iyi oyunlar".into(),
                team: false,
            })
            .await
            .unwrap();
        let first = next_of(&mut c_rx, "chat").await;
        assert_eq!(first.payload["from"], "p-c", "c never got the team message");
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
