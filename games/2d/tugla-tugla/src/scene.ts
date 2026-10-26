import Phaser from 'phaser';
import { toError, type GameHost } from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import {
  GRID_SIZE,
  TRAY_SIZE,
  canPlace,
  cellFromIndex,
  createPuzzleState,
  fitsAnywhere,
  isStuck,
  placePiece,
  type Cell,
  type PuzzleState,
  type Shape,
} from './board';

export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 900;

const BOARD_MARGIN = 40;
const CELL_SIZE = 80;
const BOARD_SIZE = GRID_SIZE * CELL_SIZE;
const PANEL_RADIUS = 12;
const PANEL_SHADOW = 8;
const TRAY_TOP = 712;
const TRAY_HEIGHT = 148;
const TRAY_CELL = 34;
const SLOT_WIDTH = BOARD_SIZE / TRAY_SIZE;
const BLOCK_SHADOW = 4;
const TRAY_BLOCK_SHADOW = 2;
const PREVIEW_ALPHA = 0.4;
// Keeps the lifted piece visible above a thumb.
const TOUCH_LIFT = 60;
const CLEAR_MS = 140;

type Phase = 'idle' | 'playing' | 'paused' | 'finished';

interface Drag {
  slot: number;
  piece: Shape;
  lift: number;
}

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class TuglaScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private state: PuzzleState;
  private phase: Phase = 'idle';
  private playTimeMs = 0;
  private drag: Drag | null = null;
  private blocksLayer!: Phaser.GameObjects.Graphics;
  private previewLayer!: Phaser.GameObjects.Graphics;
  private trayLayer!: Phaser.GameObjects.Graphics;
  private dragLayer!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('tugla-tugla');
    this.colors = toColorNumbers(host.palette);
    this.state = createPuzzleState(Math.random);
  }

  create(): void {
    try {
      this.drawPanels();
      this.blocksLayer = this.add.graphics();
      this.previewLayer = this.add.graphics();
      this.trayLayer = this.add.graphics();
      this.dragLayer = this.add.graphics().setDepth(1);
      this.drawBlocks();
      this.drawTray();
      this.bindInput();
    } catch (error) {
      this.callbacks.failed(toError(error));
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
    this.cancelDrag();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.host.onStateChange('paused');
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.tweens.resumeAll();
    this.time.paused = false;
    this.host.onStateChange('playing');
  }

  restartRun(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.time.paused = false;
    this.cancelDrag();
    this.state = createPuzzleState(Math.random);
    this.playTimeMs = 0;
    this.drawBlocks();
    this.drawTray();
    this.host.onScore(0);
    this.beginPlay();
  }

  teardown(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.removeAllListeners();
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.host.onStateChange('playing');
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing' || this.drag) return;
      const slot = slotAt(pointer.x, pointer.y);
      const piece = slot === null ? null : this.state.tray[slot];
      if (slot === null || !piece) return;
      this.drag = { slot, piece, lift: pointer.wasTouch ? TOUCH_LIFT : 0 };
      this.drawTray();
      this.followPointer(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.drag) this.followPointer(pointer);
    });
    const release = (pointer: Phaser.Input.Pointer) => {
      if (this.drag) this.dropPiece(this.drag, pointer);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private followPointer(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag) return;
    const { accent, ink, danger } = this.colors;
    const topLeft = liftedTopLeft(drag, pointer);

    this.dragLayer.clear();
    drawPiece(
      this.dragLayer,
      drag.piece,
      topLeft.x,
      topLeft.y,
      CELL_SIZE,
      accent,
      ink,
      BLOCK_SHADOW,
    );

    this.previewLayer.clear();
    const origin = snapOrigin(drag.piece, topLeft);
    if (!origin) return;
    const fill = canPlace(this.state.grid, drag.piece, origin) ? accent : danger;
    drawPiece(
      this.previewLayer,
      drag.piece,
      BOARD_MARGIN + origin.col * CELL_SIZE,
      BOARD_MARGIN + origin.row * CELL_SIZE,
      CELL_SIZE,
      fill,
      ink,
      0,
      PREVIEW_ALPHA,
    );
  }

  private dropPiece(drag: Drag, pointer: Phaser.Input.Pointer): void {
    const origin = snapOrigin(drag.piece, liftedTopLeft(drag, pointer));
    const placement = origin ? placePiece(this.state, drag.slot, origin, Math.random) : null;
    this.drag = null;
    this.dragLayer.clear();
    this.previewLayer.clear();

    if (!placement) {
      this.drawTray();
      return;
    }

    this.host.onScore(this.state.score);
    this.drawBlocks();
    this.drawTray();
    this.animateClear(placement.cleared);
    if (isStuck(this.state)) {
      this.finish();
    }
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.dragLayer.clear();
    this.previewLayer.clear();
    this.drawTray();
  }

  private finish(): void {
    this.phase = 'finished';
    this.host.onFinish({
      score: this.state.score,
      durationMs: Math.round(this.playTimeMs),
      stats: {
        piecesPlaced: this.state.piecesPlaced,
        linesCleared: this.state.linesCleared,
        maxCombo: this.state.maxCombo,
      },
    });
    this.host.onStateChange('finished');
  }

  private animateClear(cleared: Cell[]): void {
    if (this.host.reducedMotion || cleared.length === 0) return;
    const { reward, ink } = this.colors;
    for (const cell of cleared) {
      const flash = this.add.graphics();
      flash.setPosition(
        BOARD_MARGIN + cell.col * CELL_SIZE + CELL_SIZE / 2,
        BOARD_MARGIN + cell.row * CELL_SIZE + CELL_SIZE / 2,
      );
      drawBlock(flash, -CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, reward, ink, 0);
      this.tweens.add({
        targets: flash,
        scale: 0,
        duration: CLEAR_MS,
        ease: 'Quad.easeIn',
        onComplete: () => flash.destroy(),
      });
    }
  }

  private drawPanels(): void {
    const { surface, ink } = this.colors;
    const panels = this.add.graphics();
    drawPanel(panels, BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, surface, ink);
    panels.lineStyle(1, ink, 0.45);
    for (let line = 1; line < GRID_SIZE; line += 1) {
      const offset = BOARD_MARGIN + line * CELL_SIZE;
      panels.lineBetween(offset, BOARD_MARGIN, offset, BOARD_MARGIN + BOARD_SIZE);
      panels.lineBetween(BOARD_MARGIN, offset, BOARD_MARGIN + BOARD_SIZE, offset);
    }
    panels.lineStyle(2, ink);
    panels.strokeRoundedRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, PANEL_RADIUS);

    drawPanel(panels, BOARD_MARGIN, TRAY_TOP, BOARD_SIZE, TRAY_HEIGHT, surface, ink);
    panels.lineStyle(1, ink, 0.45);
    for (let divider = 1; divider < TRAY_SIZE; divider += 1) {
      const x = BOARD_MARGIN + divider * SLOT_WIDTH;
      panels.lineBetween(x, TRAY_TOP + 16, x, TRAY_TOP + TRAY_HEIGHT - 16);
    }
  }

  private drawBlocks(): void {
    const { accent, ink } = this.colors;
    const layer = this.blocksLayer;
    layer.clear();
    this.state.grid.forEach((occupied, index) => {
      if (!occupied) return;
      const cell = cellFromIndex(index);
      drawBlock(
        layer,
        BOARD_MARGIN + cell.col * CELL_SIZE,
        BOARD_MARGIN + cell.row * CELL_SIZE,
        CELL_SIZE,
        accent,
        ink,
        BLOCK_SHADOW,
      );
    });
  }

  private drawTray(): void {
    const { accent, fgMuted, ink } = this.colors;
    const layer = this.trayLayer;
    layer.clear();
    this.state.tray.forEach((piece, slot) => {
      if (!piece || this.drag?.slot === slot) return;
      const centerX = BOARD_MARGIN + SLOT_WIDTH * (slot + 0.5);
      const centerY = TRAY_TOP + TRAY_HEIGHT / 2;
      const fill = fitsAnywhere(this.state.grid, piece) ? accent : fgMuted;
      drawPiece(
        layer,
        piece,
        centerX - (piece.cols * TRAY_CELL) / 2,
        centerY - (piece.rows * TRAY_CELL) / 2,
        TRAY_CELL,
        fill,
        ink,
        TRAY_BLOCK_SHADOW,
      );
    });
  }
}

