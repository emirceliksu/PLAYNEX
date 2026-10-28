use std::time::{Duration, Instant};

use super::data::rules;

#[derive(Debug, Clone, Default)]
pub struct Tally {
    pub streak: u32,
    pub best_streak: u32,
    pub multi: u32,
    pub best_multi: u32,
    pub last_kill: Option<Instant>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call {
    pub key: String,
    // Calls for everyone (first blood) versus the killer alone.
    pub global: bool,
}

pub struct KillFacts {
    pub first_blood: bool,
    pub headshot: bool,
    pub knife: bool,
    pub victim_streak: u32,
}

// Updates the killer's tally and returns what the announcer says, loudest first.
pub fn on_kill(tally: &mut Tally, facts: &KillFacts, now: Instant) -> Vec<Call> {
    let spec = &rules().announcer;
    let window = Duration::from_millis(rules().combat.multi_kill_window_ms);
    tally.multi = match tally.last_kill {
        Some(last) if now.duration_since(last) <= window => tally.multi + 1,
        _ => 1,
    };
    tally.last_kill = Some(now);
    tally.streak += 1;
    tally.best_streak = tally.best_streak.max(tally.streak);
    tally.best_multi = tally.best_multi.max(tally.multi);

    let mut calls = Vec::new();
    let personal = |key: &str| Call {
        key: key.to_owned(),
        global: false,
    };
    if tally.multi >= 2 {
        let index = (tally.multi as usize - 2).min(spec.multi.len() - 1);
        calls.push(personal(&spec.multi[index]));
    }
    if let Some(streak) = spec.streaks.iter().find(|s| s.kills == tally.streak) {
        calls.push(personal(&streak.key));
    }
    if facts.first_blood {
        calls.push(Call {
            key: "firstBlood".to_owned(),
            global: true,
        });
    }
    if facts.victim_streak >= spec.streak_break {
        calls.push(personal("streakEnded"));
    }
    if facts.knife {
        calls.push(personal("knifeKill"));
    } else if facts.headshot {
        calls.push(personal("headshot"));
    }
    calls
}

pub fn on_death(tally: &mut Tally) -> u32 {
    let streak = tally.streak;
    tally.streak = 0;
    tally.multi = 0;
    tally.last_kill = None;
    streak
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain() -> KillFacts {
        KillFacts {
            first_blood: false,
            headshot: false,
            knife: false,
            victim_streak: 0,
        }
    }

    fn keys(calls: &[Call]) -> Vec<&str> {
        calls.iter().map(|call| call.key.as_str()).collect()
    }

    #[test]
    fn quick_kills_climb_the_multi_ladder() {
        let mut tally = Tally::default();
        let start = Instant::now();
        assert!(on_kill(&mut tally, &plain(), start).is_empty());
        let second = on_kill(&mut tally, &plain(), start + Duration::from_secs(1));
        assert_eq!(keys(&second), ["double"]);
        let third = on_kill(&mut tally, &plain(), start + Duration::from_secs(2));
        assert_eq!(keys(&third), ["triple", "heating"]);
        on_kill(&mut tally, &plain(), start + Duration::from_secs(3));
        let fifth = on_kill(&mut tally, &plain(), start + Duration::from_secs(4));
        assert_eq!(keys(&fifth), ["massacre", "unstoppable"]);
        let sixth = on_kill(&mut tally, &plain(), start + Duration::from_secs(5));
        assert_eq!(keys(&sixth), ["massacre"]);
    }

    #[test]
    fn slow_kills_only_count_the_streak() {
        let mut tally = Tally::default();
        let start = Instant::now();
        for i in 0..2 {
            on_kill(&mut tally, &plain(), start + Duration::from_secs(10 * i));
        }
        let third = on_kill(&mut tally, &plain(), start + Duration::from_secs(20));
        assert_eq!(keys(&third), ["heating"]);
        assert_eq!(on_death(&mut tally), 3);
        assert_eq!(tally.streak, 0);
    }

    #[test]
    fn special_calls() {
        let mut tally = Tally::default();
        let facts = KillFacts {
            first_blood: true,
            headshot: true,
            knife: false,
            victim_streak: 5,
        };
        let calls = on_kill(&mut tally, &facts, Instant::now());
        assert_eq!(keys(&calls), ["firstBlood", "streakEnded", "headshot"]);
        assert!(calls[0].global && !calls[1].global);
        let knife = KillFacts {
            knife: true,
            ..plain()
        };
        let calls = on_kill(&mut tally, &knife, Instant::now() + Duration::from_secs(30));
        assert_eq!(keys(&calls), ["knifeKill"]);
    }
}
