use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use rand::{RngExt, seq::IndexedRandom};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input, remaining_ms};

const WORDS_JSON: &str = include_str!("../../../../games/2d/drawing-party/data/words.json");
const LEAD_IN: Duration = Duration::from_secs(3);
const DRAW_TIME: Duration = Duration::from_secs(80);
const INTERMISSION: Duration = Duration::from_secs(5);
const TICK: Duration = Duration::from_millis(250);
// Canvas coordinates are normalised to 0..=CANVAS on both axes.
const CANVAS: u16 = 1000;
const COLORS: u8 = 8;
const SIZES: u8 = 3;
const MAX_CHUNK_POINTS: usize = 64;
const MAX_ROUND_POINTS: usize = 30_000;
const MAX_GUESS_CHARS: usize = 40;
const HINT_AT: [f64; 2] = [0.5, 0.75];
const GUESS_POINTS: i64 = 100;
const GUESS_STEP: i64 = 15;
const GUESS_FLOOR: i64 = 40;
const TIME_POINTS: f64 = 50.0;
const DRAWER_POINTS: i64 = 25;

#[derive(Deserialize)]
struct Words {
    tr: Vec<String>,
    en: Vec<String>,
}

fn words() -> &'static Words {
    static WORDS: OnceLock<Words> = OnceLock::new();
    WORDS.get_or_init(|| serde_json::from_str(WORDS_JSON).expect("drawing words.json is valid"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct DrawingOptions {
    pub locale: String,
}

pub fn parse_options(options: &Value) -> Result<DrawingOptions, Reject> {
    let parsed: DrawingOptions =
        serde_json::from_value(options.clone()).map_err(|_| Reject::InvalidOptions)?;
    if matches!(parsed.locale.as_str(), "tr" | "en") {
        Ok(parsed)
    } else {
        Err(Reject::InvalidOptions)
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum DrawInput {
    Stroke {
        id: u32,
        color: u8,
        size: u8,
        points: Vec<[u16; 2]>,
    },
    Clear,
    Undo,
    Guess {
        text: String,
    },
}

#[derive(Debug, Clone, Serialize)]
struct Stroke {
    id: u32,
    color: u8,
    size: u8,
    points: Vec<[u16; 2]>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    LeadIn { until: Instant },
    Drawing { started: Instant, deadline: Instant },
    Intermission { until: Instant },
    Done,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot<'a> {
    phase: &'static str,
    round: usize,
    total: usize,
    drawer: usize,
    word_shape: Vec<usize>,
    revealed: &'a [(usize, char)],
    remaining_ms: u64,
    guessed: Vec<bool>,
    scores: &'a [i64],
}

pub struct Drawing {
    pool: Vec<String>,
    order: Vec<usize>,
    round: usize,
    phase: Phase,
    word: String,
    revealed: Vec<(usize, char)>,
    hints_given: usize,
    strokes: Vec<Stroke>,
    round_points: usize,
    guess_order: Vec<usize>,
    gained: Vec<i64>,
    scores: Vec<i64>,
    active: Vec<bool>,
    outcome: Option<Outcome>,
}

impl Drawing {
    pub fn new(setup: &MatchSetup) -> Result<Self, Reject> {
        let options = parse_options(&setup.options)?;
        let pool = match options.locale.as_str() {
            "tr" => words().tr.clone(),
            _ => words().en.clone(),
        };
        Ok(Self::with_pool(pool, setup.seats))
    }

    fn with_pool(pool: Vec<String>, seats: usize) -> Self {
        Self {
            pool,
            order: (0..seats).collect(),
            round: 0,
            phase: Phase::Done,
            word: String::new(),
            revealed: Vec::new(),
            hints_given: 0,
            strokes: Vec::new(),
            round_points: 0,
            guess_order: Vec::new(),
            gained: vec![0; seats],
            scores: vec![0; seats],
            active: vec![true; seats],
            outcome: None,
        }
    }

    fn drawer(&self) -> usize {
        self.order[self.round]
    }

    fn snapshot(&self, now: Instant) -> Delivery {
        let (phase, remaining) = match self.phase {
            Phase::LeadIn { until } => ("leadIn", remaining_ms(until, now)),
            Phase::Drawing { deadline, .. } => ("drawing", remaining_ms(deadline, now)),
            Phase::Intermission { until } => ("intermission", remaining_ms(until, now)),
            Phase::Done => ("done", 0),
        };
        let drawer = self.drawer();
        Delivery::snapshot(Snapshot {
            phase,
            round: self.round,
            total: self.order.len(),
            drawer,
            word_shape: self
                .word
                .split(' ')
                .map(|part| part.chars().count())
                .collect(),
            revealed: &self.revealed,
            remaining_ms: remaining,
            guessed: (0..self.scores.len())
                .map(|seat| self.guess_order.contains(&seat))
                .collect(),
            scores: &self.scores,
        })
    }

    fn word_event(&self) -> Delivery {
        Delivery::event(
            Audience::Seat(self.drawer()),
            json!({ "kind": "word", "word": self.word }),
        )
    }

    fn begin_round(&mut self, now: Instant) -> Vec<Delivery> {
        while self.round < self.order.len() && !self.active[self.drawer()] {
            self.round += 1;
        }
        if self.round >= self.order.len() {
            self.finish();
            return Vec::new();
        }
        let index = rand::rng().random_range(0..self.pool.len());
        self.word = self.pool.swap_remove(index);
        self.revealed.clear();
        self.hints_given = 0;
        self.strokes.clear();
        self.round_points = 0;
        self.guess_order.clear();
        self.gained.iter_mut().for_each(|gained| *gained = 0);
        self.phase = Phase::Drawing {
            started: now,
            deadline: now + DRAW_TIME,
        };
        vec![self.snapshot(now), self.word_event()]
    }

    fn end_round(&mut self, now: Instant) -> Vec<Delivery> {
        self.phase = Phase::Intermission {
            until: now + INTERMISSION,
        };
        vec![
            Delivery::event(
                Audience::All,
                json!({
                    "kind": "roundEnd",
                    "word": self.word,
                    "gained": self.gained,
                    "scores": self.scores,
                }),
            ),
            self.snapshot(now),
        ]
    }

    fn finish(&mut self) {
        self.phase = Phase::Done;
        self.outcome = Some(Outcome::ranked(self.scores.clone(), "rounds"));
    }

    fn guessers_done(&self) -> bool {
        let drawer = self.drawer();
        (0..self.scores.len())
            .filter(|&seat| seat != drawer && self.active[seat])
            .all(|seat| self.guess_order.contains(&seat))
    }

    fn stroke(&mut self, seat: usize, stroke: Stroke) -> Result<Vec<Delivery>, Reject> {
        if seat != self.drawer() {
            return Err(Reject::NotYourTurn);
        }
        let valid = stroke.color < COLORS
            && stroke.size < SIZES
            && (1..=MAX_CHUNK_POINTS).contains(&stroke.points.len())
            && stroke
                .points
                .iter()
                .all(|&[x, y]| x <= CANVAS && y <= CANVAS);
        if !valid {
            return Err(Reject::InvalidInput);
        }
        if self.round_points + stroke.points.len() > MAX_ROUND_POINTS {
            return Err(Reject::NotNow);
        }
        self.round_points += stroke.points.len();

        let relay = Delivery::event(
            Audience::AllExcept(seat),
            json!({
                "kind": "stroke",
                "id": stroke.id,
                "color": stroke.color,
                "size": stroke.size,
                "points": stroke.points,
            }),
        );
        match self.strokes.last_mut() {
            Some(last) if last.id == stroke.id => last.points.extend(stroke.points),
            _ => self.strokes.push(stroke),
        }
        Ok(vec![relay])
    }

    fn guess(&mut self, seat: usize, text: &str, now: Instant) -> Result<Vec<Delivery>, Reject> {
        let Phase::Drawing { started, deadline } = self.phase else {
            return Err(Reject::NotNow);
        };
        if seat == self.drawer() || self.guess_order.contains(&seat) {
            return Err(Reject::NotNow);
        }
        if text.chars().count() > MAX_GUESS_CHARS {
            return Err(Reject::InvalidInput);
        }
        let guess = normalize(text);
        let target = normalize(&self.word);
        if guess.is_empty() {
            return Err(Reject::InvalidInput);
        }
        // Wrong guesses stay private: the product has no free-text chat.
        if guess != target {
            let close = target.chars().count() >= 4 && edit_distance(&guess, &target) <= 1;
            let kind = if close { "close" } else { "wrong" };
            return Ok(vec![Delivery::event(
                Audience::Seat(seat),
                json!({ "kind": kind }),
            )]);
        }

        let order = self.guess_order.len() as i64;
        let left = deadline.saturating_duration_since(now).as_secs_f64()
            / (deadline - started).as_secs_f64();
        let points = (GUESS_POINTS - GUESS_STEP * order).max(GUESS_FLOOR)
            + (TIME_POINTS * left).round() as i64;
        self.guess_order.push(seat);
        self.gained[seat] += points;
        self.scores[seat] += points;
        let drawer = self.drawer();
        self.gained[drawer] += DRAWER_POINTS;
        self.scores[drawer] += DRAWER_POINTS;

        let mut deliveries = vec![
            Delivery::event(
                Audience::All,
                json!({ "kind": "guessed", "seat": seat, "scores": self.scores }),
            ),
            Delivery::event(
                Audience::Seat(seat),
                json!({ "kind": "word", "word": self.word }),
            ),
        ];
        if self.guessers_done() {
            deliveries.extend(self.end_round(now));
        }
        Ok(deliveries)
    }

    fn maybe_hint(
        &mut self,
        started: Instant,
        deadline: Instant,
        now: Instant,
    ) -> Option<Delivery> {
        let threshold = *HINT_AT.get(self.hints_given)?;
        let elapsed = (now - started).as_secs_f64() / (deadline - started).as_secs_f64();
        if elapsed < threshold {
            return None;
        }
        self.hints_given += 1;
        let hidden: Vec<(usize, char)> = self
            .word
            .chars()
            .enumerate()
            .filter(|(index, ch)| *ch != ' ' && !self.revealed.iter().any(|(i, _)| i == index))
            .collect();
        // Never give away the whole word through hints.
        if hidden.len() <= 2 {
            return None;
        }
        let &(index, letter) = hidden.choose(&mut rand::rng())?;
        self.revealed.push((index, letter));
        Some(Delivery::event(
            Audience::All,
            json!({ "kind": "hint", "index": index, "letter": letter }),
        ))
    }
}

impl Match for Drawing {
    fn start(&mut self, now: Instant) -> Vec<Delivery> {
        self.phase = Phase::LeadIn {
            until: now + LEAD_IN,
        };
        vec![self.snapshot(now)]
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        let input: DrawInput = parse_input(payload)?;
        if !matches!(self.phase, Phase::Drawing { .. }) {
            return Err(Reject::NotNow);
        }
        match input {
            DrawInput::Stroke {
                id,
                color,
                size,
                points,
            } => self.stroke(
                seat,
                Stroke {
                    id,
                    color,
                    size,
                    points,
                },
            ),
            DrawInput::Clear | DrawInput::Undo if seat != self.drawer() => Err(Reject::NotYourTurn),
            DrawInput::Clear => {
                self.strokes.clear();
                Ok(vec![Delivery::event(
                    Audience::AllExcept(seat),
                    json!({ "kind": "clear" }),
                )])
            }
            DrawInput::Undo => {
                self.strokes.pop();
                Ok(vec![Delivery::event(
                    Audience::AllExcept(seat),
                    json!({ "kind": "undo" }),
                )])
            }
            DrawInput::Guess { text } => self.guess(seat, &text, now),
        }
    }

    fn tick(&mut self, now: Instant) -> Vec<Delivery> {
        match self.phase {
            Phase::LeadIn { until } if now >= until => self.begin_round(now),
            Phase::Drawing { deadline, .. } if now >= deadline => self.end_round(now),
            Phase::Drawing { started, deadline } => self
                .maybe_hint(started, deadline, now)
                .into_iter()
                .collect(),
            Phase::Intermission { until } if now >= until => {
                self.round += 1;
                self.begin_round(now)
            }
            _ => Vec::new(),
        }
    }

    fn tick_interval(&self) -> Option<Duration> {
        Some(TICK)
    }

    fn sync(&self, seat: usize, now: Instant) -> Vec<Delivery> {
        let mut snapshot = self.snapshot(now);
        snapshot.audience = Audience::Seat(seat);
        let mut deliveries = vec![
            snapshot,
            Delivery::event(
                Audience::Seat(seat),
                json!({ "kind": "strokes", "strokes": self.strokes }),
            ),
        ];
        if matches!(self.phase, Phase::Drawing { .. })
            && (seat == self.drawer() || self.guess_order.contains(&seat))
        {
            deliveries.push(Delivery::event(
                Audience::Seat(seat),
                json!({ "kind": "word", "word": self.word }),
            ));
        }
        deliveries
    }

    fn forfeit(&mut self, seat: usize, now: Instant) -> Vec<Delivery> {
        self.active[seat] = false;
        if self.active.iter().filter(|active| **active).count() < 2 {
            self.finish();
            return Vec::new();
        }
        if matches!(self.phase, Phase::Drawing { .. })
            && (seat == self.drawer() || self.guessers_done())
        {
            return self.end_round(now);
        }
        Vec::new()
    }

    fn outcome(&self) -> Option<Outcome> {
        self.outcome.clone()
    }
}

pub fn normalize(text: &str) -> String {
    let folded: String = text
        .chars()
        .flat_map(char::to_lowercase)
        .map(|ch| match ch {
            'ı' | 'î' => 'i',
            'ç' => 'c',
            'ğ' => 'g',
            'ö' => 'o',
            'ş' => 's',
            'ü' | 'û' => 'u',
            'â' => 'a',
            other => other,
        })
        .filter(|ch| ch.is_alphanumeric() || ch.is_whitespace())
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut current = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j] + cost)
                .min(previous[j + 1] + 1)
                .min(current[j] + 1);
        }
        previous = current;
    }
    previous[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(seats: usize) -> (Drawing, Instant) {
        let mut game = Drawing::with_pool(vec!["kaplumbağa".to_owned()], seats);
        let now = Instant::now();
        game.start(now);
        let begun = now + LEAD_IN;
        game.tick(begun);
        (game, begun)
    }

    #[test]
    fn word_lists_load() {
        assert!(words().tr.len() >= 150);
        assert!(words().en.len() >= 150);
        assert!(parse_options(&json!({ "locale": "de" })).is_err());
    }

    #[test]
    fn normalizes_turkish_letters_and_case() {
        assert_eq!(normalize("  KAPLUMBAĞA "), "kaplumbaga");
        assert_eq!(normalize("Işık!"), "isik");
        assert_eq!(normalize("Deniz   Yıldızı"), "deniz yildizi");
        assert_eq!(edit_distance("kaplumbaa", "kaplumbaga"), 1);
    }

    #[test]
    fn only_the_drawer_draws_and_strokes_are_bounded() {
        let (mut game, now) = game(3);
        let stroke = |id: u32, x: u16| json!({ "action": "stroke", "id": id, "color": 0, "size": 1, "points": [[x, 10]] });
        assert_eq!(
            game.input(1, stroke(1, 10), now).unwrap_err(),
            Reject::NotYourTurn
        );
        assert_eq!(
            game.input(0, stroke(1, 1001), now).unwrap_err(),
            Reject::InvalidInput
        );
        let relay = game.input(0, stroke(1, 10), now).unwrap();
        assert_eq!(relay[0].audience, Audience::AllExcept(0));
        game.input(0, stroke(1, 20), now).unwrap();
        assert_eq!(game.strokes.len(), 1);
        assert_eq!(game.strokes[0].points.len(), 2);
    }

    #[test]
    fn guesses_score_by_order_and_end_the_round() {
        let (mut game, now) = game(3);
        let guess = |text: &str| json!({ "action": "guess", "text": text });

        let wrong = game.input(1, guess("kurbağa"), now).unwrap();
        assert_eq!(wrong[0].audience, Audience::Seat(1));
        let close = game.input(1, guess("kaplumbaa"), now).unwrap();
        assert_eq!(close[0].payload["kind"], "close");
        assert_eq!(game.input(0, guess("x"), now).unwrap_err(), Reject::NotNow);

        game.input(1, guess("Kaplumbağa"), now).unwrap();
        let last = game.input(2, guess("kaplumbaga"), now).unwrap();
        assert!(last.iter().any(|d| d.payload["kind"] == "roundEnd"));
        assert_eq!(game.scores, vec![50, 150, 135]);
    }

    #[test]
    fn hints_reveal_letters_over_time() {
        let (mut game, now) = game(3);
        let half = now + DRAW_TIME / 2;
        let hint = game.tick(half);
        assert_eq!(hint.len(), 1);
        assert_eq!(game.revealed.len(), 1);
    }
}
