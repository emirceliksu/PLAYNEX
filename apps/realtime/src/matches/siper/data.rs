use std::{collections::HashMap, sync::OnceLock};

use serde::Deserialize;

use super::grid::Grid;

// The Babylon client reads the same files; a change here is a change there.
const RULES_JSON: &str = include_str!("../../../../../games/3d/siper/data/rules.json");
const WEAPONS_JSON: &str = include_str!("../../../../../games/3d/siper/data/weapons.json");
const MAP_FILES: [&str; 3] = [
    include_str!("../../../../../games/3d/siper/data/maps/liman.json"),
    include_str!("../../../../../games/3d/siper/data/maps/carsi.json"),
    include_str!("../../../../../games/3d/siper/data/maps/santral.json"),
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub cell_size: f64,
    pub cells: HashMap<String, CellSpec>,
    pub player: PlayerSpec,
    pub movement: MovementSpec,
    pub combat: CombatSpec,
    pub economy: EconomySpec,
    pub modes: ModeTable,
    pub announcer: AnnouncerSpec,
    pub maps: Vec<String>,
    pub vote_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct CellSpec {
    pub height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSpec {
    pub radius: f64,
    pub height: f64,
    pub crouch_height: f64,
    pub eye: f64,
    pub crouch_eye: f64,
    pub health: i32,
    pub head_radius: f64,
    pub legs_top: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementSpec {
    pub run_speed: f64,
    pub walk_speed: f64,
    pub crouch_speed: f64,
    pub ground_accel: f64,
    pub air_accel: f64,
    pub gravity: f64,
    pub jump_speed: f64,
    pub step_height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatSpec {
    pub leg_multiplier: f64,
    pub assist_damage: f64,
    pub lag_compensation_ms: u64,
    pub multi_kill_window_ms: u64,
    pub grenade_fuse_ms: u64,
    pub grenade_speed: f64,
    pub grenade_radius: f64,
    pub smoke_ms: u64,
    pub smoke_radius: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomySpec {
    pub start_money: u32,
    pub respawn_mode_money: u32,
    pub max_money: u32,
    pub round_win: u32,
    pub bomb_win: u32,
    pub loss_base: u32,
    pub loss_step: u32,
    pub loss_max: u32,
    pub plant_bonus: u32,
    pub buy_window_ms: u64,
    pub armor: u32,
    pub armor_helmet: u32,
}

#[derive(Debug, Deserialize)]
pub struct ModeTable {
    pub tdm: ModeSpec,
    pub bomb: ModeSpec,
    pub knife: ModeSpec,
    pub ffa: ModeSpec,
    pub gungame: ModeSpec,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeSpec {
    pub teams: bool,
    pub buy: bool,
    #[serde(default)]
    pub respawn_ms: Option<u64>,
    #[serde(default)]
    pub kill_limit: Option<u32>,
    #[serde(default)]
    pub time_ms: Option<u64>,
    #[serde(default)]
    pub rounds_to_win: Option<u32>,
    #[serde(default)]
    pub halftime: Option<u32>,
    #[serde(default)]
    pub round_ms: Option<u64>,
    #[serde(default)]
    pub freeze_ms: Option<u64>,
    #[serde(default)]
    pub bomb_ms: Option<u64>,
    #[serde(default)]
    pub plant_ms: Option<u64>,
    #[serde(default)]
    pub defuse_ms: Option<u64>,
    #[serde(default)]
    pub kills_per_level: Option<u32>,
    #[serde(default)]
    pub ladder: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnnouncerSpec {
    pub multi: Vec<String>,
    pub streaks: Vec<StreakSpec>,
    #[serde(rename = "streakBreak")]
    pub streak_break: u32,
}

#[derive(Debug, Deserialize)]
pub struct StreakSpec {
    pub kills: u32,
    pub key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Slot {
    Primary,
    Secondary,
    Melee,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponSpec {
    pub id: String,
    pub slot: Slot,
    pub price: u32,
    pub reward: u32,
    pub damage: f64,
    pub head_multiplier: f64,
    pub armor_penetration: f64,
    pub fire_ms: u64,
    pub magazine: u32,
    pub reserve: u32,
    pub reload_ms: u64,
    pub range: f64,
    pub falloff: f64,
    pub pellets: u32,
    pub speed_scale: f64,
    #[serde(default)]
    pub zoom: Option<f64>,
    pub spread: Spread,
    pub recoil: Vec<[f64; 2]>,
    pub recovery_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct Spread {
    pub base: f64,
    pub moving: f64,
    pub air: f64,
    pub crouch: f64,
    #[serde(default)]
    pub scoped: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct GrenadeSpec {
    pub id: String,
    pub price: u32,
    pub damage: f64,
}

#[derive(Debug, Deserialize)]
pub struct Arsenal {
    pub weapons: Vec<WeaponSpec>,
    pub grenades: Vec<GrenadeSpec>,
}

impl Arsenal {
    pub fn weapon(&self, id: &str) -> Option<&WeaponSpec> {
        self.weapons.iter().find(|weapon| weapon.id == id)
    }

    pub fn grenade(&self, id: &str) -> Option<&GrenadeSpec> {
        self.grenades.iter().find(|grenade| grenade.id == id)
    }
}

#[derive(Debug, Deserialize)]
pub struct MapFile {
    pub id: String,
    pub width: usize,
    pub height: usize,
    pub rects: Vec<(String, i64, i64, i64, i64)>,
}

pub fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| serde_json::from_str(RULES_JSON).expect("rules.json is valid"))
}

pub fn arsenal() -> &'static Arsenal {
    static ARSENAL: OnceLock<Arsenal> = OnceLock::new();
    ARSENAL.get_or_init(|| serde_json::from_str(WEAPONS_JSON).expect("weapons.json is valid"))
}

pub fn maps() -> &'static [Grid] {
    static MAPS: OnceLock<Vec<Grid>> = OnceLock::new();
    MAPS.get_or_init(|| {
        MAP_FILES
            .iter()
            .map(|source| {
                let file: MapFile = serde_json::from_str(source).expect("map file is valid");
                Grid::build(&file, rules())
            })
            .collect()
    })
}

pub fn map(id: &str) -> Option<&'static Grid> {
    maps().iter().find(|grid| grid.id == id)
}
