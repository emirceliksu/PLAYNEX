use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input, remaining_ms};

// Shared with the Babylon client, which runs the same model for prediction.
const TRACK_JSON: &str = include_str!("../../../../games/3d/neon-kart-racing/data/track.json");
const TICK: Duration = Duration::from_micros(33_333);
const TICK_SECS: f64 = 1.0 / 30.0;
const COUNTDOWN: Duration = Duration::from_secs(3);
const FINISH_GRACE: Duration = Duration::from_secs(30);
const GRID_GAP: f64 = 6.0;
const GRID_LANE: f64 = 3.5;
const CHECKPOINTS: u32 = 4;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrackFile {
    laps: u32,
    width: f64,
    wall_margin: f64,
    samples_per_segment: usize,
    control_points: Vec<[f64; 2]>,
    kart: KartTuning,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KartTuning {
    pub radius: f64,
    pub max_speed: f64,
    pub acceleration: f64,
    pub braking: f64,
    pub reverse_max: f64,
    pub drag: f64,
    pub off_track_max_speed: f64,
    pub off_track_drag: f64,
    pub steer_rate: f64,
    pub full_steer_speed: f64,
    pub drift_turn: f64,
    pub drift_drag: f64,
    pub wall_slowdown: f64,
}

pub struct Track {
    pub laps: u32,
    pub width: f64,
    pub wall_margin: f64,
    pub samples: Vec<(f64, f64)>,
    pub kart: KartTuning,
}

pub fn track() -> &'static Track {
    static TRACK: OnceLock<Track> = OnceLock::new();
    TRACK.get_or_init(|| {
        let file: TrackFile = serde_json::from_str(TRACK_JSON).expect("track.json is valid");
        Track {
            laps: file.laps,
            width: file.width,
            wall_margin: file.wall_margin,
            samples: sample_loop(&file.control_points, file.samples_per_segment),
            kart: file.kart,
        }
    })
}

// Uniform Catmull-Rom through a closed loop of control points.
fn sample_loop(points: &[[f64; 2]], per_segment: usize) -> Vec<(f64, f64)> {
    let n = points.len();
    let mut samples = Vec::with_capacity(n * per_segment);
    for i in 0..n {
        let p0 = points[(i + n - 1) % n];
        let p1 = points[i];
        let p2 = points[(i + 1) % n];
        let p3 = points[(i + 2) % n];
        for s in 0..per_segment {
            let t = s as f64 / per_segment as f64;
            let (t2, t3) = (t * t, t * t * t);
            let axis = |k: usize| {
                0.5 * (2.0 * p1[k]
                    + (-p0[k] + p2[k]) * t
                    + (2.0 * p0[k] - 5.0 * p1[k] + 4.0 * p2[k] - p3[k]) * t2
                    + (-p0[k] + 3.0 * p1[k] - 3.0 * p2[k] + p3[k]) * t3)
            };
            samples.push((axis(0), axis(1)));
        }
    }
    samples
}

pub struct Nearest {
    pub index: usize,
    pub distance: f64,
    pub point: (f64, f64),
}

impl Track {
    pub fn nearest(&self, x: f64, z: f64) -> Nearest {
        let n = self.samples.len();
        let mut best = Nearest {
            index: 0,
            distance: f64::INFINITY,
            point: self.samples[0],
        };
        for i in 0..n {
            let (ax, az) = self.samples[i];
            let (bx, bz) = self.samples[(i + 1) % n];
            let (sx, sz) = (bx - ax, bz - az);
            let length = sx * sx + sz * sz;
            let t = (((x - ax) * sx + (z - az) * sz) / length).clamp(0.0, 1.0);
            let (px, pz) = (ax + sx * t, az + sz * t);
            let distance = (x - px).hypot(z - pz);
            if distance < best.distance {
                best = Nearest {
                    index: if t > 0.5 { (i + 1) % n } else { i },
                    distance,
                    point: (px, pz),
                };
            }
        }
        best
    }

