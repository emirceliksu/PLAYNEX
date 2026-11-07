//! The game engine behind the in-site game creator. Player games are data:
//! a validated document compiled to a closed instruction set and run by a
//! deterministic, budgeted simulation. The same code runs in the browser
//! (through wasm) and in the API, where score replays are verified.

mod behaviors;
mod compile;
pub mod document;
mod error;
pub mod limits;
mod physics;
mod program;
pub mod record;
mod rng;
mod validate;
mod value;
mod vm;
mod world;

pub use document::GameDocument;
pub use error::{DocumentError, ErrorCode};
pub use record::{InputLog, LogCursor};
pub use world::{
    Diagnostic, DiagnosticKind, EntityState, FrameEvent, FrameInfo, Outcome, TickInput, World,
};

use limits::{MAX_DOCUMENT_BYTES, MAX_TICKS};

/// A document that passed validation and compiled, ready to start worlds from.
pub struct Game {
    pub document: GameDocument,
    program: program::Program,
}

impl Game {
    pub fn parse(json: &str) -> Result<Game, Vec<DocumentError>> {
        if json.len() > MAX_DOCUMENT_BYTES {
            return Err(vec![
                DocumentError::new(ErrorCode::TooLarge, "")
                    .with_detail(MAX_DOCUMENT_BYTES.to_string()),
            ]);
        }
        let document: GameDocument = serde_json::from_str(json).map_err(|e| {
            vec![DocumentError::new(ErrorCode::Malformed, "").with_detail(e.to_string())]
        })?;
        Game::from_document(document)
    }

    pub fn from_document(document: GameDocument) -> Result<Game, Vec<DocumentError>> {
        let mut errors = Vec::new();
        validate::check_structure(&document, &mut errors);
        if !errors.is_empty() {
            return Err(errors);
        }
        let program = compile::compile(&document)?;
        Ok(Game { document, program })
    }

    pub fn start(&self, seed: u64) -> World {
        World::new(
            self.program.clone(),
            self.document.dimension,
            self.document.world.clone(),
            seed,
        )
    }

    /// Re-runs a recorded session and reports where it ended. The caller
    /// compares this with what the client claimed.
    pub fn replay(&self, seed: u64, log: &InputLog) -> ReplayResult {
        let mut world = self.start(seed);
        let mut cursor = log.cursor();
        while world.outcome() == Outcome::Running && world.tick() < MAX_TICKS {
            let input = cursor.at(world.tick() + 1);
            world.step(input);
        }
        ReplayResult {
            score: world.score(),
            outcome: world.outcome(),
            ticks: world.tick(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReplayResult {
    pub score: f64,
    pub outcome: Outcome,
    pub ticks: u32,
}
