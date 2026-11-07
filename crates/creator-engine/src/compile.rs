use std::collections::BTreeMap;
use std::rc::Rc;

use crate::behaviors::{self, PLAYER_TAG};
use crate::document::{Entity, Event, Expr, GameDocument, Script, Stmt, StmtOp, Target};
use crate::error::{DocumentError, ErrorCode};
use crate::limits::{MAX_BLOCKS, MAX_NESTING, TICKS_PER_SECOND};
use crate::program::{
    Act, Addr, Archetype, CompiledScript, Function, Instr, Program, Query, TargetRef, Trigger,
};
use crate::validate::text;
use crate::value::Value;

#[derive(Clone, Copy)]
enum Scope {
    Stage,
    Entity,
    Function,
}

#[derive(Clone, Copy)]
enum Slot {
    Frame(u16),
    Local(u16),
    Global(u16),
}

struct Compiler<'a> {
    doc: &'a GameDocument,
    code: Vec<Instr>,
    origins: Vec<u32>,
    block_ids: Vec<String>,
    texts: Vec<Rc<str>>,
    text_index: BTreeMap<String, u32>,
    symbols: Vec<String>,
    symbol_index: BTreeMap<String, u32>,
    globals: BTreeMap<&'a str, u16>,
    lists: BTreeMap<&'a str, u16>,
    functions: BTreeMap<&'a str, (u16, usize)>,
    prefabs: BTreeMap<&'a str, u16>,
    sounds: BTreeMap<&'a str, u16>,
    errors: Vec<DocumentError>,
    blocks: usize,
    scope: Scope,
    locals: BTreeMap<String, u16>,
    frame: Vec<String>,
    frame_max: usize,
    block: u32,
    block_id: Option<String>,
    path: String,
    depth: usize,
}

pub fn compile(doc: &GameDocument) -> Result<Program, Vec<DocumentError>> {
    let mut compiler = Compiler::new(doc);
    let program = compiler.run();
    if compiler.errors.is_empty() {
        Ok(program)
    } else {
        Err(compiler.errors)
    }
}

impl<'a> Compiler<'a> {
    fn new(doc: &'a GameDocument) -> Self {
        let index = |names: Vec<&'a str>| -> BTreeMap<&'a str, u16> {
            names
                .into_iter()
                .enumerate()
                .map(|(i, n)| (n, i as u16))
                .collect()
        };
        let prefab_start = doc.entities.len();
        Self {
            doc,
            code: Vec::new(),
            origins: Vec::new(),
            block_ids: Vec::new(),
            texts: Vec::new(),
            text_index: BTreeMap::new(),
            symbols: Vec::new(),
            symbol_index: BTreeMap::new(),
            globals: index(doc.variables.iter().map(|v| v.name.as_str()).collect()),
            lists: index(doc.lists.iter().map(|l| l.name.as_str()).collect()),
            functions: doc
                .functions
                .iter()
                .enumerate()
                .map(|(i, f)| (f.name.as_str(), (i as u16, f.params.len())))
                .collect(),
            prefabs: doc
                .prefabs
                .iter()
                .enumerate()
                .map(|(i, p)| (p.name.as_str(), (prefab_start + i) as u16))
                .collect(),
            sounds: index(doc.sounds.iter().map(|s| s.name.as_str()).collect()),
            errors: Vec::new(),
            blocks: 0,
            scope: Scope::Stage,
            locals: BTreeMap::new(),
            frame: Vec::new(),
            frame_max: 0,
            block: u32::MAX,
            block_id: None,
            path: String::new(),
            depth: 0,
        }
    }

