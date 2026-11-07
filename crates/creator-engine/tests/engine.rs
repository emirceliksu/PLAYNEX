use playnex_creator_engine::{DiagnosticKind, ErrorCode, Game, InputLog, Outcome, TickInput};
use serde_json::{Value, json};

fn platformer() -> Value {
    json!({
        "schemaVersion": 1,
        "dimension": "2d",
        "world": { "size": { "x": 40, "y": 20 }, "gravity": 30, "background": 0, "lives": 3 },
        "entities": [
            { "id": 1, "name": "Zemin", "shape": { "kind": "rect" }, "position": { "x": 0, "y": -1 },
              "size": { "x": 40, "y": 2 }, "color": 3 },
            { "id": 2, "name": "Oyuncu", "shape": { "kind": "rect" }, "position": { "x": -5, "y": 1 },
              "size": { "x": 1, "y": 1 }, "color": 5, "body": "dynamic", "tags": ["player"],
              "behaviors": [{ "kind": "platformerController", "speed": 6, "jump": 12 }] },
            { "id": 3, "name": "Altın", "shape": { "kind": "circle" }, "position": { "x": -2, "y": 0.5 },
              "size": { "x": 0.6, "y": 0.6 }, "color": 8, "sensor": true,
              "behaviors": [{ "kind": "collectible", "points": 10 }] },
            { "id": 4, "name": "Bayrak", "shape": { "kind": "rect" }, "position": { "x": 6, "y": 1 },
              "size": { "x": 0.5, "y": 2 }, "color": 9, "sensor": true, "behaviors": [{ "kind": "goal" }] }
        ]
    })
}

fn load(doc: &Value) -> Game {
    match Game::parse(&doc.to_string()) {
        Ok(game) => game,
        Err(errors) => panic!("document rejected: {errors:?}"),
    }
}

fn hold_right(ticks: u32) -> InputLog {
    let mut log = InputLog::new();
    log.record(
        1,
        TickInput {
            buttons: 1 << 1,
            axis_x: 0,
            axis_y: 0,
        },
    );
    log.record(ticks, TickInput::default());
    log
}

#[test]
fn player_collects_the_coin_and_reaches_the_flag() {
    let game = load(&platformer());
    let result = game.replay(7, &hold_right(10_000));
    assert_eq!(result.outcome, Outcome::Won);
    assert_eq!(result.score, 10.0);
    assert!(result.ticks < 200, "took {} ticks", result.ticks);
}

#[test]
fn player_rests_on_the_ground() {
    let game = load(&platformer());
    let mut world = game.start(1);
    for _ in 0..120 {
        world.step(TickInput::default());
    }
    let player = world.entities().iter().find(|e| e.id == 2).unwrap();
    assert!(
        (player.position.y - 0.5).abs() < 1e-9,
        "player at {}",
        player.position.y
    );
    assert!(player.on_ground);
}

#[test]
fn same_seed_and_input_replay_identically() {
    let mut doc = platformer();
    doc["variables"] = json!([{ "name": "toplam", "initial": 0 }]);
    doc["scripts"] = json!([{ "event": { "kind": "tick" }, "body": [
        { "op": "change", "variable": "toplam", "by": { "op": "random", "min": { "op": "number", "value": 0 },
          "max": { "op": "number", "value": 5 } } },
        { "op": "setScore", "value": { "op": "var", "name": "toplam" } }
    ] }]);
    doc["world"]["timeLimitSeconds"] = json!(3);
    let game = load(&doc);
    let log = hold_right(50);
    let first = game.replay(99, &log);
    assert_eq!(first, game.replay(99, &log));
    assert_eq!(first.outcome, Outcome::TimeUp);
    assert_eq!(first.ticks, 180);
    assert_ne!(first.score, game.replay(100, &log).score);
}

#[test]
fn endless_loop_is_stopped_and_reported() {
    let mut doc = platformer();
    doc["variables"] = json!([{ "name": "n", "initial": 0 }]);
    doc["scripts"] = json!([{ "event": { "kind": "start" }, "body": [
        { "id": "loop-1", "op": "while", "condition": { "op": "bool", "value": true }, "body": [
            { "op": "change", "variable": "n", "by": { "op": "number", "value": 1 } }
        ] }
    ] }]);
    let game = load(&doc);
    let mut world = game.start(1);
    world.step(TickInput::default());
    world.step(TickInput::default());
    let diagnostics = world.frame_info().diagnostics.clone();
    let reported = diagnostics.iter().next().unwrap();
    assert_eq!(reported.kind, DiagnosticKind::BudgetExceeded);
    assert_eq!(reported.block.as_deref(), Some("loop-1"));
}

