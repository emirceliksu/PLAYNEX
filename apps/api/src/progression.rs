use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use time::Date;

// Shared with the game client, which draws the same skins and outfits.
const COSMETICS_JSON: &str = include_str!("../../../games/3d/siper/data/cosmetics.json");

const START_RATING: i32 = 1000;
const BASE_LEVEL_XP: i64 = 500;
const LEVEL_STEP_XP: i64 = 150;

/// What one player did in one match, as reported by the realtime service.
#[derive(Debug, Clone, Default)]
pub struct Contribution {
    pub won: bool,
    pub draw: bool,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub headshots: i32,
    pub plants: i32,
    pub defuses: i32,
    pub knife_kills: i32,
    pub damage: i64,
    pub best_multi: i32,
    // Matches with a single person against bots pay less and never move the rating.
    pub against_bots: bool,
}

pub fn match_xp(c: &Contribution) -> i64 {
    let mut xp = 100
        + 10 * i64::from(c.kills)
        + 5 * i64::from(c.assists)
        + 25 * i64::from(c.plants + c.defuses)
        + if c.won { 50 } else { 0 };
    if c.against_bots {
        xp /= 2;
    }
    xp
}

pub fn rating_change(c: &Contribution) -> i32 {
    if c.against_bots {
        return 0;
    }
    let result = match (c.won, c.draw) {
        (_, true) => 0,
        (true, false) => 25,
        (false, false) => -20,
    };
    result + (c.kills - c.deaths).clamp(-5, 5)
}

pub fn apply_rating(current: i32, change: i32) -> i32 {
    (current + change).max(0)
}

