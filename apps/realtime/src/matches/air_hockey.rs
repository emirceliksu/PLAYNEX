use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input};

// Shared with the Phaser client so both sides simulate the same table.
const TABLE_JSON: &str = include_str!("../../../../games/2d/air-hockey/data/table.json");
const TICK: Duration = Duration::from_micros(16_667);
const TICK_SECS: f64 = 1.0 / 60.0;
const SNAPSHOT_EVERY: u64 = 2;
const PADDLE_HOME_INSET: f64 = 80.0;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub width: f64,
    pub height: f64,
    pub goal_width: f64,
    pub puck_radius: f64,
    pub paddle_radius: f64,
    pub max_puck_speed: f64,
    pub max_paddle_speed: f64,
    pub friction: f64,
    pub wall_restitution: f64,
    pub paddle_restitution: f64,
    pub win_score: u32,
    pub serve_delay_ms: f64,
    pub serve_offset: f64,
    pub substeps: u32,
}

pub fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| serde_json::from_str(TABLE_JSON).expect("air hockey table.json is valid"))
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Body {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
}

// Pure simulation; mirrored line for line by `physics.ts` in the client package.
pub struct Physics {
    pub puck: Body,
    pub paddles: [Body; 2],
    pub targets: [(f64, f64); 2],
    pub score: [u32; 2],
    pub serve_ms: f64,
}

impl Physics {
    pub fn new(first_receiver: usize) -> Self {
        let t = table();
        let paddles = [
            Body {
                x: t.width / 2.0,
                y: t.height - PADDLE_HOME_INSET,
                ..Body::default()
            },
            Body {
                x: t.width / 2.0,
                y: PADDLE_HOME_INSET,
                ..Body::default()
            },
        ];
        let mut physics = Self {
            puck: Body::default(),
            paddles,
            targets: [(paddles[0].x, paddles[0].y), (paddles[1].x, paddles[1].y)],
            score: [0, 0],
            serve_ms: 0.0,
        };
        physics.serve(first_receiver);
        physics
    }

    // Seat 0 defends the bottom goal, seat 1 the top one.
    fn serve(&mut self, receiver: usize) {
        let t = table();
        let offset = if receiver == 0 {
            t.serve_offset
        } else {
            -t.serve_offset
        };
        self.puck = Body {
            x: t.width / 2.0,
            y: t.height / 2.0 + offset,
            vx: 0.0,
            vy: 0.0,
        };
        self.serve_ms = t.serve_delay_ms;
    }

    pub fn set_target(&mut self, seat: usize, x: f64, y: f64) {
        self.targets[seat] = clamp_to_half(seat, x, y);
    }

    // Returns the seat that scored during this step, if any.
    pub fn step(&mut self, dt: f64) -> Option<usize> {
        let t = table();
        for seat in 0..2 {
            let paddle = &mut self.paddles[seat];
            let (tx, ty) = self.targets[seat];
            let (dx, dy) = (tx - paddle.x, ty - paddle.y);
            let distance = dx.hypot(dy);
            let reach = t.max_paddle_speed * dt;
            let scale = if distance > reach {
                reach / distance
            } else {
                1.0
            };
            paddle.vx = dx * scale / dt;
            paddle.vy = dy * scale / dt;
            paddle.x += dx * scale;
            paddle.y += dy * scale;
        }

        if self.serve_ms > 0.0 {
            self.serve_ms = (self.serve_ms - dt * 1000.0).max(0.0);
            return None;
        }

        let sub_dt = dt / f64::from(t.substeps);
        let decay = (-t.friction * sub_dt).exp();
        for _ in 0..t.substeps {
            self.puck.x += self.puck.vx * sub_dt;
            self.puck.y += self.puck.vy * sub_dt;
            self.puck.vx *= decay;
            self.puck.vy *= decay;

            for seat in 0..2 {
                self.collide_paddle(seat);
            }
            if let Some(scorer) = self.collide_walls() {
                self.score[scorer] += 1;
                self.serve(1 - scorer);
                return Some(scorer);
            }
        }
        None
    }

