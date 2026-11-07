use playnex_creator_engine::{Game, Outcome, TickInput};

const TEMPLATES: [(&str, &str); 8] = [
    (
        "platform-kosusu",
        include_str!("../../../packages/creator-templates/templates/platform-kosusu.json"),
    ),
    (
        "yorunge-savunmasi",
        include_str!("../../../packages/creator-templates/templates/yorunge-savunmasi.json"),
    ),
    (
        "labirent-kacisi",
        include_str!("../../../packages/creator-templates/templates/labirent-kacisi.json"),
    ),
    (
        "top-toplama-3d",
        include_str!("../../../packages/creator-templates/templates/top-toplama-3d.json"),
    ),
    (
        "engelli-kosu-3d",
        include_str!("../../../packages/creator-templates/templates/engelli-kosu-3d.json"),
    ),
    (
        "kule-yig-3d",
        include_str!("../../../packages/creator-templates/templates/kule-yig-3d.json"),
    ),
    (
        "bos-2d",
        include_str!("../../../packages/creator-templates/templates/bos-2d.json"),
    ),
    (
        "bos-3d",
        include_str!("../../../packages/creator-templates/templates/bos-3d.json"),
    ),
];

fn load(name: &str, json: &str) -> Game {
    Game::parse(json).unwrap_or_else(|errors| panic!("{name} is invalid: {errors:?}"))
}

/// Mashes buttons the way a restless player would, changing every third of a second.
fn bot_input(tick: u32, seed: u32) -> TickInput {
    let phase = (tick / 20).wrapping_mul(2_654_435_761).wrapping_add(seed);
    TickInput {
        buttons: (phase >> 7) as u8 & 0b111_1111,
        axis_x: 0,
        axis_y: 0,
    }
}

#[test]
fn every_template_validates_and_survives_a_minute_of_play() {
    for (name, json) in TEMPLATES {
        let game = load(name, json);
        for seed in [1, 7, 99] {
            let mut world = game.start(u64::from(seed));
            world.step(TickInput::default());
            assert_eq!(
                world.outcome(),
                Outcome::Running,
                "{name} ended on its first tick"
            );
            for tick in 2..=60 * 60 {
                world.step(bot_input(tick, seed));
            }
            let info = world.frame_info();
            assert!(
                info.diagnostics.is_empty(),
                "{name} reported {:?}",
                info.diagnostics
            );
        }
    }
}

#[test]
fn platform_run_is_winnable() {
    let game = load("platform-kosusu", TEMPLATES[0].1);
    let archetype_of = |name: &str| {
        game.document
            .entities
            .iter()
            .position(|e| e.name == name)
            .unwrap() as u16
    };
    let (player, patrols) = (
        archetype_of("Oyuncu"),
        [archetype_of("Devriye 1"), archetype_of("Devriye 2")],
    );
    let mut world = game.start(3);
    // Run right and jump just before each gap or patrol, like a player who has learned the level.
    while world.outcome() == Outcome::Running {
        let me = world
            .entities()
            .iter()
            .find(|e| e.archetype == player)
            .unwrap();
        let near_gap = [(-11.8, -10.4), (10.8, 12.2)]
            .iter()
            .any(|(a, b)| me.position.x > *a && me.position.x < *b);
        let near_patrol = world.entities().iter().any(|e| {
            patrols.contains(&e.archetype)
                && e.position.x - me.position.x > 0.0
                && e.position.x - me.position.x < 2.6
        });
        let jump = if me.on_ground && (near_gap || near_patrol) {
            1 << 4
        } else {
            0
        };
        world.step(TickInput {
            buttons: (1 << 1) | jump,
            axis_x: 0,
            axis_y: 0,
        });
    }
    assert_eq!(world.outcome(), Outcome::Won, "score {}", world.score());
    assert!(world.score() > 0.0);
}

#[test]
fn tower_falls_on_a_late_drop_and_grows_on_a_good_one() {
    let game = load("kule-yig-3d", TEMPLATES[5].1);
    let press = TickInput {
        buttons: 1 << 4,
        axis_x: 0,
        axis_y: 0,
    };

    let mut late = game.start(1);
    late.step(press);
    late.step(TickInput::default());
    assert_eq!(late.outcome(), Outcome::Lost);

    let mut good = game.start(1);
    // The slider starts at x = -5 and moves right at 4 units/s: it is over the base after 75 ticks.
    for _ in 0..75 {
        good.step(TickInput::default());
    }
    good.step(press);
    good.step(TickInput::default());
    assert_eq!(good.outcome(), Outcome::Running);
    assert_eq!(good.score(), 1.0);
}
