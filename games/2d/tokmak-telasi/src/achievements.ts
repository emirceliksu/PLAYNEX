import type { Achievement } from '@playnex/game-kit';

import type { FieldState } from './field';

const CLEAN_RUN_MIN_HITS = 40;

export const achievements: Achievement[] = [
  'first_hit',
  'combo_10',
  'combo_25',
  'score_800',
  'score_2000',
  'clean_run',
  'daily',
].map((id) => ({ id, titleKey: `achievement_${id}`, descriptionKey: `achievement_${id}_hint` }));

export function earnedInPlay(state: FieldState): string[] {
  const earned: string[] = [];
  if (state.hits >= 1) earned.push('first_hit');
  if (state.bestCombo >= 10) earned.push('combo_10');
  if (state.bestCombo >= 25) earned.push('combo_25');
  if (state.score >= 800) earned.push('score_800');
  if (state.score >= 2000) earned.push('score_2000');
  return earned;
}

// Only a round that ran out of time counts; losing every life is not a finished round.
export function earnedAtEnd(state: FieldState, daily: boolean): string[] {
  if (state.lives <= 0) return [];
  const earned: string[] = [];
  if (state.hedgehogHits === 0 && state.hits >= CLEAN_RUN_MIN_HITS) earned.push('clean_run');
  if (daily) earned.push('daily');
  return earned;
}
