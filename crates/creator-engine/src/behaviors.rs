//! Behaviors are presets: each one expands into ordinary scripts so the
//! interpreter has a single execution path and players can later "open up"
//! a behavior into the blocks it stands for.

use crate::document::{
    Action, Axis, Behavior, BinaryOp, Dimension, Event, Expr, Literal, Property, Script, Stmt,
    StmtOp, Target, VariableDef,
};

pub const PLAYER_TAG: &str = "player";

pub struct Expansion {
    pub scripts: Vec<Script>,
    pub locals: Vec<VariableDef>,
}

pub fn expand(behaviors: &[Behavior], dimension: Dimension) -> Expansion {
    let mut expansion = Expansion {
        scripts: Vec::new(),
        locals: Vec::new(),
    };
    for (index, behavior) in behaviors.iter().enumerate() {
        expand_one(behavior, index, dimension, &mut expansion);
    }
    expansion
}

fn expand_one(behavior: &Behavior, index: usize, dimension: Dimension, out: &mut Expansion) {
    let depth_axis = match dimension {
        Dimension::Flat => Axis::Y,
        Dimension::Spatial => Axis::Z,
    };
    match behavior {
        Behavior::PlatformerController { speed, jump } => {
            let mut tick = vec![set_velocity(Axis::X, mul(input(Axis::X), num(*speed)))];
            if dimension == Dimension::Spatial {
                tick.push(set_velocity(Axis::Z, mul(input(Axis::Y), num(*speed))));
            }
            out.scripts.push(script(Event::Tick, tick));
            let jump_body = vec![when(
                prop(Property::OnGround),
                vec![set_velocity(Axis::Y, num(*jump))],
            )];
            out.scripts.push(script(
                Event::Pressed {
                    action: Action::Jump,
                },
                jump_body.clone(),
            ));
            if dimension == Dimension::Flat {
                out.scripts
                    .push(script(Event::Pressed { action: Action::Up }, jump_body));
            }
        }
        Behavior::TopDownController { speed } => {
            out.scripts.push(script(
                Event::Tick,
                vec![
                    set_velocity(Axis::X, mul(input(Axis::X), num(*speed))),
                    set_velocity(depth_axis, mul(input(Axis::Y), num(*speed))),
                ],
            ));
        }
        Behavior::Patrol {
            distance,
            speed,
            axis,
        } => {
            let origin = format!("#patrolOrigin{index}");
            let direction = format!("#patrolDirection{index}");
            out.locals.push(VariableDef {
                name: origin.clone(),
                initial: Literal::Number(0.0),
            });
            out.locals.push(VariableDef {
                name: direction.clone(),
                initial: Literal::Number(1.0),
            });
            let offset = binary(BinaryOp::Sub, prop(axis_property(*axis)), var(&origin));
            out.scripts.push(script(
                Event::Start,
                vec![set(&origin, prop(axis_property(*axis)))],
            ));
            out.scripts.push(script(
                Event::Tick,
                vec![
                    when(
                        binary(
                            BinaryOp::And,
                            binary(BinaryOp::Gt, var(&direction), num(0.0)),
                            binary(BinaryOp::Ge, offset.clone(), num(*distance)),
                        ),
                        vec![set(&direction, num(-1.0))],
                    ),
                    when(
                        binary(
                            BinaryOp::And,
                            binary(BinaryOp::Lt, var(&direction), num(0.0)),
                            binary(BinaryOp::Le, offset, num(0.0)),
                        ),
                        vec![set(&direction, num(1.0))],
                    ),
                    set_velocity(*axis, mul(var(&direction), num(*speed))),
                ],
            ));
        }
        Behavior::Chase { tag, speed } => {
            let target = Target::Nearest(tag.clone());
            let toward = |axis| {
                mul(
                    Expr::DirectionTo {
                        target: target.clone(),
                        axis,
                    },
                    num(*speed),
                )
            };
            out.scripts.push(script(
                Event::Tick,
                vec![when(
                    Expr::Property {
                        target: target.clone(),
                        property: Property::Exists,
                    },
                    vec![
                        set_velocity(Axis::X, toward(Axis::X)),
                        set_velocity(depth_axis, toward(depth_axis)),
                    ],
                )],
            ));
        }
        Behavior::Collectible { points } => {
            out.scripts.push(script(
                touched_by_player(),
                vec![
                    Stmt::new(StmtOp::AddScore {
                        amount: num(*points),
                    }),
                    Stmt::new(StmtOp::Destroy {
                        target: Target::Itself,
                    }),
                ],
            ));
        }
        Behavior::Hazard { damage } => {
            out.scripts.push(script(
                touched_by_player(),
                vec![
                    Stmt::new(StmtOp::LoseLife {
                        amount: num(f64::from(*damage)),
                    }),
                    Stmt::new(StmtOp::Broadcast {
                        message: "hit".into(),
                    }),
                ],
            ));
        }
        Behavior::Goal => out
            .scripts
            .push(script(touched_by_player(), vec![Stmt::new(StmtOp::Win)])),
        Behavior::CameraTarget => out.scripts.push(script(
            Event::Start,
            vec![Stmt::new(StmtOp::CameraFollow {
                target: Target::Itself,
            })],
        )),
        Behavior::Spin { degrees_per_second } => out.scripts.push(script(
            Event::Tick,
            vec![Stmt::new(StmtOp::Turn {
                target: Target::Itself,
                degrees: num(degrees_per_second / 60.0),
            })],
        )),
    }
}

fn touched_by_player() -> Event {
    Event::Collide {
        tag: Some(PLAYER_TAG.into()),
    }
}

fn script(event: Event, body: Vec<Stmt>) -> Script {
    Script {
        id: None,
        event,
        body,
    }
}

fn axis_property(axis: Axis) -> Property {
    match axis {
        Axis::X => Property::X,
        Axis::Y => Property::Y,
        Axis::Z => Property::Z,
    }
}

fn num(value: f64) -> Expr {
    Expr::Number { value }
}

fn var(name: &str) -> Expr {
    Expr::Var { name: name.into() }
}

fn prop(property: Property) -> Expr {
    Expr::Property {
        target: Target::Itself,
        property,
    }
}

fn input(axis: Axis) -> Expr {
    Expr::InputAxis { axis }
}

fn binary(operator: BinaryOp, left: Expr, right: Expr) -> Expr {
    Expr::Binary {
        operator,
        left: Box::new(left),
        right: Box::new(right),
    }
}

fn mul(left: Expr, right: Expr) -> Expr {
    binary(BinaryOp::Mul, left, right)
}

fn set(variable: &str, value: Expr) -> Stmt {
    Stmt::new(StmtOp::Set {
        variable: variable.into(),
        value,
    })
}

fn set_velocity(axis: Axis, value: Expr) -> Stmt {
    Stmt::new(StmtOp::SetVelocityAxis {
        target: Target::Itself,
        axis,
        value,
    })
}

fn when(condition: Expr, then: Vec<Stmt>) -> Stmt {
    Stmt::new(StmtOp::If {
        condition,
        then,
        otherwise: Vec::new(),
    })
}
