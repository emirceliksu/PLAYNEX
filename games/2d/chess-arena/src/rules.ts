import type { Chess, Color } from 'chess.js';

export interface Verdict {
  winner: Color | null;
  reason: string;
}

// Same order and reason codes as `apps/realtime/src/matches/chess.rs`, so a
// local game and an online one end the same way and share result strings.
export function verdict(chess: Chess): Verdict | null {
  if (chess.isCheckmate()) return { winner: other(chess.turn()), reason: 'checkmate' };
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: 'fiftyMove' };
  return null;
}

export function timeoutVerdict(chess: Chess, flagged: Color): Verdict {
  return canMate(chess, other(flagged))
    ? { winner: other(flagged), reason: 'timeout' }
    : { winner: null, reason: 'timeoutInsufficient' };
}

export function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

// A lone king, or king and a single minor piece, can never deliver mate.
function canMate(chess: Chess, color: Color): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((square) => square?.color === color && square.type !== 'k');
  if (pieces.length === 0) return false;
  return !(pieces.length === 1 && (pieces[0]?.type === 'n' || pieces[0]?.type === 'b'));
}
