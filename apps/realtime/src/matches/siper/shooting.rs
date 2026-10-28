use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

use rand::RngExt;
use serde_json::json;

use super::{
    Projectile, SiperMatch, Smoke, Throwable,
    combat::{self, Zone},
    data::{arsenal, rules},
    movement::direction,
    player::{Hand, Player},
};
use crate::matches::Audience;

// Shots that arrive a little early are network jitter, not a faster trigger finger.
const FIRE_SLACK: Duration = Duration::from_millis(20);
const BACKSTAB_DAMAGE: i32 = 180;

pub fn start_reload(player: &mut Player, now: Instant) {
    if player.reload_until.is_some() {
        return;
    }
    let Some(gun) = player.loadout.gun() else {
        return;
    };
    if gun.ammo >= gun.spec.magazine || gun.reserve == 0 {
        return;
    }
    player.scoped = false;
    player.reload_until = Some(now + Duration::from_millis(gun.spec.reload_ms));
}

pub fn finish_reload(player: &mut Player) {
    player.reload_until = None;
    if let Some(gun) = player.loadout.gun_mut() {
        let moved = (gun.spec.magazine - gun.ammo).min(gun.reserve);
        gun.ammo += moved;
        gun.reserve -= moved;
    }
}

pub fn fire(
    game: &mut SiperMatch,
    index: usize,
    yaw: f64,
    pitch: f64,
    view: Option<u64>,
    now: Instant,
) {
    if !game.live() || !game.players[index].alive {
        return;
    }
    let player = &game.players[index];
    if player.reload_until.is_some() || player.next_fire.is_some_and(|at| now + FIRE_SLACK < at) {
        return;
    }
    match player.loadout.hand {
        Hand::Grenade => return throw(game, index, Throwable::Grenade, yaw, pitch, now),
        Hand::Smoke => return throw(game, index, Throwable::Smoke, yaw, pitch, now),
        Hand::Melee => return stab(game, index, yaw, pitch, view, now),
        Hand::Primary | Hand::Secondary => {}
    }

    let player = &mut game.players[index];
    let Some(spec) = player.loadout.weapon() else {
        return;
    };
    let Some(gun) = player.loadout.gun_mut() else {
        return;
    };
    if gun.ammo == 0 {
        start_reload(player, now);
        return;
    }
    gun.ammo -= 1;
    let recovered = player
        .last_shot
        .is_none_or(|last| now.duration_since(last) > Duration::from_millis(spec.recovery_ms));
    if recovered {
        player.burst = 0;
    }
    let (kick_pitch, kick_yaw) = combat::recoil(spec, player.burst);
    player.burst += 1;
    player.last_shot = Some(now);
    player.next_fire = Some(now + Duration::from_millis(spec.fire_ms));
    player.stats.shots += 1;
    let cone = combat::spread(
        spec,
        player.speed(),
        !player.body.grounded,
        player.body.crouched,
        player.scoped,
    );
    if spec.zoom.is_some() {
        // Bolt-action: the scope drops after every shot like the real thing.
        player.scoped = false;
    }
    let origin = player.eye();

    let poses = game.rewound(view);
    let mut rng = rand::rng();
    let mut hits: BTreeMap<usize, (i32, i32, Zone)> = BTreeMap::new();
    let mut tracer_end = origin;
    for pellet in 0..spec.pellets {
        let jitter = |rng: &mut rand::rngs::ThreadRng| {
            (rng.random::<f64>() + rng.random::<f64>() - 1.0) * cone
        };
        let dir = direction(
            yaw + (kick_yaw + jitter(&mut rng)).to_radians(),
            pitch - (kick_pitch + jitter(&mut rng)).to_radians(),
        );
        let wall = game
            .grid()
            .raycast(origin, dir, spec.range)
            .unwrap_or(spec.range);
        let mut nearest: Option<(usize, f64, Zone)> = None;
        for (other, pose) in poses.iter().enumerate() {
            if !pose.alive || !game.enemies(index, other) {
                continue;
            }
            if let Some((t, zone)) = combat::hit_pose(origin, dir, pose)
                && t < wall
                && nearest.is_none_or(|(_, best, _)| t < best)
            {
                nearest = Some((other, t, zone));
            }
        }
        let reach = nearest.map_or(wall, |(_, t, _)| t);
        if pellet == 0 {
            tracer_end = [
                origin[0] + dir[0] * reach,
                origin[1] + dir[1] * reach,
                origin[2] + dir[2] * reach,
            ];
        }
        if let Some((victim, t, zone)) = nearest {
            let target = &game.players[victim];
            let dealt = combat::damage(spec, zone, t, target.armor, target.helmet);
            let entry = hits.entry(victim).or_insert((0, 0, zone));
            entry.0 += dealt.health;
            entry.1 += dealt.armor;
            if zone == Zone::Head {
                entry.2 = Zone::Head;
            }
        }
    }
    game.event(
        Audience::AllExcept(index),
        json!({ "t": "shot", "i": index, "w": spec.id, "o": round3(origin), "e": round3(tracer_end) }),
    );
    if !hits.is_empty() {
        game.players[index].stats.hits += 1;
    }
    for (victim, (health, armor, zone)) in hits {
        hurt(game, index, victim, health, armor, zone, &spec.id, now);
    }
}

