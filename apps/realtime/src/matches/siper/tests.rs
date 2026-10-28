use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::*;
use crate::matches::SeatInfo;

fn setup(seats: usize, teams: &[Option<u8>], options: Value) -> MatchSetup {
    MatchSetup {
        seats,
        players: (0..seats)
            .map(|seat| SeatInfo {
                nickname: format!("oyuncu{seat}"),
                team: teams.get(seat).copied().flatten(),
                ..SeatInfo::default()
            })
            .collect(),
        round: 0,
        options,
    }
}

// Runs the match on simulated time; returns the deliveries seen along the way.
fn run(game: &mut SiperMatch, start: Instant, seconds: u64) -> (Instant, Vec<Delivery>) {
    let mut seen = Vec::new();
    let mut now = start;
    for _ in 0..seconds * 30 {
        now += TICK;
        seen.extend(game.tick(now));
        if game.outcome().is_some() {
            break;
        }
    }
    (now, seen)
}

fn events<'a>(deliveries: &'a [Delivery], kind: &str) -> Vec<&'a Value> {
    deliveries
        .iter()
        .filter(|d| d.kind == "event" && d.payload["t"] == kind)
        .map(|d| &d.payload)
        .collect()
}

#[test]
fn options_are_checked() {
    assert!(parse_options(&Value::Null).is_ok());
    assert!(
        parse_options(&json!({ "mode": "bomb", "map": "santral", "bots": "hard", "size": 3 }))
            .is_ok()
    );
    assert!(parse_options(&json!({ "mode": "racing" })).is_err());
    assert!(parse_options(&json!({ "map": "dust" })).is_err());
    assert!(parse_options(&json!({ "mode": "tdm", "size": 6 })).is_err());
    assert!(parse_options(&json!({ "mode": "ffa", "size": 10 })).is_ok());
}

#[test]
fn bots_fill_teams_to_equal_size() {
    let game = SiperMatch::new(&setup(
        3,
        &[Some(0), Some(0), None],
        json!({ "mode": "tdm", "size": 4 }),
    ))
    .unwrap();
    let per_team = [0u8, 1].map(|t| game.players.iter().filter(|p| p.team == t).count());
    assert_eq!(per_team, [4, 4]);
    assert_eq!(
        game.players[2].team, 1,
        "the unpicked player balances the other side"
    );
    assert_eq!(game.players.iter().filter(|p| p.bot.is_some()).count(), 5);
}

#[test]
fn uneven_teams_without_bots_cannot_start() {
    let uneven = SiperMatch::new(&setup(
        3,
        &[Some(0), Some(0), Some(1)],
        json!({ "bots": "off" }),
    ));
    assert!(matches!(uneven, Err(Reject::TeamsUneven)));
    let even = SiperMatch::new(&setup(2, &[None, None], json!({ "bots": "off" }))).unwrap();
    assert_ne!(even.players[0].team, even.players[1].team);
}

#[test]
fn a_bot_deathmatch_produces_kills_and_finishes() {
    let mut game = SiperMatch::new(&setup(
        1,
        &[None],
        json!({ "mode": "tdm", "map": "liman", "bots": "hard", "size": 5 }),
    ))
    .unwrap();
    let start = Instant::now();
    game.start(start);
    let (_, seen) = run(&mut game, start, 120);
    assert!(!events(&seen, "kill").is_empty(), "bots found each other");
    assert!(
        seen.iter()
            .any(|d| d.kind == "state.snapshot" && d.audience == Audience::Seat(0))
    );
    assert!(
        seen.iter()
            .filter(|d| d.kind == "state.snapshot")
            .all(|d| d.audience == Audience::Seat(0)),
        "bots get no snapshots"
    );
}

#[test]
fn bomb_rounds_pay_out_and_count() {
    let mut game = SiperMatch::new(&setup(
        1,
        &[Some(0)],
        json!({ "mode": "bomb", "map": "carsi", "bots": "hard", "size": 3 }),
    ))
    .unwrap();
    let start = Instant::now();
    game.start(start);
    assert!(game.players.iter().filter(|p| p.has_bomb).count() == 1);
    assert!(
        game.players
            .iter()
            .all(|p| p.money <= rules().economy.start_money)
    );
    let (_, seen) = run(&mut game, start, 400);
    let ends = events(&seen, "round");
    assert!(
        ends.iter().any(|e| e["s"] == "end"),
        "at least one round was decided"
    );
    assert!(game.round >= 2);
}

