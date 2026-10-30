import { beforeEach, describe, expect, it, vi } from 'vitest';

import { detectSwipe, joystickVector } from './input';
import { levelUnlocked, ProgressStore } from './progress';
import { InputRecorder, replay } from './recorder';
import { createRng, dailySeed, shuffle } from './rng';

describe('rng', () => {
  it('repeats a sequence from the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('shuffles without losing items or touching the input', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = shuffle(createRng(9), items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('dailySeed', () => {
  const day = new Date('2026-10-30T10:00:00Z');

  it('is the same all day and differs per game and per day', () => {
    expect(dailySeed('x', day)).toBe(dailySeed('x', new Date('2026-10-30T23:59:00Z')));
    expect(dailySeed('x', day)).not.toBe(dailySeed('y', day));
    expect(dailySeed('x', day)).not.toBe(dailySeed('x', new Date('2026-10-31T00:00:00Z')));
  });
});

describe('recorder', () => {
  it('replays a run to the same state', () => {
    const recorder = new InputRecorder<number>(7);
    recorder.record(1, 2);
    recorder.record(5, 3);
    const run = recorder.finish();
    expect(run.seed).toBe(7);
    expect(replay(run, 0, (total, input, frame) => total + input * frame)).toBe(17);
  });
});

describe('input helpers', () => {
  it('ignores a short drag and picks the dominant axis', () => {
    expect(detectSwipe({ x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
    expect(detectSwipe({ x: 0, y: 0 }, { x: 40, y: 10 })).toBe('right');
    expect(detectSwipe({ x: 0, y: 0 }, { x: 10, y: -40 })).toBe('up');
  });

  it('clamps the joystick to the unit circle', () => {
    const { x, y } = joystickVector({ x: 0, y: 0 }, { x: 300, y: 400 }, 50);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
  });
});

describe('progress', () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
  });

  it('keeps the best stars and survives a reload', () => {
    const store = new ProgressStore('g');
    store.setStars('1', 3);
    store.setStars('1', 1);
    expect(new ProgressStore('g').progress.stars['1']).toBe(3);
  });

  it('reports an achievement only once', () => {
    const store = new ProgressStore('g');
    expect(store.unlock('first')).toBe(true);
    expect(store.unlock('first')).toBe(false);
  });

  it('keeps working when storage refuses writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    const store = new ProgressStore('g');
    store.setStars('1', 2);
    expect(store.progress.stars['1']).toBe(2);
  });

  it('unlocks a level once the previous one has stars', () => {
    const progress = { tutorialSeen: false, stars: { a: 1 }, achievements: [], dailyPlayed: null };
    expect(levelUnlocked(progress, ['a', 'b', 'c'], 'a')).toBe(true);
    expect(levelUnlocked(progress, ['a', 'b', 'c'], 'b')).toBe(true);
    expect(levelUnlocked(progress, ['a', 'b', 'c'], 'c')).toBe(false);
  });
});
