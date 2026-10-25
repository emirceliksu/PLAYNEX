import type Phaser from 'phaser';
import type { PieceSymbol } from 'chess.js';

type Shape =
  { kind: 'poly'; points: number[] } | { kind: 'circle'; x: number; y: number; r: number };

const BASE: Shape = { kind: 'poly', points: [24, 78, 76, 78, 76, 90, 24, 90] };

// Silhouettes on a 100x100 grid, drawn flat with an outline like every other
// PLAYNEX game piece; no glyph fonts are involved, so they look the same everywhere.
const SHAPES: Record<PieceSymbol, Shape[]> = {
  p: [
    { kind: 'poly', points: [40, 46, 60, 46, 68, 78, 32, 78] },
    { kind: 'circle', x: 50, y: 34, r: 13 },
    BASE,
  ],
  r: [
    { kind: 'poly', points: [33, 40, 67, 40, 70, 78, 30, 78] },
    {
      kind: 'poly',
      points: [
        28, 20, 38, 20, 38, 28, 45, 28, 45, 20, 55, 20, 55, 28, 62, 28, 62, 20, 72, 20, 72, 40, 28,
        40,
      ],
    },
    BASE,
  ],
  n: [
    {
      kind: 'poly',
      points: [
        30, 78, 70, 78, 68, 62, 64, 44, 58, 26, 48, 16, 44, 22, 34, 28, 24, 46, 28, 54, 38, 50, 46,
        46, 40, 60,
      ],
    },
    BASE,
  ],
  b: [
    { kind: 'poly', points: [50, 20, 64, 40, 61, 60, 39, 60, 36, 40] },
    { kind: 'circle', x: 50, y: 17, r: 6 },
    { kind: 'poly', points: [36, 60, 64, 60, 64, 67, 36, 67] },
    { kind: 'poly', points: [40, 67, 60, 67, 66, 78, 34, 78] },
    BASE,
  ],
  q: [
    {
      kind: 'poly',
      points: [22, 32, 34, 56, 40, 26, 50, 52, 60, 26, 66, 56, 78, 32, 70, 70, 30, 70],
    },
    { kind: 'poly', points: [30, 70, 70, 70, 72, 78, 28, 78] },
    BASE,
  ],
  k: [
    {
      kind: 'poly',
      points: [
        46, 6, 54, 6, 54, 13, 60, 13, 60, 20, 54, 20, 54, 28, 46, 28, 46, 20, 40, 20, 40, 13, 46,
        13,
      ],
    },
    { kind: 'poly', points: [32, 30, 68, 30, 72, 70, 28, 70] },
    { kind: 'poly', points: [28, 70, 72, 70, 72, 78, 28, 78] },
    BASE,
  ],
};

export function drawPiece(
  g: Phaser.GameObjects.Graphics,
  type: PieceSymbol,
  x: number,
  y: number,
  size: number,
  fill: number,
  outline: number,
): void {
  const scale = size / 100;
  g.fillStyle(fill);
  g.lineStyle(2, outline);
  for (const shape of SHAPES[type]) {
    if (shape.kind === 'circle') {
      g.fillCircle(x + shape.x * scale, y + shape.y * scale, shape.r * scale);
      g.strokeCircle(x + shape.x * scale, y + shape.y * scale, shape.r * scale);
      continue;
    }
    g.beginPath();
    for (let i = 0; i < shape.points.length; i += 2) {
      const px = x + (shape.points[i] ?? 0) * scale;
      const py = y + (shape.points[i + 1] ?? 0) * scale;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
