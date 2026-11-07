import type { Shape } from './document';

const ELLIPSE_SEGMENTS = 28;

const unitSquare: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

// Shapes in a -1..1 box with y up; the renderer scales them by the entity size.
export function localPoints(shape: Shape): [number, number][] {
  switch (shape.kind) {
    case 'triangle':
      return [
        [-1, -1],
        [1, -1],
        [0, 1],
      ];
    case 'circle':
    case 'sphere':
    case 'cylinder':
      return Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
        const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        return [round(Math.cos(angle)), round(Math.sin(angle))];
      });
    case 'star': {
      const count = shape.points * 2;
      return Array.from({ length: count }, (_, i) => {
        const angle = Math.PI / 2 + (i / count) * Math.PI * 2;
        const radius = i % 2 === 0 ? 1 : 0.45;
        return [round(Math.cos(angle) * radius), round(Math.sin(angle) * radius)];
      });
    }
    case 'polygon':
      return shape.points;
    default:
      return unitSquare;
  }
}

// Trigonometry can differ in the last bits between engines; rounded outlines
// render the same on the server and in the browser, so hydration agrees.
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