    fn run(&mut self) -> Program {
        let doc = self.doc;
        let mut functions = Vec::with_capacity(doc.functions.len());
        for (index, function) in doc.functions.iter().enumerate() {
            self.path = format!("functions[{index}]");
            self.scope = Scope::Function;
            self.locals.clear();
            self.frame = function.params.clone();
            self.frame_max = self.frame.len();
            let entry = self.here();
            self.block_id = None;
            self.statements(&function.body);
            self.emit(Instr::PushNumber(0.0));
            self.emit(Instr::Return);
            functions.push(Function {
                entry,
                params: function.params.len() as u16,
                frame_size: self.frame_max as u16,
            });
        }

        self.scope = Scope::Stage;
        self.locals.clear();
        let mut stage_scripts = Vec::new();
        for (index, script) in doc.scripts.iter().enumerate() {
            self.path = format!("scripts[{index}]");
            if matches!(script.event, Event::Collide { .. } | Event::Cloned) {
                self.errors.push(DocumentError::new(
                    ErrorCode::EventNotForStage,
                    format!("{}.event", self.path),
                ));
                continue;
            }
            stage_scripts.push(self.script(script));
        }

        let mut archetypes = Vec::new();
        for (index, entity) in doc.entities.iter().enumerate() {
            archetypes.push(self.archetype(entity, format!("entities[{index}]")));
        }
        for (index, prefab) in doc.prefabs.iter().enumerate() {
            archetypes.push(self.archetype(prefab, format!("prefabs[{index}]")));
        }

        for (index, item) in doc.hud.iter().enumerate() {
            if let crate::document::HudKind::Variable { name } = &item.kind
                && !self.globals.contains_key(name.as_str())
            {
                self.errors.push(DocumentError::new(
                    ErrorCode::UnknownVariable,
                    format!("hud[{index}].kind.name"),
                ));
            }
        }

        if self.blocks > MAX_BLOCKS {
            self.errors.push(
                DocumentError::new(ErrorCode::TooMany, "blocks")
                    .with_detail(MAX_BLOCKS.to_string()),
            );
        }

        let player_tag = self.symbol_index.get(PLAYER_TAG).copied();
        Program {
            code: std::mem::take(&mut self.code),
            origins: std::mem::take(&mut self.origins),
            block_ids: std::mem::take(&mut self.block_ids),
            texts: std::mem::take(&mut self.texts),
            symbols: std::mem::take(&mut self.symbols),
            globals: doc
                .variables
                .iter()
                .map(|v| Value::from(&v.initial))
                .collect(),
            global_names: doc.variables.iter().map(|v| v.name.clone()).collect(),
            lists: doc
                .lists
                .iter()
                .map(|l| l.initial.iter().map(Value::from).collect())
                .collect(),
            list_names: doc.lists.iter().map(|l| l.name.clone()).collect(),
            functions,
            stage_scripts,
            archetypes,
            prefab_start: doc.entities.len(),
            sounds: doc.sounds.clone(),
            hud: doc.hud.iter().map(|item| item.kind.clone()).collect(),
            player_tag,
        }
    }

    fn archetype(&mut self, entity: &Entity, path: String) -> Archetype {
        let expansion = behaviors::expand(&entity.behaviors, self.doc.dimension);
        let variables: Vec<_> = entity
            .variables
            .iter()
            .chain(expansion.locals.iter())
            .collect();
        self.scope = Scope::Entity;
        self.locals = variables
            .iter()
            .enumerate()
            .map(|(i, v)| (v.name.clone(), i as u16))
            .collect();
        let tags = entity.tags.iter().map(|t| self.symbol(t)).collect();

        let mut scripts = Vec::new();
        for (index, script) in entity.scripts.iter().enumerate() {
            self.path = format!("{path}.scripts[{index}]");
            scripts.push(self.script(script));
        }
        for (index, script) in expansion.scripts.iter().enumerate() {
            self.path = format!("{path}.behaviors[{index}]");
            scripts.push(self.script(script));
        }
        Archetype {
            source: entity.clone(),
            tags,
            locals: variables.iter().map(|v| Value::from(&v.initial)).collect(),
            scripts,
        }
    }

