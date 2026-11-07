use std::rc::Rc;

use crate::document::{Axis, BinaryOp, Property, UnaryOp, Vec3};
use crate::limits::{
    MAX_CALL_DEPTH, MAX_LIST_ITEMS, MAX_SIZE, MAX_STACK, MIN_SIZE, PALETTE_SIZE, THREAD_BUDGET,
    TICKS_PER_SECOND,
};
use crate::program::{Act, Instr, Query, TargetRef};
use crate::value::{Value, finite};
use crate::world::{
    CallFrame, DiagnosticKind, FrameEvent, Glide, Outcome, Pending, Thread, World, truncate,
};

const MISSING_DISTANCE: f64 = 1.0e9;

impl World {
    pub(crate) fn execute(&mut self, thread: &mut Thread, tick_budget: &mut u32) {
        if thread.done || thread.wake > self.tick {
            return;
        }
        if thread.owner.is_some_and(|id| self.index_of(id).is_none()) {
            thread.done = true;
            return;
        }
        let mut budget = THREAD_BUDGET;
        loop {
            if self.outcome != Outcome::Running {
                return;
            }
            if *tick_budget == 0 {
                return;
            }
            if budget == 0 {
                self.fail(thread, DiagnosticKind::BudgetExceeded);
                return;
            }
            if thread.stack.len() > MAX_STACK {
                self.fail(thread, DiagnosticKind::StackOverflow);
                return;
            }
            budget -= 1;
            *tick_budget -= 1;

            let instr = self.program.code[thread.pc as usize];
            thread.pc += 1;
            match instr {
                Instr::PushNumber(n) => thread.stack.push(Value::Number(n)),
                Instr::PushText(i) => thread
                    .stack
                    .push(Value::Text(self.program.texts[i as usize].clone())),
                Instr::PushBool(b) => thread.stack.push(Value::Bool(b)),
                Instr::Pop => {
                    thread.stack.pop();
                }
                Instr::LoadGlobal(slot) => thread.stack.push(self.globals[slot as usize].clone()),
                Instr::StoreGlobal(slot) => {
                    let value = pop(thread);
                    if self.globals[slot as usize] != value {
                        self.globals[slot as usize] = value;
                        self.mark_changed(slot);
                    }
                }
                Instr::LoadLocal(slot) => {
                    let value = thread
                        .owner
                        .and_then(|id| self.index_of(id))
                        .map_or_else(Value::zero, |i| {
                            self.entities[i].locals[slot as usize].clone()
                        });
                    thread.stack.push(value);
                }
                Instr::StoreLocal(slot) => {
                    let value = pop(thread);
                    if let Some(i) = thread.owner.and_then(|id| self.index_of(id)) {
                        self.entities[i].locals[slot as usize] = value;
                    }
                }
                Instr::LoadFrame(slot) => {
                    let base = thread.frames.last().map_or(0, |f| f.base);
                    thread
                        .stack
                        .push(thread.slots[base + slot as usize].clone());
                }
                Instr::StoreFrame(slot) => {
                    let value = pop(thread);
                    let base = thread.frames.last().map_or(0, |f| f.base);
                    thread.slots[base + slot as usize] = value;
                }
                Instr::Binary(op) => {
                    let right = pop(thread);
                    let left = pop(thread);
                    thread.stack.push(binary(op, &left, &right));
                }
                Instr::Unary(op) => {
                    let value = pop(thread);
                    thread.stack.push(unary(op, &value));
                }
                Instr::Random { integer } => {
                    let max = pop(thread).number();
                    let min = pop(thread).number();
                    let (low, high) = if min <= max { (min, max) } else { (max, min) };
                    let u = self.rng.next_f64();
                    let value = if integer {
                        let (low, high) = (libm::round(low), libm::round(high));
                        libm::floor(low + u * (high - low + 1.0)).min(high)
                    } else {
                        low + u * (high - low)
                    };
                    thread.stack.push(Value::Number(value));
                }
                Instr::Jump(addr) => thread.pc = addr,
                Instr::JumpIfFalse(addr) => {
                    if !pop(thread).truthy() {
                        thread.pc = addr;
                    }
                }
                Instr::Yield => {
                    thread.wake = self.tick + 1;
                    return;
                }
                Instr::Wait => {
                    let seconds = pop(thread).number().clamp(0.0, 600.0);
                    let ticks = libm::round(seconds * f64::from(TICKS_PER_SECOND)) as u32;
                    thread.wake = self.tick + ticks.max(1);
                    return;
                }
                Instr::Stop => {
                    thread.done = true;
                    return;
                }
                Instr::Call { function } => {
                    if thread.frames.len() >= MAX_CALL_DEPTH {
                        self.fail(thread, DiagnosticKind::RecursionTooDeep);
                        return;
                    }
                    let callee = &self.program.functions[function as usize];
                    let base = thread.slots.len();
                    let args_start = thread.stack.len().saturating_sub(callee.params as usize);
                    thread.slots.extend(thread.stack.drain(args_start..));
                    thread
                        .slots
                        .resize(base + callee.frame_size as usize, Value::zero());
                    thread.frames.push(CallFrame {
                        return_pc: thread.pc,
                        base,
                    });
                    thread.pc = callee.entry;
                }
                Instr::Return => {
                    let value = pop(thread);
                    let Some(frame) = thread.frames.pop() else {
                        thread.done = true;
                        return;
                    };
                    thread.slots.truncate(frame.base);
                    thread.pc = frame.return_pc;
                    thread.stack.push(value);
                }
                Instr::ListAdd(list) => {
                    let value = pop(thread);
                    if self.lists[list as usize].len() < MAX_LIST_ITEMS {
                        self.lists[list as usize].push(value);
                    } else {
                        self.diagnose(
                            DiagnosticKind::ListFull,
                            self.program
                                .block_at(thread.pc - 1)
                                .map(str::to_owned)
                                .as_deref(),
                        );
                    }
                }
                Instr::ListRemove(list) => {
                    let index = pop(thread);
                    if let Some(i) = list_index(&index, self.lists[list as usize].len()) {
                        self.lists[list as usize].remove(i);
                    }
                }
                Instr::ListSet(list) => {
                    let value = pop(thread);
                    let index = pop(thread);
                    if let Some(i) = list_index(&index, self.lists[list as usize].len()) {
                        self.lists[list as usize][i] = value;
                    }
                }
                Instr::ListClear(list) => self.lists[list as usize].clear(),
                Instr::ListItem(list) => {
                    let index = pop(thread);
                    let items = &self.lists[list as usize];
                    let value = list_index(&index, items.len())
                        .map_or_else(|| Value::Text(Rc::from("")), |i| items[i].clone());
                    thread.stack.push(value);
                }
                Instr::ListLength(list) => thread
                    .stack
                    .push(Value::Number(self.lists[list as usize].len() as f64)),
                Instr::ListContains(list) => {
                    let value = pop(thread);
                    let found = self.lists[list as usize]
                        .iter()
                        .any(|item| item.loosely_equals(&value));
                    thread.stack.push(Value::Bool(found));
                }
                Instr::Act(act, target) => {
                    let mut args = [0.0; 4];
                    let mut text = None;
                    if act == Act::SetText {
                        text = Some(pop(thread).text());
                    } else {
                        for slot in (0..act.arity()).rev() {
                            args[slot] = pop(thread).number();
                        }
                    }
                    let Some(index) = self.resolve(target, thread) else {
                        continue;
                    };
                    if self.act(act, index, args, text, thread) {
                        return;
                    }
                }
                Instr::Query(query) => {
                    let value = self.query(query, thread);
                    thread.stack.push(value);
                }
                Instr::Spawn(archetype) => {
                    let z = pop(thread).number();
                    let y = pop(thread).number();
                    let x = pop(thread).number();
                    if let Some(id) =
                        self.create_entity(archetype, Vec3::new(finite(x), finite(y), finite(z)))
                    {
                        self.fire_on_spawn(id);
                    }
                }
                Instr::Broadcast(symbol) => self.pending.push(Pending::Message(symbol)),
                Instr::PlaySound(index) => self.events.push(FrameEvent::Sound { index }),
                Instr::AddScore => self.score = finite(self.score + pop(thread).number()),
                Instr::SetScore => self.score = finite(pop(thread).number()),
                Instr::LoseLife => {
                    let amount = libm::round(pop(thread).number()).max(0.0) as u32;
                    match self.lives {
                        Some(lives) if lives > amount => self.lives = Some(lives - amount),
                        _ => {
                            self.lives = self.lives.map(|_| 0);
                            self.outcome = Outcome::Lost;
                        }
                    }
                }
                Instr::Win => self.outcome = Outcome::Won,
                Instr::Lose => self.outcome = Outcome::Lost,
                Instr::CameraShake => {
                    let strength = pop(thread).number().clamp(0.0, 10.0);
                    self.events.push(FrameEvent::Shake { strength });
                }
            }
        }
    }

