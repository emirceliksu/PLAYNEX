use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameDocument {
    pub schema_version: u32,
    pub dimension: Dimension,
    pub world: WorldSettings,
    #[serde(default)]
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub prefabs: Vec<Entity>,
    #[serde(default)]
    pub variables: Vec<VariableDef>,
    #[serde(default)]
    pub lists: Vec<ListDef>,
    #[serde(default)]
    pub functions: Vec<FunctionDef>,
    #[serde(default)]
    pub scripts: Vec<Script>,
    #[serde(default)]
    pub sounds: Vec<SoundDef>,
    #[serde(default)]
    pub hud: Vec<HudItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Dimension {
    #[serde(rename = "2d")]
    Flat,
    #[serde(rename = "3d")]
    Spatial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorldSettings {
    pub size: Vec3,
    pub gravity: f64,
    pub background: u8,
    #[serde(default)]
    pub camera: CameraMode,
    #[serde(default)]
    pub time_limit_seconds: Option<u32>,
    #[serde(default)]
    pub lives: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CameraMode {
    #[default]
    Fixed,
    Follow,
    TopDown,
    ThirdPerson,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub z: f64,
}

impl Vec3 {
    pub const ZERO: Vec3 = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entity {
    pub id: u32,
    pub name: String,
    pub shape: Shape,
    pub position: Vec3,
    #[serde(default)]
    pub rotation: f64,
    pub size: Vec3,
    pub color: u8,
    #[serde(default)]
    pub body: BodyKind,
    #[serde(default)]
    pub sensor: bool,
    #[serde(default)]
    pub bounce: f64,
    #[serde(default = "default_friction")]
    pub friction: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub group: Option<u32>,
    #[serde(default)]
    pub behaviors: Vec<Behavior>,
    #[serde(default)]
    pub variables: Vec<VariableDef>,
    #[serde(default)]
    pub scripts: Vec<Script>,
}

fn default_friction() -> f64 {
    0.8
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Shape {
    Box,
    Sphere,
    Cylinder,
    Cone,
    Ramp,
    Rect,
    Circle,
    Triangle,
    Star { points: u8 },
    Polygon { points: Vec<[f64; 2]> },
    Text,
}

impl Shape {
    pub fn code(&self) -> u8 {
        match self {
            Shape::Box => 0,
            Shape::Sphere => 1,
            Shape::Cylinder => 2,
            Shape::Cone => 3,
            Shape::Ramp => 4,
            Shape::Rect => 5,
            Shape::Circle => 6,
            Shape::Triangle => 7,
            Shape::Star { .. } => 8,
            Shape::Polygon { .. } => 9,
            Shape::Text => 10,
        }
    }

    pub fn is_flat(&self) -> bool {
        matches!(
            self,
            Shape::Rect
                | Shape::Circle
                | Shape::Triangle
                | Shape::Star { .. }
                | Shape::Polygon { .. }
                | Shape::Text
        )
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BodyKind {
    None,
    #[default]
    Static,
    Dynamic,
    Kinematic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Behavior {
    #[serde(rename_all = "camelCase")]
    PlatformerController {
        speed: f64,
        jump: f64,
    },
    #[serde(rename_all = "camelCase")]
    TopDownController {
        speed: f64,
    },
    #[serde(rename_all = "camelCase")]
    Patrol {
        distance: f64,
        speed: f64,
        axis: Axis,
    },
    #[serde(rename_all = "camelCase")]
    Chase {
        tag: String,
        speed: f64,
    },
    #[serde(rename_all = "camelCase")]
    Collectible {
        points: f64,
    },
    #[serde(rename_all = "camelCase")]
    Hazard {
        damage: u32,
    },
    Goal,
    CameraTarget,
    #[serde(rename_all = "camelCase")]
    Spin {
        degrees_per_second: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Axis {
    X,
    Y,
    Z,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariableDef {
    pub name: String,
    pub initial: Literal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListDef {
    pub name: String,
    #[serde(default)]
    pub initial: Vec<Literal>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Literal {
    Bool(bool),
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FunctionDef {
    pub name: String,
    #[serde(default)]
    pub params: Vec<String>,
    pub body: Vec<Stmt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Script {
    #[serde(default)]
    pub id: Option<String>,
    pub event: Event,
    pub body: Vec<Stmt>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Start,
    Tick,
    Pressed { action: Action },
    Released { action: Action },
    Collide { tag: Option<String> },
    Timer { seconds: f64 },
    Message { name: String },
    Cloned,
    VariableChanged { name: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Left,
    Right,
    Up,
    Down,
    Jump,
    Primary,
    Secondary,
}

impl Action {
    pub const ALL: [Action; 7] = [
        Action::Left,
        Action::Right,
        Action::Up,
        Action::Down,
        Action::Jump,
        Action::Primary,
        Action::Secondary,
    ];

    pub fn bit(self) -> u8 {
        1 << (self as u8)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundDef {
    pub name: String,
    pub recipe: SoundRecipe,
    #[serde(default = "default_one")]
    pub pitch: f64,
    #[serde(default = "default_one")]
    pub volume: f64,
}

fn default_one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SoundRecipe {
    Coin,
    Jump,
    Hit,
    Explosion,
    PowerUp,
    Laser,
    Click,
    Win,
    Lose,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HudItem {
    pub kind: HudKind,
    pub anchor: HudAnchor,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum HudKind {
    Score,
    Timer,
    Lives,
    Variable { name: String },
    Text { text: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HudAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stmt {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(flatten)]
    pub op: StmtOp,
}

impl Stmt {
    pub fn new(op: StmtOp) -> Self {
        Self { id: None, op }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum StmtOp {
    #[serde(rename_all = "camelCase")]
    If {
        condition: Expr,
        then: Vec<Stmt>,
        #[serde(default)]
        otherwise: Vec<Stmt>,
    },
    #[serde(rename_all = "camelCase")]
    Repeat {
        count: Expr,
        body: Vec<Stmt>,
    },
    #[serde(rename_all = "camelCase")]
    While {
        condition: Expr,
        body: Vec<Stmt>,
    },
    #[serde(rename_all = "camelCase")]
    Forever {
        body: Vec<Stmt>,
    },
    #[serde(rename_all = "camelCase")]
    ForEach {
        variable: String,
        list: String,
        body: Vec<Stmt>,
    },
    #[serde(rename_all = "camelCase")]
    Wait {
        seconds: Expr,
    },
    Stop,
    #[serde(rename_all = "camelCase")]
    Call {
        function: String,
        #[serde(default)]
        args: Vec<Expr>,
    },
    #[serde(rename_all = "camelCase")]
    Return {
        #[serde(default)]
        value: Option<Expr>,
    },

    #[serde(rename_all = "camelCase")]
    Set {
        variable: String,
        value: Expr,
    },
    #[serde(rename_all = "camelCase")]
    Change {
        variable: String,
        by: Expr,
    },
    #[serde(rename_all = "camelCase")]
    ListAdd {
        list: String,
        value: Expr,
    },
    #[serde(rename_all = "camelCase")]
    ListRemove {
        list: String,
        index: Expr,
    },
    #[serde(rename_all = "camelCase")]
    ListSet {
        list: String,
        index: Expr,
        value: Expr,
    },
    #[serde(rename_all = "camelCase")]
    ListClear {
        list: String,
    },

    #[serde(rename_all = "camelCase")]
    Move {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetPosition {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetVelocity {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetVelocityAxis {
        target: Target,
        axis: Axis,
        value: Expr,
    },
    #[serde(rename_all = "camelCase")]
    Push {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    Turn {
        target: Target,
        degrees: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetRotation {
        target: Target,
        degrees: Expr,
    },
    #[serde(rename_all = "camelCase")]
    GlideTo {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
        seconds: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetSize {
        target: Target,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::one")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    Show {
        target: Target,
    },
    #[serde(rename_all = "camelCase")]
    Hide {
        target: Target,
    },
    #[serde(rename_all = "camelCase")]
    SetColor {
        target: Target,
        color: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetText {
        target: Target,
        text: Expr,
    },

    #[serde(rename_all = "camelCase")]
    Spawn {
        prefab: String,
        x: Expr,
        y: Expr,
        #[serde(default = "Expr::zero")]
        z: Expr,
    },
    #[serde(rename_all = "camelCase")]
    Destroy {
        target: Target,
    },
    #[serde(rename_all = "camelCase")]
    Broadcast {
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    PlaySound {
        sound: String,
    },
    #[serde(rename_all = "camelCase")]
    AddScore {
        amount: Expr,
    },
    #[serde(rename_all = "camelCase")]
    SetScore {
        value: Expr,
    },
    #[serde(rename_all = "camelCase")]
    LoseLife {
        amount: Expr,
    },
    Win,
    Lose,
    #[serde(rename_all = "camelCase")]
    CameraShake {
        strength: Expr,
    },
    #[serde(rename_all = "camelCase")]
    CameraFollow {
        target: Target,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "name", rename_all = "camelCase")]
pub enum Target {
    #[serde(rename = "self")]
    Itself,
    Other,
    Named(String),
    Nearest(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Expr {
    #[serde(rename_all = "camelCase")]
    Number {
        value: f64,
    },
    #[serde(rename_all = "camelCase")]
    Text {
        value: String,
    },
    #[serde(rename_all = "camelCase")]
    Bool {
        value: bool,
    },
    #[serde(rename_all = "camelCase")]
    Var {
        name: String,
    },
    #[serde(rename_all = "camelCase")]
    Binary {
        operator: BinaryOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    #[serde(rename_all = "camelCase")]
    Unary {
        operator: UnaryOp,
        value: Box<Expr>,
    },
    #[serde(rename_all = "camelCase")]
    Random {
        min: Box<Expr>,
        max: Box<Expr>,
        #[serde(default)]
        integer: bool,
    },
    #[serde(rename_all = "camelCase")]
    ListItem {
        list: String,
        index: Box<Expr>,
    },
    #[serde(rename_all = "camelCase")]
    ListLength {
        list: String,
    },
    #[serde(rename_all = "camelCase")]
    ListContains {
        list: String,
        value: Box<Expr>,
    },
    #[serde(rename_all = "camelCase")]
    Property {
        target: Target,
        property: Property,
    },
    #[serde(rename_all = "camelCase")]
    Held {
        action: Action,
    },
    #[serde(rename_all = "camelCase")]
    InputAxis {
        axis: Axis,
    },
    Score,
    Lives,
    Time,
    #[serde(rename_all = "camelCase")]
    Distance {
        target: Target,
    },
    #[serde(rename_all = "camelCase")]
    DirectionTo {
        target: Target,
        axis: Axis,
    },
    #[serde(rename_all = "camelCase")]
    Touching {
        tag: String,
    },
    #[serde(rename_all = "camelCase")]
    Count {
        tag: String,
    },
    #[serde(rename_all = "camelCase")]
    Call {
        function: String,
        #[serde(default)]
        args: Vec<Expr>,
    },
}

impl Expr {
    pub fn zero() -> Expr {
        Expr::Number { value: 0.0 }
    }

    pub fn one() -> Expr {
        Expr::Number { value: 1.0 }
    }

    pub fn num(value: f64) -> Expr {
        Expr::Number { value }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Pow,
    Min,
    Max,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
    Join,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UnaryOp {
    Not,
    Neg,
    Abs,
    Floor,
    Ceil,
    Round,
    Sqrt,
    Sin,
    Cos,
    Tan,
    Length,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Property {
    X,
    Y,
    Z,
    VelocityX,
    VelocityY,
    VelocityZ,
    Rotation,
    Width,
    Height,
    Depth,
    Visible,
    OnGround,
    Color,
    Exists,
}
