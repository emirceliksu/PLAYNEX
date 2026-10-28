use std::time::{Duration, Instant};

use rand::seq::IndexedRandom;
use serde_json::json;

use super::{
    Bomb, Mode, Phase, ROUND_END, SiperMatch,
    data::rules,
    player::{Hand, Loadout},
};
use crate::matches::Audience;

pub fn start_round(game: &mut SiperMatch, now: Instant) {
    let spec = game.mode().spec();
    game.round += 1;
    game.bomb = None;
    game.projectiles.clear();
    game.smokes.clear();
    game.live_since = None;

    let target = spec.rounds_to_win.unwrap_or(7);
    if game.scores.iter().any(|score| *score + 1 == target) {
        game.event(
            Audience::All,
            json!({ "t": "announce", "key": "lastRound", "who": null, "global": true }),
        );
    }
    for index in 0..game.players.len() {
        game.spawn(index, now);
        let player = &mut game.players[index];
        player.has_bomb = false;
        // A fresh round always starts with something loaded in hand.
        if let Some(gun) = player.loadout.primary.as_mut() {
            gun.ammo = gun.spec.magazine;
        }
        if let Some(gun) = player.loadout.secondary.as_mut() {
            gun.ammo = gun.spec.magazine;
        }
        if player.loadout.primary.is_some() {
            player.loadout.hand = Hand::Primary;
        }
    }
    if game.mode() == Mode::Bomb {
        let attackers: Vec<usize> = (0..game.players.len())
            .filter(|i| game.players[*i].team == 0)
            .collect();
        let mut rng = rand::rng();
        if let Some(carrier) = attackers.choose(&mut rng).copied() {
            game.players[carrier].has_bomb = true;
            game.bomb = Some(Bomb::Carried(carrier));
        }
        game.bot_site = *b"AB".choose(&mut rng).unwrap_or(&b'A');
    }
    game.phase = Phase::Freeze {
        until: now + Duration::from_millis(spec.freeze_ms.unwrap_or(5_000)),
    };
    game.event(
        Audience::All,
        json!({ "t": "round", "s": "start", "rd": game.round, "sc": game.scores }),
    );
}

pub fn end_round(game: &mut SiperMatch, winner: u8, reason: &str, now: Instant) {
    if !matches!(game.phase, Phase::Live { .. }) {
        return;
    }
    let economy = &rules().economy;
    let spec = game.mode().spec();
    game.scores[winner as usize] += 1;
    let loser = 1 - winner;
    game.loss_streak[winner as usize] = 0;
    let streak = game.loss_streak[loser as usize];
    game.loss_streak[loser as usize] = (streak + 1).min(4);
    let win_bonus = if reason == "exploded" || reason == "defused" {
        economy.bomb_win
    } else {
        economy.round_win
    };
    let loss_bonus = (economy.loss_base + economy.loss_step * streak).min(economy.loss_max);
    for player in &mut game.players {
        let bonus = if player.team == winner {
            win_bonus
        } else {
            loss_bonus
        };
        player.money = (player.money + bonus).min(economy.max_money);
        player.using_since = None;
    }
    game.event(
        Audience::All,
        json!({ "t": "round", "s": "end", "winner": winner, "reason": reason, "sc": game.scores }),
    );
    game.event(
        Audience::All,
        json!({ "t": "announce", "key": if winner == 0 { "attackersWin" } else { "defendersWin" }, "who": null, "global": true }),
    );

    if game.scores[winner as usize] >= spec.rounds_to_win.unwrap_or(7) {
        game.finish(Some(winner), now);
        return;
    }
    if Some(game.round) == spec.halftime {
        swap_sides(game);
    }
    game.phase = Phase::RoundEnd {
        until: now + ROUND_END,
    };
}

// Teams trade sides at the half: scores and loss streaks travel with the people, money resets.
fn swap_sides(game: &mut SiperMatch) {
    let start = rules().economy.start_money;
    let knife = game.mode() == Mode::Knife;
    for player in &mut game.players {
        player.team = 1 - player.team;
        player.money = start;
        player.armor = 0;
        player.helmet = false;
        player.loadout = if knife {
            Loadout::knife_only()
        } else {
            Loadout::starter()
        };
    }
    game.scores.swap(0, 1);
    game.loss_streak = [0, 0];
    game.event(Audience::All, json!({ "t": "halftime", "sc": game.scores }));
    let roster = game.roster();
    game.event(Audience::All, roster);
}

pub fn time_up(game: &mut SiperMatch, now: Instant) {
    if let Some(Bomb::Planted { at, .. }) = game.bomb {
        game.explode_bomb(at, now);
        return;
    }
    if game.mode() == Mode::Knife {
        let alive = [0u8, 1].map(|team| {
            game.players
                .iter()
                .filter(|p| p.alive && p.team == team)
                .count()
        });
        let winner = u8::from(alive[1] >= alive[0]);
        end_round(game, winner, "time", now);
        return;
    }
    end_round(game, 1, "time", now);
}

pub fn check_elimination(game: &mut SiperMatch, now: Instant) {
    let alive = [0u8, 1].map(|team| game.players.iter().any(|p| p.alive && p.team == team));
    let planted = matches!(game.bomb, Some(Bomb::Planted { .. }));
    if !alive[1] {
        end_round(game, 0, "eliminated", now);
    } else if !alive[0] && !planted {
        end_round(game, 1, "eliminated", now);
    }
}
