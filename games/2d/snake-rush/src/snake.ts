export const GRID_SIZE = 20;
export const APPLE_POINTS = 10;
export const BONUS_POINTS = 50;
export const BONUS_EVERY = 5;
export const BONUS_LIFETIME_MS = 5000;
export const START_STEP_MS = 140;
export const MIN_STEP_MS = 70;

const SPEED_UP_EVERY = 5;
const SPEED_UP_MS = 10;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Rng = () => number;
export type StepOutcome = 'moved' | 'apple' | 'bonus' | 'died';

export interface Cell {
  x: number;
  y: number;
}

export const DIRECTION_DELTAS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITES: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export interface SnakeState {
  // Head first. Non-empty by construction so the head never needs a guard.
  segments: [Cell, ...Cell[]];
  direction: Direction;
  pendingDirections: Direction[];
  apple: Cell | null;
  bonus: Cell | null;
  apples: number;
  score: number;
}

export function createSnakeState(rng: Rng): SnakeState {
  const mid = GRID_SIZE / 2;
  const segments: [Cell, ...Cell[]] = [
    { x: mid, y: mid - 1 },
    { x: mid - 1, y: mid - 1 },
    { x: mid - 1, y: mid },
  ];
  return {
    segments,
    direction: 'right',
    pendingDirections: [],
    apple: randomFreeCell(segments, rng),
    bonus: null,
    apples: 0,
    score: 0,
  };
}

// Up to two turns are buffered so a quick double tap between ticks is not lost.
export function queueDirection(state: SnakeState, direction: Direction): void {
  const current = state.pendingDirections.at(-1) ?? state.direction;
  if (
    direction === current ||
    direction === OPPOSITES[current] ||
    state.pendingDirections.length >= 2
  ) {
    return;
  }
  state.pendingDirections.push(direction);
}

export function stepIntervalMs(apples: number): number {
  return Math.max(MIN_STEP_MS, START_STEP_MS - Math.floor(apples / SPEED_UP_EVERY) * SPEED_UP_MS);
}

export function advance(state: SnakeState, rng: Rng): StepOutcome {
  const queued = state.pendingDirections.shift();
  if (queued) {
    state.direction = queued;
  }

  const delta = DIRECTION_DELTAS[state.direction];
  const [head] = state.segments;
  const target: Cell = { x: head.x + delta.x, y: head.y + delta.y };

  if (target.x < 0 || target.y < 0 || target.x >= GRID_SIZE || target.y >= GRID_SIZE) {
    return 'died';
  }

  const eatsApple = sameCell(target, state.apple);
  const eatsBonus = sameCell(target, state.bonus);
  // The tail cell frees up this tick unless the snake grows into it.
  const body = eatsApple ? state.segments : state.segments.slice(0, -1);
  if (body.some((segment) => sameCell(segment, target))) {
    return 'died';
  }

  state.segments.unshift(target);
  if (!eatsApple) {
    state.segments.pop();
  }

  if (eatsBonus) {
    state.bonus = null;
    state.score += BONUS_POINTS;
    return 'bonus';
  }

  if (eatsApple) {
    state.apples += 1;
    state.score += APPLE_POINTS;
    state.apple = randomFreeCell(occupiedCells(state), rng);
    if (state.apples % BONUS_EVERY === 0) {
      state.bonus = randomFreeCell(occupiedCells(state), rng);
    }
    return 'apple';
  }

  return 'moved';
}

function occupiedCells(state: SnakeState): Cell[] {
  const cells: Cell[] = [...state.segments];
  if (state.apple) cells.push(state.apple);
  if (state.bonus) cells.push(state.bonus);
  return cells;
}

function sameCell(a: Cell, b: Cell | null): boolean {
  return b !== null && a.x === b.x && a.y === b.y;
}

function randomFreeCell(occupied: Cell[], rng: Rng): Cell | null {
  const taken = new Set(occupied.map((cell) => cell.y * GRID_SIZE + cell.x));
  const free: Cell[] = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!taken.has(y * GRID_SIZE + x)) {
        free.push({ x, y });
      }
    }
  }
  return free[Math.floor(rng() * free.length)] ?? null;
}