    fn fail(&mut self, thread: &mut Thread, kind: DiagnosticKind) {
        let block = self
            .program
            .block_at(thread.pc.saturating_sub(1))
            .map(str::to_owned);
        self.diagnose(kind, block.as_deref());
        thread.done = true;
    }

    fn resolve(&self, target: TargetRef, thread: &Thread) -> Option<usize> {
        match target {
            TargetRef::Itself => thread.owner.and_then(|id| self.index_of(id)),
            TargetRef::Other => thread.other.and_then(|id| self.index_of(id)),
            TargetRef::Named(name) => self
                .entities
                .iter()
                .position(|e| e.alive && e.name == Some(name)),
            TargetRef::Nearest(tag) => {
                let origin = thread
                    .owner
                    .and_then(|id| self.index_of(id))
                    .map_or(Vec3::ZERO, |i| self.entities[i].position);
                let mut best: Option<(usize, f64)> = None;
                for (index, entity) in self.entities.iter().enumerate() {
                    if !entity.alive || Some(entity.id) == thread.owner || !self.has_tag(index, tag)
                    {
                        continue;
                    }
                    let distance = squared_distance(origin, entity.position);
                    if best.is_none_or(|(_, d)| distance < d) {
                        best = Some((index, distance));
                    }
                }
                best.map(|(index, _)| index)
            }
        }
    }

