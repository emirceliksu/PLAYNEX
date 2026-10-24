export const COLUMNS = 7;
export const ROWS = 6;

const WIN_LENGTH = 4;
const DIRECTIONS = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
] as const;

export type Player = 1 | 2;
// 0 marks an empty slot.
export type Slot = 0 | Player;

export interface Cell {
  row: number;
  col: number;
}

export type Outcome = { kind: 'win'; winner: Player; line: Cell[] } | { kind: 'draw' };

export interface MatchState {
  // Row-major, row 0 is the top of the standing board.
  slots: Slot[];
  current: Player;
  moves: number;
  outcome: Outcome | null;
}

export interface Drop {
  cell: Cell;
  player: Player;
  outcome: Outcome | null;
}

export function opponent(player: Player): Player {
  return player === 1 ? 2 : 1;
}

export function cellIndex(cell: Cell): number {
  return cell.row * COLUMNS + cell.col;
}

export function createMatchState(starting: Player): MatchState {
  return {
    slots: new Array<Slot>(COLUMNS * ROWS).fill(0),
    current: starting,
    moves: 0,
    outcome: null,
  };
}

export function landingRow(state: MatchState, col: number): number | null {
  if (col < 0 || col >= COLUMNS) return null;
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (state.slots[cellIndex({ row, col })] === 0) return row;
  }
  return null;
}

export function dropDisc(state: MatchState, col: number): Drop | null {
  if (state.outcome) return null;
  const row = landingRow(state, col);
  if (row === null) return null;

  const cell = { row, col };
  const player = state.current;
  state.slots[cellIndex(cell)] = player;
  state.moves += 1;

  const line = winningLine(state.slots, cell, player);
  if (line) {
    state.outcome = { kind: 'win', winner: player, line };
  } else if (state.moves === COLUMNS * ROWS) {
    state.outcome = { kind: 'draw' };
  } else {
    state.current = opponent(player);
  }

  return { cell, player, outcome: state.outcome };
}

// Only lines through the disc just dropped can be new, so the scan starts there.
function winningLine(slots: Slot[], from: Cell, player: Player): Cell[] | null {
  for (const direction of DIRECTIONS) {
    const line = [
      from,
      ...run(slots, from, direction, player),
      ...run(slots, from, negate(direction), player),
    ];
    if (line.length >= WIN_LENGTH) return line;
  }
  return null;
}

function run(slots: Slot[], from: Cell, step: Cell, player: Player): Cell[] {
  const cells: Cell[] = [];
  let row = from.row + step.row;
  let col = from.col + step.col;
  while (row >= 0 && row < ROWS && col >= 0 && col < COLUMNS) {
    if (slots[cellIndex({ row, col })] !== player) break;
    cells.push({ row, col });
    row += step.row;
    col += step.col;
  }
  return cells;
}

function negate(step: Cell): Cell {
  return { row: -step.row, col: -step.col };
}