fn stab(
    game: &mut SiperMatch,
    index: usize,
    yaw: f64,
    pitch: f64,
    view: Option<u64>,
    now: Instant,
) {
    let Some(spec) = arsenal().weapon("knife") else {
        return;
    };
    let player = &mut game.players[index];
    player.next_fire = Some(now + Duration::from_millis(spec.fire_ms));
    player.stats.shots += 1;
    let origin = player.eye();
    let dir = direction(yaw, pitch);
    let poses = game.rewound(view);
    let mut nearest: Option<(usize, f64, Zone)> = None;
    for (other, pose) in poses.iter().enumerate() {
        if !pose.alive || !game.enemies(index, other) {
            continue;
        }
        if let Some((t, zone)) = combat::hit_pose(origin, dir, pose)
            && t <= spec.range
            && nearest.is_none_or(|(_, best, _)| t < best)
        {
            nearest = Some((other, t, zone));
        }
    }
    game.event(
        Audience::AllExcept(index),
        json!({ "t": "slash", "i": index }),
    );
    let Some((victim, t, zone)) = nearest else {
        return;
    };
    let target = &game.players[victim];
    // Stabbing someone who faces away finishes them.
    let facing = direction(target.input.yaw, 0.0);
    let behind = facing[0] * dir[0] + facing[2] * dir[2] > 0.5;
    let dealt = combat::damage(spec, zone, t, target.armor, target.helmet);
    let health = if behind {
        BACKSTAB_DAMAGE
    } else {
        dealt.health
    };
    game.players[index].stats.hits += 1;
    hurt(game, index, victim, health, dealt.armor, zone, "knife", now);
}

#[allow(clippy::too_many_arguments)]
fn hurt(
    game: &mut SiperMatch,
    attacker: usize,
    victim: usize,
    health: i32,
    armor: i32,
    zone: Zone,
    weapon: &str,
    now: Instant,
) {
    let from = {
        let source = &game.players[attacker];
        [source.body.x, source.body.z]
    };
    let target = &mut game.players[victim];
    if !target.alive {
        return;
    }
    let applied = health.min(target.health);
    target.health -= health;
    target.armor = (target.armor - armor).max(0);
    if target.armor == 0 {
        target.helmet = false;
    }
    target.damage_from.push((attacker, applied));
    let killed = target.health <= 0;
    if zone == Zone::Head && weapon != "knife" && weapon != "grenade" {
        let source = &game.players[attacker];
        let target = &game.players[victim];
        let distance = (source.body.x - target.body.x).hypot(source.body.z - target.body.z);
        game.players[attacker].integrity.on_head_hit(distance);
    }
    game.players[attacker].stats.damage += i64::from(applied);
    game.event(
        Audience::Seat(attacker),
        json!({ "t": "hit", "v": victim, "head": zone == Zone::Head, "kill": killed, "dmg": applied }),
    );
    game.event(
        Audience::Seat(victim),
        json!({ "t": "hurt", "from": from, "dmg": applied, "by": attacker }),
    );
    if killed {
        game.kill(Some(attacker), victim, weapon, zone == Zone::Head, now);
    }
}

