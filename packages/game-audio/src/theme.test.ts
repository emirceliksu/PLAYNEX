import { describe, expect, it } from 'vitest';

import { recipes } from './recipes';
import { composeTheme, degreeToHz, menuTheme, REST, scales, type ScaleName } from './theme';

describe('composeTheme', () => {
  it('is reproducible from the seed', () => {
    expect(composeTheme({ seed: 7, mood: 'tense' })).toEqual(
      composeTheme({ seed: 7, mood: 'tense' }),
    );
  });

  it('gives different games different music', () => {
    const themes = [1, 2, 3, 4, 5].map((seed) =>
      JSON.stringify(composeTheme({ seed, mood: 'bright' })),
    );
    expect(new Set(themes).size).toBe(themes.length);
  });

  it('honours a requested scale', () => {
    expect(composeTheme({ seed: 3, mood: 'bright', scale: 'hicaz' }).scale).toBe('hicaz');
  });

  it('only uses degrees the scale can resolve', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const theme = composeTheme({ seed, mood: 'tense' });
      for (const degree of [...theme.bass, ...theme.lead]) {
        if (degree === REST) continue;
        expect(Number.isFinite(degreeToHz(theme, degree))).toBe(true);
      }
    }
  });
});

describe('degreeToHz', () => {
  it('wraps a degree past the scale into the next octave', () => {
    const theme = { scale: 'minor' as ScaleName, rootHz: 55 };
    expect(degreeToHz(theme, scales.minor.length)).toBeCloseTo(110);
  });

  it('plays the uşşak quarter tone', () => {
    const theme = { scale: 'ussak' as ScaleName, rootHz: 100 };
    expect(degreeToHz(theme, 1)).toBeCloseTo(100 * 2 ** (1.5 / 12));
  });
});

describe('menuTheme', () => {
  it('keeps the key and removes the drums', () => {
    const theme = composeTheme({ seed: 11, mood: 'tense' });
    const menu = menuTheme(theme);
    expect(menu.scale).toBe(theme.scale);
    expect(menu.tempo).toBeLessThan(theme.tempo);
    expect(menu.kick.some(Boolean)).toBe(false);
  });
});

describe('recipes', () => {
  it('covers the planned set', () => {
    expect(Object.keys(recipes).length).toBeGreaterThanOrEqual(30);
  });

  it('never ends an envelope at zero length', () => {
    for (const recipe of Object.values(recipes)) {
      for (const layer of recipe) expect(layer.length).toBeGreaterThan(0);
    }
  });
});
