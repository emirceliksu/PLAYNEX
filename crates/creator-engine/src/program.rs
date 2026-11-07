use std::rc::Rc;

use crate::document::{Action, Axis, BinaryOp, Entity, HudKind, Property, SoundDef, UnaryOp};
use crate::value::Value;

pub type Addr = u32;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TargetRef {
    Itself,
    Other,
    Named(u32),
    Nearest(u32),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Act {
    Move,
    SetPosition,
    SetVelocity,
    SetVelocityAxis(Axis),
    Push,
    Turn,
    SetRotation,
    GlideTo,
    SetSize,
    Show,
    Hide,
    SetColor,
    SetText,
    Destroy,
    CameraFollow,
}

impl Act {
    pub fn arity(self) -> usize {
        match self {
            Act::Move | Act::SetPosition | Act::SetVelocity | Act::Push | Act::SetSize => 3,
            Act::GlideTo => 4,
            Act::SetVelocityAxis(_)
            | Act::Turn
            | Act::SetRotation
            | Act::SetColor
            | Act::SetText => 1,
            Act::Show | Act::Hide | Act::Destroy | Act::CameraFollow => 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Query {
    Property(TargetRef, Property),
    Distance(TargetRef),
    DirectionTo(TargetRef, Axis),
    Held(Action),
    InputAxis(Axis),
    Touching(u32),
    Count(u32),
    Score,
    Lives,
    Time,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Instr {
    PushNumber(f64),
    PushText(u32),
    PushBool(bool),
    Pop,
    LoadGlobal(u16),
    StoreGlobal(u16),
    LoadLocal(u16),
    StoreLocal(u16),
    LoadFrame(u16),
    StoreFrame(u16),
    Binary(BinaryOp),
    Unary(UnaryOp),
    Random { integer: bool },
    Jump(Addr),
    JumpIfFalse(Addr),
    Yield,
    Wait,
    Stop,
    Call { function: u16 },
    Return,
    ListAdd(u16),
    ListRemove(u16),
    ListSet(u16),
    ListClear(u16),
    ListItem(u16),
    ListLength(u16),
    ListContains(u16),
    Act(Act, TargetRef),
    Query(Query),
    Spawn(u16),
    Broadcast(u32),
    PlaySound(u16),
    AddScore,
    SetScore,
    LoseLife,
    Win,
    Lose,
    CameraShake,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Trigger {
    Start,
    Tick,
    Pressed(Action),
    Released(Action),
    Collide(Option<u32>),
    Timer(u32),
    Message(u32),
    Cloned,
    VariableChanged(u16),
}

#[derive(Debug, Clone)]
pub struct CompiledScript {
    pub trigger: Trigger,
    pub entry: Addr,
    pub frame_size: u16,
}

#[derive(Debug, Clone)]
pub struct Function {
    pub entry: Addr,
    pub params: u16,
    pub frame_size: u16,
}

/// Everything an entity instance needs at runtime, shared by the placed
/// entity and every clone spawned from the same prefab.
#[derive(Debug, Clone)]
pub struct Archetype {
    pub source: Entity,
    pub tags: Vec<u32>,
    pub locals: Vec<Value>,
    pub scripts: Vec<CompiledScript>,
}

#[derive(Debug, Clone)]
pub struct Program {
    pub code: Vec<Instr>,
    /// Block id for each instruction, so runtime diagnostics can point at a block.
    pub origins: Vec<u32>,
    pub block_ids: Vec<String>,
    pub texts: Vec<Rc<str>>,
    pub symbols: Vec<String>,
    pub globals: Vec<Value>,
    pub global_names: Vec<String>,
    pub lists: Vec<Vec<Value>>,
    pub list_names: Vec<String>,
    pub functions: Vec<Function>,
    pub stage_scripts: Vec<CompiledScript>,
    pub archetypes: Vec<Archetype>,
    /// Index into `archetypes` where prefabs begin; placed entities come first.
    pub prefab_start: usize,
    pub sounds: Vec<SoundDef>,
    pub hud: Vec<HudKind>,
    pub player_tag: Option<u32>,
}

impl Program {
    pub fn symbol(&self, index: u32) -> &str {
        &self.symbols[index as usize]
    }

    pub fn block_at(&self, pc: Addr) -> Option<&str> {
        let origin = *self.origins.get(pc as usize)?;
        (origin != u32::MAX).then(|| self.block_ids[origin as usize].as_str())
    }
}