    fn script(&mut self, script: &Script) -> CompiledScript {
        let trigger = match &script.event {
            Event::Start => Trigger::Start,
            Event::Tick => Trigger::Tick,
            Event::Pressed { action } => Trigger::Pressed(*action),
            Event::Released { action } => Trigger::Released(*action),
            Event::Collide { tag } => Trigger::Collide(tag.as_ref().map(|t| self.symbol(t))),
            Event::Timer { seconds } => {
                if !seconds.is_finite() || *seconds < 0.05 || *seconds > 600.0 {
                    self.errors.push(DocumentError::new(
                        ErrorCode::OutOfRange,
                        format!("{}.event", self.path),
                    ));
                }
                let ticks = libm::round(seconds * f64::from(TICKS_PER_SECOND))
                    .clamp(1.0, f64::from(u32::MAX));
                Trigger::Timer(ticks as u32)
            }
            Event::Message { name } => Trigger::Message(self.symbol(name)),
            Event::Cloned => Trigger::Cloned,
            Event::VariableChanged { name } => match self.globals.get(name.as_str()) {
                Some(slot) => Trigger::VariableChanged(*slot),
                None => {
                    self.errors.push(DocumentError::new(
                        ErrorCode::UnknownVariable,
                        format!("{}.event", self.path),
                    ));
                    Trigger::VariableChanged(0)
                }
            },
        };
        self.frame.clear();
        self.frame_max = 0;
        self.block_id = script.id.clone();
        self.block = self.intern_block(script.id.as_ref());
        let entry = self.here();
        self.statements(&script.body);
        self.emit(Instr::Stop);
        CompiledScript {
            trigger,
            entry,
            frame_size: self.frame_max as u16,
        }
    }

    fn statements(&mut self, body: &[Stmt]) {
        self.depth += 1;
        if self.depth > MAX_NESTING {
            self.error(ErrorCode::NestingTooDeep);
        } else {
            for stmt in body {
                self.statement(stmt);
            }
        }
        self.depth -= 1;
    }

