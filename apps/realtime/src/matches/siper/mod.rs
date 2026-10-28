mod announcer;
mod bots;
mod combat;
mod data;
mod grid;
mod movement;
mod nav;
mod player;
mod round;
mod shooting;
mod view;

use std::{
    collections::{BTreeMap, VecDeque},
    time::{Duration, Instant},
};

use rand::{
    RngExt,
    seq::{IndexedRandom, SliceRandom},
};
use serde::Deserialize;
use serde_json::{Value, json};

use self::{
    bots::{Bot, Difficulty, Seen, Situation},
    combat::Pose,
    data::{ModeSpec, arsenal, rules},
    grid::{Cell, Grid},
    movement::MoveInput,
    player::{Gun, Hand, Loadout, Player},
};
use super::{Audience, Delivery, Match, MatchSetup, Outcome, Reject, parse_input};

const TICK: Duration = Duration::from_micros(33_333);
const TICK_SECS: f64 = 1.0 / 30.0;
const HISTORY: usize = 30;
const ROUND_END: Duration = Duration::from_secs(5);
const RESPAWN_FREEZE: Duration = Duration::from_secs(3);
const BOMB_RADIUS: f64 = 14.0;
const DEFUSE_REACH: f64 = 1.8;
const PICKUP_REACH: f64 = 1.3;
const MAX_TEAM: usize = 5;
const MAX_PLAYERS: usize = 10;
const BOT_NAMES: [&str; 10] = [
    "Kartal", "Poyraz", "Bora", "Tufan", "Kaya", "Doğan", "Atmaca", "Şahin", "Yağız", "Tolga",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Deathmatch,
    Bomb,
    Knife,
    FreeForAll,
    GunGame,
}

impl Mode {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "tdm" => Mode::Deathmatch,
            "bomb" => Mode::Bomb,
            "knife" => Mode::Knife,
            "ffa" => Mode::FreeForAll,
            "gungame" => Mode::GunGame,
            _ => return None,
        })
    }

    pub fn key(self) -> &'static str {
        match self {
            Mode::Deathmatch => "tdm",
            Mode::Bomb => "bomb",
            Mode::Knife => "knife",
            Mode::FreeForAll => "ffa",
            Mode::GunGame => "gungame",
        }
    }

    fn spec(self) -> &'static ModeSpec {
        let modes = &rules().modes;
        match self {
            Mode::Deathmatch => &modes.tdm,
            Mode::Bomb => &modes.bomb,
            Mode::Knife => &modes.knife,
            Mode::FreeForAll => &modes.ffa,
            Mode::GunGame => &modes.gungame,
        }
    }

    fn rounds(self) -> bool {
        matches!(self, Mode::Bomb | Mode::Knife)
    }
}

pub struct Options {
    pub mode: Mode,
    pub map: &'static Grid,
    pub bots: Option<Difficulty>,
    pub size: usize,
}

#[derive(Deserialize, Default)]
struct RawOptions {
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    map: Option<String>,
    #[serde(default)]
    bots: Option<String>,
    #[serde(default)]
    size: Option<usize>,
}

