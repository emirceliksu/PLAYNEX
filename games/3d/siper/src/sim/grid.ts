import { cellHeight, type MapFile, rules } from './data';

// Mirrors `grid.rs`: a height field painted from rects, later rects over earlier ones.

const OUTSIDE = 1_000;

export interface Cell {
  x: number;
  z: number;
}

export type Vec3 = [number, number, number];

export class Grid {
  readonly id: string;
  readonly width: number;
  readonly depth: number;
  readonly cell = rules.cellSize;
  private readonly kinds: string[];
  private readonly heights: Float64Array;

  constructor(file: MapFile) {
    this.id = file.id;
    this.width = file.width;
    this.depth = file.height;
    this.kinds = Array.from({ length: file.width * file.height }, () => '.');
    for (const [kind, x, z, w, d] of file.rects) {
      for (let cz = z; cz < z + d; cz += 1) {
        for (let cx = x; cx < x + w; cx += 1) {
          if (cx >= 0 && cx < file.width && cz >= 0 && cz < file.height) {
            this.kinds[cz * file.width + cx] = kind;
          }
        }
      }
    }
    this.heights = Float64Array.from(this.kinds, cellHeight);
  }

  private index(x: number, z: number): number | null {
    return x >= 0 && x < this.width && z >= 0 && z < this.depth ? z * this.width + x : null;
  }

  height(x: number, z: number): number {
    const i = this.index(x, z);
    return i === null ? OUTSIDE : (this.heights[i] ?? OUTSIDE);
  }

  kind(x: number, z: number): string {
    const i = this.index(x, z);
    return i === null ? '#' : (this.kinds[i] ?? '#');
  }

  cellAt(x: number, z: number): Cell {
    return { x: Math.floor(x / this.cell), z: Math.floor(z / this.cell) };
  }

  support(x: number, z: number, radius: number): number {
    const min = this.cellAt(x - radius, z - radius);
    const max = this.cellAt(x + radius - 1e-9, z + radius - 1e-9);
    let top = -Infinity;
    for (let cz = min.z; cz <= max.z; cz += 1) {
      for (let cx = min.x; cx <= max.x; cx += 1) top = Math.max(top, this.height(cx, cz));
    }
    return top;
  }

  raycast(origin: Vec3, dir: Vec3, max: number): number | null {
    const cell = this.cellAt(origin[0], origin[2]);
    const stepX = dir[0] > 0 ? 1 : -1;
    const stepZ = dir[2] > 0 ? 1 : -1;
    const deltaX = Math.abs(dir[0]) < 1e-12 ? Infinity : this.cell / Math.abs(dir[0]);
    const deltaZ = Math.abs(dir[2]) < 1e-12 ? Infinity : this.cell / Math.abs(dir[2]);
    const boundary = (c: number, step: number, o: number, d: number) =>
      Math.abs(d) < 1e-12 ? Infinity : ((step > 0 ? c + 1 : c) * this.cell - o) / d;
    let nextX = boundary(cell.x, stepX, origin[0], dir[0]);
    let nextZ = boundary(cell.z, stepZ, origin[2], dir[2]);
    let t = 0;
    for (;;) {
      const exit = Math.min(nextX, nextZ, max);
      const top = this.height(cell.x, cell.z);
      if (origin[1] + dir[1] * t <= top) return t;
      if (origin[1] + dir[1] * exit <= top) return (top - origin[1]) / dir[1];
      if (exit >= max) return null;
      t = exit;
      if (nextX < nextZ) {
        cell.x += stepX;
        nextX += deltaX;
      } else {
        cell.z += stepZ;
        nextZ += deltaZ;
      }
    }
  }
}
