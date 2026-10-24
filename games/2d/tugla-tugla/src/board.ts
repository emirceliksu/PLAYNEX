export const GRID_SIZE = 8;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const TRAY_SIZE = 3;

const LINE_SCORE = 10;
const MULTI_LINE_BONUS = 5;

export type Rng = () => number;

export interface Cell {
  row: number;
  col: number;
}

export interface Shape {
  id: string;
  cells: Cell[];
  rows: number;
  cols: number;
}

// Row-major, true marks an occupied cell.
export type Grid = boolean[];

export interface PuzzleState {
  grid: Grid;
  tray: (Shape | null)[];
  score: number;
  piecesPlaced: number;
  linesCleared: number;
  maxCombo: number;
}

export interface Placement {
  cells: Cell[];
  cleared: Cell[];
  lines: number;
  gained: number;
  dealt: boolean;
}

function shape(id: string, rows: string[]): Shape {
  const cells: Cell[] = [];
  rows.forEach((pattern, row) => {
    for (let col = 0; col < pattern.length; col += 1) {
      if (pattern[col] === '#') cells.push({ row, col });
    }
  });
  return { id, cells, rows: rows.length, cols: rows[0]?.length ?? 0 };
}

export const SHAPES: readonly Shape[] = [
  shape('single', ['#']),
  shape('domino-h', ['##']),
  shape('domino-v', ['#', '#']),
  shape('line3-h', ['###']),
  shape('line3-v', ['#', '#', '#']),
  shape('line4-h', ['####']),
  shape('line4-v', ['#', '#', '#', '#']),
  shape('square', ['##', '##']),
  shape('corner', ['#.', '##']),
  shape('corner-flipped', ['.#', '##']),
  shape('hook', ['#..', '#..', '###']),
  shape('tee', ['###', '.#.']),
  shape('zig', ['##.', '.##']),
];

export function cellIndex(cell: Cell): number {
  return cell.row * GRID_SIZE + cell.col;
}

export function cellFromIndex(index: number): Cell {
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

export function createPuzzleState(rng: Rng): PuzzleState {
  return {
    grid: new Array<boolean>(CELL_COUNT).fill(false),
    tray: dealTray(rng),
    score: 0,
    piecesPlaced: 0,
    linesCleared: 0,
    maxCombo: 0,
  };
}

export function dealTray(rng: Rng): Shape[] {
  const tray: Shape[] = [];
  for (let slot = 0; slot < TRAY_SIZE; slot += 1) {
    const picked = SHAPES[Math.floor(rng() * SHAPES.length)];
    if (picked) tray.push(picked);
  }
  return tray;
}

export function footprint(piece: Shape, origin: Cell): Cell[] {
  return piece.cells.map((cell) => ({ row: origin.row + cell.row, col: origin.col + cell.col }));
}

export function canPlace(grid: Grid, piece: Shape, origin: Cell): boolean {
  if (origin.row < 0 || origin.col < 0) return false;
  if (origin.row + piece.rows > GRID_SIZE || origin.col + piece.cols > GRID_SIZE) return false;
  return footprint(piece, origin).every((cell) => !grid[cellIndex(cell)]);
}

export function fitsAnywhere(grid: Grid, piece: Shape): boolean {
  for (let row = 0; row <= GRID_SIZE - piece.rows; row += 1) {
    for (let col = 0; col <= GRID_SIZE - piece.cols; col += 1) {
      if (canPlace(grid, piece, { row, col })) return true;
    }
  }
  return false;
}

export function isStuck(state: PuzzleState): boolean {
  return state.tray.every((piece) => piece === null || !fitsAnywhere(state.grid, piece));
}

export function placePiece(
  state: PuzzleState,
  slot: number,
  origin: Cell,
  rng: Rng,
): Placement | null {
  const piece = state.tray[slot];
  if (!piece || !canPlace(state.grid, piece, origin)) return null;

  const cells = footprint(piece, origin);
  for (const cell of cells) {
    state.grid[cellIndex(cell)] = true;
  }
  state.tray[slot] = null;
  state.piecesPlaced += 1;

  const cleared = clearFullLines(state.grid);
  const lines = cleared.lines;
  const gained = cells.length + lines * LINE_SCORE + Math.max(0, lines - 1) * MULTI_LINE_BONUS;
  state.score += gained;
  state.linesCleared += lines;
  state.maxCombo = Math.max(state.maxCombo, lines);

  const dealt = state.tray.every((remaining) => remaining === null);
  if (dealt) {
    state.tray = dealTray(rng);
  }

  return { cells, cleared: cleared.cells, lines, gained, dealt };
}

// Rows and columns are evaluated on the same snapshot so a cross clears both at once.
function clearFullLines(grid: Grid): { cells: Cell[]; lines: number } {
  const fullRows: number[] = [];
  const fullCols: number[] = [];
  for (let line = 0; line < GRID_SIZE; line += 1) {
    let rowFull = true;
    let colFull = true;
    for (let other = 0; other < GRID_SIZE; other += 1) {
      if (!grid[cellIndex({ row: line, col: other })]) rowFull = false;
      if (!grid[cellIndex({ row: other, col: line })]) colFull = false;
    }
    if (rowFull) fullRows.push(line);
    if (colFull) fullCols.push(line);
  }

  const cleared = new Set<number>();
  for (const row of fullRows) {
    for (let col = 0; col < GRID_SIZE; col += 1) cleared.add(cellIndex({ row, col }));
  }
  for (const col of fullCols) {
    for (let row = 0; row < GRID_SIZE; row += 1) cleared.add(cellIndex({ row, col }));
  }
  for (const index of cleared) {
    grid[index] = false;
  }

  return {
    cells: [...cleared].map(cellFromIndex),
    lines: fullRows.length + fullCols.length,
  };
}