#[test]
fn unbounded_recursion_is_stopped() {
    let mut doc = platformer();
    doc["functions"] = json!([{ "name": "derin", "params": ["x"], "body": [
        { "op": "return", "value": { "op": "call", "function": "derin", "args": [{ "op": "var", "name": "x" }] } }
    ] }]);
    doc["scripts"] = json!([{ "event": { "kind": "start" }, "body": [
        { "op": "call", "function": "derin", "args": [{ "op": "number", "value": 1 }] }
    ] }]);
    let mut world = load(&doc).start(1);
    world.step(TickInput::default());
    assert!(
        world
            .frame_info()
            .diagnostics
            .iter()
            .any(|d| d.kind == DiagnosticKind::RecursionTooDeep)
    );
}

#[test]
fn functions_lists_and_loops_compute() {
    let mut doc = platformer();
    doc["lists"] = json!([{ "name": "sayılar", "initial": [1, 2, 3, 4] }]);
    doc["variables"] = json!([{ "name": "toplam", "initial": 0 }]);
    doc["functions"] = json!([{ "name": "kare", "params": ["n"], "body": [
        { "op": "return", "value": { "op": "binary", "operator": "mul",
          "left": { "op": "var", "name": "n" }, "right": { "op": "var", "name": "n" } } }
    ] }]);
    doc["scripts"] = json!([{ "event": { "kind": "start" }, "body": [
        { "op": "forEach", "variable": "s", "list": "sayılar", "body": [
            { "op": "change", "variable": "toplam", "by": { "op": "call", "function": "kare",
              "args": [{ "op": "var", "name": "s" }] } }
        ] },
        { "op": "repeat", "count": { "op": "number", "value": 3 }, "body": [
            { "op": "listAdd", "list": "sayılar", "value": { "op": "var", "name": "toplam" } }
        ] },
        { "op": "setScore", "value": { "op": "binary", "operator": "add",
          "left": { "op": "var", "name": "toplam" }, "right": { "op": "listLength", "list": "sayılar" } } }
    ] }]);
    let mut world = load(&doc).start(1);
    world.step(TickInput::default());
    assert_eq!(world.score(), 30.0 + 7.0);
}

#[test]
fn wait_and_messages_run_across_ticks() {
    let mut doc = platformer();
    doc["scripts"] = json!([
        { "event": { "kind": "start" }, "body": [
            { "op": "wait", "seconds": { "op": "number", "value": 0.5 } },
            { "op": "broadcast", "message": "zil" }
        ] },
        { "event": { "kind": "message", "name": "zil" }, "body": [
            { "op": "addScore", "amount": { "op": "number", "value": 1 } }
        ] }
    ]);
    let mut world = load(&doc).start(1);
    for _ in 0..30 {
        world.step(TickInput::default());
    }
    assert_eq!(world.score(), 0.0);
    world.step(TickInput::default());
    world.step(TickInput::default());
    assert_eq!(world.score(), 1.0);
}

#[test]
fn clones_spawn_from_prefabs_and_run_their_scripts() {
    let mut doc = platformer();
    doc["prefabs"] = json!([{ "id": 100, "name": "Mermi", "shape": { "kind": "circle" },
        "position": { "x": 0, "y": 0 }, "size": { "x": 0.2, "y": 0.2 }, "color": 1, "body": "kinematic",
        "tags": ["mermi"],
        "scripts": [{ "event": { "kind": "start" }, "body": [
            { "op": "setVelocity", "target": { "kind": "self" },
              "x": { "op": "number", "value": 10 }, "y": { "op": "number", "value": 0 } }
        ] }] }]);
    doc["scripts"] = json!([{ "event": { "kind": "timer", "seconds": 0.1 }, "body": [
        { "op": "spawn", "prefab": "Mermi", "x": { "op": "number", "value": 0 }, "y": { "op": "number", "value": 5 } },
        { "op": "setScore", "value": { "op": "count", "tag": "mermi" } }
    ] }]);
    let mut world = load(&doc).start(1);
    for _ in 0..61 {
        world.step(TickInput::default());
    }
    assert_eq!(world.score(), 10.0);
    let bullet = world.entities().iter().find(|e| e.archetype == 4).unwrap();
    assert!(bullet.position.x > 0.0);
}

