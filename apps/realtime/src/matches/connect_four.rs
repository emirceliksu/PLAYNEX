use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input};

const COLUMNS: usize = 7;
const ROWS: usize = 6;
const WIN_LENGTH: usize = 4;
const DIRECTIONS: [(isize, isize); 4] = [(0, 1), (1, 0), (1, 1), (1, -1)];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct Cell {
    row: usize,
    col: usize,
}

#[derive(Deserialize)]
struct DropInput {
    column: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot<'a> {
    // Row-major, row 0 at the top; 0 empty, 1 seat 0, 2 seat 1 (matches the client board).
    slots: &'a [u8],
    turn: usize,
    starter: usize,
    moves: u32,
    last: Option<Cell>,
    win_line: &'a [Cell],
}

pub struct ConnectFour {
    slots: [u8; COLUMNS * ROWS],
    starter: usize,
    turn: usize,
    moves: u32,
    last: Option<Cell>,
    win_line: Vec<Cell>,
    outcome: Option<Outcome>,
}

impl ConnectFour {
    pub fn new(setup: &MatchSetup) -> Self {
        let starter = (setup.round % 2) as usize;
        Self {
            slots: [0; COLUMNS * ROWS],
            starter,
            turn: starter,
            moves: 0,
            last: None,
            win_line: Vec::new(),
            outcome: None,
        }
    }

    fn snapshot(&self) -> Delivery {
        Delivery::snapshot(Snapshot {
            slots: &self.slots,
            turn: self.turn,
            starter: self.starter,
            moves: self.moves,
            last: self.last,
            win_line: &self.win_line,
        })
    }

    fn drop_disc(&mut self, column: usize) -> Result<(), Reject> {
        if column >= COLUMNS {
            return Err(Reject::InvalidInput);
        }
        let row = (0..ROWS)
            .rev()
            .find(|&row| self.slots[row * COLUMNS + column] == 0)
            .ok_or(Reject::IllegalMove)?;

        let disc = self.turn as u8 + 1;
        self.slots[row * COLUMNS + column] = disc;
        self.moves += 1;
        let cell = Cell { row, col: column };
        self.last = Some(cell);

        if let Some(line) = self.winning_line(cell, disc) {
            self.win_line = line;
            self.outcome = Some(Outcome::duel(Some(self.turn), "connect"));
        } else if self.moves as usize == COLUMNS * ROWS {
            self.outcome = Some(Outcome::duel(None, "full"));
        } else {
            self.turn = 1 - self.turn;
        }
        Ok(())
    }

    fn winning_line(&self, from: Cell, disc: u8) -> Option<Vec<Cell>> {
        DIRECTIONS.iter().find_map(|&(dr, dc)| {
            let mut line = vec![from];
            line.extend(self.run(from, dr, dc, disc));
            line.extend(self.run(from, -dr, -dc, disc));
            (line.len() >= WIN_LENGTH).then_some(line)
        })
    }

    fn run(&self, from: Cell, dr: isize, dc: isize, disc: u8) -> Vec<Cell> {
        let mut cells = Vec::new();
        let mut row = from.row as isize + dr;
        let mut col = from.col as isize + dc;
        while (0..ROWS as isize).contains(&row) && (0..COLUMNS as isize).contains(&col) {
            let cell = Cell {
                row: row as usize,
                col: col as usize,
            };
            if self.slots[cell.row * COLUMNS + cell.col] != disc {
                break;
            }
            cells.push(cell);
            row += dr;
            col += dc;
        }
        cells
    }
}

impl Match for ConnectFour {
    fn start(&mut self, _now: Instant) -> Vec<Delivery> {
        vec![self.snapshot()]
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        _now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        if self.outcome.is_some() {
            return Err(Reject::NotNow);
        }
        if seat != self.turn {
            return Err(Reject::NotYourTurn);
        }
        let input: DropInput = parse_input(payload)?;
        self.drop_disc(input.column)?;
        Ok(vec![self.snapshot()])
    }

    fn sync(&self, seat: usize, _now: Instant) -> Vec<Delivery> {
        let mut snapshot = self.snapshot();
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn game() -> ConnectFour {
        ConnectFour::new(&MatchSetup {
            seats: 2,
            round: 0,
            options: Value::Null,
        })
    }

    fn play(game: &mut ConnectFour, seat: usize, column: usize) -> Result<Vec<Delivery>, Reject> {
        game.input(seat, json!({ "column": column }), Instant::now())
    }

    #[test]
    fn rejects_out_of_turn_and_bad_columns() {
        let mut game = game();
        assert_eq!(play(&mut game, 1, 3).unwrap_err(), Reject::NotYourTurn);
        assert_eq!(play(&mut game, 0, 7).unwrap_err(), Reject::InvalidInput);
        assert_eq!(
            game.input(0, json!({ "col": 1 }), Instant::now())
                .unwrap_err(),
            Reject::InvalidInput
        );
    }

    #[test]
    fn full_column_is_illegal() {
        let mut game = game();
        for i in 0..ROWS {
            play(&mut game, i % 2, 0).unwrap();
        }
        assert_eq!(play(&mut game, 0, 0).unwrap_err(), Reject::IllegalMove);
    }

    #[test]
    fn diagonal_win() {
        let mut game = game();
        // Seat 0 builds the diagonal (5,0) (4,1) (3,2) (2,3).
        for (seat, column) in [
            (0, 0),
            (1, 1),
            (0, 1),
            (1, 2),
            (0, 2),
            (1, 3),
            (0, 2),
            (1, 3),
            (0, 3),
            (1, 6),
            (0, 3),
        ] {
            play(&mut game, seat, column).unwrap();
        }
        let outcome = game.outcome().unwrap();
        assert_eq!(outcome.placements, vec![1, 2]);
        assert_eq!(game.win_line.len(), 4);
        assert_eq!(play(&mut game, 1, 4).unwrap_err(), Reject::NotNow);
    }

    #[test]
    fn rematch_alternates_starter_and_forfeit_awards_opponent() {
        let mut game = ConnectFour::new(&MatchSetup {
            seats: 2,
            round: 1,
            options: Value::Null,
        });
        assert_eq!(game.turn, 1);
        game.forfeit(1, Instant::now());
        assert_eq!(game.outcome().unwrap().placements, vec![1, 2]);
    }
}