    /// Returns true when the thread has to yield (a glide waits for its end).
    fn act(
        &mut self,
        act: Act,
        index: usize,
        args: [f64; 4],
        text: Option<Rc<str>>,
        thread: &mut Thread,
    ) -> bool {
        let flat = self.dimension == crate::document::Dimension::Flat;
        let vector = |args: [f64; 4]| {
            Vec3::new(
                finite(args[0]),
                finite(args[1]),
                if flat { 0.0 } else { finite(args[2]) },
            )
        };
        let tick = self.tick;
        let entity = &mut self.entities[index];
        match act {
            Act::Move => {
                let delta = vector(args);
                entity.position = Vec3::new(
                    entity.position.x + delta.x,
                    entity.position.y + delta.y,
                    entity.position.z + delta.z,
                );
                entity.moved = true;
            }
            Act::SetPosition => {
                entity.position = vector(args);
                entity.moved = true;
            }
            Act::SetVelocity => entity.velocity = vector(args),
            Act::SetVelocityAxis(axis) => match axis {
                Axis::X => entity.velocity.x = finite(args[0]),
                Axis::Y => entity.velocity.y = finite(args[0]),
                Axis::Z if !flat => entity.velocity.z = finite(args[0]),
                Axis::Z => {}
            },
            Act::Push => {
                let delta = vector(args);
                entity.velocity = Vec3::new(
                    entity.velocity.x + delta.x,
                    entity.velocity.y + delta.y,
                    entity.velocity.z + delta.z,
                );
            }
            Act::Turn => entity.rotation = normalize_degrees(entity.rotation + finite(args[0])),
            Act::SetRotation => entity.rotation = normalize_degrees(finite(args[0])),
            Act::GlideTo => {
                let ticks =
                    libm::round(finite(args[3]).clamp(0.0, 600.0) * f64::from(TICKS_PER_SECOND))
                        as u32;
                entity.glide = Some(Glide {
                    from: entity.position,
                    to: vector(args),
                    start: tick,
                    ticks: ticks.max(1),
                });
                if Some(entity.id) == thread.owner {
                    thread.wake = tick + ticks.max(1);
                    return true;
                }
            }
            Act::SetSize => {
                let size = |v: f64| finite(v).clamp(MIN_SIZE, MAX_SIZE);
                entity.size = Vec3::new(
                    size(args[0]),
                    size(args[1]),
                    if flat { entity.size.z } else { size(args[2]) },
                );
                entity.moved = true;
            }
            Act::Show => entity.visible = true,
            Act::Hide => entity.visible = false,
            Act::SetColor => {
                let palette = f64::from(PALETTE_SIZE);
                entity.color = (libm::floor(finite(args[0])).rem_euclid(palette)) as u8;
            }
            Act::SetText => entity.text = text.map(|t| Rc::from(truncate(&t))),
            Act::Destroy => {
                entity.alive = false;
                if Some(entity.id) == thread.owner {
                    thread.done = true;
                    return true;
                }
            }
            Act::CameraFollow => self.camera_target = Some(entity.id),
        }
        false
    }

