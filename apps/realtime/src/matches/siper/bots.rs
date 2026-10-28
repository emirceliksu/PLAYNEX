use std::{
    f64::consts::PI,
    time::{Duration, Instant},
};

use rand::RngExt;

use super::{
    combat::Pose,
    grid::{Cell, Grid},
    movement::MoveInput,
    nav,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Difficulty {
    Easy,
    Normal,
    Hard,
}

impl Difficulty {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "easy" => Difficulty::Easy,
            "normal" => Difficulty::Normal,
            "hard" => Difficulty::Hard,
            _ => return None,
        })
    }

    fn reaction(self) -> Duration {
        Duration::from_millis(match self {
            Difficulty::Easy => 650,
            Difficulty::Normal => 380,
            Difficulty::Hard => 220,
        })
    }

    // Radians per second the bot can turn its view.
    fn turn_rate(self) -> f64 {
        match self {
            Difficulty::Easy => 3.0,
            Difficulty::Normal => 6.0,
            Difficulty::Hard => 10.0,
        }
    }

    // Degrees of aim error when a target is first noticed; it shrinks while tracking.
    fn aim_error(self) -> f64 {
        match self {
            Difficulty::Easy => 5.0,
            Difficulty::Normal => 2.6,
            Difficulty::Hard => 1.2,
        }
    }

    fn head_chance(self) -> f64 {
        match self {
            Difficulty::Easy => 0.1,
            Difficulty::Normal => 0.3,
            Difficulty::Hard => 0.55,
        }
    }
}

pub struct Seen {
    pub pose: Pose,
    pub enemy: bool,
}

pub struct Situation<'a> {
    pub grid: &'a Grid,
    pub me: Pose,
    pub eye: [f64; 3],
    pub others: &'a [Seen],
    pub smokes: &'a [[f64; 3]],
    pub smoke_radius: f64,
    // Where the mode wants this bot to be, and whether it should hold "use" once there.
    pub goal: Option<Cell>,
    pub use_at_goal: bool,
    pub melee: bool,
    pub ready: bool,
    pub dt: f64,
}

pub struct Intent {
    pub input: MoveInput,
    pub fire: Option<(f64, f64)>,
}

pub struct Bot {
    pub difficulty: Difficulty,
    route: Vec<Cell>,
    routed_to: Option<Cell>,
    repath_at: Option<Instant>,
    target: Option<usize>,
    noticed_at: Option<Instant>,
    aim_head: bool,
    aim_error: (f64, f64),
    yaw: f64,
    pitch: f64,
    strafe: f64,
    strafe_until: Option<Instant>,
    progress_check: Option<(Instant, f64, f64)>,
    jump: bool,
}

impl Bot {
    pub fn new(difficulty: Difficulty) -> Self {
        Self {
            difficulty,
            route: Vec::new(),
            routed_to: None,
            repath_at: None,
            target: None,
            noticed_at: None,
            aim_head: false,
            aim_error: (0.0, 0.0),
            yaw: 0.0,
            pitch: 0.0,
            strafe: 1.0,
            strafe_until: None,
            progress_check: None,
            jump: false,
        }
    }

    pub fn face(&mut self, yaw: f64) {
        self.yaw = yaw;
        self.pitch = 0.0;
        self.route.clear();
        self.target = None;
    }

    fn visible(&self, situation: &Situation, pose: &Pose) -> bool {
        let point = pose.chest();
        let dx = point[0] - situation.eye[0];
        let dz = point[2] - situation.eye[2];
        let distance = dx.hypot(dz);
        if distance > 55.0 {
            return false;
        }
        // A wide cone in front, plus anything close enough to hear.
        let facing = angle_diff(dx.atan2(dz), self.yaw).abs() < 1.1;
        if !facing && distance > 7.0 {
            return false;
        }
        situation.grid.clear_line(situation.eye, point)
            && !situation.smokes.iter().any(|smoke| {
                segment_hits_sphere(situation.eye, point, *smoke, situation.smoke_radius)
            })
    }