    fn statement(&mut self, stmt: &Stmt) {
        self.blocks += 1;
        let saved_block = (self.block, self.block_id.clone());
        if stmt.id.is_some() {
            self.block_id = stmt.id.clone();
            self.block = self.intern_block(stmt.id.as_ref());
        }
        match &stmt.op {
            StmtOp::If {
                condition,
                then,
                otherwise,
            } => {
                self.expr(condition);
                let to_else = self.emit_jump_if_false();
                self.statements(then);
                if otherwise.is_empty() {
                    self.patch(to_else);
                } else {
                    let to_end = self.emit_jump();
                    self.patch(to_else);
                    self.statements(otherwise);
                    self.patch(to_end);
                }
            }
            StmtOp::Repeat { count, body } => {
                let counter = self.hidden_slot();
                self.expr(count);
                self.emit(Instr::StoreFrame(counter));
                let top = self.here();
                self.emit(Instr::LoadFrame(counter));
                self.emit(Instr::PushNumber(0.5));
                self.emit(Instr::Binary(crate::document::BinaryOp::Gt));
                let exit = self.emit_jump_if_false();
                self.statements(body);
                self.emit(Instr::LoadFrame(counter));
                self.emit(Instr::PushNumber(1.0));
                self.emit(Instr::Binary(crate::document::BinaryOp::Sub));
                self.emit(Instr::StoreFrame(counter));
                self.emit(Instr::Jump(top));
                self.patch(exit);
                self.release_slot();
            }
            StmtOp::While { condition, body } => {
                let top = self.here();
                self.expr(condition);
                let exit = self.emit_jump_if_false();
                self.statements(body);
                self.emit(Instr::Jump(top));
                self.patch(exit);
            }
            StmtOp::Forever { body } => {
                let top = self.here();
                self.statements(body);
                self.emit(Instr::Yield);
                self.emit(Instr::Jump(top));
            }
            StmtOp::ForEach {
                variable,
                list,
                body,
            } => {
                let list = self.list(list);
                let index = self.hidden_slot();
                self.frame.push(variable.clone());
                self.frame_max = self.frame_max.max(self.frame.len());
                let item = (self.frame.len() - 1) as u16;
                self.emit(Instr::PushNumber(0.0));
                self.emit(Instr::StoreFrame(index));
                let top = self.here();
                self.emit(Instr::LoadFrame(index));
                self.emit(Instr::ListLength(list));
                self.emit(Instr::Binary(crate::document::BinaryOp::Lt));
                let exit = self.emit_jump_if_false();
                self.emit(Instr::LoadFrame(index));
                self.emit(Instr::PushNumber(1.0));
                self.emit(Instr::Binary(crate::document::BinaryOp::Add));
                self.emit(Instr::StoreFrame(index));
                self.emit(Instr::LoadFrame(index));
                self.emit(Instr::ListItem(list));
                self.emit(Instr::StoreFrame(item));
                self.statements(body);
                self.emit(Instr::Jump(top));
                self.patch(exit);
                self.frame.pop();
                self.release_slot();
            }
            StmtOp::Wait { seconds } => {
                self.expr(seconds);
                self.emit(Instr::Wait);
            }
            StmtOp::Stop => self.emit(Instr::Stop),
            StmtOp::Call { function, args } => {
                self.call(function, args);
                self.emit(Instr::Pop);
            }
            StmtOp::Return { value } => match self.scope {
                Scope::Function => {
                    match value {
                        Some(value) => self.expr(value),
                        None => self.emit(Instr::PushNumber(0.0)),
                    }
                    self.emit(Instr::Return);
                }
                Scope::Stage | Scope::Entity => self.emit(Instr::Stop),
            },
            StmtOp::Set { variable, value } => {
                self.expr(value);
                self.store(variable);
            }
            StmtOp::Change { variable, by } => {
                self.load(variable);
                self.expr(by);
                self.emit(Instr::Binary(crate::document::BinaryOp::Add));
                self.store(variable);
            }
            StmtOp::ListAdd { list, value } => {
                let list = self.list(list);
                self.expr(value);
                self.emit(Instr::ListAdd(list));
            }
            StmtOp::ListRemove { list, index } => {
                let list = self.list(list);
                self.expr(index);
                self.emit(Instr::ListRemove(list));
            }
            StmtOp::ListSet { list, index, value } => {
                let list = self.list(list);
                self.expr(index);
                self.expr(value);
                self.emit(Instr::ListSet(list));
            }
            StmtOp::ListClear { list } => {
                let list = self.list(list);
                self.emit(Instr::ListClear(list));
            }
            StmtOp::Move { target, x, y, z } => self.act(Act::Move, target, &[x, y, z]),
            StmtOp::SetPosition { target, x, y, z } => {
                self.act(Act::SetPosition, target, &[x, y, z])
            }
            StmtOp::SetVelocity { target, x, y, z } => {
                self.act(Act::SetVelocity, target, &[x, y, z])
            }
            StmtOp::SetVelocityAxis {
                target,
                axis,
                value,
            } => {
                self.act(Act::SetVelocityAxis(*axis), target, &[value]);
            }
            StmtOp::Push { target, x, y, z } => self.act(Act::Push, target, &[x, y, z]),
            StmtOp::Turn { target, degrees } => self.act(Act::Turn, target, &[degrees]),
            StmtOp::SetRotation { target, degrees } => {
                self.act(Act::SetRotation, target, &[degrees])
            }
            StmtOp::GlideTo {
                target,
                x,
                y,
                z,
                seconds,
            } => self.act(Act::GlideTo, target, &[x, y, z, seconds]),
            StmtOp::SetSize { target, x, y, z } => self.act(Act::SetSize, target, &[x, y, z]),
            StmtOp::Show { target } => self.act(Act::Show, target, &[]),
            StmtOp::Hide { target } => self.act(Act::Hide, target, &[]),
            StmtOp::SetColor { target, color } => self.act(Act::SetColor, target, &[color]),
            StmtOp::SetText { target, text } => self.act(Act::SetText, target, &[text]),
            StmtOp::Destroy { target } => self.act(Act::Destroy, target, &[]),
            StmtOp::CameraFollow { target } => self.act(Act::CameraFollow, target, &[]),
            StmtOp::Spawn { prefab, x, y, z } => {
                for value in [x, y, z] {
                    self.expr(value);
                }
                match self.prefabs.get(prefab.as_str()) {
                    Some(index) => self.emit(Instr::Spawn(*index)),
                    None => self.error(ErrorCode::UnknownPrefab),
                }
            }
            StmtOp::Broadcast { message } => {
                let symbol = self.symbol(message);
                self.emit(Instr::Broadcast(symbol));
            }
            StmtOp::PlaySound { sound } => match self.sounds.get(sound.as_str()) {
                Some(index) => self.emit(Instr::PlaySound(*index)),
                None => self.error(ErrorCode::UnknownSound),
            },
            StmtOp::AddScore { amount } => {
                self.expr(amount);
                self.emit(Instr::AddScore);
            }
            StmtOp::SetScore { value } => {
                self.expr(value);
                self.emit(Instr::SetScore);
            }
            StmtOp::LoseLife { amount } => {
                self.expr(amount);
                self.emit(Instr::LoseLife);
            }
            StmtOp::Win => self.emit(Instr::Win),
            StmtOp::Lose => self.emit(Instr::Lose),
            StmtOp::CameraShake { strength } => {
                self.expr(strength);
                self.emit(Instr::CameraShake);
            }
        }
        (self.block, self.block_id) = saved_block;
    }