    fn query(&self, query: Query, thread: &Thread) -> Value {
        match query {
            Query::Property(target, property) => {
                let Some(index) = self.resolve(target, thread) else {
                    return match property {
                        Property::Exists | Property::Visible | Property::OnGround => {
                            Value::Bool(false)
                        }
                        _ => Value::zero(),
                    };
                };
                let entity = &self.entities[index];
                match property {
                    Property::X => Value::Number(entity.position.x),
                    Property::Y => Value::Number(entity.position.y),
                    Property::Z => Value::Number(entity.position.z),
                    Property::VelocityX => Value::Number(entity.velocity.x),
                    Property::VelocityY => Value::Number(entity.velocity.y),
                    Property::VelocityZ => Value::Number(entity.velocity.z),
                    Property::Rotation => Value::Number(entity.rotation),
                    Property::Width => Value::Number(entity.size.x),
                    Property::Height => Value::Number(entity.size.y),
                    Property::Depth => Value::Number(entity.size.z),
                    Property::Visible => Value::Bool(entity.visible),
                    Property::OnGround => Value::Bool(entity.on_ground),
                    Property::Color => Value::Number(f64::from(entity.color)),
                    Property::Exists => Value::Bool(true),
                }
            }
            Query::Distance(target) => {
                let from = thread.owner.and_then(|id| self.index_of(id));
                match (from, self.resolve(target, thread)) {
                    (Some(a), Some(b)) => Value::Number(libm::sqrt(squared_distance(
                        self.entities[a].position,
                        self.entities[b].position,
                    ))),
                    _ => Value::Number(MISSING_DISTANCE),
                }
            }
            Query::DirectionTo(target, axis) => {
                let from = thread.owner.and_then(|id| self.index_of(id));
                let (Some(a), Some(b)) = (from, self.resolve(target, thread)) else {
                    return Value::zero();
                };
                let (p, q) = (self.entities[a].position, self.entities[b].position);
                let delta = Vec3::new(q.x - p.x, q.y - p.y, q.z - p.z);
                let length = libm::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
                if length < 1e-9 {
                    return Value::zero();
                }
                Value::Number(match axis {
                    Axis::X => delta.x / length,
                    Axis::Y => delta.y / length,
                    Axis::Z => delta.z / length,
                })
            }
            Query::Held(action) => Value::Bool(self.input.held(action)),
            Query::InputAxis(axis) => Value::Number(self.input_axis(axis)),
            Query::Touching(tag) => {
                let Some(owner) = thread.owner else {
                    return Value::Bool(false);
                };
                let touching = self.contacts.iter().any(|&(a, b)| {
                    let other = if a == owner {
                        b
                    } else if b == owner {
                        a
                    } else {
                        return false;
                    };
                    self.index_of(other).is_some_and(|i| self.has_tag(i, tag))
                });
                Value::Bool(touching)
            }
            Query::Count(tag) => {
                let count = (0..self.entities.len())
                    .filter(|&i| self.entities[i].alive && self.has_tag(i, tag))
                    .count();
                Value::Number(count as f64)
            }
            Query::Score => Value::Number(self.score),
            Query::Lives => Value::Number(f64::from(self.lives.unwrap_or(0))),
            Query::Time => Value::Number(f64::from(self.tick) / f64::from(TICKS_PER_SECOND)),
        }
    }

