//! Axis-aligned boxes only: spheres and rotated shapes collide as their
//! bounding box, and ramps get a sloped top. Rotating rigid bodies would make
//! cross-target determinism much harder and none of the game styles the
//! editor targets need them.

use crate::document::{BodyKind, Dimension, Shape, Vec3};
use crate::limits::TICKS_PER_SECOND;
use crate::world::{EntityState, Pending, World};

const DT: f64 = 1.0 / TICKS_PER_SECOND as f64;
const CONTACT_MARGIN: f64 = 0.02;
const GROUND_DRAG: f64 = 0.08;
const MAX_SPEED: f64 = 500.0;

#[derive(Clone, Copy)]
struct Bounds {
    min: Vec3,
    max: Vec3,
}

impl Bounds {
    fn of(entity: &EntityState, flat: bool) -> Self {
        let half = Vec3::new(
            entity.size.x / 2.0,
            entity.size.y / 2.0,
            if flat { 0.0 } else { entity.size.z / 2.0 },
        );
        let p = entity.position;
        Bounds {
            min: Vec3::new(p.x - half.x, p.y - half.y, p.z - half.z),
            max: Vec3::new(p.x + half.x, p.y + half.y, p.z + half.z),
        }
    }

    fn overlaps(&self, other: &Bounds, margin: f64, flat: bool) -> bool {
        self.min.x < other.max.x + margin
            && self.max.x > other.min.x - margin
            && self.min.y < other.max.y + margin
            && self.max.y > other.min.y - margin
            && (flat || (self.min.z < other.max.z + margin && self.max.z > other.min.z - margin))
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Component {
    X,
    Y,
    Z,
}

fn get(v: Vec3, c: Component) -> f64 {
    match c {
        Component::X => v.x,
        Component::Y => v.y,
        Component::Z => v.z,
    }
}

fn set(v: &mut Vec3, c: Component, value: f64) {
    match c {
        Component::X => v.x = value,
        Component::Y => v.y = value,
        Component::Z => v.z = value,
    }
}

impl World {
    fn is_solid(&self, index: usize) -> bool {
        let source = &self.program.archetypes[self.entities[index].archetype as usize].source;
        self.entities[index].alive && source.body != BodyKind::None && !source.sensor
    }

    fn is_ramp(&self, index: usize) -> bool {
        self.program.archetypes[self.entities[index].archetype as usize]
            .source
            .shape
            == Shape::Ramp
    }

    pub(crate) fn simulate(&mut self) {
        let flat = self.dimension == Dimension::Flat;
        let gravity = self.settings.gravity;
        let components: &[Component] = if flat {
            &[Component::X, Component::Y]
        } else {
            &[Component::X, Component::Y, Component::Z]
        };
        let solids: Vec<usize> = (0..self.entities.len())
            .filter(|&i| self.is_solid(i))
            .collect();

        for index in 0..self.entities.len() {
            let body = self.body_of(index);
            let entity = &self.entities[index];
            if !entity.alive
                || entity.glide.is_some()
                || !matches!(body, BodyKind::Dynamic | BodyKind::Kinematic)
            {
                continue;
            }
            let source = &self.program.archetypes[entity.archetype as usize].source;
            let (bounce, friction, collides) = (
                source.bounce,
                source.friction,
                body == BodyKind::Dynamic && !source.sensor,
            );

            let entity = &mut self.entities[index];
            if body == BodyKind::Dynamic {
                entity.velocity.y -= gravity * DT;
            }
            entity.velocity = Vec3::new(
                entity.velocity.x.clamp(-MAX_SPEED, MAX_SPEED),
                entity.velocity.y.clamp(-MAX_SPEED, MAX_SPEED),
                entity.velocity.z.clamp(-MAX_SPEED, MAX_SPEED),
            );
            entity.on_ground = false;
            if entity.velocity != Vec3::ZERO {
                entity.moved = true;
            }

            for &component in components {
                let delta = get(self.entities[index].velocity, component) * DT;
                if delta == 0.0 {
                    continue;
                }
                let mut position = self.entities[index].position;
                let moved_to = get(position, component) + delta;
                set(&mut position, component, moved_to);
                self.entities[index].position = position;
                if collides {
                    self.resolve_collisions(index, component, delta, bounce, &solids, flat);
                }
            }

            let entity = &mut self.entities[index];
            if entity.on_ground && body == BodyKind::Dynamic {
                let keep = 1.0 - friction * GROUND_DRAG;
                entity.velocity.x *= keep;
                if !flat {
                    entity.velocity.z *= keep;
                }
            }
        }
    }

    fn resolve_collisions(
        &mut self,
        index: usize,
        component: Component,
        delta: f64,
        bounce: f64,
        solids: &[usize],
        flat: bool,
    ) {
        for &other in solids {
            if other == index || !self.entities[other].alive {
                continue;
            }
            let mine = Bounds::of(&self.entities[index], flat);
            let theirs = Bounds::of(&self.entities[other], flat);
            if !mine.overlaps(&theirs, 0.0, flat) {
                continue;
            }

            if self.is_ramp(other) {
                if component == Component::Y {
                    self.land_on_ramp(index, other, &mine, &theirs);
                }
                continue;
            }

            let half = get(self.entities[index].size, component) / 2.0;
            let edge = if delta > 0.0 {
                get(theirs.min, component) - half
            } else {
                get(theirs.max, component) + half
            };
            let entity = &mut self.entities[index];
            set(&mut entity.position, component, edge);
            if component == Component::Y && delta < 0.0 {
                entity.on_ground = true;
            }
            let speed = get(entity.velocity, component);
            let rebound = if bounce > 0.05 && speed.abs() > 1.0 {
                -speed * bounce
            } else {
                0.0
            };
            set(&mut entity.velocity, component, rebound);
        }
    }

    /// The ramp rises along its local +x; rotation is snapped to quarter turns
    /// because the collider stays axis aligned.
    fn land_on_ramp(&mut self, index: usize, ramp: usize, mine: &Bounds, theirs: &Bounds) {
        let quarter = (libm::round(self.entities[ramp].rotation / 90.0) as i64).rem_euclid(4);
        let p = self.entities[index].position;
        let along = |min: f64, max: f64, v: f64| ((v - min) / (max - min)).clamp(0.0, 1.0);
        let t = match quarter {
            0 => along(theirs.min.x, theirs.max.x, p.x),
            1 => along(theirs.min.z, theirs.max.z, p.z),
            2 => 1.0 - along(theirs.min.x, theirs.max.x, p.x),
            _ => 1.0 - along(theirs.min.z, theirs.max.z, p.z),
        };
        let surface = theirs.min.y + t * (theirs.max.y - theirs.min.y);
        if mine.min.y < surface {
            let entity = &mut self.entities[index];
            entity.position.y = surface + entity.size.y / 2.0;
            entity.on_ground = true;
            if entity.velocity.y < 0.0 {
                entity.velocity.y = 0.0;
            }
        }
    }

    /// Sort and sweep along x keeps this near linear for spread-out scenes.
    /// Pairs where neither side moved and both are static are skipped: a wall
    /// of touching tiles would otherwise report contacts every tick.
    pub(crate) fn detect_contacts(&mut self) {
        let flat = self.dimension == Dimension::Flat;
        let mut order: Vec<(f64, usize)> = (0..self.entities.len())
            .filter(|&i| self.entities[i].alive && self.body_of(i) != BodyKind::None)
            .map(|i| (Bounds::of(&self.entities[i], flat).min.x, i))
            .collect();
        order.sort_by(|a, b| {
            a.0.total_cmp(&b.0)
                .then(self.entities[a.1].id.cmp(&self.entities[b.1].id))
        });

        let mut contacts = Vec::new();
        for (position, &(_, a)) in order.iter().enumerate() {
            let bounds_a = Bounds::of(&self.entities[a], flat);
            for &(min_x, b) in &order[position + 1..] {
                if min_x > bounds_a.max.x + CONTACT_MARGIN {
                    break;
                }
                let (ea, eb) = (&self.entities[a], &self.entities[b]);
                let both_still = !ea.moved
                    && !eb.moved
                    && self.body_of(a) == BodyKind::Static
                    && self.body_of(b) == BodyKind::Static;
                if both_still {
                    continue;
                }
                if bounds_a.overlaps(&Bounds::of(eb, flat), CONTACT_MARGIN, flat) {
                    contacts.push((ea.id.min(eb.id), ea.id.max(eb.id)));
                }
            }
        }
        contacts.sort_unstable();

        for &(a, b) in &contacts {
            if self.contacts.binary_search(&(a, b)).is_err() {
                self.pending.push(Pending::Collide {
                    entity: a,
                    other: b,
                });
                self.pending.push(Pending::Collide {
                    entity: b,
                    other: a,
                });
            }
        }
        self.contacts = contacts;
    }
}