function slotAt(x: number, y: number): number | null {
  if (y < TRAY_TOP || y > TRAY_TOP + TRAY_HEIGHT) return null;
  if (x < BOARD_MARGIN || x > BOARD_MARGIN + BOARD_SIZE) return null;
  return Math.min(TRAY_SIZE - 1, Math.floor((x - BOARD_MARGIN) / SLOT_WIDTH));
}

function liftedTopLeft(drag: Drag, pointer: Phaser.Input.Pointer): { x: number; y: number } {
  return {
    x: pointer.x - (drag.piece.cols * CELL_SIZE) / 2,
    y: pointer.y - drag.lift - (drag.piece.rows * CELL_SIZE) / 2,
  };
}

// Only a piece whose whole bounding box is over the board gets a snap target.
function snapOrigin(piece: Shape, topLeft: { x: number; y: number }): Cell | null {
  const col = Math.round((topLeft.x - BOARD_MARGIN) / CELL_SIZE);
  const row = Math.round((topLeft.y - BOARD_MARGIN) / CELL_SIZE);
  if (col < 0 || row < 0 || col + piece.cols > GRID_SIZE || row + piece.rows > GRID_SIZE) {
    return null;
  }
  return { row, col };
}

function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number,
  ink: number,
): void {
  graphics.fillStyle(ink);
  graphics.fillRoundedRect(x + PANEL_SHADOW, y + PANEL_SHADOW, width, height, PANEL_RADIUS);
  graphics.fillStyle(fill);
  graphics.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
  graphics.lineStyle(2, ink);
  graphics.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
}

function drawPiece(
  graphics: Phaser.GameObjects.Graphics,
  piece: Shape,
  left: number,
  top: number,
  size: number,
  fill: number,
  ink: number,
  shadow: number,
  alpha = 1,
): void {
  for (const cell of piece.cells) {
    drawBlock(
      graphics,
      left + cell.col * size,
      top + cell.row * size,
      size,
      fill,
      ink,
      shadow,
      alpha,
    );
  }
}

// Inset and shadow are sized so neighbouring blocks never overlap each other's shadow.
function drawBlock(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  fill: number,
  ink: number,
  shadow: number,
  alpha = 1,
): void {
  const inset = Math.max(1, Math.round(size * 0.04));
  const radius = Math.round(size * 0.1);
  const span = size - inset * 2;
  if (shadow > 0) {
    graphics.fillStyle(ink, alpha);
    graphics.fillRoundedRect(x + inset + shadow, y + inset + shadow, span, span, radius);
  }
  graphics.fillStyle(fill, alpha);
  graphics.fillRoundedRect(x + inset, y + inset, span, span, radius);
  graphics.lineStyle(2, ink, alpha);
  graphics.strokeRoundedRect(x + inset, y + inset, span, span, radius);
}
