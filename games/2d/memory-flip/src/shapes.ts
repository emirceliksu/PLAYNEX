import Phaser from 'phaser';
import type { Shape } from './deck';

const OUTLINE_WIDTH = 2;

// Phaser 4 only accepts Vector2 instances for polygon paths.
function point(x: number, y: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(x, y);
}

// Every shape fits a 68px box centred on the origin so faces read at the same visual weight.
export function drawShape(
  graphics: Phaser.GameObjects.Graphics,
  shape: Shape,
  fill: number,
  outline: number,
): void {
  graphics.fillStyle(fill);
  graphics.lineStyle(OUTLINE_WIDTH, outline);

  switch (shape) {
    case 'circle':
      graphics.fillCircle(0, 0, 32);
      graphics.strokeCircle(0, 0, 32);
      return;
    case 'square':
      graphics.fillRoundedRect(-29, -29, 58, 58, 8);
      graphics.strokeRoundedRect(-29, -29, 58, 58, 8);
      return;
    case 'triangle':
      drawPolygon(graphics, [point(0, -33), point(34, 27), point(-34, 27)]);
      return;
    case 'diamond':
      drawPolygon(graphics, [point(0, -34), point(30, 0), point(0, 34), point(-30, 0)]);
      return;
    case 'ring':
      graphics.lineStyle(12, fill);
      graphics.strokeCircle(0, 0, 26);
      graphics.lineStyle(OUTLINE_WIDTH, outline);
      graphics.strokeCircle(0, 0, 33);
      graphics.strokeCircle(0, 0, 19);
      return;
    case 'cross':
      drawPolygon(graphics, [
        point(-11, -33),
        point(11, -33),
        point(11, -11),
        point(33, -11),
        point(33, 11),
        point(11, 11),
        point(11, 33),
        point(-11, 33),
        point(-11, 11),
        point(-33, 11),
        point(-33, -11),
        point(-11, -11),
      ]);
      return;
    case 'star':
      drawPolygon(graphics, [point(0, -34), point(30, 17), point(-30, 17)]);
      drawPolygon(graphics, [point(0, 34), point(30, -17), point(-30, -17)]);
      return;
    case 'hexagon':
      drawPolygon(graphics, regularPolygon(6, 33));
      return;
  }
}

function drawPolygon(graphics: Phaser.GameObjects.Graphics, points: Phaser.Math.Vector2[]): void {
  graphics.fillPoints(points, true);
  graphics.strokePoints(points, true, true);
}

function regularPolygon(sides: number, radius: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides;
    points.push(point(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}
