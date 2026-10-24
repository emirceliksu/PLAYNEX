use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input, remaining_ms};

// The server only needs ids and answer keys; clients render the localized text
// from the same file, so players with different languages can share a room.
const BANK_JSON: &str = include_str!("../../../../games/2d/trivia-battle/data/questions.json");
pub const ROUNDS: usize = 10;
const ANSWER_COUNT: u8 = 4;
const LEAD_IN: Duration = Duration::from_secs(3);
const QUESTION_TIME: Duration = Duration::from_secs(15);
const REVEAL_TIME: Duration = Duration::from_secs(4);
const TICK: Duration = Duration::from_millis(200);
const BASE_POINTS: i64 = 100;
const SPEED_POINTS: i64 = 100;
const STREAK_BONUS: i64 = 20;
const STREAK_CAP: i64 = 5;

#[derive(Deserialize)]
struct Bank {
    categories: Vec<String>,
    questions: Vec<BankQuestion>,
}

#[derive(Deserialize)]
struct BankQuestion {
    id: String,
    category: String,
    correct: u8,
}

fn bank() -> &'static Bank {
    static BANK: OnceLock<Bank> = OnceLock::new();
    BANK.get_or_init(|| serde_json::from_str(BANK_JSON).expect("trivia questions.json is valid"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct TriviaOptions {
    pub category: String,
}

pub fn parse_options(options: &Value) -> Result<TriviaOptions, Reject> {
    let parsed: TriviaOptions =
        serde_json::from_value(options.clone()).map_err(|_| Reject::InvalidOptions)?;
    if parsed.category == "mixed" || bank().categories.contains(&parsed.category) {
        Ok(parsed)
    } else {
        Err(Reject::InvalidOptions)
    }
}

#[derive(Deserialize)]
struct AnswerInput {
    round: usize,
    choice: u8,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    LeadIn { until: Instant },
    Question { deadline: Instant, opened: Instant },
    Reveal { until: Instant },
    Done,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot<'a> {
    phase: &'static str,
    round: usize,
    total: usize,
    question_id: Option<&'a str>,
    remaining_ms: u64,
    answered: Vec<bool>,
    scores: &'a [i64],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RevealEvent<'a> {
    kind: &'static str,
    round: usize,
    correct: u8,
    choices: &'a [Option<u8>],
    gained: &'a [i64],
    scores: &'a [i64],
    streaks: &'a [i64],
}

pub struct Trivia {
    questions: Vec<(String, u8)>,
    round: usize,
    phase: Phase,
    choices: Vec<Option<u8>>,
    answer_times: Vec<Option<Duration>>,
    scores: Vec<i64>,
    streaks: Vec<i64>,
    active: Vec<bool>,
    outcome: Option<Outcome>,
}

impl Trivia {
    pub fn new(setup: &MatchSetup) -> Result<Self, Reject> {
        let options = parse_options(&setup.options)?;
        let mut pool: Vec<(String, u8)> = bank()
            .questions
            .iter()
            .filter(|q| options.category == "mixed" || q.category == options.category)
            .map(|q| (q.id.clone(), q.correct))
            .collect();
        pool.shuffle(&mut rand::rng());
        pool.truncate(ROUNDS);
        Ok(Self::with_questions(pool, setup.seats))
    }

    fn with_questions(questions: Vec<(String, u8)>, seats: usize) -> Self {
        Self {
            questions,
            round: 0,
            phase: Phase::Done,
            choices: vec![None; seats],
            answer_times: vec![None; seats],
            scores: vec![0; seats],
            streaks: vec![0; seats],
            active: vec![true; seats],
            outcome: None,
        }
    }

    fn snapshot(&self, now: Instant) -> Delivery {
        let (phase, remaining) = match self.phase {
            Phase::LeadIn { until } => ("leadIn", remaining_ms(until, now)),
            Phase::Question { deadline, .. } => ("question", remaining_ms(deadline, now)),
            Phase::Reveal { until } => ("reveal", remaining_ms(until, now)),
            Phase::Done => ("done", 0),
        };
        let question_id = matches!(self.phase, Phase::Question { .. } | Phase::Reveal { .. })
            .then(|| self.questions[self.round].0.as_str());
        Delivery::snapshot(Snapshot {
            phase,
            round: self.round,
            total: self.questions.len(),
            question_id,
            remaining_ms: remaining,
            answered: self.choices.iter().map(Option::is_some).collect(),
            scores: &self.scores,
        })
    }

    fn open_question(&mut self, now: Instant) {
        self.choices.iter_mut().for_each(|choice| *choice = None);
        self.answer_times.iter_mut().for_each(|time| *time = None);
        self.phase = Phase::Question {
            deadline: now + QUESTION_TIME,
            opened: now,
        };
    }

    fn reveal(&mut self, now: Instant) -> Delivery {
        let correct = self.questions[self.round].1;
        let mut gained = vec![0; self.scores.len()];
        for (seat, gain) in gained.iter_mut().enumerate() {
            match (self.choices[seat], self.answer_times[seat]) {
                (Some(choice), Some(taken)) if choice == correct => {
                    self.streaks[seat] += 1;
                    let left = QUESTION_TIME.saturating_sub(taken).as_secs_f64()
                        / QUESTION_TIME.as_secs_f64();
                    let speed = (SPEED_POINTS as f64 * left).round() as i64;
                    let streak = STREAK_BONUS * (self.streaks[seat] - 1).min(STREAK_CAP);
                    *gain = BASE_POINTS + speed + streak;
                    self.scores[seat] += *gain;
                }
                _ => self.streaks[seat] = 0,
            }
        }
        self.phase = Phase::Reveal {
            until: now + REVEAL_TIME,
        };
        Delivery::event(
            Audience::All,
            RevealEvent {
                kind: "reveal",
                round: self.round,
                correct,
                choices: &self.choices,
                gained: &gained,
                scores: &self.scores,
                streaks: &self.streaks,
            },
        )
    }

    fn everyone_answered(&self) -> bool {
        self.active
            .iter()
            .zip(&self.choices)
            .all(|(active, choice)| !active || choice.is_some())
    }

    fn finish(&mut self) {
        self.phase = Phase::Done;
        self.outcome = Some(Outcome::ranked(self.scores.clone(), "rounds"));
    }
}

impl Match for Trivia {
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
        let input: AnswerInput = parse_input(payload)?;
        let Phase::Question { deadline, opened } = self.phase else {
            return Err(Reject::NotNow);
        };
        if input.round != self.round || now >= deadline || self.choices[seat].is_some() {
            return Err(Reject::NotNow);
        }
        if input.choice >= ANSWER_COUNT {
            return Err(Reject::InvalidInput);
        }
        self.choices[seat] = Some(input.choice);
        self.answer_times[seat] = Some(now - opened);

        let mut deliveries = vec![Delivery::event(
            Audience::All,
            serde_json::json!({ "kind": "answered", "seat": seat }),
        )];
        if self.everyone_answered() {
            deliveries.push(self.reveal(now));
            deliveries.push(self.snapshot(now));
        }
        Ok(deliveries)
    }

    fn tick(&mut self, now: Instant) -> Vec<Delivery> {
        match self.phase {
            Phase::LeadIn { until } if now >= until => {
                self.open_question(now);
                vec![self.snapshot(now)]
            }
            Phase::Question { deadline, .. } if now >= deadline => {
                let reveal = self.reveal(now);
                vec![reveal, self.snapshot(now)]
            }
            Phase::Reveal { until } if now >= until => {
                if self.round + 1 >= self.questions.len() {
                    self.finish();
                    Vec::new()
                } else {
                    self.round += 1;
                    self.open_question(now);
                    vec![self.snapshot(now)]
                }
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
        vec![snapshot]
    }

    fn forfeit(&mut self, seat: usize, now: Instant) -> Vec<Delivery> {
        self.active[seat] = false;
        if self.active.iter().filter(|active| **active).count() < 2 {
            self.finish();
            return Vec::new();
        }
        if matches!(self.phase, Phase::Question { .. }) && self.everyone_answered() {
            let reveal = self.reveal(now);
            return vec![reveal, self.snapshot(now)];
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

    fn game(seats: usize) -> (Trivia, Instant) {
        let questions = vec![("a".to_owned(), 2), ("b".to_owned(), 0)];
        let mut game = Trivia::with_questions(questions, seats);
        let now = Instant::now();
        game.start(now);
        let opened = now + LEAD_IN;
        game.tick(opened);
        (game, opened)
    }

    #[test]
    fn bank_is_consistent() {
        let bank = bank();
        assert!(bank.questions.len() >= ROUNDS * bank.categories.len());
        for question in &bank.questions {
            assert!(question.correct < ANSWER_COUNT, "{}", question.id);
            assert!(
                bank.categories.contains(&question.category),
                "{}",
                question.id
            );
        }
        for category in &bank.categories {
            let options = json!({ "category": category });
            let game = Trivia::new(&MatchSetup {
                seats: 2,
                round: 0,
                options,
            })
            .unwrap();
            assert_eq!(game.questions.len(), ROUNDS);
        }
        assert!(parse_options(&json!({ "category": "cooking" })).is_err());
    }

    #[test]
    fn faster_correct_answers_score_more_and_streaks_add_up() {
        let (mut game, opened) = game(2);
        game.input(
            0,
            json!({ "round": 0, "choice": 2 }),
            opened + Duration::from_secs(1),
        )
        .unwrap();
        let deliveries = game
            .input(
                1,
                json!({ "round": 0, "choice": 2 }),
                opened + Duration::from_secs(10),
            )
            .unwrap();
        assert_eq!(deliveries.len(), 3, "answered + reveal + snapshot");
        assert!(game.scores[0] > game.scores[1]);
        assert_eq!(game.scores[0], 100 + 93);

        let next = opened + Duration::from_secs(10) + REVEAL_TIME;
        game.tick(next);
        game.input(0, json!({ "round": 1, "choice": 0 }), next)
            .unwrap();
        game.input(1, json!({ "round": 1, "choice": 3 }), next)
            .unwrap();
        assert_eq!(game.scores[0], 193 + 100 + 100 + STREAK_BONUS);
        assert_eq!(game.streaks, vec![2, 0]);

        game.tick(next + REVEAL_TIME);
        assert_eq!(game.outcome().unwrap().placements, vec![1, 2]);
    }

    #[test]
    fn late_duplicate_and_wrong_round_answers_are_rejected() {
        let (mut game, opened) = game(3);
        assert_eq!(
            game.input(0, json!({ "round": 1, "choice": 0 }), opened)
                .unwrap_err(),
            Reject::NotNow
        );
        game.input(0, json!({ "round": 0, "choice": 1 }), opened)
            .unwrap();
        assert_eq!(
            game.input(0, json!({ "round": 0, "choice": 2 }), opened)
                .unwrap_err(),
            Reject::NotNow
        );
        assert_eq!(
            game.input(1, json!({ "round": 0, "choice": 9 }), opened)
                .unwrap_err(),
            Reject::InvalidInput
        );
        assert_eq!(
            game.input(
                1,
                json!({ "round": 0, "choice": 1 }),
                opened + QUESTION_TIME
            )
            .unwrap_err(),
            Reject::NotNow
        );
    }

    #[test]
    fn forfeiting_the_last_holdout_reveals_early() {
        let (mut game, opened) = game(3);
        game.input(0, json!({ "round": 0, "choice": 2 }), opened)
            .unwrap();
        game.input(1, json!({ "round": 0, "choice": 2 }), opened)
            .unwrap();
        let deliveries = game.forfeit(2, opened);
        assert_eq!(deliveries.len(), 2);
        assert!(matches!(game.phase, Phase::Reveal { .. }));
    }
}
