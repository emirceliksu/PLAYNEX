use std::{sync::OnceLock, time::Instant};

use serde_json::{Value, json};

use super::{Bomb, Phase, SiperMatch, Throwable, data::arsenal, visibility};
use crate::matches::{Audience, Delivery, remaining_ms};

// Scoreboard columns change slowly, so they ride along twice a second instead of every tick.
pub const BOARD_EVERY: u64 = 15;

const CROUCHED: u8 = 1;
const ALIVE: u8 = 2;
const CARRIES_BOMB: u8 = 4;
const SCOPED: u8 = 8;

// Weapon ids travel as indexes into this list: the weapons file order, then the grenades.
// The client builds the same list from the same file.
pub fn weapon_ids() -> &'static [String] {
    static IDS: OnceLock<Vec<String>> = OnceLock::new();
    IDS.get_or_init(|| {
        let arsenal = arsenal();
        arsenal
            .weapons
            .iter()
            .map(|w| w.id.clone())
            .chain(arsenal.grenades.iter().map(|g| g.id.clone()))
            .collect()
    })
}

fn weapon_index(id: &str) -> usize {
    weapon_ids()
        .iter()
        .position(|known| known == id)
        .unwrap_or(0)
}

fn r2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn r3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn phase(game: &SiperMatch, now: Instant) -> (&'static str, u64) {
    match game.phase {
        Phase::Freeze { until } => ("freeze", remaining_ms(until, now)),
        Phase::Live { until } => ("live", remaining_ms(until, now)),
        Phase::RoundEnd { until } => ("roundEnd", remaining_ms(until, now)),
        Phase::Vote { until } => ("vote", remaining_ms(until, now)),
        Phase::Done => ("done", 0),
    }
}

fn bomb(game: &SiperMatch, now: Instant, attacker: bool) -> Value {
    match game.bomb {
        None => Value::Null,
        // Defenders learn that someone has it, not who.
        Some(Bomb::Carried(index)) if attacker => json!({ "s": "carried", "by": index }),
        Some(Bomb::Carried(_)) => json!({ "s": "carried", "by": null }),
        Some(Bomb::Dropped(at)) => json!({ "s": "dropped", "at": at.map(r2) }),
        Some(Bomb::Planted { at, site, explodes }) => json!({
            "s": "planted",
            "at": at.map(r2),
            "site": (site as char).to_string(),
            "tl": remaining_ms(explodes, now),
        }),
        Some(Bomb::Defused(at)) => json!({ "s": "defused", "at": at.map(r2) }),
        Some(Bomb::Exploded(at)) => json!({ "s": "exploded", "at": at.map(r2) }),
    }
}

fn board(game: &SiperMatch) -> Value {
    Value::Array(
        game.players
            .iter()
            .map(|p| {
                json!([
                    p.team,
                    p.stats.kills,
                    p.stats.deaths,
                    p.stats.assists,
                    p.stats.score(),
                    p.ping,
                    p.level
                ])
            })
            .collect(),
    )
}

// One frame per human seat. Each side only gets the enemies it can see or hear, as compact
// arrays: [x, y, z, yaw, pitch, flags, health, weapon]; hidden players are null.
pub fn snapshots(game: &SiperMatch, now: Instant, with_board: bool) -> Vec<Delivery> {
    let (phase, left) = phase(game, now);
    let teams = game.mode().spec().teams;
    let open = matches!(game.phase, Phase::Vote { .. } | Phase::Done);
    let compact: Vec<Value> = game
        .players
        .iter()
        .map(|p| {
            let flags = (u8::from(p.body.crouched) * CROUCHED)
                | (u8::from(p.alive) * ALIVE)
                | (u8::from(p.has_bomb) * CARRIES_BOMB)
                | (u8::from(p.scoped) * SCOPED);
            json!([
                r2(p.body.x),
                r2(p.body.y),
                r2(p.body.z),
                r3(p.input.yaw),
                r3(p.input.pitch),
                flags,
                p.health.max(0),
                weapon_index(p.loadout.held_id())
            ])
        })
        .collect();
    let projectiles: Vec<Value> = game
        .projectiles
        .iter()
        .map(|g| {
            json!([
                r2(g.pos[0]),
                r2(g.pos[1]),
                r2(g.pos[2]),
                u8::from(g.kind == Throwable::Smoke)
            ])
        })
        .collect();
    let smokes: Vec<Value> = game
        .smokes
        .iter()
        .map(|s| {
            json!([
                r2(s.pos[0]),
                r2(s.pos[1]),
                r2(s.pos[2]),
                remaining_ms(s.until, now)
            ])
        })
        .collect();
    let scoreboard = with_board.then(|| board(game));

    let plant_ms = game.mode().spec().plant_ms.unwrap_or(3_000) as f64;
    let defuse_ms = game.mode().spec().defuse_ms.unwrap_or(5_000) as f64;
    game.players
        .iter()
        .enumerate()
        .filter(|(_, p)| p.bot.is_none())
        .map(|(seat, p)| {
            let known = if open || game.sight.is_empty() {
                vec![true; game.players.len()]
            } else {
                visibility::known_by(&game.sight, &game.players, seat, teams)
            };
            let players: Vec<Value> = compact
                .iter()
                .zip(&known)
                .map(|(view, seen)| if *seen { view.clone() } else { Value::Null })
                .collect();
            let gun = p.loadout.gun();
            let using = p.using_since.map(|since| {
                let held = now.duration_since(since).as_millis() as f64;
                if p.has_bomb {
                    json!(["plant", r2((held / plant_ms).min(1.0))])
                } else {
                    json!(["defuse", r2((held / defuse_ms).min(1.0))])
                }
            });
            let mut payload = json!({
                "t": game.tick,
                "ph": phase,
                "tl": left,
                "rd": game.round,
                "sc": game.scores,
                "p": players,
                "bomb": bomb(game, now, !teams || p.team == 0),
                "gr": projectiles,
                "sm": smokes,
                "me": {
                    "i": seat,
                    "ack": p.input.seq,
                    "hp": p.health.max(0),
                    "ar": p.armor,
                    "hel": p.helmet,
                    "$": p.money,
                    "hand": p.loadout.hand,
                    "ammo": gun.map(|g| g.ammo),
                    "res": gun.map(|g| g.reserve),
                    "rl": p.reload_until.map(|until| remaining_ms(until, now)),
                    "inv": [
                        p.loadout.primary.as_ref().map(|g| g.spec.id.as_str()),
                        p.loadout.secondary.as_ref().map(|g| g.spec.id.as_str()),
                        p.loadout.knife,
                        p.loadout.grenade,
                        p.loadout.smoke,
                    ],
                    "buy": game.can_buy(seat, now),
                    "use": using,
                    "rs": p.respawn_at.map(|at| remaining_ms(at, now)),
                    "v": [r2(p.body.vx), r2(p.body.vy), r2(p.body.vz)],
                    "gd": p.body.grounded,
                },
            });
            if let Some(scoreboard) = &scoreboard {
                payload["b"] = scoreboard.clone();
            }
            Delivery {
                audience: Audience::Seat(seat),
                kind: "state.snapshot",
                payload,
            }
        })
        .collect()
}