    pub fn grid_slot(&self, slot: usize) -> KartState {
        let (sx, sz) = self.samples[0];
        let (nx, nz) = self.samples[1];
        let length = (nx - sx).hypot(nz - sz);
        let (dx, dz) = ((nx - sx) / length, (nz - sz) / length);
        let back = GRID_GAP * (1 + slot / 2) as f64;
        let lane = if slot.is_multiple_of(2) {
            GRID_LANE
        } else {
            -GRID_LANE
        };
        // Right-hand normal of the driving direction on the x/z plane.
        let (rx, rz) = (dz, -dx);
        KartState {
            x: sx - dx * back + rx * lane,
            z: sz - dz * back + rz * lane,
            heading: dx.atan2(dz),
            speed: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct KartState {
    pub x: f64,
    pub z: f64,
    pub heading: f64,
    pub speed: f64,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct KartInput {
    #[serde(default)]
    pub seq: u32,
    pub throttle: f64,
    pub steer: f64,
    #[serde(default)]
    pub drift: bool,
}

// Mirrored by `model.ts` in the client package; keep both in step.
pub fn step(state: &mut KartState, input: &KartInput, dt: f64) {
    let track = track();
    let tuning = &track.kart;
    let half = track.width / 2.0;
    let on_track = track.nearest(state.x, state.z).distance <= half;

    let throttle = input.throttle.clamp(-1.0, 1.0);
    let steer = input.steer.clamp(-1.0, 1.0);
    if throttle > 0.0 {
        state.speed += tuning.acceleration * throttle * dt;
    } else if throttle < 0.0 {
        if state.speed > 0.0 {
            state.speed = (state.speed + tuning.braking * throttle * dt).max(0.0);
        } else {
            state.speed += tuning.acceleration * 0.5 * throttle * dt;
        }
    }

    let mut drag = if on_track {
        tuning.drag
    } else {
        tuning.off_track_drag
    };
    if input.drift {
        drag += tuning.drift_drag;
    }
    state.speed -= state.speed * drag * dt;

    let cap = if on_track {
        tuning.max_speed
    } else {
        tuning.off_track_max_speed
    };
    if state.speed > cap {
        state.speed -= (state.speed - cap) * (3.0 * dt).min(1.0);
    }
    state.speed = state.speed.clamp(-tuning.reverse_max, tuning.max_speed);

    let grip = (state.speed.abs() / tuning.full_steer_speed).min(1.0) * state.speed.signum();
    let turn = if input.drift { tuning.drift_turn } else { 1.0 };
    state.heading += steer * tuning.steer_rate * turn * grip * dt;
    state.x += state.heading.sin() * state.speed * dt;
    state.z += state.heading.cos() * state.speed * dt;

    let wall = half + track.wall_margin;
    let nearest = track.nearest(state.x, state.z);
    if nearest.distance > wall {
        let (px, pz) = nearest.point;
        let scale = wall / nearest.distance;
        state.x = px + (state.x - px) * scale;
        state.z = pz + (state.z - pz) * scale;
        state.speed *= tuning.wall_slowdown;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progress {
    pub lap: u32,
    pub next_checkpoint: u32,
    pub index: usize,
}

impl Default for Progress {
    fn default() -> Self {
        Self {
            lap: 0,
            next_checkpoint: 1,
            index: 0,
        }
    }
}

impl Progress {
    // Checkpoints sit at each quarter of the loop; the fourth is the start line.
    pub fn update(&mut self, index: usize, samples: usize) {
        self.index = index;
        let target = (self.next_checkpoint % CHECKPOINTS) as usize * samples / CHECKPOINTS as usize;
        let window = samples / 16;
        if (index + samples - target) % samples < window {
            if self.next_checkpoint == CHECKPOINTS {
                self.lap += 1;
                self.next_checkpoint = 1;
            } else {
                self.next_checkpoint += 1;
            }
        }
    }

    fn distance(&self, samples: usize) -> usize {
        let quarter = samples / CHECKPOINTS as usize;
        let leg = (self.next_checkpoint as usize - 1) * quarter;
        // Karts still behind the start of their leg (the grid sits behind the line)
        // have covered nothing of it yet.
        let into_leg = match (self.index + samples - leg) % samples {
            behind if behind > samples / 2 => 0,
            ahead => ahead,
        };
        self.lap as usize * samples + leg + into_leg.min(quarter)
    }
}

struct Kart {
    state: KartState,
    input: KartInput,
    progress: Progress,
    finished: Option<Duration>,
    active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KartView {
    x: f64,
    z: f64,
    h: f64,
    s: f64,
    lap: u32,
    cp: u32,
    idx: usize,
    finished_ms: Option<u64>,
    ack: u32,
    active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    phase: &'static str,
    tick: u64,
    countdown_ms: u64,
    race_ms: u64,
    karts: Vec<KartView>,
}

#[derive(Clone, Copy)]
enum Phase {
    Countdown {
        until: Instant,
    },
    Racing {
        started: Instant,
        ends: Option<Instant>,
    },
    Done,
}

pub struct KartRace {
    karts: Vec<Kart>,
    phase: Phase,
    tick: u64,
    outcome: Option<Outcome>,
}

impl KartRace {
    pub fn new(setup: &MatchSetup) -> Self {
        let track = track();
        let karts = (0..setup.seats)
            .map(|seat| {
                let state = track.grid_slot(seat);
                let progress = Progress {
                    index: track.nearest(state.x, state.z).index,
                    ..Progress::default()
                };
                Kart {
                    state,
                    input: KartInput::default(),
                    progress,
                    finished: None,
                    active: true,
                }
            })
            .collect();
        Self {
            karts,
            phase: Phase::Done,
            tick: 0,
            outcome: None,
        }
    }

    fn snapshot(&self, now: Instant) -> Delivery {
        let (phase, countdown, race) = match self.phase {
            Phase::Countdown { until } => ("countdown", remaining_ms(until, now), 0),
            Phase::Racing { started, .. } => ("racing", 0, (now - started).as_millis() as u64),
            Phase::Done => ("done", 0, 0),
        };
        let round = |v: f64| (v * 1000.0).round() / 1000.0;
        Delivery::snapshot(Snapshot {
            phase,
            tick: self.tick,
            countdown_ms: countdown,
            race_ms: race,
            karts: self
                .karts
                .iter()
                .map(|kart| KartView {
                    x: round(kart.state.x),
                    z: round(kart.state.z),
                    h: round(kart.state.heading),
                    s: round(kart.state.speed),
                    lap: kart.progress.lap,
                    cp: kart.progress.next_checkpoint,
                    idx: kart.progress.index,
                    finished_ms: kart.finished.map(|d| d.as_millis() as u64),
                    ack: kart.input.seq,
                    active: kart.active,
                })
                .collect(),
        })
    }

    fn separate_karts(&mut self) {
        let reach = track().kart.radius * 2.0;
        for i in 0..self.karts.len() {
            for j in i + 1..self.karts.len() {
                if !self.karts[i].active || !self.karts[j].active {
                    continue;
                }
                let (a, b) = (self.karts[i].state, self.karts[j].state);
                let (dx, dz) = (b.x - a.x, b.z - a.z);
                let distance = dx.hypot(dz);
                if distance >= reach || distance == 0.0 {
                    continue;
                }
                let push = (reach - distance) / 2.0;
                let (nx, nz) = (dx / distance, dz / distance);
                self.karts[i].state.x -= nx * push;
                self.karts[i].state.z -= nz * push;
                self.karts[j].state.x += nx * push;
                self.karts[j].state.z += nz * push;
            }
        }
    }

    fn race(&mut self, started: Instant, ends: Option<Instant>, now: Instant) {
        let track = track();
        let samples = track.samples.len();
        let elapsed = now - started;
        for kart in self
            .karts
            .iter_mut()
            .filter(|k| k.active && k.finished.is_none())
        {
            step(&mut kart.state, &kart.input, TICK_SECS);
        }
        self.separate_karts();
        let mut first_finish = false;
        for kart in self
            .karts
            .iter_mut()
            .filter(|k| k.active && k.finished.is_none())
        {
            let index = track.nearest(kart.state.x, kart.state.z).index;
            kart.progress.update(index, samples);
            if kart.progress.lap >= track.laps {
                kart.finished = Some(elapsed);
                kart.state.speed = 0.0;
                first_finish = true;
            }
        }
        let ends = match ends {
            None if first_finish => Some(now + FINISH_GRACE),
            other => other,
        };
        self.phase = Phase::Racing { started, ends };

        let running = self
            .karts
            .iter()
            .any(|kart| kart.active && kart.finished.is_none());
        if !running || ends.is_some_and(|ends| now >= ends) {
            self.finish();
        }
    }

    fn finish(&mut self) {
        let samples = track().samples.len();
        let mut order: Vec<usize> = (0..self.karts.len()).collect();
        order.sort_by_key(|&seat| {
            let kart = &self.karts[seat];
            (
                !kart.active,
                kart.finished.is_none(),
                kart.finished.unwrap_or(Duration::MAX),
                usize::MAX - kart.progress.distance(samples),
            )
        });
        let mut placements = vec![0; self.karts.len()];
        for (place, seat) in order.into_iter().enumerate() {
            placements[seat] = place as u32 + 1;
        }
        self.phase = Phase::Done;
        self.outcome = Some(Outcome {
            placements,
            scores: self
                .karts
                .iter()
                .map(|kart| kart.finished.map_or(0, |d| d.as_millis() as i64))
                .collect(),
            reason: "race",
        });
    }
}

impl Match for KartRace {
    fn start(&mut self, now: Instant) -> Vec<Delivery> {
        self.phase = Phase::Countdown {
            until: now + COUNTDOWN,
        };
        vec![self.snapshot(now)]
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        _now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        let input: KartInput = parse_input(payload)?;
        if !input.throttle.is_finite() || !input.steer.is_finite() {
            return Err(Reject::InvalidInput);
        }
        let kart = &mut self.karts[seat];
        // Out-of-order packets are dropped; the latest input wins.
        if input.seq >= kart.input.seq {
            kart.input = input;
        }
        Ok(Vec::new())
    }

    fn tick(&mut self, now: Instant) -> Vec<Delivery> {
        match self.phase {
            Phase::Countdown { until } if now >= until => {
                self.phase = Phase::Racing {
                    started: now,
                    ends: None,
                };
            }
            Phase::Racing { started, ends } => self.race(started, ends, now),
            _ => {}
        }
        if matches!(self.phase, Phase::Done) {
            return Vec::new();
        }
        self.tick += 1;
        vec![self.snapshot(now)]
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
        self.karts[seat].active = false;
        if !self
            .karts
            .iter()
            .any(|kart| kart.active && kart.finished.is_none())
        {
            self.finish();
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

    fn throttle() -> KartInput {
        KartInput {
            seq: 0,
            throttle: 1.0,
            steer: 0.0,
            drift: false,
        }
    }

    #[test]
    fn track_samples_close_the_loop() {
        let track = track();
        assert_eq!(track.samples.len(), 14 * 16);
        let first = track.samples[0];
        assert!(first.0.abs() < 1e-9 && first.1.abs() < 1e-9);
        let grid = track.grid_slot(0);
        assert!(track.nearest(grid.x, grid.z).distance <= track.width / 2.0);
    }

    #[test]
    fn accelerates_to_cap_and_brakes() {
        let mut state = track().grid_slot(0);
        for _ in 0..60 {
            step(&mut state, &throttle(), TICK_SECS);
        }
        assert!(state.speed > 10.0);
        assert!(state.speed <= track().kart.max_speed);
        let brake = KartInput {
            throttle: -1.0,
            ..throttle()
        };
        for _ in 0..60 {
            step(&mut state, &brake, TICK_SECS);
        }
        assert!(state.speed <= 0.0);
    }

    #[test]
    fn walls_hold_karts_on_the_map() {
        let track = track();
        let mut state = KartState {
            x: 0.0,
            z: -100.0,
            heading: std::f64::consts::PI,
            speed: 20.0,
        };
        step(&mut state, &throttle(), TICK_SECS);
        let limit = track.width / 2.0 + track.wall_margin;
        assert!(track.nearest(state.x, state.z).distance <= limit + 1e-6);
        assert!(state.speed < 20.0);
    }

    #[test]
    fn laps_need_every_checkpoint_in_order() {
        let samples = 224;
        let mut progress = Progress::default();
        // Crossing the line without the other checkpoints does nothing.
        progress.update(2, samples);
        assert_eq!((progress.lap, progress.next_checkpoint), (0, 1));
        for index in [56, 112, 168, 0] {
            progress.update(index + 1, samples);
        }
        assert_eq!((progress.lap, progress.next_checkpoint), (1, 1));
    }

    #[test]
    fn grid_positions_behind_the_line_count_as_no_progress() {
        let samples = 224;
        let on_grid = Progress {
            lap: 0,
            next_checkpoint: 1,
            index: samples - 3,
        };
        let away = Progress {
            lap: 0,
            next_checkpoint: 1,
            index: 4,
        };
        assert!(away.distance(samples) > on_grid.distance(samples));
    }

    #[test]
    fn race_ranks_finishers_then_progress() {
        let mut race = KartRace::new(&MatchSetup {
            seats: 3,
            players: Vec::new(),
            round: 0,
            options: Value::Null,
        });
        let now = Instant::now();
        race.start(now);
        race.karts[1].finished = Some(Duration::from_secs(70));
        race.karts[0].progress = Progress {
            lap: 2,
            next_checkpoint: 3,
            index: 120,
        };
        race.karts[2].progress = Progress {
            lap: 2,
            next_checkpoint: 2,
            index: 60,
        };
        race.finish();
        assert_eq!(race.outcome().unwrap().placements, vec![2, 1, 3]);
    }

    #[test]
    fn inputs_only_move_forward_in_sequence() {
        let mut race = KartRace::new(&MatchSetup {
            seats: 2,
            players: Vec::new(),
            round: 0,
            options: Value::Null,
        });
        let now = Instant::now();
        race.input(0, json!({ "seq": 5, "throttle": 1, "steer": 0 }), now)
            .unwrap();
        race.input(0, json!({ "seq": 4, "throttle": -1, "steer": 0 }), now)
            .unwrap();
        assert_eq!(race.karts[0].input.throttle, 1.0);
        assert!(
            race.input(0, json!({ "seq": 6, "throttle": "x", "steer": 0 }), now)
                .is_err()
        );
    }
}
