use std::time::Instant;

use serde_json::{Value, json};

use super::{Bomb, Phase, SiperMatch, Throwable};
use crate::matches::{Audience, Delivery, remaining_ms};

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

fn bomb(game: &SiperMatch, now: Instant) -> Value {
    match game.bomb {
        None => Value::Null,
        Some(Bomb::Carried(index)) => json!({ "s": "carried", "by": index }),
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

// Everyone gets the same world; each seat also gets its own wallet, ammo and timers.
pub fn snapshots(game: &SiperMatch, now: Instant) -> Vec<Delivery> {
    let (phase, left) = phase(game, now);
    let players: Vec<Value> = game
        .players
        .iter()
        .map(|p| {
            json!({
                "x": r2(p.body.x),
                "y": r2(p.body.y),
                "z": r2(p.body.z),
                "yw": r3(p.input.yaw),
                "pt": r3(p.input.pitch),
                "c": p.body.crouched,
                "a": p.alive,
                "hp": p.health.max(0),
                "w": p.loadout.held_id(),
                "tm": p.team,
                "k": p.stats.kills,
                "d": p.stats.deaths,
                "as": p.stats.assists,
                "sc": p.stats.score(),
                "pg": p.ping,
                "bm": p.has_bomb,
                "lv": p.level,
                "zm": p.scoped,
                "$": if game.mode().spec().teams { Some(p.money) } else { None },
            })
        })
        .collect();
    let world = json!({
        "t": game.tick,
        "ph": phase,
        "tl": left,
        "rd": game.round,
        "sc": game.scores,
        "p": players,
        "bomb": bomb(game, now),
        "gr": game.projectiles.iter().map(|g| json!([r2(g.pos[0]), r2(g.pos[1]), r2(g.pos[2]), u8::from(g.kind == Throwable::Smoke)])).collect::<Vec<_>>(),
        "sm": game.smokes.iter().map(|s| json!([r2(s.pos[0]), r2(s.pos[1]), r2(s.pos[2]), remaining_ms(s.until, now)])).collect::<Vec<_>>(),
    });

    let plant_ms = game.mode().spec().plant_ms.unwrap_or(3_000) as f64;
    let defuse_ms = game.mode().spec().defuse_ms.unwrap_or(5_000) as f64;
    game.players
        .iter()
        .enumerate()
        .filter(|(_, p)| p.bot.is_none())
        .map(|(seat, p)| {
            let gun = p.loadout.gun();
            let using = p.using_since.map(|since| {
                let held = now.duration_since(since).as_millis() as f64;
                if p.has_bomb {
                    json!(["plant", r2((held / plant_ms).min(1.0))])
                } else {
                    json!(["defuse", r2((held / defuse_ms).min(1.0))])
                }
            });
            let mut payload = world.clone();
            payload["me"] = json!({
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
                "inv": {
                    "p": p.loadout.primary.as_ref().map(|g| g.spec.id.as_str()),
                    "s": p.loadout.secondary.as_ref().map(|g| g.spec.id.as_str()),
                    "k": p.loadout.knife,
                    "g": p.loadout.grenade,
                    "m": p.loadout.smoke,
                },
                "buy": game.can_buy(seat, now),
                "use": using,
                "rs": p.respawn_at.map(|at| remaining_ms(at, now)),
                "zm": p.scoped,
                "vy": r2(p.body.vy),
                "vx": r2(p.body.vx),
                "vz": r2(p.body.vz),
                "gd": p.body.grounded,
                "lk": p.level_kills,
            });
            Delivery {
                audience: Audience::Seat(seat),
                kind: "state.snapshot",
                payload,
            }
        })
        .collect()
}
