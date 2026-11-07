// Mirror of crates/creator-engine/src/document.rs. The engine is the authority:
// anything that fails these types also fails `validate` there.

export const SCHEMA_VERSION = 1;

export type Dimension = '2d' | '3d';
export type CameraMode = 'fixed' | 'follow' | 'topDown' | 'thirdPerson';
export type BodyKind = 'none' | 'static' | 'dynamic' | 'kinematic';
export type Axis = 'x' | 'y' | 'z';
export type ActionName = 'left' | 'right' | 'up' | 'down' | 'jump' | 'primary' | 'secondary';

export const ACTIONS: readonly ActionName[] = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'primary',
  'secondary',
];

export interface Vec3 {
  x: number;
  y: number;
  z?: number;
}

export type Shape =
  | { kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'ramp' }
  | { kind: 'rect' | 'circle' | 'triangle' | 'text' }
  | { kind: 'star'; points: number }
  | { kind: 'polygon'; points: [number, number][] };

export type ShapeKind = Shape['kind'];

export const SHAPES_2D: readonly ShapeKind[] = [
  'rect',
  'circle',
  'triangle',
  'star',
  'polygon',
  'text',
];
export const SHAPES_3D: readonly ShapeKind[] = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'ramp',
  'text',
];

export type Behavior =
  | { kind: 'platformerController'; speed: number; jump: number }
  | { kind: 'topDownController'; speed: number }
  | { kind: 'patrol'; distance: number; speed: number; axis: Axis }
  | { kind: 'chase'; tag: string; speed: number }
  | { kind: 'collectible'; points: number }
  | { kind: 'hazard'; damage: number }
  | { kind: 'goal' }
  | { kind: 'cameraTarget' }
  | { kind: 'spin'; degreesPerSecond: number };

export type BehaviorKind = Behavior['kind'];

export type Literal = number | string | boolean;

export interface VariableDef {
  name: string;
  initial: Literal;
}

export interface ListDef {
  name: string;
  initial?: Literal[];
}

export type Target =
  | { kind: 'self' }
  | { kind: 'other' }
  | { kind: 'named'; name: string }
  | { kind: 'nearest'; name: string };

export type BinaryOperator =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mod'
  | 'pow'
  | 'min'
  | 'max'
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'and'
  | 'or'
  | 'join';

export type UnaryOperator =
  'not' | 'neg' | 'abs' | 'floor' | 'ceil' | 'round' | 'sqrt' | 'sin' | 'cos' | 'tan' | 'length';

export type Property =
  | 'x'
  | 'y'
  | 'z'
  | 'velocityX'
  | 'velocityY'
  | 'velocityZ'
  | 'rotation'
  | 'width'
  | 'height'
  | 'depth'
  | 'visible'
  | 'onGround'
  | 'color'
  | 'exists';

export type Expr =
  | { op: 'number'; value: number }
  | { op: 'text'; value: string }
  | { op: 'bool'; value: boolean }
  | { op: 'var'; name: string }
  | { op: 'binary'; operator: BinaryOperator; left: Expr; right: Expr }
  | { op: 'unary'; operator: UnaryOperator; value: Expr }
  | { op: 'random'; min: Expr; max: Expr; integer?: boolean }
  | { op: 'listItem'; list: string; index: Expr }
  | { op: 'listLength'; list: string }
  | { op: 'listContains'; list: string; value: Expr }
  | { op: 'property'; target: Target; property: Property }
  | { op: 'held'; action: ActionName }
  | { op: 'inputAxis'; axis: Axis }
  | { op: 'score' }
  | { op: 'lives' }
  | { op: 'time' }
  | { op: 'distance'; target: Target }
  | { op: 'directionTo'; target: Target; axis: Axis }
  | { op: 'touching'; tag: string }
  | { op: 'count'; tag: string }
  | { op: 'call'; function: string; args?: Expr[] };

interface Xyz {
  x: Expr;
  y: Expr;
  z?: Expr;
}

