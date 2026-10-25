import { Chess, type Move, type PieceSymbol } from 'chess.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
}

interface Profile {
  maxDepth: number;
  budgetMs: number;
  // Root moves within this many centipawns of the best are treated as equal
  // and one is picked at random; larger values make weaker, less predictable play.
  slack: number;
}

const profiles: Record<Difficulty, Profile> = {
  easy: { maxDepth: 1, budgetMs: 300, slack: 140 },
  normal: { maxDepth: 2, budgetMs: 900, slack: 25 },
  hard: { maxDepth: 4, budgetMs: 2_500, slack: 0 },
};

const VALUES: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;
const QUIESCENCE_DEPTH = 3;

// Piece-square tables from white's side, a8 first (the order of `Chess.board()`).
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
};

class OutOfTime extends Error {}

export function bestMove(
  fen: string,
  difficulty: Difficulty,
  random: () => number = Math.random,
): EngineMove | null {
  const profile = profiles[difficulty];
  const chess = new Chess(fen);
  const deadline = performance.now() + profile.budgetMs;
  const roots = ordered(chess.moves({ verbose: true }));
  if (roots.length === 0) return null;

  let scored = roots.map((move) => ({ move, score: 0 }));
  for (let depth = 1; depth <= profile.maxDepth; depth += 1) {
    try {
      const next = roots.map((move) => {
        chess.move(move);
        const score = -search(chess, depth - 1, -MATE, MATE, 1, deadline);
        chess.undo();
        return { move, score };
      });
      scored = next;
    } catch (error) {
      if (error instanceof OutOfTime) break;
      throw error;
    }
  }

  const top = Math.max(...scored.map((entry) => entry.score));
  const candidates = scored.filter((entry) => entry.score >= top - profile.slack);
  const pick = candidates[Math.floor(random() * candidates.length)] ?? scored[0];
  if (!pick) return null;
  return { from: pick.move.from, to: pick.move.to, promotion: pick.move.promotion };
}

function search(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  deadline: number,
): number {
  if (performance.now() > deadline) throw new OutOfTime();
  if (depth === 0) return quiesce(chess, alpha, beta, QUIESCENCE_DEPTH);

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return chess.inCheck() ? -MATE + ply : 0;
  if (chess.isDraw()) return 0;

  let best = -MATE;
  for (const move of ordered(moves)) {
    chess.move(move);
    const score = -search(chess, depth - 1, -beta, -alpha, ply + 1, deadline);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

// Captures only, so the search does not stop in the middle of an exchange.
function quiesce(chess: Chess, alpha: number, beta: number, depth: number): number {
  const standPat = evaluate(chess);
  if (depth === 0 || standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;

  const captures = ordered(chess.moves({ verbose: true }).filter((move) => move.captured));
  for (const move of captures) {
    chess.move(move);
    const score = -quiesce(chess, -beta, -alpha, depth - 1);
    chess.undo();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Most valuable victim first, cheapest attacker first; promotions lead.
function ordered(moves: Move[]): Move[] {
  const weight = (move: Move) =>
    (move.promotion ? VALUES[move.promotion] * 10 : 0) +
    (move.captured ? VALUES[move.captured] * 10 - VALUES[move.piece] : 0);
  return moves.sort((a, b) => weight(b) - weight(a));
}

// Score from the side to move.
export function evaluate(chess: Chess): number {
  let score = 0;
  chess.board().forEach((rank, row) => {
    rank.forEach((square, col) => {
      if (!square) return;
      const index = square.color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
      const value = VALUES[square.type] + (PST[square.type][index] ?? 0);
      score += square.color === 'w' ? value : -value;
    });
  });
  return chess.turn() === 'w' ? score : -score;
}