    fn expr(&mut self, expr: &Expr) {
        self.blocks += 1;
        self.depth += 1;
        if self.depth > MAX_NESTING {
            self.error(ErrorCode::NestingTooDeep);
            self.depth -= 1;
            return;
        }
        match expr {
            Expr::Number { value } => {
                if !value.is_finite() {
                    self.error(ErrorCode::InvalidNumber);
                }
                self.emit(Instr::PushNumber(*value));
            }
            Expr::Text { value } => {
                let path = self.path.clone();
                let before = self.errors.len();
                text(&mut self.errors, value, &path);
                if let Some(error) = self.errors.get_mut(before) {
                    error.block = self.block_id.clone();
                }
                let index = self.text(value);
                self.emit(Instr::PushText(index));
            }
            Expr::Bool { value } => self.emit(Instr::PushBool(*value)),
            Expr::Var { name } => self.load(name),
            Expr::Binary {
                operator,
                left,
                right,
            } => {
                self.expr(left);
                self.expr(right);
                self.emit(Instr::Binary(*operator));
            }
            Expr::Unary { operator, value } => {
                self.expr(value);
                self.emit(Instr::Unary(*operator));
            }
            Expr::Random { min, max, integer } => {
                self.expr(min);
                self.expr(max);
                self.emit(Instr::Random { integer: *integer });
            }
            Expr::ListItem { list, index } => {
                let list = self.list(list);
                self.expr(index);
                self.emit(Instr::ListItem(list));
            }
            Expr::ListLength { list } => {
                let list = self.list(list);
                self.emit(Instr::ListLength(list));
            }
            Expr::ListContains { list, value } => {
                let list = self.list(list);
                self.expr(value);
                self.emit(Instr::ListContains(list));
            }
            Expr::Property { target, property } => {
                let target = self.target(target);
                self.emit(Instr::Query(Query::Property(target, *property)));
            }
            Expr::Held { action } => self.emit(Instr::Query(Query::Held(*action))),
            Expr::InputAxis { axis } => self.emit(Instr::Query(Query::InputAxis(*axis))),
            Expr::Score => self.emit(Instr::Query(Query::Score)),
            Expr::Lives => self.emit(Instr::Query(Query::Lives)),
            Expr::Time => self.emit(Instr::Query(Query::Time)),
            Expr::Distance { target } => {
                let target = self.target(target);
                self.emit(Instr::Query(Query::Distance(target)));
            }
            Expr::DirectionTo { target, axis } => {
                let target = self.target(target);
                self.emit(Instr::Query(Query::DirectionTo(target, *axis)));
            }
            Expr::Touching { tag } => {
                let tag = self.symbol(tag);
                self.emit(Instr::Query(Query::Touching(tag)));
            }
            Expr::Count { tag } => {
                let tag = self.symbol(tag);
                self.emit(Instr::Query(Query::Count(tag)));
            }
            Expr::Call { function, args } => self.call(function, args),
        }
        self.depth -= 1;
    }

    fn call(&mut self, function: &str, args: &[Expr]) {
        for arg in args {
            self.expr(arg);
        }
        match self.functions.get(function) {
            Some((index, params)) if *params == args.len() => {
                self.emit(Instr::Call { function: *index });
            }
            Some(_) => {
                self.error(ErrorCode::WrongArgumentCount);
                self.emit(Instr::PushNumber(0.0));
            }
            None => {
                self.error(ErrorCode::UnknownFunction);
                self.emit(Instr::PushNumber(0.0));
            }
        }
    }