    fn collide_paddle(&mut self, seat: usize) {
        let t = table();
        let paddle = self.paddles[seat];
        let (dx, dy) = (self.puck.x - paddle.x, self.puck.y - paddle.y);
        let distance = dx.hypot(dy);
        let reach = t.puck_radius + t.paddle_radius;
        if distance >= reach || distance == 0.0 {
            return;
        }
        let (nx, ny) = (dx / distance, dy / distance);
        self.puck.x = paddle.x + nx * reach;
        self.puck.y = paddle.y + ny * reach;
        let along = (self.puck.vx - paddle.vx) * nx + (self.puck.vy - paddle.vy) * ny;
        if along < 0.0 {
            let impulse = (1.0 + t.paddle_restitution) * along;
            self.puck.vx -= impulse * nx;
            self.puck.vy -= impulse * ny;
        }
        let speed = self.puck.vx.hypot(self.puck.vy);
        if speed > t.max_puck_speed {
            let scale = t.max_puck_speed / speed;
            self.puck.vx *= scale;
            self.puck.vy *= scale;
        }
    }

    fn collide_walls(&mut self) -> Option<usize> {
        let t = table();
        let r = t.puck_radius;
        if self.puck.x < r {
            self.puck.x = r;
            self.puck.vx = self.puck.vx.abs() * t.wall_restitution;
        } else if self.puck.x > t.width - r {
            self.puck.x = t.width - r;
            self.puck.vx = -self.puck.vx.abs() * t.wall_restitution;
        }

        let in_mouth = (self.puck.x - t.width / 2.0).abs() < t.goal_width / 2.0 - r;
        if in_mouth {
            if self.puck.y < -r {
                return Some(0);
            }
            if self.puck.y > t.height + r {
                return Some(1);
            }
        } else if self.puck.y < r {
            self.puck.y = r;
            self.puck.vy = self.puck.vy.abs() * t.wall_restitution;
        } else if self.puck.y > t.height - r {
            self.puck.y = t.height - r;
            self.puck.vy = -self.puck.vy.abs() * t.wall_restitution;
        }
        None
    }
}

fn clamp_to_half(seat: usize, x: f64, y: f64) -> (f64, f64) {
    let t = table();
    let r = t.paddle_radius;
    let (min_y, max_y) = if seat == 0 {
        (t.height / 2.0 + r, t.height - r)
    } else {
        (r, t.height / 2.0 - r)
    };
    (x.clamp(r, t.width - r), y.clamp(min_y, max_y))
}

#[derive(Deserialize)]
struct PaddleInput {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    tick: u64,
    puck: [f64; 4],
    paddles: [[f64; 2]; 2],
    score: [u32; 2],
    serve_ms: f64,
}

#[derive(Serialize)]
struct GoalEvent {
    kind: &'static str,
    scorer: usize,
    score: [u32; 2],
}

pub struct AirHockey {
    physics: Physics,
    tick: u64,
    outcome: Option<Outcome>,
}

impl AirHockey {
    pub fn new(setup: &MatchSetup) -> Self {
        Self {
            physics: Physics::new((setup.round % 2) as usize),
            tick: 0,
            outcome: None,
        }
    }

    fn snapshot(&self) -> Delivery {
        let p = &self.physics;
        Delivery::snapshot(Snapshot {
            tick: self.tick,
            puck: [
                round(p.puck.x),
                round(p.puck.y),
                round(p.puck.vx),
                round(p.puck.vy),
            ],
            paddles: [
                [round(p.paddles[0].x), round(p.paddles[0].y)],
                [round(p.paddles[1].x), round(p.paddles[1].y)],
            ],
            score: p.score,
            serve_ms: p.serve_ms.round(),
        })
    }
}

