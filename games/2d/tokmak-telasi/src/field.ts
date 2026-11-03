import type { Rng } from '@playnex/game-kit';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type TargetKind = 'mouse' | 'quick' | 'hedgehog';

export const STEP_MS = 1000 / 60;
export const ROUND_MS = 60_000;
export const START_LIVES = 3;
export const HEDGEHOG_PENALTY = 20;

const POINTS: Record<Exclude<TargetKind, 'hedgehog'>, number> = { mouse: 10, quick: 25 };
// Every HALF_LIFE_MS the targets stay up half as long, so the last seconds of a round are
// four times as fast as the first.
const HALF_LIFE_MS = 30_000;
const MIN_UP_MS = 300;
const MIN_SPAWN_MS = 170;
const QUICK_UP_SCALE = 0.6;
const COMBO_STEP = 5;
const MAX_MULTIPLIER = 3;

interface Tuning {
  size: number;
  upMs: number;
  spawnMs: number;
}

const tuning: Record<Difficulty, Tuning> = {
  easy: { size: 3, upMs: 1400, spawnMs: 950 },
  normal: { size: 4, upMs: 1200, spawnMs: 760 },
  hard: { size: 4, upMs: 980, spawnMs: 600 },
};

export interface Target {
  kind: TargetKind;
  lifeMs: number;
  remainingMs: number;
}

export interface FieldState {
  difficulty: Difficulty;
  size: number;
  holes: (Target | null)[];
  elapsedMs: number;
  spawnInMs: number;
  score: number;
  lives: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  escaped: number;
  hedgehogHits: number;
  over: boolean;
}

export type FieldEvent =
  | { type: 'spawn'; hole: number; kind: TargetKind }
  | { type: 'escape'; hole: number; kind: TargetKind }
  | { type: 'timeup' };

export type WhackResult =
  | { type: 'hit'; hole: number; kind: TargetKind; points: number; multiplier: number }
  | { type: 'hedgehog'; hole: number }
  | { type: 'miss'; hole: number };

export function createField(difficulty: Difficulty): FieldState {
  const { size, spawnMs } = tuning[difficulty];
  return {
    difficulty,
    size,
    holes: Array.from({ length: size * size }, () => null),
    elapsedMs: 0,
    spawnInMs: spawnMs / 2,
    score: 0,
    lives: START_LIVES,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
    escaped: 0,
    hedgehogHits: 0,
    over: false,
  };
}

export function speedFactor(elapsedMs: number): number {
  return 0.5 ** (elapsedMs / HALF_LIFE_MS);
}

export function remainingMs(state: FieldState): number {
  return Math.max(0, ROUND_MS - state.elapsedMs);
}

export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP) * 0.5);
}

// Hedgehogs get more common as the round speeds up, so fast clicking alone stops paying off.
function pickKind(elapsedMs: number, rng: Rng): TargetKind {
  const roll = rng();
  const hedgehogChance = 0.1 + 0.12 * (elapsedMs / ROUND_MS);
  if (roll < hedgehogChance) return 'hedgehog';
  return roll < hedgehogChance + 0.2 ? 'quick' : 'mouse';
}

function spawn(state: FieldState, rng: Rng, events: FieldEvent[]): void {
  const free = state.holes.flatMap((target, hole) => (target ? [] : [hole]));
  if (free.length === 0) return;
  const hole = free[Math.floor(rng() * free.length)] ?? 0;
  const kind = pickKind(state.elapsedMs, rng);
  const base = Math.max(MIN_UP_MS, tuning[state.difficulty].upMs * speedFactor(state.elapsedMs));
  const lifeMs = kind === 'quick' ? Math.max(MIN_UP_MS, base * QUICK_UP_SCALE) : base;
  state.holes[hole] = { kind, lifeMs, remainingMs: lifeMs };
  events.push({ type: 'spawn', hole, kind });
}

export function step(state: FieldState, rng: Rng): FieldEvent[] {
  const events: FieldEvent[] = [];
  if (state.over) return events;

  state.elapsedMs += STEP_MS;
  state.holes.forEach((target, hole) => {
    if (!target) return;
    target.remainingMs -= STEP_MS;
    if (target.remainingMs > 0) return;
    state.holes[hole] = null;
    if (target.kind !== 'hedgehog') {
      state.escaped += 1;
      state.combo = 0;
    }
    events.push({ type: 'escape', hole, kind: target.kind });
  });

  state.spawnInMs -= STEP_MS;
  if (state.spawnInMs <= 0) {
    const factor = speedFactor(state.elapsedMs);
    spawn(state, rng, events);
    if (factor < 0.6 && rng() < 0.35) spawn(state, rng, events);
    state.spawnInMs = Math.max(MIN_SPAWN_MS, tuning[state.difficulty].spawnMs * factor);
  }

  if (state.elapsedMs >= ROUND_MS) {
    state.over = true;
    events.push({ type: 'timeup' });
  }
  return events;
}

export function whack(state: FieldState, hole: number): WhackResult {
  const target = state.holes[hole];
  if (!target) {
    state.misses += 1;
    state.combo = 0;
    return { type: 'miss', hole };
  }

  state.holes[hole] = null;
  if (target.kind === 'hedgehog') {
    state.hedgehogHits += 1;
    state.combo = 0;
    state.score = Math.max(0, state.score - HEDGEHOG_PENALTY);
    state.lives -= 1;
    if (state.lives <= 0) state.over = true;
    return { type: 'hedgehog', hole };
  }

  state.hits += 1;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const multiplier = multiplierFor(state.combo);
  const points = Math.round(POINTS[target.kind] * multiplier);
  state.score += points;
  return { type: 'hit', hole, kind: target.kind, points, multiplier };
}

// How far the target has risen out of its hole, 0..1, for drawing.
export function riseOf(target: Target): number {
  const shown = target.lifeMs - target.remainingMs;
  const edge = Math.min(120, target.lifeMs / 4);
  return Math.min(1, shown / edge, target.remainingMs / edge);
}
