use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

pub mod air_hockey;
pub mod chess;
pub mod connect_four;
pub mod drawing;
pub mod kart;
pub mod siper;
pub mod trivia;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameKind {
    ConnectFour,
    ChessArena,
    AirHockey,
    TriviaBattle,
    DrawingParty,
    NeonKartRacing,
    Siper,
}

impl GameKind {
    pub fn from_slug(slug: &str) -> Option<Self> {
        Some(match slug {
            "connect-four" => GameKind::ConnectFour,
            "chess-arena" => GameKind::ChessArena,
            "air-hockey" => GameKind::AirHockey,
            "trivia-battle" => GameKind::TriviaBattle,
            "drawing-party" => GameKind::DrawingParty,
            "neon-kart-racing" => GameKind::NeonKartRacing,
            "siper" => GameKind::Siper,
            _ => return None,
        })
    }

    pub fn slug(self) -> &'static str {
        match self {
            GameKind::ConnectFour => "connect-four",
            GameKind::ChessArena => "chess-arena",
            GameKind::AirHockey => "air-hockey",
            GameKind::TriviaBattle => "trivia-battle",
            GameKind::DrawingParty => "drawing-party",
            GameKind::NeonKartRacing => "neon-kart-racing",
            GameKind::Siper => "siper",
        }
    }

    pub fn players(self) -> (usize, usize) {
        match self {
            GameKind::ConnectFour | GameKind::ChessArena | GameKind::AirHockey => (2, 2),
            GameKind::TriviaBattle => (2, 12),
            GameKind::DrawingParty => (3, 8),
            GameKind::NeonKartRacing => (2, 8),
            GameKind::Siper => (1, 10),
        }
    }
}

pub struct MatchSetup {
    pub seats: usize,
    // One entry per seat, in seat order.
    pub players: Vec<SeatInfo>,
    // Increments on every rematch in the same room; used to alternate who opens.
    pub round: u32,
    pub options: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Audience {
    All,
    Seat(usize),
    AllExcept(usize),
}

#[derive(Debug, Clone)]
pub struct Delivery {
    pub audience: Audience,
    pub kind: &'static str,
    pub payload: Value,
}

impl Delivery {
    pub fn snapshot(payload: impl Serialize) -> Self {
        Self::build(Audience::All, "state.snapshot", payload)
    }

    pub fn event(audience: Audience, payload: impl Serialize) -> Self {
        Self::build(audience, "event", payload)
    }

    fn build(audience: Audience, kind: &'static str, payload: impl Serialize) -> Self {
        Self {
            audience,
            kind,
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reject {
    InvalidInput,
    NotYourTurn,
    IllegalMove,
    NotNow,
    InvalidOptions,
    TeamsUneven,
}

impl Reject {
    pub fn code(self) -> &'static str {
        match self {
            Reject::InvalidInput => "invalid_input",
            Reject::NotYourTurn => "not_your_turn",
            Reject::IllegalMove => "illegal_move",
            Reject::NotNow => "not_now",
            Reject::InvalidOptions => "invalid_options",
            Reject::TeamsUneven => "teams_uneven",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Outcome {
    // 1 is first place; tied seats share a placement.
    pub placements: Vec<u32>,
    pub scores: Vec<i64>,
    pub reason: &'static str,
}

impl Outcome {
    pub fn duel(winner: Option<usize>, reason: &'static str) -> Self {
        let placements = match winner {
            Some(0) => vec![1, 2],
            Some(_) => vec![2, 1],
            None => vec![1, 1],
        };
        let scores = placements
            .iter()
            .map(|&p| i64::from(winner.is_some() && p == 1))
            .collect();
        Self {
            placements,
            scores,
            reason,
        }
    }

    // Higher score places better.
    pub fn ranked(scores: Vec<i64>, reason: &'static str) -> Self {
        let placements = scores
            .iter()
            .map(|score| 1 + scores.iter().filter(|other| *other > score).count() as u32)
            .collect();
        Self {
            placements,
            scores,
            reason,
        }
    }
}

pub trait Match: Send {
    fn start(&mut self, now: Instant) -> Vec<Delivery>;
    fn input(&mut self, seat: usize, payload: Value, now: Instant)
    -> Result<Vec<Delivery>, Reject>;
    fn tick(&mut self, _now: Instant) -> Vec<Delivery> {
        Vec::new()
    }
    fn tick_interval(&self) -> Option<Duration> {
        None
    }
    // Full state for a seat that (re)joins mid-match.
    fn sync(&self, seat: usize, now: Instant) -> Vec<Delivery>;
    // The seat is gone for good (left or reconnect grace ran out).
    fn forfeit(&mut self, seat: usize, now: Instant) -> Vec<Delivery>;
    fn outcome(&self) -> Option<Outcome>;
    // Games with drop-in seats hand a newcomer one (usually a bot's) while the match runs.
    fn admit(
        &mut self,
        _nickname: &str,
        _team: Option<u8>,
        _now: Instant,
    ) -> Option<(usize, Vec<Delivery>)> {
        None
    }
    fn team_of(&self, _seat: usize) -> Option<u8> {
        None
    }
    // Per-player statistics kept after the match, once there is an outcome.
    fn report(&self) -> Option<Value> {
        None
    }
    // Room options for the next match when the players voted for a change.
    fn next_options(&self, _current: &Value) -> Option<Value> {
        None
    }
}

pub fn create(kind: GameKind, setup: &MatchSetup) -> Result<Box<dyn Match>, Reject> {
    Ok(match kind {
        GameKind::ConnectFour => Box::new(connect_four::ConnectFour::new(setup)),
        GameKind::ChessArena => Box::new(chess::ChessMatch::new(setup)?),
        GameKind::AirHockey => Box::new(air_hockey::AirHockey::new(setup)),
        GameKind::TriviaBattle => Box::new(trivia::Trivia::new(setup)?),
        GameKind::DrawingParty => Box::new(drawing::Drawing::new(setup)?),
        GameKind::NeonKartRacing => Box::new(kart::KartRace::new(setup)),
        GameKind::Siper => Box::new(siper::SiperMatch::new(setup)?),
    })
}

pub fn validate_options(kind: GameKind, options: &Value) -> Result<(), Reject> {
    match kind {
        GameKind::ChessArena => chess::parse_options(options).map(|_| ()),
        GameKind::TriviaBattle => trivia::parse_options(options).map(|_| ()),
        GameKind::DrawingParty => drawing::parse_options(options).map(|_| ()),
        GameKind::Siper => siper::parse_options(options).map(|_| ()),
        _ => Ok(()),
    }
}

#[derive(Debug, Clone, Default)]
pub struct SeatInfo {
    pub nickname: String,
    pub team: Option<u8>,
    pub skin: Option<String>,
    pub outfit: Option<String>,
}

pub fn parse_input<T: for<'de> serde::Deserialize<'de>>(payload: Value) -> Result<T, Reject> {
    serde_json::from_value(payload).map_err(|_| Reject::InvalidInput)
}

pub fn remaining_ms(deadline: Instant, now: Instant) -> u64 {
    deadline.saturating_duration_since(now).as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranked_outcome_shares_ties() {
        let outcome = Outcome::ranked(vec![300, 500, 300, 100], "done");
        assert_eq!(outcome.placements, vec![2, 1, 2, 4]);
    }

    #[test]
    fn duel_outcome() {
        assert_eq!(Outcome::duel(Some(1), "x").placements, vec![2, 1]);
        assert_eq!(Outcome::duel(None, "x").scores, vec![0, 0]);
    }
}
