import Phaser from 'phaser';
import { hexToColorNumber } from '@playnex/game-sdk';

import type { Shape } from './document';
import { localPoints } from './shapes';
import { F, UNITS_IN_FOLLOW_VIEW, type RenderSetup, type Renderer, type WorldView } from './view';

const PIXELS_PER_UNIT = 32;
const SHADOW_OFFSET = 3;
const OUTLINE = 2;

class StageScene extends Phaser.Scene {
  graphics!: Phaser.GameObjects.Graphics;

  constructor(private readonly onCreate: () => void) {
    super({ key: 'creator-stage' });
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.onCreate();
  }
}

export function createRenderer2d(container: HTMLElement, setup: RenderSetup): Promise<Renderer> {
  return new Promise((resolve, reject) => {
    const scene = new StageScene(() => resolve(new Renderer2d(game, scene, setup)));
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: setup.swatches[setup.document.world.background] ?? setup.ink,
      banner: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: container.clientWidth,
        height: container.clientHeight,
      },
      input: { keyboard: false, mouse: false, touch: false },
      scene,
    });
    game.events.once(Phaser.Core.Events.DESTROY, () =>
      reject(new Error('stage destroyed before it booted')),
    );
  });
}

class Renderer2d implements Renderer {
  private readonly colors: number[];
  private readonly ink: number;
  private readonly texts = new Map<number, Phaser.GameObjects.Text>();
  private readonly points: Phaser.Math.Vector2[] = [];

  constructor(
    private readonly game: Phaser.Game,
    private readonly scene: StageScene,
    private readonly setup: RenderSetup,
  ) {
    this.colors = setup.swatches.map(hexToColorNumber);
    this.ink = hexToColorNumber(setup.ink);
  }

  sync(view: WorldView): void {
    const { entities, stride, frame } = view;
    const camera = this.scene.cameras.main;
    this.placeCamera(camera, view);

    const g = this.scene.graphics;
    g.clear();
    const zoom = camera.zoom;
    const shadow = SHADOW_OFFSET / zoom;
    const textIds = new Set<number>();
    const textOf = new Map(frame.texts);

    for (let i = 0; i < entities.length; i += stride) {
      if (entities[i + F.visible] === 0) continue;
      const archetype = this.setup.archetypes[entities[i + F.archetype]!];
      if (!archetype) continue;
      const id = entities[i + F.id]!;
      const x = entities[i + F.x]! * PIXELS_PER_UNIT;
      const y = -entities[i + F.y]! * PIXELS_PER_UNIT;
      const w = entities[i + F.width]! * PIXELS_PER_UNIT;
      const h = entities[i + F.height]! * PIXELS_PER_UNIT;
      const rotation = (-entities[i + F.rotation]! * Math.PI) / 180;
      const color = this.colors[entities[i + F.color]!] ?? this.ink;

      if (archetype.shape.kind === 'text') {
        textIds.add(id);
        this.drawText(id, textOf.get(id) ?? '', x, y, h, rotation, entities[i + F.color]!);
        continue;
      }
      this.outline(archetype.shape, x, y, w, h, rotation);
      g.fillStyle(this.ink, 1);
      this.translate(shadow, shadow);
      g.fillPoints(this.points, true);
      this.translate(-shadow, -shadow);
      g.fillStyle(color, 1);
      g.fillPoints(this.points, true);
      g.lineStyle(OUTLINE / zoom, this.ink, 1);
      g.strokePoints(this.points, true, true);
    }

    for (const [id, text] of this.texts) {
      if (!textIds.has(id)) {
        text.destroy();
        this.texts.delete(id);
      }
    }

    if (!this.setup.reducedMotion) {
      for (const event of frame.events) {
        if (event.kind === 'shake') camera.shake(180, 0.004 * event.strength);
      }
    }
  }

  destroy(): void {
    this.texts.clear();
    this.game.destroy(true);
  }

  private placeCamera(camera: Phaser.Cameras.Scene2D.Camera, view: WorldView): void {
    const world = this.setup.document.world;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const mode = world.camera ?? 'fixed';
    const visibleUnits =
      mode === 'fixed' ? world.size.x : Math.min(world.size.x, UNITS_IN_FOLLOW_VIEW);
    const visibleHeight = mode === 'fixed' ? world.size.y : (visibleUnits * height) / width;
    camera.setZoom(
      Math.min(
        width / (visibleUnits * PIXELS_PER_UNIT),
        height / (visibleHeight * PIXELS_PER_UNIT),
      ),
    );

    const target = view.frame.cameraTarget;
    if (mode === 'fixed' || target === null) {
      camera.centerOn(0, 0);
      return;
    }
    const { entities, stride } = view;
    for (let i = 0; i < entities.length; i += stride) {
      if (entities[i + F.id] !== target) continue;
      const halfW = width / camera.zoom / 2 / PIXELS_PER_UNIT;
      const halfH = height / camera.zoom / 2 / PIXELS_PER_UNIT;
      const limitX = Math.max(0, world.size.x / 2 - halfW);
      const limitY = Math.max(0, world.size.y / 2 - halfH);
      const x = Math.max(-limitX, Math.min(limitX, entities[i + F.x]!));
      const y = Math.max(-limitY, Math.min(limitY, entities[i + F.y]!));
      camera.centerOn(x * PIXELS_PER_UNIT, -y * PIXELS_PER_UNIT);
      return;
    }
  }

  private outline(
    shape: Shape,
    cx: number,
    cy: number,
    w: number,
    h: number,
    rotation: number,
  ): void {
    const local: [number, number][] = localPoints(shape);
    this.points.length = 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const [u, v] of local) {
      const px = (u * w) / 2;
      const py = (-v * h) / 2;
      this.points.push(new Phaser.Math.Vector2(cx + px * cos - py * sin, cy + px * sin + py * cos));
    }
  }

  private translate(dx: number, dy: number): void {
    for (const point of this.points) {
      point.x += dx;
      point.y += dy;
    }
  }

  private drawText(
    id: number,
    content: string,
    x: number,
    y: number,
    h: number,
    rotation: number,
    color: number,
  ): void {
    let text = this.texts.get(id);
    if (!text) {
      text = this.scene.add.text(0, 0, '', { fontFamily: this.setup.fontFamily, fontStyle: '700' });
      text.setOrigin(0.5);
      this.texts.set(id, text);
    }
    if (text.text !== content) text.setText(content);
    text.setFontSize(Math.max(8, h * 0.8));
    text.setColor(this.setup.swatches[color] ?? this.setup.ink);
    text.setStroke(this.setup.ink, OUTLINE * 2);
    text.setPosition(x, y);
    text.setRotation(rotation);
  }
}