fn round(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

impl Match for AirHockey {
    fn start(&mut self, _now: Instant) -> Vec<Delivery> {
        vec![self.snapshot()]
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        _now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        let input: PaddleInput = parse_input(payload)?;
        if !input.x.is_finite() || !input.y.is_finite() {
            return Err(Reject::InvalidInput);
        }
        self.physics.set_target(seat, input.x, input.y);
        Ok(Vec::new())
    }

    fn tick(&mut self, _now: Instant) -> Vec<Delivery> {
        if self.outcome.is_some() {
            return Vec::new();
        }
        self.tick += 1;
        let mut deliveries = Vec::new();
        if let Some(scorer) = self.physics.step(TICK_SECS) {
            let score = self.physics.score;
            deliveries.push(Delivery::event(
                Audience::All,
                GoalEvent {
                    kind: "goal",
                    scorer,
                    score,
                },
            ));
            if score[scorer] >= table().win_score {
                self.outcome = Some(Outcome {
                    placements: if scorer == 0 { vec![1, 2] } else { vec![2, 1] },
                    scores: score.iter().map(|&s| i64::from(s)).collect(),
                    reason: "score",
                });
            }
        }
        if self.tick.is_multiple_of(SNAPSHOT_EVERY) || !deliveries.is_empty() {
            deliveries.push(self.snapshot());
        }
        deliveries
    }

    fn tick_interval(&self) -> Option<Duration> {
        Some(TICK)
    }

    fn sync(&self, seat: usize, _now: Instant) -> Vec<Delivery> {
        let mut snapshot = self.snapshot();
        snapshot.audience = Audience::Seat(seat);
        vec![snapshot]
    }

    fn forfeit(&mut self, seat: usize, _now: Instant) -> Vec<Delivery> {
        if self.outcome.is_none() {
            let mut outcome = Outcome::duel(Some(1 - seat), "forfeit");
            outcome.scores = self.physics.score.iter().map(|&s| i64::from(s)).collect();
            self.outcome = Some(outcome);
        }
        Vec::new()
    }

    fn outcome(&self) -> Option<Outcome> {
        self.outcome.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_until_served(physics: &mut Physics) {
        while physics.serve_ms > 0.0 {
            physics.step(TICK_SECS);
        }
    }

    #[test]
    fn targets_are_clamped_to_own_half() {
        let t = table();
        let mut physics = Physics::new(0);
        physics.set_target(0, -50.0, 10.0);
        assert_eq!(
            physics.targets[0],
            (t.paddle_radius, t.height / 2.0 + t.paddle_radius)
        );
        physics.set_target(1, 1_000.0, 1_000.0);
        assert_eq!(
            physics.targets[1],
            (t.width - t.paddle_radius, t.height / 2.0 - t.paddle_radius)
        );
    }

    #[test]
    fn puck_into_top_goal_scores_for_bottom_seat() {
        let t = table();
        let mut physics = Physics::new(0);
        run_until_served(&mut physics);
        physics.puck = Body {
            x: t.width / 2.0,
            y: 120.0,
            vx: 0.0,
            vy: -900.0,
        };
        // Keep the top paddle out of the way.
        physics.paddles[1].x = t.paddle_radius;
        physics.set_target(1, 0.0, 0.0);
        let scorer = (0..120).find_map(|_| physics.step(TICK_SECS));
        assert_eq!(scorer, Some(0));
        assert_eq!(physics.score, [1, 0]);
        // The conceding seat receives the next serve on its own half.
        assert!(physics.puck.y < t.height / 2.0);
        assert!(physics.serve_ms > 0.0);
    }

    #[test]
    fn side_walls_bounce_and_speed_is_capped() {
        let t = table();
        let mut physics = Physics::new(0);
        run_until_served(&mut physics);
        physics.puck = Body {
            x: t.puck_radius + 1.0,
            y: t.height / 2.0,
            vx: -600.0,
            vy: 0.0,
        };
        physics.step(TICK_SECS);
        assert!(physics.puck.vx > 0.0);

        physics.puck = Body {
            x: t.width / 2.0,
            y: t.height - 140.0,
            vx: 0.0,
            vy: 0.0,
        };
        physics.paddles[0] = Body {
            x: t.width / 2.0,
            y: t.height - 140.0 + t.puck_radius + t.paddle_radius - 2.0,
            vx: 0.0,
            vy: -5_000.0,
        };
        physics.collide_paddle(0);
        assert!(physics.puck.vx.hypot(physics.puck.vy) <= t.max_puck_speed + 1e-9);
        assert!(physics.puck.vy < 0.0);
    }

    #[test]
    fn match_ends_at_win_score() {
        let mut game = AirHockey::new(&MatchSetup {
            seats: 2,
            players: Vec::new(),
            round: 0,
            options: Value::Null,
        });
        game.physics.score = [2, table().win_score - 1];
        run_until_served(&mut game.physics);
        game.physics.puck = Body {
            x: table().width / 2.0,
            y: table().height - 60.0,
            vx: 0.0,
            vy: 1_200.0,
        };
        game.physics.paddles[0].x = table().paddle_radius;
        game.physics.set_target(0, 0.0, table().height);
        let now = Instant::now();
        for _ in 0..60 {
            game.tick(now);
        }
        let outcome = game.outcome().unwrap();
        assert_eq!(outcome.placements, vec![2, 1]);
        assert_eq!(outcome.scores, vec![2, i64::from(table().win_score)]);
    }
}
