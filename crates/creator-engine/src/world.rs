use std::collections::BTreeSet;
use std::rc::Rc;

use serde::Serialize;

use crate::document::{Action, BodyKind, Dimension, HudKind, Vec3, WorldSettings};
use crate::limits::{MAX_LIVE_ENTITIES, MAX_TEXT_CHARS, MAX_TICKS, TICKS_PER_SECOND};
use crate::program::{Addr, Program, Trigger};
use crate::rng::Rng;
use crate::value::{Value, format_number};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TickInput {
    pub buttons: u8,
    pub axis_x: i8,
    pub axis_y: i8,
}

impl TickInput {
    pub fn held(self, action: Action) -> bool {
        self.buttons & action.bit() != 0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Running,
    Won,
    Lost,
    TimeUp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticKind {
    BudgetExceeded,
    RecursionTooDeep,
    StackOverflow,
    TooManyEntities,
    ListFull,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub kind: DiagnosticKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct Glide {
    pub from: Vec3,
    pub to: Vec3,
    pub start: u32,
    pub ticks: u32,
}

#[derive(Debug, Clone)]
pub struct EntityState {
    pub id: u32,
    pub archetype: u16,
    pub name: Option<u32>,
    pub position: Vec3,
    pub velocity: Vec3,
    pub rotation: f64,
    pub size: Vec3,
    pub color: u8,
    pub visible: bool,
    pub text: Option<Rc<str>>,
    pub locals: Vec<Value>,
    pub on_ground: bool,
    pub moved: bool,
    pub glide: Option<Glide>,
    pub alive: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct CallFrame {
    pub return_pc: Addr,
    pub base: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct Thread {
    pub key: u64,
    pub owner: Option<u32>,
    pub other: Option<u32>,
    pub pc: Addr,
    pub stack: Vec<Value>,
    pub slots: Vec<Value>,
    pub frames: Vec<CallFrame>,
    pub wake: u32,
    pub done: bool,
}

#[derive(Debug, Clone)]
pub(crate) enum Pending {
    Collide { entity: u32, other: u32 },
    Message(u32),
    VariableChanged(u16),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum FrameEvent {
    Sound { index: u16 },
    Shake { strength: f64 },
}

/// Per-frame data the renderer needs beyond entity transforms.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameInfo<'a> {
    pub tick: u32,
    pub score: f64,
    pub lives: Option<u32>,
    pub outcome: Outcome,
    pub camera_target: Option<u32>,
    pub events: &'a [FrameEvent],
    pub hud: Vec<String>,
    pub texts: Vec<(u32, &'a str)>,
    pub diagnostics: &'a BTreeSet<Diagnostic>,
}

pub struct World {
    pub(crate) program: Program,
    pub(crate) dimension: Dimension,
    pub(crate) settings: WorldSettings,
    pub(crate) entities: Vec<EntityState>,
    pub(crate) next_id: u32,
    pub(crate) globals: Vec<Value>,
    pub(crate) lists: Vec<Vec<Value>>,
    pub(crate) threads: Vec<Thread>,
    pub(crate) running: BTreeSet<u64>,
    pub(crate) tick: u32,
    pub(crate) rng: Rng,
    pub(crate) input: TickInput,
    previous_buttons: u8,
    pub(crate) score: f64,
    pub(crate) lives: Option<u32>,
    pub(crate) outcome: Outcome,
    pub(crate) contacts: Vec<(u32, u32)>,
    pub(crate) pending: Vec<Pending>,
    pub(crate) events: Vec<FrameEvent>,
    pub(crate) camera_target: Option<u32>,
    pub(crate) diagnostics: BTreeSet<Diagnostic>,
    watched_globals: BTreeSet<u16>,
}

const STAGE_OWNER: u64 = 0;

impl World {
    pub fn new(program: Program, dimension: Dimension, settings: WorldSettings, seed: u64) -> Self {
        let watched_globals = program
            .stage_scripts
            .iter()
            .chain(program.archetypes.iter().flat_map(|a| a.scripts.iter()))
            .filter_map(|s| match s.trigger {
                Trigger::VariableChanged(slot) => Some(slot),
                _ => None,
            })
            .collect();
        let mut world = Self {
            globals: program.globals.clone(),
            lists: program.lists.clone(),
            program,
            dimension,
            lives: settings.lives,
            settings,
            entities: Vec::new(),
            next_id: 1,
            threads: Vec::new(),
            running: BTreeSet::new(),
            tick: 0,
            rng: Rng::new(seed),
            input: TickInput::default(),
            previous_buttons: 0,
            score: 0.0,
            outcome: Outcome::Running,
            contacts: Vec::new(),
            pending: Vec::new(),
            events: Vec::new(),
            camera_target: None,
            diagnostics: BTreeSet::new(),
            watched_globals,
        };
        for archetype in 0..world.program.prefab_start {
            let position = world.program.archetypes[archetype].source.position;
            world.create_entity(archetype as u16, position);
        }
        world
    }

    pub fn tick(&self) -> u32 {
        self.tick
    }

    pub fn score(&self) -> f64 {
        self.score
    }

    pub fn outcome(&self) -> Outcome {
        self.outcome
    }

    pub fn entities(&self) -> &[EntityState] {
        &self.entities
    }

    /// FNV-1a over the bits of everything that affects play. Two targets that
    /// disagree here have drifted, even when the score still matches.
    pub fn state_hash(&self) -> u64 {
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        let mut feed = |bits: u64| {
            for byte in bits.to_le_bytes() {
                hash ^= u64::from(byte);
                hash = hash.wrapping_mul(0x0100_0000_01b3);
            }
        };
        feed(u64::from(self.tick));
        feed(self.score.to_bits());
        for entity in &self.entities {
            feed(u64::from(entity.id));
            for v in [entity.position, entity.velocity] {
                feed(v.x.to_bits());
                feed(v.y.to_bits());
                feed(v.z.to_bits());
            }
            feed(entity.rotation.to_bits());
        }
        for value in &self.globals {
            feed(value.number().to_bits());
        }
        hash
    }

    pub fn step(&mut self, input: TickInput) {
        if self.outcome != Outcome::Running {
            return;
        }
        self.events.clear();
        self.tick += 1;
        self.input = input;
        let pressed = input.buttons & !self.previous_buttons;
        let released = !input.buttons & self.previous_buttons;
        self.previous_buttons = input.buttons;

        if self.tick == 1 {
            let ids: Vec<u32> = self.entities.iter().map(|e| e.id).collect();
            self.fire_stage(|t| matches!(t, Trigger::Start), None);
            for id in ids {
                self.fire_entity(id, |t| matches!(t, Trigger::Start), None);
            }
        }

        for event in std::mem::take(&mut self.pending) {
            match event {
                Pending::Collide { entity, other } => {
                    let other_tags = self.tags_of(other);
                    self.fire_entity(
                        entity,
                        |t| matches!(t, Trigger::Collide(tag) if tag.is_none_or(|tag| other_tags.contains(&tag))),
                        Some(other),
                    );
                }
                Pending::Message(symbol) => {
                    let matches = |t: &Trigger| *t == Trigger::Message(symbol);
                    self.restart_matching(matches);
                    self.fire_everywhere(matches);
                }
                Pending::VariableChanged(slot) => {
                    self.fire_everywhere(|t| *t == Trigger::VariableChanged(slot));
                }
            }
        }

        for action in Action::ALL {
            if pressed & action.bit() != 0 {
                self.fire_everywhere(|t| *t == Trigger::Pressed(action));
            }
            if released & action.bit() != 0 {
                self.fire_everywhere(|t| *t == Trigger::Released(action));
            }
        }
        let tick = self.tick;
        self.fire_everywhere(|t| match t {
            Trigger::Tick => true,
            Trigger::Timer(every) => tick.is_multiple_of(*every),
            _ => false,
        });

        self.run_threads();
        if self.outcome != Outcome::Running {
            return;
        }
        self.advance_glides();
        self.simulate();
        self.detect_contacts();
        self.entities.retain(|e| e.alive);
        for entity in &mut self.entities {
            entity.moved = false;
        }
        if self
            .camera_target
            .is_some_and(|id| self.index_of(id).is_none())
        {
            self.camera_target = None;
        }

        let limit = self
            .settings
            .time_limit_seconds
            .map_or(MAX_TICKS, |s| (s * TICKS_PER_SECOND).min(MAX_TICKS));
        if self.tick >= limit {
            self.outcome = Outcome::TimeUp;
        }
    }

    pub fn frame_info(&self) -> FrameInfo<'_> {
        let hud = self
            .program
            .hud
            .iter()
            .map(|kind| match kind {
                HudKind::Score => format_number(libm::round(self.score)),
                HudKind::Timer => {
                    let elapsed = self.tick / TICKS_PER_SECOND;
                    let shown = self
                        .settings
                        .time_limit_seconds
                        .map_or(elapsed, |limit| limit.saturating_sub(elapsed));
                    format!("{}:{:02}", shown / 60, shown % 60)
                }
                HudKind::Lives => self.lives.map_or_else(String::new, |l| l.to_string()),
                HudKind::Variable { name } => self
                    .program
                    .global_names
                    .iter()
                    .position(|n| n == name)
                    .map_or_else(String::new, |slot| self.globals[slot].text().to_string()),
                HudKind::Text { text } => text.clone(),
            })
            .collect();
        FrameInfo {
            tick: self.tick,
            score: self.score,
            lives: self.lives,
            outcome: self.outcome,
            camera_target: self.camera_target,
            events: &self.events,
            hud,
            texts: self
                .entities
                .iter()
                .filter_map(|e| e.text.as_deref().map(|t| (e.id, t)))
                .collect(),
            diagnostics: &self.diagnostics,
        }
    }

    pub(crate) fn create_entity(&mut self, archetype: u16, position: Vec3) -> Option<u32> {
        if self.entities.len() >= MAX_LIVE_ENTITIES {
            self.diagnose(crate::world::DiagnosticKind::TooManyEntities, None);
            return None;
        }
        let source = &self.program.archetypes[archetype as usize];
        let name = self
            .program
            .symbols
            .iter()
            .position(|s| *s == source.source.name)
            .map(|i| i as u32);
        let id = self.next_id;
        self.next_id += 1;
        let entity = EntityState {
            id,
            archetype,
            name,
            position: self.flatten(position),
            velocity: Vec3::ZERO,
            rotation: source.source.rotation,
            size: source.source.size,
            color: source.source.color,
            visible: source.source.visible,
            text: source.source.text.as_deref().map(|t| Rc::from(truncate(t))),
            locals: source.locals.clone(),
            on_ground: false,
            moved: true,
            glide: None,
            alive: true,
        };
        self.entities.push(entity);
        Some(id)
    }

    pub(crate) fn flatten(&self, mut v: Vec3) -> Vec3 {
        if self.dimension == Dimension::Flat {
            v.z = 0.0;
        }
        v
    }

    pub(crate) fn index_of(&self, id: u32) -> Option<usize> {
        self.entities
            .binary_search_by_key(&id, |e| e.id)
            .ok()
            .filter(|i| self.entities[*i].alive)
    }

    pub(crate) fn body_of(&self, index: usize) -> BodyKind {
        self.program.archetypes[self.entities[index].archetype as usize]
            .source
            .body
    }

    pub(crate) fn tags_of(&self, id: u32) -> Vec<u32> {
        self.index_of(id)
            .map(|i| {
                self.program.archetypes[self.entities[i].archetype as usize]
                    .tags
                    .clone()
            })
            .unwrap_or_default()
    }

    pub(crate) fn has_tag(&self, index: usize, tag: u32) -> bool {
        self.program.archetypes[self.entities[index].archetype as usize]
            .tags
            .contains(&tag)
    }

    pub(crate) fn diagnose(&mut self, kind: DiagnosticKind, block: Option<&str>) {
        if self.diagnostics.len() < 32 {
            self.diagnostics.insert(Diagnostic {
                kind,
                block: block.map(str::to_owned),
            });
        }
    }

    pub(crate) fn mark_changed(&mut self, slot: u16) {
        if self.watched_globals.contains(&slot) {
            self.pending.push(Pending::VariableChanged(slot));
        }
    }

    pub(crate) fn fire_on_spawn(&mut self, id: u32) {
        self.fire_entity(id, |t| matches!(t, Trigger::Start | Trigger::Cloned), None);
    }

    fn fire_everywhere(&mut self, matches: impl Fn(&Trigger) -> bool + Copy) {
        self.fire_stage(matches, None);
        let ids: Vec<u32> = self
            .entities
            .iter()
            .filter(|e| e.alive)
            .map(|e| e.id)
            .collect();
        for id in ids {
            self.fire_entity(id, matches, None);
        }
    }

    fn fire_stage(&mut self, matches: impl Fn(&Trigger) -> bool, other: Option<u32>) {
        let starts: Vec<(usize, Addr, u16)> = self
            .program
            .stage_scripts
            .iter()
            .enumerate()
            .filter(|(_, s)| matches(&s.trigger))
            .map(|(i, s)| (i, s.entry, s.frame_size))
            .collect();
        for (index, entry, frame_size) in starts {
            self.spawn_thread(
                STAGE_OWNER << 16 | index as u64,
                None,
                other,
                entry,
                frame_size,
            );
        }
    }

    fn fire_entity(&mut self, id: u32, matches: impl Fn(&Trigger) -> bool, other: Option<u32>) {
        let Some(index) = self.index_of(id) else {
            return;
        };
        let archetype = &self.program.archetypes[self.entities[index].archetype as usize];
        let starts: Vec<(usize, Addr, u16)> = archetype
            .scripts
            .iter()
            .enumerate()
            .filter(|(_, s)| matches(&s.trigger))
            .map(|(i, s)| (i, s.entry, s.frame_size))
            .collect();
        for (script, entry, frame_size) in starts {
            self.spawn_thread(
                u64::from(id) << 16 | script as u64,
                Some(id),
                other,
                entry,
                frame_size,
            );
        }
    }

    /// A script that is still running (waiting, or in a forever loop) is not
    /// started a second time; this is what keeps "every tick" scripts with a
    /// wait inside from piling up.
    fn spawn_thread(
        &mut self,
        key: u64,
        owner: Option<u32>,
        other: Option<u32>,
        entry: Addr,
        frame_size: u16,
    ) {
        if self.running.contains(&key) || self.running.len() >= crate::limits::MAX_THREADS {
            return;
        }
        self.running.insert(key);
        self.threads.push(Thread {
            key,
            owner,
            other,
            pc: entry,
            stack: Vec::new(),
            slots: vec![Value::zero(); frame_size as usize],
            frames: Vec::new(),
            wake: 0,
            done: false,
        });
    }

    fn restart_matching(&mut self, matches: impl Fn(&Trigger) -> bool) {
        let program = &self.program;
        let entities = &self.entities;
        let mut stopped = Vec::new();
        for thread in self.threads.iter_mut().filter(|t| !t.done) {
            let script = (thread.key & 0xFFFF) as usize;
            let trigger = match thread.owner {
                None => program.stage_scripts.get(script).map(|s| &s.trigger),
                Some(id) => entities
                    .binary_search_by_key(&id, |e| e.id)
                    .ok()
                    .and_then(|i| {
                        program.archetypes[entities[i].archetype as usize]
                            .scripts
                            .get(script)
                    })
                    .map(|s| &s.trigger),
            };
            if trigger.is_some_and(&matches) {
                thread.done = true;
                stopped.push(thread.key);
            }
        }
        for key in stopped {
            self.running.remove(&key);
        }
    }

    fn run_threads(&mut self) {
        let mut tick_budget = crate::limits::TICK_BUDGET;
        let mut current = std::mem::take(&mut self.threads);
        let mut index = 0;
        loop {
            while index < current.len() {
                if self.outcome != Outcome::Running {
                    break;
                }
                self.execute(&mut current[index], &mut tick_budget);
                index += 1;
            }
            if self.threads.is_empty() || self.outcome != Outcome::Running {
                break;
            }
            current.append(&mut self.threads);
        }
        current.append(&mut self.threads);
        for thread in current.iter().filter(|t| t.done) {
            self.running.remove(&thread.key);
        }
        current.retain(|t| !t.done);
        self.threads = current;
    }

    fn advance_glides(&mut self) {
        let tick = self.tick;
        for entity in self.entities.iter_mut().filter(|e| e.alive) {
            let Some(glide) = entity.glide else { continue };
            let elapsed = tick.saturating_sub(glide.start).min(glide.ticks);
            let t = f64::from(elapsed) / f64::from(glide.ticks.max(1));
            entity.position = Vec3::new(
                glide.from.x + (glide.to.x - glide.from.x) * t,
                glide.from.y + (glide.to.y - glide.from.y) * t,
                glide.from.z + (glide.to.z - glide.from.z) * t,
            );
            entity.moved = true;
            if elapsed >= glide.ticks {
                entity.glide = None;
            }
        }
    }
}

pub(crate) fn truncate(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT_CHARS)
        .collect()
}
