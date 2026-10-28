use std::{collections::BTreeMap, time::Instant};

use serde::{Deserialize, Serialize};

use super::{
    announcer::Tally,
    bots::Bot,
    combat::Pose,
    data::{Slot, WeaponSpec, arsenal, rules},
    movement::{Body, MoveInput},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Hand {
    Primary,
    Secondary,
    Melee,
    Grenade,
    Smoke,
}

#[derive(Debug, Clone)]
pub struct Gun {
    pub spec: &'static WeaponSpec,
    pub ammo: u32,
    pub reserve: u32,
}

impl Gun {
    pub fn new(id: &str) -> Option<Self> {
        let spec = arsenal().weapon(id)?;
        Some(Self {
            spec,
            ammo: spec.magazine,
            reserve: spec.reserve,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Loadout {
    pub primary: Option<Gun>,
    pub secondary: Option<Gun>,
    pub knife: bool,
    pub grenade: bool,
    pub smoke: bool,
    pub hand: Hand,
    pub previous: Hand,
}

impl Loadout {
    pub fn starter() -> Self {
        Self {
            primary: None,
            secondary: Gun::new("pistol"),
            knife: true,
            grenade: false,
            smoke: false,
            hand: Hand::Secondary,
            previous: Hand::Melee,
        }
    }

    pub fn knife_only() -> Self {
        Self {
            primary: None,
            secondary: None,
            knife: true,
            grenade: false,
            smoke: false,
            hand: Hand::Melee,
            previous: Hand::Melee,
        }
    }

    // Gun game hands out one weapon at a time with ammunition that never runs dry.
    pub fn single(id: &str) -> Self {
        let mut loadout = Self::knife_only();
        if let Some(mut gun) = Gun::new(id) {
            gun.reserve = 999;
            let hand = match gun.spec.slot {
                Slot::Primary => Hand::Primary,
                _ => Hand::Secondary,
            };
            match hand {
                Hand::Primary => loadout.primary = Some(gun),
                _ => loadout.secondary = Some(gun),
            }
            loadout.hand = hand;
        }
        loadout
    }

    pub fn has(&self, hand: Hand) -> bool {
        match hand {
            Hand::Primary => self.primary.is_some(),
            Hand::Secondary => self.secondary.is_some(),
            Hand::Melee => self.knife,
            Hand::Grenade => self.grenade,
            Hand::Smoke => self.smoke,
        }
    }

    pub fn select(&mut self, hand: Hand) -> bool {
        if !self.has(hand) || self.hand == hand {
            return false;
        }
        self.previous = self.hand;
        self.hand = hand;
        true
    }

    pub fn fallback(&mut self) {
        for hand in [self.previous, Hand::Primary, Hand::Secondary, Hand::Melee] {
            if self.has(hand) && hand != Hand::Grenade && hand != Hand::Smoke {
                self.hand = hand;
                return;
            }
        }
    }

    pub fn gun_mut(&mut self) -> Option<&mut Gun> {
        match self.hand {
            Hand::Primary => self.primary.as_mut(),
            Hand::Secondary => self.secondary.as_mut(),
            _ => None,
        }
    }

    pub fn gun(&self) -> Option<&Gun> {
        match self.hand {
            Hand::Primary => self.primary.as_ref(),
            Hand::Secondary => self.secondary.as_ref(),
            _ => None,
        }
    }

    pub fn weapon(&self) -> Option<&'static WeaponSpec> {
        match self.hand {
            Hand::Melee => arsenal().weapon("knife"),
            _ => self.gun().map(|gun| gun.spec),
        }
    }

    pub fn held_id(&self) -> &'static str {
        match self.hand {
            Hand::Grenade => "grenade",
            Hand::Smoke => "smoke",
            Hand::Melee => "knife",
            _ => self.gun().map_or("knife", |gun| gun.spec.id.as_str()),
        }
    }

    pub fn speed_scale(&self) -> f64 {
        self.weapon().map_or(1.0, |weapon| weapon.speed_scale)
    }
}

#[derive(Debug, Clone, Default)]
pub struct Stats {
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub headshots: u32,
    pub shots: u32,
    pub hits: u32,
    pub damage: i64,
    pub plants: u32,
    pub defuses: u32,
    pub knife_kills: u32,
    pub weapon_kills: BTreeMap<String, u32>,
}

impl Stats {
    pub fn score(&self) -> i64 {
        i64::from(self.kills) * 2
            + i64::from(self.assists)
            + i64::from(self.plants + self.defuses) * 2
    }
}

pub struct Player {
    pub name: String,
    pub team: u8,
    pub bot: Option<Bot>,
    pub skin: Option<String>,
    pub outfit: Option<String>,
    pub body: Body,
    pub input: MoveInput,
    pub alive: bool,
    pub health: i32,
    pub armor: i32,
    pub helmet: bool,
    pub loadout: Loadout,
    pub money: u32,
    pub next_fire: Option<Instant>,
    pub reload_until: Option<Instant>,
    pub burst: usize,
    pub last_shot: Option<Instant>,
    pub scoped: bool,
    pub respawn_at: Option<Instant>,
    pub spawned_at: Option<Instant>,
    pub stats: Stats,
    pub tally: Tally,
    pub damage_from: Vec<(usize, i32)>,
    pub level: usize,
    pub level_kills: u32,
    pub using_since: Option<Instant>,
    pub has_bomb: bool,
    pub ping: u32,
}

impl Player {
    pub fn new(name: String, team: u8, bot: Option<Bot>) -> Self {
        Self {
            name,
            team,
            bot,
            skin: None,
            outfit: None,
            body: Body::default(),
            input: MoveInput::default(),
            alive: false,
            health: 0,
            armor: 0,
            helmet: false,
            loadout: Loadout::starter(),
            money: 0,
            next_fire: None,
            reload_until: None,
            burst: 0,
            last_shot: None,
            scoped: false,
            respawn_at: None,
            spawned_at: None,
            stats: Stats::default(),
            tally: Tally::default(),
            damage_from: Vec::new(),
            level: 0,
            level_kills: 0,
            using_since: None,
            has_bomb: false,
            ping: 0,
        }
    }

    pub fn pose(&self) -> Pose {
        Pose {
            x: self.body.x,
            y: self.body.y,
            z: self.body.z,
            crouched: self.body.crouched,
            alive: self.alive,
        }
    }

    pub fn eye(&self) -> [f64; 3] {
        [
            self.body.x,
            self.body.y + super::movement::eye_height(&self.body),
            self.body.z,
        ]
    }

    pub fn speed(&self) -> f64 {
        self.body.vx.hypot(self.body.vz)
    }

    pub fn revive(&mut self, x: f64, y: f64, z: f64, yaw: f64, now: Instant) {
        self.body = Body {
            x,
            y,
            z,
            grounded: true,
            ..Body::default()
        };
        self.input = MoveInput {
            seq: self.input.seq,
            yaw,
            ..MoveInput::default()
        };
        self.alive = true;
        self.health = rules().player.health;
        self.respawn_at = None;
        self.spawned_at = Some(now);
        self.reload_until = None;
        self.next_fire = None;
        self.burst = 0;
        self.scoped = false;
        self.damage_from.clear();
        self.using_since = None;
    }
}