    fn act(&mut self, act: Act, target: &Target, args: &[&Expr]) {
        for arg in args {
            self.expr(arg);
        }
        let target = self.target(target);
        self.emit(Instr::Act(act, target));
    }

    fn target(&mut self, target: &Target) -> TargetRef {
        match target {
            Target::Itself => TargetRef::Itself,
            Target::Other => TargetRef::Other,
            Target::Named(name) => TargetRef::Named(self.symbol(name)),
            Target::Nearest(tag) => TargetRef::Nearest(self.symbol(tag)),
        }
    }

    fn resolve(&self, name: &str) -> Option<Slot> {
        if let Some(index) = self.frame.iter().rposition(|n| n == name) {
            return Some(Slot::Frame(index as u16));
        }
        if matches!(self.scope, Scope::Entity)
            && let Some(slot) = self.locals.get(name)
        {
            return Some(Slot::Local(*slot));
        }
        self.globals.get(name).map(|slot| Slot::Global(*slot))
    }

    fn load(&mut self, name: &str) {
        match self.resolve(name) {
            Some(Slot::Frame(i)) => self.emit(Instr::LoadFrame(i)),
            Some(Slot::Local(i)) => self.emit(Instr::LoadLocal(i)),
            Some(Slot::Global(i)) => self.emit(Instr::LoadGlobal(i)),
            None => {
                self.error(ErrorCode::UnknownVariable);
                self.emit(Instr::PushNumber(0.0));
            }
        }
    }

    fn store(&mut self, name: &str) {
        match self.resolve(name) {
            Some(Slot::Frame(i)) => self.emit(Instr::StoreFrame(i)),
            Some(Slot::Local(i)) => self.emit(Instr::StoreLocal(i)),
            Some(Slot::Global(i)) => self.emit(Instr::StoreGlobal(i)),
            None => {
                self.error(ErrorCode::UnknownVariable);
                self.emit(Instr::Pop);
            }
        }
    }

    fn list(&mut self, name: &str) -> u16 {
        match self.lists.get(name) {
            Some(index) => *index,
            None => {
                self.error(ErrorCode::UnknownList);
                0
            }
        }
    }

    /// Loop counters live in the frame under a name players cannot type.
    fn hidden_slot(&mut self) -> u16 {
        self.frame.push(String::from("#"));
        self.frame_max = self.frame_max.max(self.frame.len());
        (self.frame.len() - 1) as u16
    }

    fn release_slot(&mut self) {
        self.frame.pop();
    }

    fn symbol(&mut self, value: &str) -> u32 {
        if let Some(index) = self.symbol_index.get(value) {
            return *index;
        }
        let index = self.symbols.len() as u32;
        self.symbols.push(value.to_owned());
        self.symbol_index.insert(value.to_owned(), index);
        index
    }

    fn text(&mut self, value: &str) -> u32 {
        if let Some(index) = self.text_index.get(value) {
            return *index;
        }
        let index = self.texts.len() as u32;
        self.texts.push(Rc::from(value));
        self.text_index.insert(value.to_owned(), index);
        index
    }

    fn intern_block(&mut self, id: Option<&String>) -> u32 {
        match id {
            Some(id) => {
                self.block_ids.push(id.clone());
                (self.block_ids.len() - 1) as u32
            }
            None => u32::MAX,
        }
    }

    fn error(&mut self, code: ErrorCode) {
        let error = DocumentError::new(code, self.path.clone()).at_block(self.block_id.as_ref());
        self.errors.push(error);
    }

    fn here(&self) -> Addr {
        self.code.len() as Addr
    }

    fn emit(&mut self, instr: Instr) {
        self.code.push(instr);
        self.origins.push(self.block);
    }

    fn emit_jump(&mut self) -> usize {
        self.emit(Instr::Jump(0));
        self.code.len() - 1
    }

    fn emit_jump_if_false(&mut self) -> usize {
        self.emit(Instr::JumpIfFalse(0));
        self.code.len() - 1
    }

    fn patch(&mut self, at: usize) {
        let target = self.here();
        match &mut self.code[at] {
            Instr::Jump(addr) | Instr::JumpIfFalse(addr) => *addr = target,
            _ => unreachable!("patched a non-jump instruction"),
        }
    }
}
