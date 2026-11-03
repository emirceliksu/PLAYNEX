import { createRng } from '@playnex/game-kit';
import { describe, expect, it } from 'vitest';

import {
  createField,
  multiplierFor,
  ROUND_MS,
  speedFactor,
  step,
  STEP_MS,
  whack,
  type FieldEvent,
  type FieldState,
} from './field';

function runUntil(state: FieldState, seed: number, done: (events: FieldEvent[]) => boolean) {
  const rng = createRng(seed);
  for (let frame = 0; frame < (ROUND_MS / STEP_MS) * 2; frame += 1) {
    if (done(step(state, rng))) return;
  }
  throw new Error('condition never met');
}

describe('field', () => {
  it('sizes the field by difficulty', () => {
    expect(createField('easy').holes).toHaveLength(9);
    expect(createField('hard').holes).toHaveLength(16);
  });

  it('speeds up exponentially', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(30_000)).toBeCloseTo(0.5);
    expect(speedFactor(60_000)).toBeCloseTo(0.25);
  });

  it('plays the same round from the same seed', () => {
    const a = createField('normal');
    const b = createField('normal');
    const rngA = createRng(7);
    const rngB = createRng(7);
    for (let frame = 0; frame < 600; frame += 1) {
      expect(step(a, rngA)).toEqual(step(b, rngB));
    }
  });

  it('ends after the round time', () => {
    const state = createField('easy');
    runUntil(state, 3, (events) => events.some((event) => event.type === 'timeup'));
    expect(state.over).toBe(true);
    expect(state.elapsedMs).toBeGreaterThanOrEqual(ROUND_MS);
  });

  it('scores hits and grows the combo multiplier', () => {
    const state = createField('easy');
    state.holes[0] = { kind: 'mouse', lifeMs: 1000, remainingMs: 1000 };
    expect(whack(state, 0)).toMatchObject({ type: 'hit', points: 10, multiplier: 1 });
    state.combo = 4;
    state.holes[1] = { kind: 'quick', lifeMs: 600, remainingMs: 600 };
    expect(whack(state, 1)).toMatchObject({ type: 'hit', points: 38, multiplier: 1.5 });
    expect(multiplierFor(100)).toBe(3);
  });

  it('breaks the combo on an empty hole', () => {
    const state = createField('easy');
    state.combo = 6;
    expect(whack(state, 4).type).toBe('miss');
    expect(state.combo).toBe(0);
  });

  it('costs a life and points for a hedgehog and ends the run on the last life', () => {
    const state = createField('easy');
    state.score = 10;
    for (let life = 0; life < 3; life += 1) {
      state.holes[2] = { kind: 'hedgehog', lifeMs: 800, remainingMs: 800 };
      whack(state, 2);
    }
    expect(state.score).toBe(0);
    expect(state.lives).toBe(0);
    expect(state.over).toBe(true);
  });

  it('counts escaped mice but lets hedgehogs leave freely', () => {
    const state = createField('easy');
    state.spawnInMs = Number.POSITIVE_INFINITY;
    state.combo = 3;
    state.holes[0] = { kind: 'hedgehog', lifeMs: STEP_MS, remainingMs: STEP_MS };
    step(state, createRng(1));
    expect(state.combo).toBe(3);
    state.holes[1] = { kind: 'mouse', lifeMs: STEP_MS, remainingMs: STEP_MS };
    step(state, createRng(1));
    expect(state.escaped).toBe(1);
    expect(state.combo).toBe(0);
  });
});
