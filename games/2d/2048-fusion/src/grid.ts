export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const TARGET_TILE = 2048;

const FOUR_SPAWN_CHANCE = 0.1;

// Row-major, 0 marks an empty cell.
export type Grid = number[];
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Rng = () => number;

export interface Cell {
  row: number;
  col: number;
}

export interface TileSlide {
  from: Cell;
  to: Cell;
  // A sliding tile that merges into the one already at `to` and disappears.
  vanishes: boolean;
}

export interface MoveResult {
  grid: Grid;
  slides: TileSlide[];
  merges: Cell[];
  gained: number;
  changed: boolean;
}

export function cellIndex(cell: Cell): number {
  return cell.row * GRID_SIZE + cell.col;
}

export function cellFromIndex(index: number): Cell {
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

export function tileAt(grid: Grid, cell: Cell): number {
  return grid[cellIndex(cell)] ?? 0;
}

export function createGrid(rng: Rng): Grid {
  const grid = new Array<number>(CELL_COUNT).fill(0);
  spawnTile(grid, rng);
  spawnTile(grid, rng);
  return grid;
}

export function spawnTile(grid: Grid, rng: Rng): Cell | null {
  const empty: number[] = [];
  grid.forEach((value, index) => {
    if (value === 0) empty.push(index);
  });
  const index = empty[Math.floor(rng() * empty.length)];
  if (index === undefined) return null;
  grid[index] = rng() < FOUR_SPAWN_CHANCE ? 4 : 2;
  return cellFromIndex(index);
}

// Position 0 is the wall the tiles slide toward.
function lineCell(direction: Direction, line: number, position: number): Cell {
  switch (direction) {
    case 'left':
      return { row: line, col: position };
    case 'right':
      return { row: line, col: GRID_SIZE - 1 - position };
    case 'up':
      return { row: position, col: line };
    case 'down':
      return { row: GRID_SIZE - 1 - position, col: line };
  }
}

export function applyMove(grid: Grid, direction: Direction): MoveResult {
  const next = new Array<number>(CELL_COUNT).fill(0);
  const slides: TileSlide[] = [];
  const merges: Cell[] = [];
  let gained = 0;
  let changed = false;

  for (let line = 0; line < GRID_SIZE; line += 1) {
    let filled = 0;
    let lastValue = 0;
    let lastMerged = false;

    for (let position = 0; position < GRID_SIZE; position += 1) {
      const from = lineCell(direction, line, position);
      const value = tileAt(grid, from);
      if (value === 0) continue;

      if (filled > 0 && !lastMerged && lastValue === value) {
        const to = lineCell(direction, line, filled - 1);
        next[cellIndex(to)] = value * 2;
        gained += value * 2;
        merges.push(to);
        slides.push({ from, to, vanishes: true });
        lastMerged = true;
        changed = true;
        continue;
      }

      const to = lineCell(direction, line, filled);
      next[cellIndex(to)] = value;
      slides.push({ from, to, vanishes: false });
      if (to.row !== from.row || to.col !== from.col) {
        changed = true;
      }
      filled += 1;
      lastValue = value;
      lastMerged = false;
    }
  }

  return { grid: next, slides, merges, gained, changed };
}

export function canMove(grid: Grid): boolean {
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const cell = cellFromIndex(index);
    const value = tileAt(grid, cell);
    if (value === 0) return true;
    if (cell.col < GRID_SIZE - 1 && tileAt(grid, { row: cell.row, col: cell.col + 1 }) === value) {
      return true;
    }
    if (cell.row < GRID_SIZE - 1 && tileAt(grid, { row: cell.row + 1, col: cell.col }) === value) {
      return true;
    }
  }
  return false;
}

export function maxTile(grid: Grid): number {
  return Math.max(0, ...grid);
}
