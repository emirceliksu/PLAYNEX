import type { GameDocument, Shape } from '@playnex/creator-runtime';
import { localPoints } from '@playnex/creator-runtime/shapes';
import type { SceneShape } from '@playnex/ui';

import type { Cover } from '@/features/creator/types';

import { swatchHex } from './swatches';

const hexagon: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
});

// Shape codes from crates/creator-engine (Shape::code). 3D scenes arrive seen
// from above, so round solids become circles and boxes squares.
const coverShapes: Shape[] = [
  { kind: 'rect' },
  { kind: 'circle' },
  { kind: 'circle' },
  { kind: 'circle' },
  { kind: 'rect' },
  { kind: 'rect' },
  { kind: 'circle' },
  { kind: 'triangle' },
  { kind: 'star', points: 5 },
  { kind: 'polygon', points: hexagon },
  { kind: 'rect' },
];

export function sceneShapes(cover: Cover): SceneShape[] {
  return cover.items.map(([code, color, x, y, width, height, rotation]) => {
    const shape = coverShapes[code] ?? { kind: 'rect' };
    const angle = (rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const h = code === 10 ? height * 0.3 : height;
    return {
      points: localPoints(shape).map(([u, v]) => {
        const px = (u * width) / 2;
        const py = (v * h) / 2;
        return [round(x + px * cos - py * sin), round(y + px * sin + py * cos)] as [number, number];
      }),
      fill: swatchHex[color] ?? swatchHex[0]!,
    };
  });
}

export function coverBackground(cover: Cover): string {
  return swatchHex[cover.background] ?? swatchHex[5]!;
}

const shapeCodes: Record<Shape['kind'], number> = {
  box: 0,
  sphere: 1,
  cylinder: 2,
  cone: 3,
  ramp: 4,
  rect: 5,
  circle: 6,
  triangle: 7,
  star: 8,
  polygon: 9,
  text: 10,
};

// Same projection the API stores at publish time (apps/api/src/creator/publish.rs),
// for drafts and templates that have no release yet.
export function documentCover(document: GameDocument): Cover {
  const flat = document.dimension === '2d';
  const visible = document.entities.filter((entity) => entity.visible !== false);
  if (!flat) visible.sort((a, b) => a.position.y - b.position.y);
  return {
    width: document.world.size.x,
    height: flat ? document.world.size.y : (document.world.size.z ?? document.world.size.x),
    background: document.world.background,
    items: visible
      .slice(0, 240)
      .map((entity) => [
        shapeCodes[entity.shape.kind],
        entity.color,
        entity.position.x,
        flat ? entity.position.y : (entity.position.z ?? 0),
        entity.size.x,
        flat ? entity.size.y : (entity.size.z ?? 1),
        entity.rotation ?? 0,
      ]),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