pub fn parse_options(options: &Value) -> Result<Options, Reject> {
    let raw: RawOptions = if options.is_null() {
        RawOptions::default()
    } else {
        serde_json::from_value(options.clone()).map_err(|_| Reject::InvalidOptions)?
    };
    let mode = match raw.mode.as_deref() {
        None => Mode::Deathmatch,
        Some(mode) => Mode::parse(mode).ok_or(Reject::InvalidOptions)?,
    };
    let map = data::map(raw.map.as_deref().unwrap_or("liman")).ok_or(Reject::InvalidOptions)?;
    let bots = match raw.bots.as_deref() {
        None => Some(Difficulty::Normal),
        Some("off") => None,
        Some(level) => Some(Difficulty::parse(level).ok_or(Reject::InvalidOptions)?),
    };
    let limit = if mode.spec().teams {
        MAX_TEAM
    } else {
        MAX_PLAYERS
    };
    let size = raw.size.unwrap_or(limit);
    if !(1..=limit).contains(&size) {
        return Err(Reject::InvalidOptions);
    }
    Ok(Options {
        mode,
        map,
        bots,
        size,
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    Freeze { until: Instant },
    Live { until: Instant },
    RoundEnd { until: Instant },
    Vote { until: Instant },
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Bomb {
    Carried(usize),
    Dropped([f64; 3]),
    Planted {
        at: [f64; 3],
        site: u8,
        explodes: Instant,
    },
    Defused([f64; 3]),
    Exploded([f64; 3]),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Throwable {
    Grenade,
    Smoke,
}

struct Projectile {
    owner: usize,
    kind: Throwable,
    pos: [f64; 3],
    vel: [f64; 3],
    fuse: Instant,
}

struct Smoke {
    pos: [f64; 3],
    until: Instant,
}

struct MatchResult {
    winner: Option<u8>,
}

pub struct SiperMatch {
    options: Options,
    players: Vec<Player>,
    phase: Phase,
    tick: u64,
    history: VecDeque<(u64, Vec<Pose>)>,
    scores: [u32; 2],
    round: u32,
    loss_streak: [u32; 2],
    first_blood: bool,
    bomb: Option<Bomb>,
    bot_site: u8,
    projectiles: Vec<Projectile>,
    smokes: Vec<Smoke>,
    pending: Vec<Delivery>,
    started: Option<Instant>,
    live_since: Option<Instant>,
    result: Option<MatchResult>,
    votes: BTreeMap<usize, String>,
    next_map: Option<String>,
    outcome: Option<Outcome>,
    hunt_goals: Vec<(Instant, Cell)>,
}

impl SiperMatch {
    pub fn new(setup: &MatchSetup) -> Result<Self, Reject> {
        let options = parse_options(&setup.options)?;
        let teams = options.mode.spec().teams;
        let mut players: Vec<Player> = Vec::new();
        let mut counts = [0usize; 2];
        let wished: Vec<Option<u8>> = (0..setup.seats)
            .map(|seat| {
                setup
                    .players
                    .get(seat)
                    .and_then(|p| p.team)
                    .filter(|t| *t < 2)
            })
            .collect();
        for &team in wished.iter().flatten() {
            counts[team as usize] += 1;
        }
        for (seat, wish) in wished.iter().enumerate() {
            let info = setup.players.get(seat);
            let name = info.map_or_else(|| format!("#{}", seat + 1), |p| p.nickname.clone());
            let team = if teams {
                wish.unwrap_or_else(|| {
                    let team = u8::from(counts[1] < counts[0]);
                    counts[team as usize] += 1;
                    team
                })
            } else {
                seat as u8 + 2
            };
            let mut player = Player::new(name, team, None);
            player.skin = info.and_then(|p| p.skin.clone());
            player.outfit = info.and_then(|p| p.outfit.clone());
            players.push(player);
        }
        if teams {
            let humans = [0u8, 1].map(|t| players.iter().filter(|p| p.team == t).count());
            if humans[0].max(humans[1]) > MAX_TEAM {
                return Err(Reject::TeamsUneven);
            }
            match options.bots {
                None if humans[0] != humans[1] => return Err(Reject::TeamsUneven),
                None => {}
                Some(difficulty) => {
                    let size = options.size.max(humans[0]).max(humans[1]);
                    for team in [0u8, 1] {
                        for _ in humans[team as usize]..size {
                            let name = BOT_NAMES[players.len() % BOT_NAMES.len()].to_owned();
                            players.push(Player::new(name, team, Some(Bot::new(difficulty))));
                        }
                    }
                }
            }
        } else if let Some(difficulty) = options.bots {
            let size = options.size.max(players.len()).max(2);
            while players.len() < size {
                let team = players.len() as u8 + 2;
                let name = BOT_NAMES[players.len() % BOT_NAMES.len()].to_owned();
                players.push(Player::new(name, team, Some(Bot::new(difficulty))));
            }
        }
        Ok(Self {
            options,
            players,
            phase: Phase::Done,
            tick: 0,
            history: VecDeque::with_capacity(HISTORY),
            scores: [0, 0],
            round: 0,
            loss_streak: [0, 0],
            first_blood: false,
            bomb: None,
            bot_site: b'A',
            projectiles: Vec::new(),
            smokes: Vec::new(),
            pending: Vec::new(),
            started: None,
            live_since: None,
            result: None,
            votes: BTreeMap::new(),
            next_map: None,
            outcome: None,
            hunt_goals: Vec::new(),
        })
    }

    fn mode(&self) -> Mode {
        self.options.mode
    }

    fn grid(&self) -> &'static Grid {
        self.options.map
    }

    fn live(&self) -> bool {
        matches!(self.phase, Phase::Live { .. })
    }

    fn enemies(&self, a: usize, b: usize) -> bool {
        a != b && self.players[a].team != self.players[b].team
    }

    fn event(&mut self, audience: Audience, payload: Value) {
        self.pending.push(Delivery::event(audience, payload));
    }

    fn roster(&self) -> Value {
        json!({
            "t": "roster",
            "mode": self.mode().key(),
            "map": self.grid().id,
            "teams": self.mode().spec().teams,
            "players": self.players.iter().map(|p| json!({
                "n": p.name,
                "tm": p.team,
                "bot": p.bot.is_some(),
                "sk": p.skin,
                "of": p.outfit,
            })).collect::<Vec<_>>(),
        })
    }

    fn spawn_point(&self, index: usize) -> (f64, f64, f64, f64) {
        let grid = self.grid();
        let mut rng = rand::rng();
        let team = self.players[index].team;
        let candidates: Vec<Cell> = if self.mode().spec().teams {
            grid.cells_of(if team == 0 { b'a' } else { b'b' })
        } else {
            let mut cells: Vec<Cell> = b".ABab"
                .iter()
                .flat_map(|kind| grid.cells_of(*kind))
                .filter(|cell| nav::walkable(grid, *cell))
                .collect();
            // Spawn far from whoever is alive: best of a handful of random picks.
            cells.shuffle(&mut rng);
            cells.truncate(12);
            let threat = |cell: &Cell| {
                let (x, z) = grid.center(*cell);
                self.players
                    .iter()
                    .enumerate()
                    .filter(|(i, p)| *i != index && p.alive)
                    .map(|(_, p)| (p.body.x - x).hypot(p.body.z - z))
                    .fold(f64::INFINITY, f64::min)
            };
            cells.sort_by(|a, b| threat(b).total_cmp(&threat(a)));
            cells.truncate(1);
            cells
        };
        let occupied = |cell: &Cell| {
            let (x, z) = grid.center(*cell);
            self.players
                .iter()
                .enumerate()
                .any(|(i, p)| i != index && p.alive && (p.body.x - x).hypot(p.body.z - z) < 1.2)
        };
        let free: Vec<Cell> = candidates
            .iter()
            .copied()
            .filter(|c| !occupied(c))
            .collect();
        let cell = free
            .choose(&mut rng)
            .or_else(|| candidates.choose(&mut rng))
            .copied()
            .unwrap_or(Cell { x: 1, z: 1 });
        let (x, z) = grid.center(cell);
        let mut jitter = |v: f64| v + (rng.random::<f64>() - 0.5) * 0.6;
        let (cx, cz) = (
            grid.width as f64 * grid.cell / 2.0,
            grid.depth as f64 * grid.cell / 2.0,
        );
        let yaw = (cx - x).atan2(cz - z);
        (jitter(x), grid.height(cell), jitter(z), yaw)
    }

    fn spawn(&mut self, index: usize, now: Instant) {
        let (x, y, z, yaw) = self.spawn_point(index);
        let mode = self.mode();
        let player = &mut self.players[index];
        player.revive(x, y, z, yaw, now);
        if let Some(bot) = player.bot.as_mut() {
            bot.face(yaw);
        }
        match mode {
            Mode::GunGame => {
                let ladder = &mode.spec().ladder;
                let id = &ladder[player.level.min(ladder.len() - 1)];
                player.loadout = Loadout::single(id);
            }
            Mode::Knife => player.loadout = Loadout::knife_only(),
            Mode::Deathmatch | Mode::FreeForAll => {
                player.loadout = Loadout::starter();
                player.armor = 0;
                player.helmet = false;
            }
            Mode::Bomb => {}
        }
        if player.bot.is_some() {
            self.bot_buy(index);
        }
    }

    fn can_buy(&self, index: usize, now: Instant) -> bool {
        let player = &self.players[index];
        if !self.mode().spec().buy || !player.alive {
            return false;
        }
        let window = Duration::from_millis(rules().economy.buy_window_ms);
        let in_time = match self.phase {
            Phase::Freeze { .. } => true,
            Phase::Live { .. } if self.mode().rounds() => self
                .live_since
                .is_some_and(|since| now.duration_since(since) <= window),
            Phase::Live { .. } => player
                .spawned_at
                .is_some_and(|at| now.duration_since(at) <= window),
            _ => false,
        };
        if !in_time {
            return false;
        }
        if !self.mode().spec().teams {
            return true;
        }
        let zone = if player.team == 0 { b'a' } else { b'b' };
        self.grid()
            .kind(self.grid().cell_at(player.body.x, player.body.z))
            == zone
    }

    fn buy(&mut self, index: usize, item: &str, now: Instant) -> bool {
        if !self.can_buy(index, now) {
            return false;
        }
        let economy = &rules().economy;
        let player = &mut self.players[index];
        let price = match item {
            "armor" => economy.armor,
            "armorHelmet" => economy.armor_helmet,
            _ => match (arsenal().weapon(item), arsenal().grenade(item)) {
                (Some(weapon), _) if weapon.price > 0 => weapon.price,
                (_, Some(grenade)) => grenade.price,
                _ => return false,
            },
        };
        if player.money < price {
            return false;
        }
        match item {
            "armor" => {
                if player.armor >= 100 {
                    return false;
                }
                player.armor = 100;
            }
            "armorHelmet" => {
                if player.armor >= 100 && player.helmet {
                    return false;
                }
                player.armor = 100;
                player.helmet = true;
            }
            "grenade" if !player.loadout.grenade => player.loadout.grenade = true,
            "smoke" if !player.loadout.smoke => player.loadout.smoke = true,
            "grenade" | "smoke" => return false,
            id => {
                let Some(gun) = Gun::new(id) else {
                    return false;
                };
                let hand = match gun.spec.slot {
                    data::Slot::Primary => Hand::Primary,
                    _ => Hand::Secondary,
                };
                match hand {
                    Hand::Primary => player.loadout.primary = Some(gun),
                    _ => player.loadout.secondary = Some(gun),
                }
                player.loadout.previous = player.loadout.hand;
                player.loadout.hand = hand;
                player.reload_until = None;
                player.scoped = false;
            }
        }
        player.money -= price;
        true
    }

    fn bot_buy(&mut self, index: usize) {
        let now = Instant::now();
        let mut rng = rand::rng();
        let team = self.players[index].team;
        let has_primary = self.players[index].loadout.primary.is_some();
        if !has_primary {
            let rifle = if team == 1 { "carbine" } else { "rifle" };
            let money = self.players[index].money;
            let choice = if money >= 5_700 && rng.random::<f64>() < 0.15 {
                Some("sniper")
            } else if money >= 3_100 {
                Some(rifle)
            } else if money >= 1_900 && rng.random::<bool>() {
                Some("smg")
            } else if money >= 1_500 {
                Some("shotgun")
            } else {
                None
            };
            if let Some(id) = choice {
                self.buy(index, id, now);
            }
        }
        if self.players[index].money >= 1_600 {
            self.buy(index, "armorHelmet", now);
        } else if self.players[index].money >= 900 {
            self.buy(index, "armor", now);
        }
        if self.players[index].money >= 500 && rng.random::<bool>() {
            self.buy(index, "grenade", now);
        }
        let loadout = &mut self.players[index].loadout;
        loadout.hand = if loadout.primary.is_some() {
            Hand::Primary
        } else if loadout.secondary.is_some() {
            Hand::Secondary
        } else {
            Hand::Melee
        };
    }

    fn start_respawn_mode(&mut self, now: Instant) {
        let money = rules().economy.respawn_mode_money;
        for index in 0..self.players.len() {
            self.players[index].money = money;
            self.spawn(index, now);
        }
        self.phase = Phase::Freeze {
            until: now + RESPAWN_FREEZE,
        };
    }

    fn poses(&self) -> Vec<Pose> {
        self.players.iter().map(Player::pose).collect()
    }

    // Where each player's hitbox was at the tick their client was showing, capped.
    fn rewound(&self, view: Option<u64>) -> Vec<Pose> {
        let Some(view) = view else {
            return self.poses();
        };
        let cap = rules().combat.lag_compensation_ms * 30 / 1000;
        let wanted = view.max(self.tick.saturating_sub(cap)).min(self.tick);
        self.history
            .iter()
            .find(|(tick, poses)| *tick == wanted && poses.len() == self.players.len())
            .map(|(_, poses)| {
                // Life state is always current: a player killed since then cannot be hit again.
                poses
                    .iter()
                    .zip(&self.players)
                    .map(|(pose, player)| Pose {
                        alive: player.alive,
                        ..*pose
                    })
                    .collect()
            })
            .unwrap_or_else(|| self.poses())
    }

    fn think_bots(&mut self, now: Instant) -> Vec<(usize, f64, f64)> {
        let mut shots = Vec::new();
        let smokes: Vec<[f64; 3]> = self.smokes.iter().map(|s| s.pos).collect();
        for index in 0..self.players.len() {
            if self.players[index].bot.is_none() || !self.players[index].alive {
                continue;
            }
            let others: Vec<Seen> = (0..self.players.len())
                .map(|other| Seen {
                    pose: self.players[other].pose(),
                    enemy: self.enemies(index, other),
                })
                .collect();
            let (goal, use_at_goal) = self.bot_goal(index, now);
            let player = &self.players[index];
            let ready = player.next_fire.is_none_or(|at| now >= at)
                && player.reload_until.is_none()
                && player.loadout.gun().is_none_or(|gun| gun.ammo > 0);
            let situation = Situation {
                grid: self.grid(),
                me: player.pose(),
                eye: player.eye(),
                others: &others,
                smokes: &smokes,
                smoke_radius: rules().combat.smoke_radius,
                goal,
                use_at_goal,
                melee: player.loadout.hand == Hand::Melee,
                ready,
                dt: TICK_SECS,
            };
            let Some(bot) = self.players[index].bot.as_mut() else {
                continue;
            };
            let intent = bot.think(&situation, now);
            let player = &mut self.players[index];
            player.input = MoveInput {
                seq: player.input.seq,
                ..intent.input
            };
            if let Some((yaw, pitch)) = intent.fire {
                shots.push((index, yaw, pitch));
            }
            if player.loadout.gun().is_some_and(|gun| gun.ammo == 0)
                && player.reload_until.is_none()
            {
                shooting::start_reload(player, now);
            }
        }
        shots
    }

    fn bot_goal(&mut self, index: usize, now: Instant) -> (Option<Cell>, bool) {
        let grid = self.grid();
        let team = self.players[index].team;
        if self.mode() == Mode::Bomb {
            let site_cell = |site: u8| {
                let cells: Vec<Cell> = grid
                    .cells_of(site)
                    .into_iter()
                    .filter(|cell| nav::walkable(grid, *cell))
                    .collect();
                cells.get(cells.len() / 2).copied()
            };
            match self.bomb {
                Some(Bomb::Planted { at, .. }) => {
                    let cell = grid.cell_at(at[0], at[2]);
                    return (Some(cell), team == 1);
                }
                Some(Bomb::Dropped(at)) if team == 0 => {
                    return (Some(grid.cell_at(at[0], at[2])), false);
                }
                _ => {}
            }
            if team == 0 {
                let carrier = self.players[index].has_bomb;
                return (site_cell(self.bot_site), carrier);
            }
            let site = if index.is_multiple_of(2) { b'A' } else { b'B' };
            return (site_cell(site), false);
        }
        if self.hunt_goals.len() < self.players.len() {
            self.hunt_goals
                .resize(self.players.len(), (now, Cell { x: 1, z: 1 }));
        }
        let (refresh, goal) = self.hunt_goals[index];
        if now < refresh {
            return (Some(goal), false);
        }
        let mut rng = rand::rng();
        let targets: Vec<Cell> = (0..self.players.len())
            .filter(|other| self.enemies(index, *other) && self.players[*other].alive)
            .map(|other| grid.cell_at(self.players[other].body.x, self.players[other].body.z))
            .collect();
        let goal = targets.choose(&mut rng).copied().unwrap_or(goal);
        self.hunt_goals[index] = (now + Duration::from_secs(4), goal);
        (Some(goal), false)
    }

    fn simulate(&mut self, now: Instant) {
        let frozen = matches!(
            self.phase,
            Phase::Freeze { .. } | Phase::Vote { .. } | Phase::Done
        );
        let grid = self.grid();
        for player in self.players.iter_mut().filter(|p| p.alive) {
            let mut input = player.input;
            if frozen {
                input = MoveInput {
                    yaw: input.yaw,
                    pitch: input.pitch,
                    c: input.c,
                    ..MoveInput::default()
                };
            }
            let scale = player.loadout.speed_scale() * if player.scoped { 0.6 } else { 1.0 };
            movement::step(&mut player.body, &input, scale, grid, TICK_SECS);
            if player.reload_until.is_some_and(|until| now >= until) {
                shooting::finish_reload(player);
            }
        }
        if self.mode() == Mode::Bomb && self.live() {
            self.bomb_tick(now);
        }
        shooting::update_projectiles(self, now);
        self.smokes.retain(|smoke| smoke.until > now);
    }

    fn bomb_tick(&mut self, now: Instant) {
        let grid = self.grid();
        let spec = self.mode().spec();
        match self.bomb {
            Some(Bomb::Dropped(at)) => {
                let picker = self.players.iter().position(|p| {
                    p.alive
                        && p.team == 0
                        && (p.body.x - at[0]).hypot(p.body.z - at[2]) < PICKUP_REACH
                });
                if let Some(index) = picker {
                    self.players[index].has_bomb = true;
                    self.bomb = Some(Bomb::Carried(index));
                }
            }
            Some(Bomb::Carried(index)) => {
                let player = &mut self.players[index];
                let kind = grid.kind(grid.cell_at(player.body.x, player.body.z));
                let planting = player.input.u
                    && player.body.grounded
                    && !player.input.moving()
                    && (kind == b'A' || kind == b'B');
                if !planting {
                    player.using_since = None;
                    return;
                }
                let since = *player.using_since.get_or_insert(now);
                if now.duration_since(since) < Duration::from_millis(spec.plant_ms.unwrap_or(3_000))
                {
                    return;
                }
                player.using_since = None;
                player.has_bomb = false;
                player.stats.plants += 1;
                player.money =
                    (player.money + rules().economy.plant_bonus).min(rules().economy.max_money);
                let at = [player.body.x, player.body.y, player.body.z];
                let explodes = now + Duration::from_millis(spec.bomb_ms.unwrap_or(40_000));
                self.bomb = Some(Bomb::Planted {
                    at,
                    site: kind,
                    explodes,
                });
                self.phase = Phase::Live { until: explodes };
                self.event(Audience::All, json!({ "t": "bomb", "s": "planted", "site": (kind as char).to_string(), "by": index }));
                self.event(
                    Audience::All,
                    json!({ "t": "announce", "key": "bombPlanted", "who": index, "global": true }),
                );
            }
            Some(Bomb::Planted { at, explodes, .. }) => {
                if now >= explodes {
                    self.explode_bomb(at, now);
                    return;
                }
                let defuse_ms = Duration::from_millis(spec.defuse_ms.unwrap_or(5_000));
                let mut defused_by = None;
                for (index, player) in self.players.iter_mut().enumerate() {
                    let near = (player.body.x - at[0]).hypot(player.body.z - at[2]) < DEFUSE_REACH;
                    if !(player.alive
                        && player.team == 1
                        && near
                        && player.input.u
                        && !player.input.moving())
                    {
                        player.using_since = None;
                        continue;
                    }
                    let since = *player.using_since.get_or_insert(now);
                    if now.duration_since(since) >= defuse_ms {
                        defused_by = Some(index);
                    }
                }
                if let Some(index) = defused_by {
                    self.players[index].stats.defuses += 1;
                    self.bomb = Some(Bomb::Defused(at));
                    self.event(
                        Audience::All,
                        json!({ "t": "bomb", "s": "defused", "by": index }),
                    );
                    self.event(Audience::All, json!({ "t": "announce", "key": "bombDefused", "who": index, "global": true }));
                    round::end_round(self, 1, "defused", now);
                }
            }
            _ => {}
        }
    }

    fn explode_bomb(&mut self, at: [f64; 3], now: Instant) {
        self.bomb = Some(Bomb::Exploded(at));
        self.event(
            Audience::All,
            json!({ "t": "bomb", "s": "exploded", "at": at }),
        );
        // The round is decided before the blast so its kills cannot end it a second time.
        round::end_round(self, 0, "exploded", now);
        for index in 0..self.players.len() {
            let player = &self.players[index];
            if !player.alive {
                continue;
            }
            let distance = (player.body.x - at[0]).hypot(player.body.z - at[2]);
            if distance < BOMB_RADIUS {
                let amount = (500.0 * (1.0 - distance / BOMB_RADIUS)) as i32;
                let player = &mut self.players[index];
                player.health -= amount;
                if player.health <= 0 {
                    self.kill(None, index, "bomb", false, now);
                }
            }
        }
    }

    fn drop_bomb(&mut self, index: usize) {
        if !self.players[index].has_bomb {
            return;
        }
        self.players[index].has_bomb = false;
        let body = self.players[index].body;
        self.bomb = Some(Bomb::Dropped([body.x, body.y, body.z]));
    }

    pub(crate) fn kill(
        &mut self,
        killer: Option<usize>,
        victim: usize,
        weapon: &str,
        headshot: bool,
        now: Instant,
    ) {
        let victim_streak = {
            let player = &mut self.players[victim];
            player.alive = false;
            player.health = 0;
            player.scoped = false;
            player.using_since = None;
            player.reload_until = None;
            player.stats.deaths += 1;
            if let Some(ms) = self.options.mode.spec().respawn_ms {
                player.respawn_at = Some(now + Duration::from_millis(ms));
            }
            announcer::on_death(&mut player.tally)
        };
        self.drop_bomb(victim);
        let mode = self.mode();
        if mode.rounds() {
            // Whoever dies loses what they carried; the next round starts them on the basics.
            let player = &mut self.players[victim];
            player.loadout = if mode == Mode::Knife {
                Loadout::knife_only()
            } else {
                Loadout::starter()
            };
            player.armor = 0;
            player.helmet = false;
        }

        let scorer = killer.filter(|k| self.enemies(*k, victim));
        if let Some(k) = scorer {
            let first_blood = !self.first_blood;
            self.first_blood = true;
            let knife = weapon == "knife";
            let economy = self.mode().spec().buy;
            let reward = arsenal().weapon(weapon).map_or(300, |spec| spec.reward);
            let calls = {
                let player = &mut self.players[k];
                player.stats.kills += 1;
                if headshot {
                    player.stats.headshots += 1;
                }
                if knife {
                    player.stats.knife_kills += 1;
                }
                *player
                    .stats
                    .weapon_kills
                    .entry(weapon.to_owned())
                    .or_default() += 1;
                if economy {
                    player.money = (player.money + reward).min(rules().economy.max_money);
                }
                announcer::on_kill(
                    &mut player.tally,
                    &announcer::KillFacts {
                        first_blood,
                        headshot,
                        knife,
                        victim_streak,
                    },
                    now,
                )
            };
            for call in calls {
                self.event(
                    Audience::All,
                    json!({ "t": "announce", "key": call.key, "who": k, "global": call.global }),
                );
            }
            let assisters: Vec<usize> = self.players[victim]
                .damage_from
                .iter()
                .filter(|(from, _)| *from != k)
                .fold(BTreeMap::<usize, i32>::new(), |mut sum, (from, amount)| {
                    *sum.entry(*from).or_default() += amount;
                    sum
                })
                .into_iter()
                .filter(|(_, amount)| f64::from(*amount) >= rules().combat.assist_damage)
                .map(|(from, _)| from)
                .collect();
            for from in assisters {
                if self.enemies(from, victim) {
                    self.players[from].stats.assists += 1;
                }
            }
            if self.mode() == Mode::Deathmatch {
                self.scores[self.players[k].team as usize] += 1;
            }
            if self.mode() == Mode::GunGame {
                self.gun_game_progress(k, victim, knife);
            }
        }
        self.players[victim].damage_from.clear();
        self.event(
            Audience::All,
            json!({ "t": "kill", "k": killer, "v": victim, "w": weapon, "h": headshot }),
        );
        self.check_end(now);
    }

    fn gun_game_progress(&mut self, killer: usize, victim: usize, knife: bool) {
        let spec = self.mode().spec();
        let last = spec.ladder.len() - 1;
        if knife && self.players[killer].level < last {
            let demoted = &mut self.players[victim];
            demoted.level = demoted.level.saturating_sub(1);
            demoted.level_kills = 0;
        }
        let player = &mut self.players[killer];
        if player.level == last {
            player.level = last + 1;
            return;
        }
        player.level_kills += 1;
        if player.level_kills >= spec.kills_per_level.unwrap_or(2) {
            player.level += 1;
            player.level_kills = 0;
            player.loadout = Loadout::single(&spec.ladder[player.level]);
            player.reload_until = None;
            player.scoped = false;
            let level = player.level;
            self.event(
                Audience::All,
                json!({ "t": "level", "who": killer, "lv": level, "w": spec.ladder[level] }),
            );
        }
    }

    fn check_end(&mut self, now: Instant) {
        if !self.live() || self.result.is_some() {
            return;
        }
        let spec = self.mode().spec();
        match self.mode() {
            Mode::Deathmatch => {
                let limit = spec.kill_limit.unwrap_or(50);
                if let Some(team) = (0..2).find(|t| self.scores[*t] >= limit) {
                    self.finish(Some(team as u8), now);
                }
            }
            Mode::FreeForAll => {
                let limit = spec.kill_limit.unwrap_or(25);
                if let Some(index) = self.players.iter().position(|p| p.stats.kills >= limit) {
                    self.finish(Some(self.players[index].team), now);
                }
            }
            Mode::GunGame => {
                let done = spec.ladder.len();
                if let Some(index) = self.players.iter().position(|p| p.level >= done) {
                    self.finish(Some(self.players[index].team), now);
                }
            }
            Mode::Bomb | Mode::Knife => round::check_elimination(self, now),
        }
    }

    fn finish(&mut self, winner: Option<u8>, now: Instant) {
        self.result = Some(MatchResult { winner });
        self.phase = Phase::Vote {
            until: now + Duration::from_millis(rules().vote_ms),
        };
        self.projectiles.clear();
        self.event(
            Audience::All,
            json!({ "t": "matchEnd", "winner": winner, "maps": rules().maps, "voteMs": rules().vote_ms }),
        );
    }

    fn close_vote(&mut self) {
        let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
        for map in self.votes.values() {
            *counts.entry(map.as_str()).or_default() += 1;
        }
        let best = counts.values().copied().max().unwrap_or(0);
        let mut rng = rand::rng();
        let leaders: Vec<&str> = if best == 0 {
            rules().maps.iter().map(String::as_str).collect()
        } else {
            counts
                .iter()
                .filter(|(_, n)| **n == best)
                .map(|(map, _)| *map)
                .collect()
        };
        self.next_map = leaders.choose(&mut rng).map(|map| (*map).to_owned());
        self.phase = Phase::Done;
        self.outcome = Some(self.build_outcome());
    }

    fn build_outcome(&self) -> Outcome {
        let winner = self.result.as_ref().and_then(|r| r.winner);
        let scores: Vec<i64> = self
            .players
            .iter()
            .map(|p| i64::from(p.stats.kills))
            .collect();
        if self.mode().spec().teams {
            let placements = self
                .players
                .iter()
                .map(|p| match winner {
                    Some(team) if p.team != team => 2,
                    _ => 1,
                })
                .collect();
            return Outcome {
                placements,
                scores,
                reason: "match",
            };
        }
        let rank: Vec<i64> = self
            .players
            .iter()
            .map(|p| p.level as i64 * 1_000 + i64::from(p.stats.kills))
            .collect();
        let mut outcome = Outcome::ranked(rank, "match");
        outcome.scores = scores;
        outcome
    }

    fn respawns(&mut self, now: Instant) {
        if self.mode().rounds() || !self.live() {
            return;
        }
        let due: Vec<usize> = self
            .players
            .iter()
            .enumerate()
            .filter(|(_, p)| !p.alive && p.respawn_at.is_some_and(|at| now >= at))
            .map(|(i, _)| i)
            .collect();
        for index in due {
            self.spawn(index, now);
        }
    }

    fn advance_phase(&mut self, now: Instant) {
        match self.phase {
            Phase::Freeze { until } if now >= until => {
                let spec = self.mode().spec();
                let length =
                    Duration::from_millis(spec.round_ms.or(spec.time_ms).unwrap_or(600_000));
                self.live_since = Some(now);
                self.phase = Phase::Live {
                    until: now + length,
                };
            }
            Phase::Live { until } if now >= until => {
                if self.mode().rounds() {
                    round::time_up(self, now);
                } else {
                    let winner = self.leader();
                    self.finish(winner, now);
                }
            }
            Phase::RoundEnd { until } if now >= until => round::start_round(self, now),
            Phase::Vote { until } if now >= until => self.close_vote(),
            _ => {}
        }
    }

    fn leader(&self) -> Option<u8> {
        if self.mode().spec().teams {
            return match self.scores[0].cmp(&self.scores[1]) {
                std::cmp::Ordering::Greater => Some(0),
                std::cmp::Ordering::Less => Some(1),
                std::cmp::Ordering::Equal => None,
            };
        }
        self.players
            .iter()
            .max_by_key(|p| (p.level, p.stats.kills))
            .map(|p| p.team)
    }
}

#[derive(Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
enum Action {
    Move {
        #[serde(flatten)]
        input: MoveInput,
        #[serde(default)]
        pg: u32,
    },
    Fire {
        yaw: f64,
        pitch: f64,
        #[serde(default)]
        view: Option<u64>,
    },
    Reload,
    Slot {
        slot: Hand,
    },
    Buy {
        item: String,
    },
    Scope,
    Vote {
        map: String,
    },
}

impl Match for SiperMatch {
    fn start(&mut self, now: Instant) -> Vec<Delivery> {
        self.started = Some(now);
        if self.mode().rounds() {
            let money = rules().economy.start_money;
            for player in &mut self.players {
                player.money = money;
            }
            round::start_round(self, now);
        } else {
            self.start_respawn_mode(now);
        }
        let mut deliveries = vec![Delivery::event(Audience::All, self.roster())];
        deliveries.append(&mut self.pending);
        deliveries.extend(view::snapshots(self, now));
        deliveries
    }

    fn input(
        &mut self,
        seat: usize,
        payload: Value,
        now: Instant,
    ) -> Result<Vec<Delivery>, Reject> {
        if seat >= self.players.len() || self.players[seat].bot.is_some() {
            return Err(Reject::NotNow);
        }
        let action: Action = parse_input(payload)?;
        match action {
            Action::Move { input, pg } => {
                if !input.is_finite() {
                    return Err(Reject::InvalidInput);
                }
                let player = &mut self.players[seat];
                // Out-of-order packets are dropped; the latest input wins.
                if input.seq >= player.input.seq {
                    player.input = input;
                    player.ping = pg.min(999);
                }
            }
            Action::Fire { yaw, pitch, view } => {
                if !yaw.is_finite() || !pitch.is_finite() {
                    return Err(Reject::InvalidInput);
                }
                shooting::fire(self, seat, yaw, pitch.clamp(-1.55, 1.55), view, now);
            }
            Action::Reload => {
                let player = &mut self.players[seat];
                if player.alive {
                    shooting::start_reload(player, now);
                }
            }
            Action::Slot { slot } => {
                let player = &mut self.players[seat];
                if player.alive && player.loadout.select(slot) {
                    player.reload_until = None;
                    player.scoped = false;
                    player.burst = 0;
                    player.next_fire = Some(now + Duration::from_millis(250));
                }
            }
            Action::Buy { item } => {
                if !self.buy(seat, &item, now) {
                    return Err(Reject::NotNow);
                }
            }
            Action::Scope => {
                let player = &mut self.players[seat];
                if player.alive && player.loadout.weapon().is_some_and(|w| w.zoom.is_some()) {
                    player.scoped = !player.scoped;
                }
            }
            Action::Vote { map } => {
                if !matches!(self.phase, Phase::Vote { .. }) || !rules().maps.contains(&map) {
                    return Err(Reject::NotNow);
                }
                self.votes.insert(seat, map);
                let tally: BTreeMap<&str, usize> =
                    self.votes.values().fold(BTreeMap::new(), |mut sum, map| {
                        *sum.entry(map.as_str()).or_default() += 1;
                        sum
                    });
                self.event(Audience::All, json!({ "t": "votes", "counts": tally }));
            }
        }
        Ok(std::mem::take(&mut self.pending))
    }

    fn tick(&mut self, now: Instant) -> Vec<Delivery> {
        if self.phase == Phase::Done {
            return Vec::new();
        }
        self.advance_phase(now);
        if self.phase == Phase::Done {
            return std::mem::take(&mut self.pending);
        }
        let shots = if matches!(self.phase, Phase::Live { .. } | Phase::Freeze { .. }) {
            self.think_bots(now)
        } else {
            Vec::new()
        };
        self.simulate(now);
        for (index, yaw, pitch) in shots {
            shooting::fire(self, index, yaw, pitch, None, now);
        }
        self.respawns(now);

        self.tick += 1;
        if self.history.len() == HISTORY {
            self.history.pop_front();
        }
        self.history.push_back((self.tick, self.poses()));

        let mut deliveries = std::mem::take(&mut self.pending);
        deliveries.extend(view::snapshots(self, now));
        deliveries
    }

    fn tick_interval(&self) -> Option<Duration> {
        Some(TICK)
    }

    fn sync(&self, seat: usize, now: Instant) -> Vec<Delivery> {
        let mut deliveries = vec![Delivery::event(Audience::Seat(seat), self.roster())];
        deliveries.extend(
            view::snapshots(self, now)
                .into_iter()
                .filter(|delivery| delivery.audience == Audience::Seat(seat)),
        );
        deliveries
    }

    fn forfeit(&mut self, seat: usize, _now: Instant) -> Vec<Delivery> {
        let difficulty = self.options.bots.unwrap_or(Difficulty::Normal);
        if let Some(player) = self.players.get_mut(seat) {
            let mut bot = Bot::new(difficulty);
            bot.face(player.input.yaw);
            player.bot = Some(bot);
        }
        vec![Delivery::event(Audience::All, self.roster())]
    }

    fn outcome(&self) -> Option<Outcome> {
        self.outcome.clone()
    }

    fn admit(
        &mut self,
        nickname: &str,
        prefer: Option<u8>,
        _now: Instant,
    ) -> Option<(usize, Vec<Delivery>)> {
        if self.result.is_some() {
            return None;
        }
        let teams = self.mode().spec().teams;
        let humans = |team: u8| {
            self.players
                .iter()
                .filter(|p| p.team == team && p.bot.is_none())
                .count()
        };
        let preferred_team = if teams {
            prefer
                .filter(|t| *t < 2)
                .unwrap_or(u8::from(humans(1) < humans(0)))
        } else {
            0
        };
        let candidates: Vec<usize> = self
            .players
            .iter()
            .enumerate()
            .filter(|(_, p)| p.bot.is_some())
            .map(|(i, _)| i)
            .collect();
        let index = candidates
            .iter()
            .copied()
            .find(|i| !teams || self.players[*i].team == preferred_team)
            .or_else(|| candidates.first().copied())?;
        let player = &mut self.players[index];
        player.bot = None;
        player.name = nickname.to_owned();
        player.stats = player::Stats::default();
        player.tally = announcer::Tally::default();
        Some((index, vec![Delivery::event(Audience::All, self.roster())]))
    }

    fn team_of(&self, seat: usize) -> Option<u8> {
        self.players
            .get(seat)
            .filter(|_| self.mode().spec().teams)
            .map(|p| p.team)
    }

    fn report(&self) -> Option<Value> {
        let outcome = self.outcome.as_ref()?;
        let winner = self.result.as_ref().and_then(|r| r.winner);
        let duration = self
            .started
            .map_or(0, |started| started.elapsed().as_millis() as u64);
        Some(json!({
            "game": "siper",
            "mode": self.mode().key(),
            "map": self.grid().id,
            "durationMs": duration,
            "rounds": self.round,
            "scores": self.scores,
            "humans": self.players.iter().filter(|p| p.bot.is_none()).count(),
            "players": self.players.iter().enumerate().map(|(i, p)| json!({
                "seat": i,
                "bot": p.bot.is_some(),
                "team": p.team,
                "won": self.mode().spec().teams && winner == Some(p.team) || outcome.placements[i] == 1 && !self.mode().spec().teams,
                "placement": outcome.placements[i],
                "kills": p.stats.kills,
                "deaths": p.stats.deaths,
                "assists": p.stats.assists,
                "headshots": p.stats.headshots,
                "shots": p.stats.shots,
                "hits": p.stats.hits,
                "damage": p.stats.damage,
                "plants": p.stats.plants,
                "defuses": p.stats.defuses,
                "knifeKills": p.stats.knife_kills,
                "bestStreak": p.tally.best_streak,
                "bestMulti": p.tally.best_multi,
                "weaponKills": p.stats.weapon_kills,
            })).collect::<Vec<_>>(),
        }))
    }

    fn next_options(&self, current: &Value) -> Option<Value> {
        let map = self.next_map.as_ref()?;
        let mut options = current.clone();
        if let Some(object) = options.as_object_mut() {
            object.insert("map".to_owned(), Value::String(map.clone()));
        }
        Some(options)
    }
}

#[cfg(test)]
mod tests;
