export const SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'ring',
  'cross',
  'star',
  'hexagon',
] as const;

export type Shape = (typeof SHAPES)[number];
export type Rng = () => number;

export const PAIR_COUNT = SHAPES.length;
export const CARD_COUNT = PAIR_COUNT * 2;

const BASE_SCORE = 1000;
const PAIR_BONUS = 100;
const MISMATCH_PENALTY = 25;
const MIN_SCORE = 100;

export interface MatchState {
  cards: Shape[];
  matched: boolean[];
  openCard: number | null;
  pairsMatched: number;
  moves: number;
  mismatches: number;
}

export type FlipOutcome =
  | { kind: 'ignored' }
  | { kind: 'opened' }
  | { kind: 'matched'; pair: [number, number] }
  | { kind: 'mismatched'; pair: [number, number] };

export function createMatchState(rng: Rng): MatchState {
  const cards = shuffle([...SHAPES, ...SHAPES], rng);
  return {
    cards,
    matched: cards.map(() => false),
    openCard: null,
    pairsMatched: 0,
    moves: 0,
    mismatches: 0,
  };
}

export function flipCard(state: MatchState, index: number): FlipOutcome {
  const shape = state.cards[index];
  if (shape === undefined || state.matched[index] || state.openCard === index) {
    return { kind: 'ignored' };
  }
  if (state.openCard === null) {
    state.openCard = index;
    return { kind: 'opened' };
  }

  const first = state.openCard;
  state.openCard = null;
  state.moves += 1;

  if (state.cards[first] === shape) {
    state.matched[first] = true;
    state.matched[index] = true;
    state.pairsMatched += 1;
    return { kind: 'matched', pair: [first, index] };
  }

  state.mismatches += 1;
  return { kind: 'mismatched', pair: [first, index] };
}

export function isComplete(state: MatchState): boolean {
  return state.pairsMatched === PAIR_COUNT;
}

export function computeScore(state: MatchState, elapsedSeconds: number): number {
  const score =
    BASE_SCORE +
    state.pairsMatched * PAIR_BONUS -
    state.mismatches * MISMATCH_PENALTY -
    elapsedSeconds;
  return Math.max(MIN_SCORE, score);
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const pool = [...items];
  const shuffled: T[] = [];
  while (pool.length > 0) {
    shuffled.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return shuffled;
}
