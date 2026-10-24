use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shakmaty::{
    Chess, Color, EnPassantMode, Position,
    fen::{Epd, Fen},
    san::SanPlus,
    uci::UciMove,
};

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input};

const ALLOWED_MINUTES: [u64; 2] = [3, 5];
const TICK: Duration = Duration::from_millis(100);
// FIDE's automatic thresholds; the client offers no claim button, so the
// server ends the game on its own once they are reached.
const REPETITION_LIMIT: u8 = 3;
const HALFMOVE_LIMIT: u32 = 100;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ChessOptions {
    pub minutes: u64,
}

pub fn parse_options(options: &Value) -> Result<ChessOptions, Reject> {
    let parsed: ChessOptions =
        serde_json::from_value(options.clone()).map_err(|_| Reject::InvalidOptions)?;
    if ALLOWED_MINUTES.contains(&parsed.minutes) {
        Ok(parsed)
    } else {
        Err(Reject::InvalidOptions)
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum ChessInput {
    Move { uci: String },
    Resign,
    OfferDraw,
    AcceptDraw,
    DeclineDraw,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot<'a> {
    fen: String,
    white_seat: usize,
    turn: &'static str,
    // Remaining time per colour at the moment of this snapshot.
    clocks: Clocks,
    last_move: Option<&'a str>,
    history: &'a [String],
    draw_offer: Option<usize>,
}

#[derive(Serialize)]
struct Clocks {
    white: u64,
    black: u64,
}

pub struct ChessMatch {
    position: Chess,
    white_seat: usize,
    remaining: [Duration; 2],
    turn_started: Option<Instant>,
    history: Vec<String>,
    last_move: Option<String>,
    repetitions: HashMap<String, u8>,
    draw_offer: Option<usize>,
    outcome: Option<Outcome>,
}

impl ChessMatch {
    pub fn new(setup: &MatchSetup) -> Result<Self, Reject> {
        let options = parse_options(&setup.options)?;
        let clock = Duration::from_secs(options.minutes * 60);
        let position = Chess::default();
        let mut repetitions = HashMap::new();
        repetitions.insert(repetition_key(&position), 1);
        Ok(Self {
            position,
            white_seat: (setup.round % 2) as usize,
            remaining: [clock, clock],
            turn_started: None,
            history: Vec::new(),
            last_move: None,
            repetitions,
            draw_offer: None,
            outcome: None,
        })
    }

    fn seat_color(&self, seat: usize) -> Color {
        if seat == self.white_seat {
            Color::White
        } else {
            Color::Black
        }
    }

    fn color_seat(&self, color: Color) -> usize {
        match color {
            Color::White => self.white_seat,
            Color::Black => 1 - self.white_seat,
        }
    }

    fn clocks_at(&self, now: Instant) -> [Duration; 2] {
        let mut clocks = self.remaining;
        if let (Some(started), None) = (self.turn_started, &self.outcome) {
            let index = color_index(self.position.turn());
            clocks[index] = clocks[index].saturating_sub(now - started);
        }
        clocks
    }

    fn snapshot(&self, now: Instant) -> Delivery {
        let clocks = self.clocks_at(now);
        Delivery::snapshot(Snapshot {
            fen: Fen::from_position(&self.position, EnPassantMode::Legal).to_string(),
            white_seat: self.white_seat,
            turn: match self.position.turn() {
                Color::White => "w",
                Color::Black => "b",
            },
            clocks: Clocks {
                white: clocks[0].as_millis() as u64,
                black: clocks[1].as_millis() as u64,
            },
            last_move: self.last_move.as_deref(),
            history: &self.history,
            draw_offer: self.draw_offer,
        })
    }

    fn play(&mut self, seat: usize, uci: &str, now: Instant) -> Result<(), Reject> {
        if self.seat_color(seat) != self.position.turn() {
            return Err(Reject::NotYourTurn);
        }
        let uci: UciMove = uci.parse().map_err(|_| Reject::InvalidInput)?;
        let chess_move = uci
            .to_move(&self.position)
            .map_err(|_| Reject::IllegalMove)?;

        let mover = color_index(self.position.turn());
        if let Some(started) = self.turn_started {
            self.remaining[mover] = self.remaining[mover].saturating_sub(now - started);
            if self.remaining[mover].is_zero() {
                self.flag(self.position.turn());
                return Ok(());
            }
        }

        let san = SanPlus::from_move_and_play_unchecked(&mut self.position, chess_move);
        self.history.push(san.to_string());
        self.last_move = Some(uci.to_string());
        self.turn_started = Some(now);
        self.draw_offer = None;

        let count = self
            .repetitions
            .entry(repetition_key(&self.position))
            .or_insert(0);
        *count += 1;
        let repeated = *count >= REPETITION_LIMIT;

        self.outcome = if self.position.is_checkmate() {
            Some(Outcome::duel(Some(seat), "checkmate"))
        } else if self.position.is_stalemate() {
            Some(Outcome::duel(None, "stalemate"))
        } else if self.position.is_insufficient_material() {
            Some(Outcome::duel(None, "insufficient"))
        } else if repeated {
            Some(Outcome::duel(None, "repetition"))
        } else if self.position.halfmoves() >= HALFMOVE_LIMIT {
            Some(Outcome::duel(None, "fiftyMove"))
        } else {
            None
        };
        Ok(())
    }

    fn flag(&mut self, loser: Color) {
        let index = color_index(loser);
        self.remaining[index] = Duration::ZERO;
        // Running out of time only loses if the opponent could still mate.
        self.outcome = if self.position.has_insufficient_material(loser.other()) {
            Some(Outcome::duel(None, "timeoutInsufficient"))
        } else {
            Some(Outcome::duel(
                Some(self.color_seat(loser.other())),
                "timeout",
            ))
        };
    }
}

impl Match for ChessMatch {
    fn start(&mut self, now: Instant) -> Vec<Delivery> {
        self.turn_started = Some(now);
        vec![self.snapshot(now)]
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        if self.outcome.is_some() {
            return Err(Reject::NotNow);
        }
        match parse_input::<ChessInput>(payload)? {
            ChessInput::Move { uci } => self.play(seat, &uci, now)?,
            ChessInput::Resign => {
                self.outcome = Some(Outcome::duel(Some(1 - seat), "resign"));
            }
            ChessInput::OfferDraw => {
                if self.draw_offer.is_some() {
                    return Err(Reject::NotNow);
                }
                self.draw_offer = Some(seat);
            }
            ChessInput::AcceptDraw => {
                if self.draw_offer != Some(1 - seat) {
                    return Err(Reject::NotNow);
                }
                self.outcome = Some(Outcome::duel(None, "agreement"));
            }
            ChessInput::DeclineDraw => {
                if self.draw_offer != Some(1 - seat) {
                    return Err(Reject::NotNow);
                }
                self.draw_offer = None;
            }
        }
        if self.outcome.is_some() {
            self.remaining = self.clocks_at(now);
        }
        Ok(vec![self.snapshot(now)])
    }

    fn tick(&mut self, now: Instant) -> Vec<Delivery> {
        if self.outcome.is_some() {
            return Vec::new();
        }
        let turn = self.position.turn();
        if self.clocks_at(now)[color_index(turn)].is_zero() {
            self.flag(turn);
            return vec![self.snapshot(now)];
        }
        Vec::new()
    }

    fn tick_interval(&self) -> Option<Duration> {
        Some(TICK)
    }

    fn sync(&self, seat: usize, now: Instant) -> Vec<Delivery> {
        let mut snapshot = self.snapshot(now);
        snapshot.audience = Audience::Seat(seat);
        vec![snapshot]
    }

    fn forfeit(&mut self, seat: usize, _now: Instant) -> Vec<Delivery> {
        if self.outcome.is_none() {
            self.outcome = Some(Outcome::duel(Some(1 - seat), "forfeit"));
        }
        Vec::new()
    }

    fn outcome(&self) -> Option<Outcome> {
        self.outcome.clone()
    }
}

fn color_index(color: Color) -> usize {
    match color {
        Color::White => 0,
        Color::Black => 1,
    }
}

fn repetition_key(position: &Chess) -> String {
    Epd::from_position(position, EnPassantMode::Legal).to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn game(round: u32) -> ChessMatch {
        let mut game = ChessMatch::new(&MatchSetup {
            seats: 2,
            round,
            options: json!({ "minutes": 3 }),
        })
        .unwrap();
        game.start(Instant::now());
        game
    }

    fn mv(game: &mut ChessMatch, seat: usize, uci: &str) -> Result<Vec<Delivery>, Reject> {
        game.input(
            seat,
            json!({ "action": "move", "uci": uci }),
            Instant::now(),
        )
    }

    #[test]
    fn options_are_validated() {
        assert!(parse_options(&json!({ "minutes": 5 })).is_ok());
        assert_eq!(
            parse_options(&json!({ "minutes": 1 })).unwrap_err(),
            Reject::InvalidOptions
        );
        assert_eq!(
            parse_options(&Value::Null).unwrap_err(),
            Reject::InvalidOptions
        );
    }

    #[test]
    fn rejects_illegal_and_out_of_turn_moves() {
        let mut game = game(0);
        assert_eq!(mv(&mut game, 1, "e7e5").unwrap_err(), Reject::NotYourTurn);
        assert_eq!(mv(&mut game, 0, "e2e5").unwrap_err(), Reject::IllegalMove);
        assert_eq!(mv(&mut game, 0, "zz").unwrap_err(), Reject::InvalidInput);
        mv(&mut game, 0, "e2e4").unwrap();
        assert_eq!(game.history, vec!["e4"]);
    }

    #[test]
    fn fools_mate_with_colours_swapped_on_rematch() {
        // Round 1: seat 1 is white.
        let mut game = game(1);
        for (seat, uci) in [(1, "f2f3"), (0, "e7e5"), (1, "g2g4"), (0, "d8h4")] {
            mv(&mut game, seat, uci).unwrap();
        }
        let outcome = game.outcome().unwrap();
        assert_eq!(outcome.reason, "checkmate");
        assert_eq!(outcome.placements, vec![1, 2]);
    }

    #[test]
    fn repetition_ends_in_draw() {
        let mut game = game(0);
        for _ in 0..2 {
            for (seat, uci) in [(0, "g1f3"), (1, "g8f6"), (0, "f3g1"), (1, "f6g8")] {
                mv(&mut game, seat, uci).unwrap();
            }
        }
        assert_eq!(game.outcome().unwrap().reason, "repetition");
    }

    #[test]
    fn clock_runs_out() {
        let mut game = game(0);
        let later = Instant::now() + Duration::from_secs(181);
        let deliveries = game.tick(later);
        assert_eq!(deliveries.len(), 1);
        let outcome = game.outcome().unwrap();
        assert_eq!(outcome.reason, "timeout");
        assert_eq!(outcome.placements, vec![2, 1]);
    }

    #[test]
    fn draw_offer_flow_and_resign() {
        let mut game = game(0);
        let now = Instant::now();
        assert_eq!(
            game.input(0, json!({ "action": "acceptDraw" }), now)
                .unwrap_err(),
            Reject::NotNow
        );
        game.input(0, json!({ "action": "offerDraw" }), now)
            .unwrap();
        game.input(1, json!({ "action": "declineDraw" }), now)
            .unwrap();
        assert!(game.draw_offer.is_none());
        game.input(1, json!({ "action": "resign" }), now).unwrap();
        assert_eq!(game.outcome().unwrap().placements, vec![1, 2]);
    }
}