fn throw(game: &mut SiperMatch, index: usize, kind: Throwable, yaw: f64, pitch: f64, now: Instant) {
    let combat_spec = &rules().combat;
    let player = &mut game.players[index];
    match kind {
        Throwable::Grenade => player.loadout.grenade = false,
        Throwable::Smoke => player.loadout.smoke = false,
    }
    player.loadout.fallback();
    player.next_fire = Some(now + Duration::from_millis(400));
    let dir = direction(yaw, pitch - 0.12);
    let speed = combat_spec.grenade_speed;
    let pos = player.eye();
    let vel = [
        dir[0] * speed + player.body.vx * 0.5,
        dir[1] * speed + player.body.vy * 0.5,
        dir[2] * speed + player.body.vz * 0.5,
    ];
    game.projectiles.push(Projectile {
        owner: index,
        kind,
        pos,
        vel,
        fuse: now + Duration::from_millis(combat_spec.grenade_fuse_ms),
    });
    game.event(
        Audience::All,
        json!({ "t": "throw", "i": index, "k": if kind == Throwable::Grenade { "grenade" } else { "smoke" } }),
    );
}

pub fn update_projectiles(game: &mut SiperMatch, now: Instant) {
    let gravity = rules().movement.gravity;
    let grid = game.grid();
    let mut detonated = Vec::new();
    for (i, projectile) in game.projectiles.iter_mut().enumerate() {
        projectile.vel[1] -= gravity * super::TICK_SECS;
        let old = projectile.pos;
        let next = [
            old[0] + projectile.vel[0] * super::TICK_SECS,
            old[1] + projectile.vel[1] * super::TICK_SECS,
            old[2] + projectile.vel[2] * super::TICK_SECS,
        ];
        let top = grid.height(grid.cell_at(next[0], next[2]));
        if next[1] > top {
            projectile.pos = next;
        } else if top <= old[1] {
            projectile.pos = [next[0], top + 0.05, next[2]];
            projectile.vel = [
                projectile.vel[0] * 0.6,
                -projectile.vel[1] * 0.35,
                projectile.vel[2] * 0.6,
            ];
        } else {
            if grid.height(grid.cell_at(next[0], old[2])) > old[1] {
                projectile.vel[0] = -projectile.vel[0] * 0.5;
            }
            if grid.height(grid.cell_at(old[0], next[2])) > old[1] {
                projectile.vel[2] = -projectile.vel[2] * 0.5;
            }
        }
        if now >= projectile.fuse {
            detonated.push(i);
        }
    }
    for i in detonated.into_iter().rev() {
        let projectile = game.projectiles.remove(i);
        detonate(game, projectile, now);
    }
}

fn detonate(game: &mut SiperMatch, projectile: Projectile, now: Instant) {
    let combat_spec = &rules().combat;
    let at = projectile.pos;
    match projectile.kind {
        Throwable::Smoke => {
            game.smokes.push(Smoke {
                pos: at,
                until: now + Duration::from_millis(combat_spec.smoke_ms),
            });
            game.event(
                Audience::All,
                json!({ "t": "smoke", "at": round3(at), "ms": combat_spec.smoke_ms }),
            );
        }
        Throwable::Grenade => {
            game.event(Audience::All, json!({ "t": "boom", "at": round3(at) }));
            let damage = arsenal().grenade("grenade").map_or(98.0, |g| g.damage);
            let radius = combat_spec.grenade_radius;
            let blast = [at[0], at[1] + 0.2, at[2]];
            for victim in 0..game.players.len() {
                let target = &game.players[victim];
                if !target.alive {
                    continue;
                }
                let own = victim == projectile.owner;
                if !own && !game.enemies(projectile.owner, victim) {
                    continue;
                }
                let chest = target.pose().chest();
                let d = ((chest[0] - at[0]).powi(2)
                    + (chest[1] - at[1]).powi(2)
                    + (chest[2] - at[2]).powi(2))
                .sqrt();
                if d >= radius || !game.grid().clear_line(blast, chest) {
                    continue;
                }
                let mut amount = damage * (1.0 - d / radius);
                if target.armor > 0 {
                    amount *= 0.6;
                }
                hurt(
                    game,
                    projectile.owner,
                    victim,
                    amount.round() as i32,
                    0,
                    Zone::Body,
                    "grenade",
                    now,
                );
            }
        }
    }
}

fn round3(v: [f64; 3]) -> [f64; 3] {
    v.map(|x| (x * 1000.0).round() / 1000.0)
}
