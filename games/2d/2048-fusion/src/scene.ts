import Phaser from 'phaser';
import type { GameHost } from '@playnex/game-sdk';
import { isBright, mixColors, toColorNumbers, type PaletteColors } from './colors';
import {
  GRID_SIZE,
  TARGET_TILE,
  applyMove,
  canMove,
  cellFromIndex,
  cellIndex,
  createGrid,
  maxTile,
  spawnTile,
  type Cell,
  type Direction,
  type Grid,
} from './grid';

export const LOGICAL_SIZE = 640;

const BOARD_MARGIN = 40;
const GAP = 16;
const TILE_SIZE = 120;
const TILE_RADIUS = 12;
const TILE_SHADOW = 4;
const BOARD_SIZE = GRID_SIZE * TILE_SIZE + (GRID_SIZE + 1) * GAP;
const BOARD_RADIUS = 16;
const BOARD_SHADOW = 8;
const SWIPE_THRESHOLD = 24;
const SLIDE_MS = 90;
const POP_MS = 100;
const SPAWN_MS = 110;
const FONT_FAMILY = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';

const { KeyCodes } = Phaser.Input.Keyboard;
const CAPTURED_KEYS = [
  KeyCodes.UP,
  KeyCodes.DOWN,
  KeyCodes.LEFT,
  KeyCodes.RIGHT,
  KeyCodes.W,
  KeyCodes.A,
  KeyCodes.S,
  KeyCodes.D,
];
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