#[test]
fn humans_hit_what_they_aim_at() {
    let mut game = SiperMatch::new(&setup(
        2,
        &[Some(0), Some(1)],
        json!({ "mode": "tdm", "bots": "off" }),
    ))
    .unwrap();
    let start = Instant::now();
    game.start(start);
    let now = start + Duration::from_secs(4);
    game.tick(now);
    assert!(game.live());
    // Stand the two players face to face in the open attacker spawn.
    let grid = game.grid();
    let (x, z) = grid.center(grid.cells_of(b'a')[0]);
    for (index, dz) in [(0usize, 0.0), (1, -8.0)] {
        let player = &mut game.players[index];
        player.body.x = x;
        player.body.z = z + dz;
        player.body.y = 0.0;
        player.body.vx = 0.0;
        player.body.vz = 0.0;
        player.body.grounded = true;
    }
    game.history.clear();
    let target = game.players[1].pose().head_center();
    let eye = game.players[0].eye();
    let (dx, dy, dz) = (target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
    let yaw = dx.atan2(dz);
    let pitch = -dy.atan2(dx.hypot(dz));
    game.players[0].loadout = Loadout::single("sniper");
    game.players[0].scoped = true;
    let result = game
        .input(0, json!({ "t": "fire", "yaw": yaw, "pitch": pitch }), now)
        .unwrap();
    let hit = events(&result, "hit");
    assert_eq!(hit.len(), 1);
    assert_eq!(hit[0]["head"], true);
    assert_eq!(hit[0]["kill"], true);
    assert!(!game.players[1].alive);
    let calls: Vec<&Value> = events(&result, "announce");
    assert!(calls.iter().any(|c| c["key"] == "firstBlood"));
    assert!(calls.iter().any(|c| c["key"] == "headshot"));
    assert_eq!(game.scores[0], 1);
}

#[test]
fn gun_game_walks_the_ladder() {
    let mut game = SiperMatch::new(&setup(
        1,
        &[None],
        json!({ "mode": "gungame", "bots": "off", "size": 2 }),
    ))
    .unwrap();
    let start = Instant::now();
    game.start(start);
    assert_eq!(game.players[0].loadout.held_id(), "pistol");
    game.players[0].level_kills = 1;
    game.gun_game_progress(0, 1, false);
    assert_eq!(game.players[0].level, 1);
    assert_eq!(game.players[0].loadout.held_id(), "revolver");
}

#[test]
fn a_newcomer_takes_over_a_bot_and_a_leaver_is_replaced() {
    let mut game =
        SiperMatch::new(&setup(1, &[Some(0)], json!({ "mode": "tdm", "size": 2 }))).unwrap();
    let start = Instant::now();
    game.start(start);
    let (seat, _) = game.admit("yeni", None, start).unwrap();
    assert_eq!(
        game.players[seat].team, 1,
        "joins the side with fewer people"
    );
    assert!(game.players[seat].bot.is_none());
    game.forfeit(seat, start);
    assert!(game.players[seat].bot.is_some());
}

#[test]
fn the_vote_picks_the_next_map() {
    let mut game = SiperMatch::new(&setup(
        2,
        &[Some(0), Some(1)],
        json!({ "mode": "tdm", "bots": "off" }),
    ))
    .unwrap();
    let start = Instant::now();
    game.start(start);
    let now = start + Duration::from_secs(4);
    game.tick(now);
    game.finish(Some(0), now);
    game.input(0, json!({ "t": "vote", "map": "santral" }), now)
        .unwrap();
    game.input(1, json!({ "t": "vote", "map": "santral" }), now)
        .unwrap();
    run(&mut game, now, 20);
    assert!(game.outcome().is_some());
    let next = game
        .next_options(&json!({ "mode": "tdm", "map": "liman" }))
        .unwrap();
    assert_eq!(next["map"], "santral");
    let report = game.report().unwrap();
    assert_eq!(report["players"].as_array().unwrap().len(), 2);
}
