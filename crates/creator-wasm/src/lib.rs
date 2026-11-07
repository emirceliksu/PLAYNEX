use playnex_creator_engine::{Game, InputLog, Outcome, TickInput, World};
use wasm_bindgen::prelude::*;

/// Floats per entity in `CreatorWorld::entities`; the runtime reads the same layout.
pub const ENTITY_STRIDE: usize = 11;

/// Returns the document's errors as a JSON array; `[]` means the game is valid.
#[wasm_bindgen]
pub fn validate(json: &str) -> String {
    match Game::parse(json) {
        Ok(_) => String::from("[]"),
        Err(errors) => serde_json::to_string(&errors).unwrap_or_else(|_| String::from("[]")),
    }
}

#[wasm_bindgen(js_name = entityStride)]
pub fn entity_stride() -> usize {
    ENTITY_STRIDE
}

#[wasm_bindgen]
pub struct CreatorGame {
    game: Game,
}

#[wasm_bindgen]
impl CreatorGame {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str) -> Result<CreatorGame, JsError> {
        Game::parse(json)
            .map(|game| CreatorGame { game })
            .map_err(|errors| JsError::new(&serde_json::to_string(&errors).unwrap_or_default()))
    }

    pub fn start(&self, seed: u32) -> CreatorWorld {
        CreatorWorld {
            world: self.game.start(u64::from(seed)),
            log: InputLog::new(),
        }
    }
}

#[wasm_bindgen]
pub struct CreatorWorld {
    world: World,
    log: InputLog,
}

#[wasm_bindgen]
impl CreatorWorld {
    pub fn step(&mut self, buttons: u8, axis_x: i8, axis_y: i8) {
        let input = TickInput {
            buttons,
            axis_x,
            axis_y,
        };
        self.log.record(self.world.tick() + 1, input);
        self.world.step(input);
    }

    pub fn tick(&self) -> u32 {
        self.world.tick()
    }

    pub fn score(&self) -> f64 {
        self.world.score()
    }

    pub fn finished(&self) -> bool {
        self.world.outcome() != Outcome::Running
    }

    /// `[id, archetype, color, x, y, z, rotation, width, height, depth, visible]`
    /// per live entity, flattened so one copy crosses the wasm boundary per frame.
    pub fn entities(&self) -> Vec<f32> {
        let entities = self.world.entities();
        let mut out = Vec::with_capacity(entities.len() * ENTITY_STRIDE);
        for e in entities {
            out.extend_from_slice(&[
                e.id as f32,
                f32::from(e.archetype),
                f32::from(e.color),
                e.position.x as f32,
                e.position.y as f32,
                e.position.z as f32,
                e.rotation as f32,
                e.size.x as f32,
                e.size.y as f32,
                e.size.z as f32,
                f32::from(u8::from(e.visible)),
            ]);
        }
        out
    }

    /// Score, HUD values, camera, sounds and texts for the current frame as JSON.
    pub fn frame(&self) -> String {
        serde_json::to_string(&self.world.frame_info()).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = inputLog)]
    pub fn input_log(&self) -> Vec<u8> {
        self.log.encode()
    }
}