    /// Analog input wins when present; otherwise the arrow buttons give -1, 0 or 1.
    fn input_axis(&self, axis: Axis) -> f64 {
        use crate::document::Action;
        let (analog, negative, positive) = match axis {
            Axis::X => (self.input.axis_x, Action::Left, Action::Right),
            Axis::Y | Axis::Z => (self.input.axis_y, Action::Down, Action::Up),
        };
        if analog != 0 {
            return (f64::from(analog) / 127.0).clamp(-1.0, 1.0);
        }
        f64::from(i8::from(self.input.held(positive)) - i8::from(self.input.held(negative)))
    }
}

fn pop(thread: &mut Thread) -> Value {
    thread.stack.pop().unwrap_or_else(Value::zero)
}

/// Lists are 1-based in blocks, the way players count.
fn list_index(index: &Value, len: usize) -> Option<usize> {
    let n = libm::floor(index.number());
    (n >= 1.0 && n <= len as f64).then(|| n as usize - 1)
}

fn squared_distance(a: Vec3, b: Vec3) -> f64 {
    let (dx, dy, dz) = (a.x - b.x, a.y - b.y, a.z - b.z);
    dx * dx + dy * dy + dz * dz
}

fn normalize_degrees(degrees: f64) -> f64 {
    degrees.rem_euclid(360.0)
}

fn binary(op: BinaryOp, left: &Value, right: &Value) -> Value {
    let (a, b) = (left.number(), right.number());
    match op {
        BinaryOp::Add => Value::Number(finite(a + b)),
        BinaryOp::Sub => Value::Number(finite(a - b)),
        BinaryOp::Mul => Value::Number(finite(a * b)),
        BinaryOp::Div => Value::Number(finite(a / b)),
        BinaryOp::Mod => Value::Number(if b == 0.0 {
            0.0
        } else {
            finite(a - b * libm::floor(a / b))
        }),
        BinaryOp::Pow => Value::Number(finite(libm::pow(a, b))),
        BinaryOp::Min => Value::Number(a.min(b)),
        BinaryOp::Max => Value::Number(a.max(b)),
        BinaryOp::Eq => Value::Bool(left.loosely_equals(right)),
        BinaryOp::Ne => Value::Bool(!left.loosely_equals(right)),
        BinaryOp::Lt => Value::Bool(a < b),
        BinaryOp::Le => Value::Bool(a <= b),
        BinaryOp::Gt => Value::Bool(a > b),
        BinaryOp::Ge => Value::Bool(a >= b),
        BinaryOp::And => Value::Bool(left.truthy() && right.truthy()),
        BinaryOp::Or => Value::Bool(left.truthy() || right.truthy()),
        BinaryOp::Join => {
            let joined: String = format!("{}{}", left.text(), right.text());
            Value::Text(Rc::from(truncate(&joined)))
        }
    }
}

fn unary(op: UnaryOp, value: &Value) -> Value {
    let n = value.number();
    let radians = n.to_radians();
    match op {
        UnaryOp::Not => Value::Bool(!value.truthy()),
        UnaryOp::Neg => Value::Number(-n),
        UnaryOp::Abs => Value::Number(n.abs()),
        UnaryOp::Floor => Value::Number(libm::floor(n)),
        UnaryOp::Ceil => Value::Number(libm::ceil(n)),
        UnaryOp::Round => Value::Number(libm::round(n)),
        UnaryOp::Sqrt => Value::Number(if n < 0.0 { 0.0 } else { libm::sqrt(n) }),
        UnaryOp::Sin => Value::Number(libm::sin(radians)),
        UnaryOp::Cos => Value::Number(libm::cos(radians)),
        UnaryOp::Tan => Value::Number(finite(libm::tan(radians))),
        UnaryOp::Length => Value::Number(value.text().chars().count() as f64),
    }
}