type Phase = 'idle' | 'playing' | 'paused' | 'finished';

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class FusionScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private grid: Grid;
  private readonly tiles = new Map<number, Phaser.GameObjects.Container>();
  private phase: Phase = 'idle';
  private score = 0;
  private moves = 0;
  private reachedTarget = false;
  private playTimeMs = 0;
  private sliding = false;
  private swipeOrigin: Phaser.Math.Vector2 | null = null;
  private keyboard!: Phaser.Input.Keyboard.KeyboardPlugin;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('2048-fusion');
    this.colors = toColorNumbers(host.palette);
    this.grid = createGrid(Math.random);
  }

  create(): void {
    try {
      this.drawBoard();
      this.renderTiles(null, []);
      this.bindInput();
    } catch (error) {
      this.callbacks.failed(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    this.callbacks.ready();
  }

  override update(_time: number, delta: number): void {
    if (this.phase === 'playing') {
      this.playTimeMs += delta;
    }
  }

  startRun(): void {
    if (this.phase === 'idle') {
      this.beginPlay();
      return;
    }
    this.restartRun();
  }

  pauseRun(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.keyboard.removeCapture(CAPTURED_KEYS);
    this.tweens.pauseAll();
    this.time.paused = true;
    this.host.onStateChange('paused');
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.keyboard.addCapture(CAPTURED_KEYS);
    this.tweens.resumeAll();
    this.time.paused = false;
    this.host.onStateChange('playing');
  }

  restartRun(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.time.paused = false;
    this.grid = createGrid(Math.random);
    this.score = 0;
    this.moves = 0;
    this.reachedTarget = false;
    this.playTimeMs = 0;
    this.sliding = false;
    this.swipeOrigin = null;
    this.renderTiles(null, []);
    this.host.onScore(0);
    this.beginPlay();
  }

  teardown(): void {
    this.keyboard.removeCapture(CAPTURED_KEYS);
    this.keyboard.removeAllListeners();
    this.input.removeAllListeners();
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.keyboard.addCapture(CAPTURED_KEYS);
    this.host.onStateChange('playing');
  }

  private moveTiles(direction: Direction): void {
    if (this.phase !== 'playing' || this.sliding) return;
    const result = applyMove(this.grid, direction);
    if (!result.changed) return;

    this.grid = result.grid;
    this.moves += 1;
    if (result.gained > 0) {
      this.score += result.gained;
      this.host.onScore(this.score);
    }
    if (maxTile(this.grid) >= TARGET_TILE) {
      this.reachedTarget = true;
    }
    const spawned = spawnTile(this.grid, Math.random);

    const settle = () => {
      this.renderTiles(spawned, result.merges);
      this.sliding = false;
      if (!canMove(this.grid)) {
        this.finish();
      }
    };

    if (this.host.reducedMotion) {
      settle();
      return;
    }

    this.sliding = true;
    for (const slide of result.slides) {
      const tile = this.tiles.get(cellIndex(slide.from));
      if (!tile) continue;
      const target = cellCenter(slide.to);
      this.tweens.add({
        targets: tile,
        x: target.x,
        y: target.y,
        duration: SLIDE_MS,
        ease: 'Quad.easeOut',
      });
    }
    this.time.delayedCall(SLIDE_MS, settle);
  }

  private finish(): void {
    this.phase = 'finished';
    this.keyboard.removeCapture(CAPTURED_KEYS);
    this.host.onFinish({
      score: this.score,
      durationMs: Math.round(this.playTimeMs),
      stats: {
        moves: this.moves,
        maxTile: maxTile(this.grid),
        reached2048: this.reachedTarget ? 1 : 0,
      },
    });
    this.host.onStateChange('finished');
  }

  private bindInput(): void {
    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable');
    }
    this.keyboard = this.input.keyboard;
    this.keyboard.on('keydown', (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];
      if (direction) {
        this.moveTiles(direction);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.swipeOrigin = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.swipeOrigin) return;
      const dx = pointer.x - this.swipeOrigin.x;
      const dy = pointer.y - this.swipeOrigin.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      // One gesture, one move: wait for the pointer to lift before reading another.
      this.swipeOrigin = null;
      this.moveTiles(swipeDirection(dx, dy));
    });
    this.input.on('pointerup', () => {
      this.swipeOrigin = null;
    });
  }

  private drawBoard(): void {
    const { surface, ink } = this.colors;
    const board = this.add.graphics();
    board.fillStyle(ink);
    board.fillRoundedRect(
      BOARD_MARGIN + BOARD_SHADOW,
      BOARD_MARGIN + BOARD_SHADOW,
      BOARD_SIZE,
      BOARD_SIZE,
      BOARD_RADIUS,
    );
    board.fillStyle(ink, 0.35);
    board.fillRoundedRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);
    board.lineStyle(2, ink);
    board.strokeRoundedRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);

    board.fillStyle(surface);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const { x, y } = cellCenter({ row, col });
        board.fillRoundedRect(
          x - TILE_SIZE / 2,
          y - TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
          TILE_RADIUS,
        );
      }
    }
  }

  private renderTiles(spawned: Cell | null, merged: Cell[]): void {
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();

    this.grid.forEach((value, index) => {
      if (value === 0) return;
      const cell = cellFromIndex(index);
      this.tiles.set(index, this.createTile(cell, value));
    });

    if (this.host.reducedMotion) return;

    if (spawned) {
      const tile = this.tiles.get(cellIndex(spawned));
      if (tile) {
        tile.setScale(0);
        this.tweens.add({ targets: tile, scale: 1, duration: SPAWN_MS, ease: 'Back.easeOut' });
      }
    }
    for (const cell of merged) {
      const tile = this.tiles.get(cellIndex(cell));
      if (!tile) continue;
      tile.setScale(1.12);
      this.tweens.add({ targets: tile, scale: 1, duration: POP_MS, ease: 'Quad.easeOut' });
    }
  }

  private createTile(cell: Cell, value: number): Phaser.GameObjects.Container {
    const { ink } = this.colors;
    const fill = this.tileFill(value);
    const half = TILE_SIZE / 2;

    const body = this.add.graphics();
    body.fillStyle(ink);
    body.fillRoundedRect(
      -half + TILE_SHADOW,
      -half + TILE_SHADOW,
      TILE_SIZE,
      TILE_SIZE,
      TILE_RADIUS,
    );
    body.fillStyle(fill);
    body.fillRoundedRect(-half, -half, TILE_SIZE, TILE_SIZE, TILE_RADIUS);
    body.lineStyle(2, ink);
    body.strokeRoundedRect(-half, -half, TILE_SIZE, TILE_SIZE, TILE_RADIUS);

    const label = this.add
      .text(0, 0, String(value), {
        fontFamily: FONT_FAMILY,
        fontSize: `${tileFontSize(value)}px`,
        fontStyle: 'bold',
        color: isBright(fill) ? this.host.palette.canvas : this.host.palette.fg,
      })
      .setOrigin(0.5);

    const { x, y } = cellCenter(cell);
    return this.add.container(x, y, [body, label]);
  }

  // Low tiles climb from the board surface toward the accent; 512 and up head for the reward color.
  private tileFill(value: number): number {
    const { surface, accent, reward } = this.colors;
    const exponent = Math.log2(value);
    if (value < 512) {
      return mixColors(surface, accent, exponent / 8);
    }
    return mixColors(accent, reward, Math.min(1, (exponent - 8) / 3));
  }
}

function cellCenter(cell: Cell): { x: number; y: number } {
  return {
    x: BOARD_MARGIN + GAP + cell.col * (TILE_SIZE + GAP) + TILE_SIZE / 2,
    y: BOARD_MARGIN + GAP + cell.row * (TILE_SIZE + GAP) + TILE_SIZE / 2,
  };
}

function tileFontSize(value: number): number {
  if (value < 100) return 48;
  if (value < 1000) return 40;
  return 32;
}

function swipeDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