    pub fn think(&mut self, situation: &Situation, now: Instant) -> Intent {
        let mut rng = rand::rng();
        let mut input = MoveInput::default();

        let still_visible = self.target.and_then(|index| {
            let seen = situation.others.get(index)?;
            (seen.enemy && seen.pose.alive && self.visible(situation, &seen.pose)).then_some(index)
        });
        let target = still_visible.or_else(|| {
            situation
                .others
                .iter()
                .enumerate()
                .filter(|(_, seen)| seen.enemy && seen.pose.alive)
                .filter(|(_, seen)| self.visible(situation, &seen.pose))
                .min_by(|(_, a), (_, b)| {
                    distance(situation.me, a.pose).total_cmp(&distance(situation.me, b.pose))
                })
                .map(|(index, _)| index)
        });
        if target != self.target {
            self.target = target;
            self.noticed_at = target.map(|_| now);
            self.aim_head = rng.random::<f64>() < self.difficulty.head_chance();
            let error = self.difficulty.aim_error().to_radians();
            self.aim_error = (
                (rng.random::<f64>() * 2.0 - 1.0) * error,
                (rng.random::<f64>() * 2.0 - 1.0) * error,
            );
        }

        let mut fire = None;
        if let Some(seen) = target.and_then(|index| situation.others.get(index)) {
            let aim = if self.aim_head {
                seen.pose.head_center()
            } else {
                seen.pose.chest()
            };
            let dx = aim[0] - situation.eye[0];
            let dy = aim[1] - situation.eye[1];
            let dz = aim[2] - situation.eye[2];
            let flat = dx.hypot(dz);
            let want_yaw = dx.atan2(dz) + self.aim_error.0;
            let want_pitch = -(dy.atan2(flat)) + self.aim_error.1;
            self.turn_towards(want_yaw, want_pitch, situation.dt);
            self.aim_error.0 *= 0.92;
            self.aim_error.1 *= 0.92;

            if situation.melee {
                input.f = 1.0;
            } else if self.difficulty != Difficulty::Easy {
                if self.strafe_until.is_none_or(|until| now >= until) {
                    self.strafe = if rng.random::<bool>() { 1.0 } else { -1.0 };
                    self.strafe_until =
                        Some(now + Duration::from_millis(400 + rng.random_range(0..500)));
                }
                input.s = self.strafe;
                input.w = self.difficulty == Difficulty::Hard;
            }
            let settled = angle_diff(want_yaw, self.yaw).abs() < 0.05
                && (want_pitch - self.pitch).abs() < 0.05;
            let reacted = self
                .noticed_at
                .is_some_and(|noticed| now.duration_since(noticed) >= self.difficulty.reaction());
            let in_reach = !situation.melee || flat < 2.0;
            if settled && reacted && in_reach && situation.ready {
                fire = Some((self.yaw, self.pitch));
            }
        } else {
            self.walk(situation, &mut input, now);
        }

        input.yaw = self.yaw;
        input.pitch = self.pitch;
        if self.jump {
            input.j = true;
            self.jump = false;
        }
        Intent { input, fire }
    }

    fn walk(&mut self, situation: &Situation, input: &mut MoveInput, now: Instant) {
        let here = situation.grid.cell_at(situation.me.x, situation.me.z);
        let Some(goal) = situation.goal else {
            self.pitch *= 0.9;
            return;
        };
        if here == goal || (self.route.is_empty() && self.routed_to == Some(goal)) {
            input.u = situation.use_at_goal;
            self.pitch *= 0.9;
            return;
        }
        let stale = self.repath_at.is_none_or(|at| now >= at);
        if self.routed_to != Some(goal) || stale {
            self.route = nav::path(situation.grid, here, goal).unwrap_or_default();
            self.routed_to = Some(goal);
            self.repath_at = Some(now + Duration::from_secs(3));
        }
        let Some(next) = self.route.first().copied() else {
            return;
        };
        let (cx, cz) = situation.grid.center(next);
        let (dx, dz) = (cx - situation.me.x, cz - situation.me.z);
        if dx.hypot(dz) < 0.6 {
            self.route.remove(0);
        }
        self.turn_towards(dx.atan2(dz), 0.0, situation.dt);
        input.f = if angle_diff(dx.atan2(dz), self.yaw).abs() < 0.8 {
            1.0
        } else {
            0.3
        };

        match self.progress_check {
            Some((at, x, z)) if now.duration_since(at) >= Duration::from_millis(1500) => {
                if (situation.me.x - x).hypot(situation.me.z - z) < 0.5 {
                    self.jump = true;
                    self.repath_at = None;
                }
                self.progress_check = Some((now, situation.me.x, situation.me.z));
            }
            None => self.progress_check = Some((now, situation.me.x, situation.me.z)),
            _ => {}
        }
    }

    fn turn_towards(&mut self, yaw: f64, pitch: f64, dt: f64) {
        let rate = self.difficulty.turn_rate() * dt;
        let diff = angle_diff(yaw, self.yaw);
        self.yaw = wrap(self.yaw + diff.clamp(-rate, rate));
        self.pitch += (pitch - self.pitch).clamp(-rate, rate);
        self.pitch = self.pitch.clamp(-1.4, 1.4);
    }
}

fn distance(a: Pose, b: Pose) -> f64 {
    (a.x - b.x).hypot(a.z - b.z)
}

pub fn wrap(angle: f64) -> f64 {
    let mut a = angle % (2.0 * PI);
    if a > PI {
        a -= 2.0 * PI;
    } else if a < -PI {
        a += 2.0 * PI;
    }
    a
}

pub fn angle_diff(to: f64, from: f64) -> f64 {
    wrap(to - from)
}

pub fn segment_hits_sphere(from: [f64; 3], to: [f64; 3], center: [f64; 3], radius: f64) -> bool {
    let d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    let f = [
        from[0] - center[0],
        from[1] - center[1],
        from[2] - center[2],
    ];
    let a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    if a < 1e-12 {
        return false;
    }
    let t = (-(f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / a).clamp(0.0, 1.0);
    let closest = [f[0] + d[0] * t, f[1] + d[1] * t, f[2] + d[2] * t];
    closest[0] * closest[0] + closest[1] * closest[1] + closest[2] * closest[2] <= radius * radius
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn angles_wrap_the_short_way() {
        assert!((angle_diff(-3.0, 3.0) - (2.0 * PI - 6.0)).abs() < 1e-9);
        assert!((wrap(3.0 * PI) - PI).abs() < 1e-9);
    }

    #[test]
    fn smoke_blocks_a_line_through_it() {
        assert!(segment_hits_sphere(
            [0.0, 1.0, 0.0],
            [0.0, 1.0, 10.0],
            [0.0, 1.0, 5.0],
            2.0
        ));
        assert!(!segment_hits_sphere(
            [0.0, 1.0, 0.0],
            [0.0, 1.0, 10.0],
            [5.0, 1.0, 5.0],
            2.0
        ));
    }
}