export type StmtOp =
  | { op: 'if'; condition: Expr; then: Stmt[]; otherwise?: Stmt[] }
  | { op: 'repeat'; count: Expr; body: Stmt[] }
  | { op: 'while'; condition: Expr; body: Stmt[] }
  | { op: 'forever'; body: Stmt[] }
  | { op: 'forEach'; variable: string; list: string; body: Stmt[] }
  | { op: 'wait'; seconds: Expr }
  | { op: 'stop' }
  | { op: 'call'; function: string; args?: Expr[] }
  | { op: 'return'; value?: Expr }
  | { op: 'set'; variable: string; value: Expr }
  | { op: 'change'; variable: string; by: Expr }
  | { op: 'listAdd'; list: string; value: Expr }
  | { op: 'listRemove'; list: string; index: Expr }
  | { op: 'listSet'; list: string; index: Expr; value: Expr }
  | { op: 'listClear'; list: string }
  | ({ op: 'move' | 'setPosition' | 'setVelocity' | 'push'; target: Target } & Xyz)
  | { op: 'setVelocityAxis'; target: Target; axis: Axis; value: Expr }
  | { op: 'turn'; target: Target; degrees: Expr }
  | { op: 'setRotation'; target: Target; degrees: Expr }
  | ({ op: 'glideTo'; target: Target; seconds: Expr } & Xyz)
  | ({ op: 'setSize'; target: Target } & Xyz)
  | { op: 'show' | 'hide' | 'destroy' | 'cameraFollow'; target: Target }
  | { op: 'setColor'; target: Target; color: Expr }
  | { op: 'setText'; target: Target; text: Expr }
  | ({ op: 'spawn'; prefab: string } & Xyz)
  | { op: 'broadcast'; message: string }
  | { op: 'playSound'; sound: string }
  | { op: 'addScore'; amount: Expr }
  | { op: 'setScore'; value: Expr }
  | { op: 'loseLife'; amount: Expr }
  | { op: 'win' }
  | { op: 'lose' }
  | { op: 'cameraShake'; strength: Expr };

export type Stmt = StmtOp & { id?: string };

export type GameEvent =
  | { kind: 'start' | 'tick' | 'cloned' }
  | { kind: 'pressed' | 'released'; action: ActionName }
  | { kind: 'collide'; tag?: string | null }
  | { kind: 'timer'; seconds: number }
  | { kind: 'message'; name: string }
  | { kind: 'variableChanged'; name: string };

export interface Script {
  id?: string;
  event: GameEvent;
  body: Stmt[];
}

export interface FunctionDef {
  name: string;
  params?: string[];
  body: Stmt[];
}

export interface Entity {
  id: number;
  name: string;
  shape: Shape;
  position: Vec3;
  rotation?: number;
  size: Vec3;
  color: number;
  body?: BodyKind;
  sensor?: boolean;
  bounce?: number;
  friction?: number;
  tags?: string[];
  visible?: boolean;
  text?: string | null;
  group?: number | null;
  behaviors?: Behavior[];
  variables?: VariableDef[];
  scripts?: Script[];
}

export type SoundRecipe =
  'coin' | 'jump' | 'hit' | 'explosion' | 'powerUp' | 'laser' | 'click' | 'win' | 'lose';

export interface SoundDef {
  name: string;
  recipe: SoundRecipe;
  pitch?: number;
  volume?: number;
}

export type HudAnchor =
  'topLeft' | 'topCenter' | 'topRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';

export type HudKind =
  | { type: 'score' | 'timer' | 'lives' }
  | { type: 'variable'; name: string }
  | { type: 'text'; text: string };

export interface HudItem {
  kind: HudKind;
  anchor: HudAnchor;
  label?: string | null;
}

export interface WorldSettings {
  size: Vec3;
  gravity: number;
  background: number;
  camera?: CameraMode;
  timeLimitSeconds?: number | null;
  lives?: number | null;
}

export interface GameDocument {
  schemaVersion: number;
  dimension: Dimension;
  world: WorldSettings;
  entities: Entity[];
  prefabs?: Entity[];
  variables?: VariableDef[];
  lists?: ListDef[];
  functions?: FunctionDef[];
  scripts?: Script[];
  sounds?: SoundDef[];
  hud?: HudItem[];
}

// The engine numbers placed entities first, then prefabs; renderers look
// shapes up by that index.
export function archetypesOf(document: GameDocument): Entity[] {
  return [...document.entities, ...(document.prefabs ?? [])];
}

export function actionBit(action: ActionName): number {
  return 1 << ACTIONS.indexOf(action);
}
