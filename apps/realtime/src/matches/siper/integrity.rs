use super::player::Stats;

// Turning more than this between two inputs (one tick) right before a long headshot is a flick.
const FLICK_RADIANS: f64 = 0.35;
const LONG_SHOT: f64 = 8.0;
// Aim resting on someone behind a wall: within this cone of an enemy the player cannot see.
const HIDDEN_CONE_RADIANS: f64 = 0.045;
const HIDDEN_RANGE: f64 = 40.0;

// Signs of aim assistance gathered over one match. None of them proves anything alone; the
// score only decides whether a moderator gets to look at the match.
#[derive(Debug, Clone, Default)]
pub struct Integrity {
    last_view: Option<(f64, f64)>,
    turns: [f64; 3],
    next: usize,
    pub long_heads: u32,
    pub flick_heads: u32,
    pub hidden_samples: u32,
    pub hidden_aim: u32,
}

pub struct Verdict {
    pub score: u32,
    pub flags: Vec<&'static str>,
}

fn angle_between(a: (f64, f64), b: (f64, f64)) -> f64 {
    let yaw = (b.0 - a.0).sin().atan2((b.0 - a.0).cos()).abs();
    yaw.hypot(b.1 - a.1)
}

impl Integrity {
    pub fn on_view(&mut self, yaw: f64, pitch: f64) {
        if let Some(previous) = self.last_view {
            self.turns[self.next % self.turns.len()] = angle_between(previous, (yaw, pitch));
            self.next += 1;
        }
        self.last_view = Some((yaw, pitch));
    }

    pub fn on_head_hit(&mut self, distance: f64) {
        if distance < LONG_SHOT {
            return;
        }
        self.long_heads += 1;
        if self.turns.iter().copied().fold(0.0, f64::max) > FLICK_RADIANS {
            self.flick_heads += 1;
        }
    }

    // `hidden` holds (distance, angle off the aim) for enemies this player cannot see.
    pub fn sample(&mut self, hidden: &[(f64, f64)]) {
        let near: Vec<&(f64, f64)> = hidden.iter().filter(|(d, _)| *d <= HIDDEN_RANGE).collect();
        if near.is_empty() {
            return;
        }
        self.hidden_samples += 1;
        if near.iter().any(|(_, off)| *off <= HIDDEN_CONE_RADIANS) {
            self.hidden_aim += 1;
        }
    }

    pub fn verdict(&self, stats: &Stats) -> Verdict {
        let mut score = 0;
        let mut flags = Vec::new();
        if self.flick_heads >= 5 && self.flick_heads * 2 >= self.long_heads {
            score += 40;
            flags.push("flick");
        }
        if stats.kills >= 15 && f64::from(stats.headshots) / f64::from(stats.kills) >= 0.75 {
            score += 25;
            flags.push("headshots");
        }
        if stats.shots >= 80 && f64::from(stats.hits) / f64::from(stats.shots) >= 0.7 {
            score += 20;
            flags.push("accuracy");
        }
        if self.hidden_samples >= 300
            && f64::from(self.hidden_aim) / f64::from(self.hidden_samples) >= 0.15
        {
            score += 35;
            flags.push("wallTracking");
        }
        Verdict {
            score: score.min(100),
            flags,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steady_players_raise_nothing() {
        let mut integrity = Integrity::default();
        for i in 0..100 {
            integrity.on_view(f64::from(i) * 0.01, 0.0);
            integrity.sample(&[(20.0, 0.6)]);
        }
        integrity.on_head_hit(20.0);
        let stats = Stats {
            kills: 20,
            headshots: 6,
            shots: 200,
            hits: 70,
            ..Stats::default()
        };
        let verdict = integrity.verdict(&stats);
        assert_eq!(verdict.score, 0);
        assert!(verdict.flags.is_empty());
    }

    #[test]
    fn snapping_onto_heads_and_tracking_through_walls_add_up() {
        let mut integrity = Integrity::default();
        for _ in 0..6 {
            integrity.on_view(0.0, 0.0);
            integrity.on_view(0.9, 0.1);
            integrity.on_head_hit(25.0);
        }
        for _ in 0..400 {
            integrity.sample(&[(15.0, 0.01)]);
        }
        let stats = Stats {
            kills: 20,
            headshots: 18,
            shots: 100,
            hits: 80,
            ..Stats::default()
        };
        let verdict = integrity.verdict(&stats);
        assert_eq!(
            verdict.flags,
            ["flick", "headshots", "accuracy", "wallTracking"]
        );
        assert_eq!(verdict.score, 100);
    }

    #[test]
    fn wrapping_yaw_is_not_a_flick() {
        let mut integrity = Integrity::default();
        integrity.on_view(std::f64::consts::PI - 0.01, 0.0);
        integrity.on_view(-std::f64::consts::PI + 0.01, 0.0);
        integrity.on_head_hit(20.0);
        assert_eq!(integrity.flick_heads, 0);
    }
}