pub fn start_rating() -> i32 {
    START_RATING
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Level {
    pub level: i64,
    // XP earned inside the current level and the size of that level.
    pub into: i64,
    pub need: i64,
}

pub fn level_for(xp: i64) -> Level {
    let mut level = 1;
    let mut left = xp.max(0);
    loop {
        let need = BASE_LEVEL_XP + LEVEL_STEP_XP * (level - 1);
        if left < need {
            return Level {
                level,
                into: left,
                need,
            };
        }
        left -= need;
        level += 1;
    }
}

pub fn rank(rating: i32) -> &'static str {
    match rating {
        ..1100 => "bronze",
        1100..1250 => "silver",
        1250..1450 => "gold",
        1450..1700 => "platinum",
        _ => "diamond",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Metric {
    Matches,
    Wins,
    Kills,
    Headshots,
    KnifeKills,
    Plants,
    MultiKills,
    Damage,
}

#[derive(Debug, Clone, Copy)]
pub struct Quest {
    pub key: &'static str,
    pub metric: Metric,
    pub target: i32,
    pub xp: i64,
}

pub const QUESTS: [Quest; 8] = [
    Quest {
        key: "play3",
        metric: Metric::Matches,
        target: 3,
        xp: 150,
    },
    Quest {
        key: "win2",
        metric: Metric::Wins,
        target: 2,
        xp: 200,
    },
    Quest {
        key: "kills15",
        metric: Metric::Kills,
        target: 15,
        xp: 150,
    },
    Quest {
        key: "headshots5",
        metric: Metric::Headshots,
        target: 5,
        xp: 150,
    },
    Quest {
        key: "knife1",
        metric: Metric::KnifeKills,
        target: 1,
        xp: 200,
    },
    Quest {
        key: "plant2",
        metric: Metric::Plants,
        target: 2,
        xp: 200,
    },
    Quest {
        key: "multi1",
        metric: Metric::MultiKills,
        target: 1,
        xp: 150,
    },
    Quest {
        key: "damage1500",
        metric: Metric::Damage,
        target: 1500,
        xp: 150,
    },
];

// Three quests a day, the same for everyone, rotating through the pool.
pub fn daily_quests(day: Date) -> [&'static Quest; 3] {
    let n = day.to_julian_day().unsigned_abs() as usize;
    let first = n % QUESTS.len();
    let second = (first + 3) % QUESTS.len();
    let third = (first + 5) % QUESTS.len();
    [&QUESTS[first], &QUESTS[second], &QUESTS[third]]
}

pub fn quest_amount(metric: Metric, c: &Contribution) -> i32 {
    match metric {
        Metric::Matches => 1,
        Metric::Wins => i32::from(c.won),
        Metric::Kills => c.kills,
        Metric::Headshots => c.headshots,
        Metric::KnifeKills => c.knife_kills,
        Metric::Plants => c.plants,
        Metric::MultiKills => i32::from(c.best_multi >= 2),
        Metric::Damage => i32::try_from(c.damage).unwrap_or(i32::MAX),
    }
}

/// Lifetime numbers the achievements look at.
#[derive(Debug, Clone, Default)]
pub struct Totals {
    pub matches: i32,
    pub wins: i32,
    pub kills: i32,
    pub headshots: i32,
    pub knife_kills: i32,
    pub plants: i32,
    pub defuses: i32,
    pub best_streak: i32,
    pub best_multi: i32,
    pub level: i64,
}

pub const ACHIEVEMENTS: [&str; 10] = [
    "first_win",
    "sharpshooter",
    "headhunter",
    "knife_master",
    "demolition",
    "defuser",
    "ace",
    "veteran",
    "unstoppable",
    "level_10",
];

pub fn earned(t: &Totals) -> Vec<&'static str> {
    let checks = [
        t.wins >= 1,
        t.kills >= 100,
        t.headshots >= 50,
        t.knife_kills >= 10,
        t.plants >= 10,
        t.defuses >= 10,
        t.best_multi >= 5,
        t.matches >= 50,
        t.best_streak >= 10,
        t.level >= 10,
    ];
    ACHIEVEMENTS
        .iter()
        .zip(checks)
        .filter(|(_, ok)| *ok)
        .map(|(key, _)| *key)
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct Unlock {
    #[serde(default)]
    pub level: Option<i64>,
    #[serde(default)]
    pub achievement: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Cosmetic {
    pub id: String,
    pub unlock: Unlock,
}

#[derive(Debug, Deserialize)]
pub struct Cosmetics {
    pub skins: Vec<Cosmetic>,
    pub outfits: Vec<Cosmetic>,
}

pub static COSMETICS: LazyLock<Cosmetics> =
    LazyLock::new(|| serde_json::from_str(COSMETICS_JSON).expect("cosmetics.json is valid"));

pub fn unlocked(item: &Cosmetic, level: i64, achievements: &[String]) -> bool {
    item.unlock.level.is_none_or(|needed| level >= needed)
        && item
            .unlock
            .achievement
            .as_ref()
            .is_none_or(|key| achievements.contains(key))
}

#[cfg(test)]
mod tests {
    use time::Month;

    use super::*;

    #[test]
    fn levels_get_longer() {
        assert_eq!(
            level_for(0),
            Level {
                level: 1,
                into: 0,
                need: 500
            }
        );
        assert_eq!(level_for(499).level, 1);
        assert_eq!(
            level_for(500),
            Level {
                level: 2,
                into: 0,
                need: 650
            }
        );
        assert_eq!(level_for(500 + 650 + 10).level, 3);
    }

    #[test]
    fn bot_matches_pay_half_and_leave_the_rating() {
        let human = Contribution {
            won: true,
            kills: 10,
            deaths: 2,
            ..Contribution::default()
        };
        let bots = Contribution {
            against_bots: true,
            ..human.clone()
        };
        assert_eq!(match_xp(&human), 250);
        assert_eq!(match_xp(&bots), 125);
        assert_eq!(rating_change(&human), 30);
        assert_eq!(rating_change(&bots), 0);
        assert_eq!(apply_rating(10, -20), 0);
    }

    #[test]
    fn ranks_by_rating() {
        assert_eq!(rank(start_rating()), "bronze");
        assert_eq!(rank(1100), "silver");
        assert_eq!(rank(1500), "platinum");
        assert_eq!(rank(2400), "diamond");
    }

    #[test]
    fn daily_quests_are_distinct_and_rotate() {
        let day = Date::from_calendar_date(2026, Month::October, 29).unwrap();
        let today = daily_quests(day);
        assert_ne!(today[0].key, today[1].key);
        assert_ne!(today[1].key, today[2].key);
        assert_ne!(today[0].key, today[2].key);
        let tomorrow = daily_quests(day.next_day().unwrap());
        assert_ne!(today[0].key, tomorrow[0].key);
    }

    #[test]
    fn achievements_and_cosmetics_unlock() {
        let totals = Totals {
            wins: 1,
            best_multi: 5,
            level: 4,
            ..Totals::default()
        };
        assert_eq!(earned(&totals), ["first_win", "ace"]);
        let owned = vec!["ace".to_owned()];
        let skins = &COSMETICS.skins;
        let open: Vec<&str> = skins
            .iter()
            .filter(|s| unlocked(s, 4, &owned))
            .map(|s| s.id.as_str())
            .collect();
        assert_eq!(open, ["standard", "kum", "lale"]);
    }
}