#[test]
fn hazards_take_lives_until_the_game_is_lost() {
    let mut doc = platformer();
    doc["world"]["lives"] = json!(1);
    doc["entities"][2]["behaviors"] = json!([{ "kind": "hazard", "damage": 1 }]);
    let result = load(&doc).replay(1, &hold_right(10_000));
    assert_eq!(result.outcome, Outcome::Lost);
}

#[test]
fn rejects_unknown_references_with_block_ids() {
    let mut doc = platformer();
    doc["scripts"] = json!([{ "event": { "kind": "start" }, "body": [
        { "id": "b7", "op": "set", "variable": "yok", "value": { "op": "number", "value": 1 } },
        { "id": "b8", "op": "playSound", "sound": "patlama" }
    ] }]);
    let errors = Game::parse(&doc.to_string()).err().unwrap();
    assert_eq!(errors.len(), 2);
    assert_eq!(errors[0].code, ErrorCode::UnknownVariable);
    assert_eq!(errors[0].block.as_deref(), Some("b7"));
    assert_eq!(errors[1].code, ErrorCode::UnknownSound);
}

#[test]
fn rejects_out_of_range_and_wrong_dimension_shapes() {
    let mut doc = platformer();
    doc["entities"][0]["color"] = json!(99);
    doc["entities"][1]["shape"] = json!({ "kind": "sphere" });
    doc["entities"][3]["body"] = json!("static");
    doc["entities"][3]["behaviors"] =
        json!([{ "kind": "patrol", "distance": 3, "speed": 2, "axis": "x" }]);
    let codes: Vec<ErrorCode> = Game::parse(&doc.to_string())
        .err()
        .unwrap()
        .iter()
        .map(|e| e.code)
        .collect();
    assert!(codes.contains(&ErrorCode::InvalidColor));
    assert!(codes.contains(&ErrorCode::ShapeNotInDimension));
    assert!(codes.contains(&ErrorCode::BehaviorNeedsMovingBody));
}

#[test]
fn rejects_unknown_fields_and_oversized_documents() {
    let mut doc = platformer();
    doc["script"] = json!("<script>alert(1)</script>");
    let errors = Game::parse(&doc.to_string()).err().unwrap();
    assert_eq!(errors[0].code, ErrorCode::Malformed);

    let huge = format!("{{\"padding\":\"{}\"}}", "a".repeat(600 * 1024));
    assert_eq!(
        Game::parse(&huge).err().unwrap()[0].code,
        ErrorCode::TooLarge
    );
}

#[test]
fn ball_rolls_up_a_ramp_in_3d() {
    let doc = json!({
        "schemaVersion": 1,
        "dimension": "3d",
        "world": { "size": { "x": 40, "y": 20, "z": 40 }, "gravity": 20, "background": 0 },
        "entities": [
            { "id": 1, "name": "Zemin", "shape": { "kind": "box" }, "position": { "x": 0, "y": -0.5, "z": 0 },
              "size": { "x": 40, "y": 1, "z": 40 }, "color": 3 },
            { "id": 2, "name": "Rampa", "shape": { "kind": "ramp" }, "position": { "x": 4, "y": 1, "z": 0 },
              "size": { "x": 4, "y": 2, "z": 4 }, "color": 4 },
            { "id": 3, "name": "Top", "shape": { "kind": "sphere" }, "position": { "x": 0, "y": 0.5, "z": 0 },
              "size": { "x": 1, "y": 1, "z": 1 }, "color": 5, "body": "dynamic", "tags": ["player"],
              "behaviors": [{ "kind": "topDownController", "speed": 4 }] }
        ]
    });
    let game = load(&doc);
    let mut world = game.start(1);
    for _ in 0..80 {
        world.step(TickInput {
            buttons: 1 << 1,
            axis_x: 0,
            axis_y: 0,
        });
    }
    let ball = world.entities().iter().find(|e| e.id == 3).unwrap();
    assert!(
        ball.position.x > 3.0 && ball.position.y > 1.0,
        "ball at {:?}",
        ball.position
    );
}
