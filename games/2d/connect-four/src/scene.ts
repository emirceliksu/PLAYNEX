import Phaser from 'phaser';
import type { GameHost } from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import {
  COLUMNS,
  ROWS,
  createMatchState,
  dropDisc,
  landingRow,
  opponent,
  type Cell,
  type Drop,
  type MatchState,
  type Outcome,
  type Player,
} from './board';

export const LOGICAL_SIZE = 720;

const CELL_SIZE = 84;
const BOARD_WIDTH = COLUMNS * CELL_SIZE;
const BOARD_HEIGHT = ROWS * CELL_SIZE;
const BOARD_LEFT = (LOGICAL_SIZE - BOARD_WIDTH) / 2;
const BOARD_TOP = 150;
const BOARD_RADIUS = 12;
const BOARD_SHADOW = 8;
const DISC_RADIUS = 34;
const DISC_SHADOW = 3;
const GHOST_Y = BOARD_TOP - CELL_SIZE / 2 - 2;
const GHOST_ALPHA = 0.45;
const INDICATOR_Y = 36;
const INDICATOR_RADIUS = 14;
const RESULT_BAR_Y = 676;
const RESULT_BAR_HEIGHT = 10;
const DROP_MAX_MS = 200;
const PULSE_MS = 500;

type Phase = 'idle' | 'playing' | 'paused' | 'finished';

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class ConnectFourScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private state: MatchState;
  private starter: Player = 1;
  private phase: Phase = 'idle';
  private playTimeMs = 0;
  private dropping = false;
  private hoverColumn: number | null = null;
  private discs: Phaser.GameObjects.Graphics[] = [];
  private ghostLayer!: Phaser.GameObjects.Graphics;
  private indicatorLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private resultLayer!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('connect-four');
    this.colors = toColorNumbers(host.palette);
    this.state = createMatchState(this.starter);
  }

  create(): void {
    try {
      this.drawBoard();
      this.ghostLayer = this.add.graphics().setDepth(1);
      this.indicatorLayer = this.add.graphics();
      this.highlightLayer = this.add.graphics().setDepth(2);
      this.resultLayer = this.add.graphics();
      this.drawIndicator();
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
    this.ghostLayer.clear();
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
    for (const disc of this.discs) {
      disc.destroy();
    }
    this.discs = [];
    this.ghostLayer.clear();
    this.highlightLayer.clear().setAlpha(1);
    this.resultLayer.clear();
    this.starter = opponent(this.starter);
    this.state = createMatchState(this.starter);
    this.playTimeMs = 0;
    this.dropping = false;
    this.drawIndicator();
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
    const track = (pointer: Phaser.Input.Pointer) => {
      this.hoverColumn = columnAt(pointer.x);
      this.drawGhost();
    };
    this.input.on('pointerdown', track);
    this.input.on('pointermove', track);
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const column = columnAt(pointer.x);
      // A finger lifts off the screen, so no ghost should linger where it left.
      this.hoverColumn = pointer.wasTouch ? null : column;
      if (column !== null) this.dropAt(column);
    });
  }

  private dropAt(col: number): void {
    if (this.phase !== 'playing' || this.dropping) return;
    const drop = dropDisc(this.state, col);
    if (!drop) return;

    this.ghostLayer.clear();
    const disc = this.add.graphics();
    drawDisc(disc, 0, 0, DISC_RADIUS, this.playerColor(drop.player), this.colors.ink, DISC_SHADOW);
    disc.setPosition(columnX(col), GHOST_Y);
    this.discs.push(disc);

    const landing = cellCenter(drop.cell);
    const settle = () => {
      disc.setPosition(landing.x, landing.y);
      this.dropping = false;
      this.afterDrop(drop);
    };

    if (this.host.reducedMotion) {
      settle();
      return;
    }

    this.dropping = true;
    this.tweens.add({
      targets: disc,
      y: landing.y,
      duration: Math.min(DROP_MAX_MS, 80 + drop.cell.row * 20),
      ease: 'Quad.easeIn',
      onComplete: settle,
    });
  }

  private afterDrop(drop: Drop): void {
    if (drop.outcome) {
      this.finish(drop.outcome);
      return;
    }
    this.drawIndicator();
    this.drawGhost();
  }

  private finish(outcome: Outcome): void {
    this.phase = 'finished';
    this.indicatorLayer.clear();
    this.ghostLayer.clear();
    this.drawResultBar(outcome);
    if (outcome.kind === 'win') {
      this.highlightLine(outcome.line);
    }

    const winner = outcome.kind === 'win' ? outcome.winner : 0;
    const score = winner === 1 ? 1 : 0;
    this.host.onScore(score);
    this.host.onFinish({
      score,
      durationMs: Math.round(this.playTimeMs),
      stats: { moves: this.state.moves, winner },
    });
    this.host.onStateChange('finished');
  }

  private playerColor(player: Player): number {
    return player === 1 ? this.colors.accent : this.colors.reward;
  }

  private drawBoard(): void {
    const { surface, ink, canvas } = this.colors;
    const board = this.add.graphics();
    board.fillStyle(ink);
    board.fillRoundedRect(
      BOARD_LEFT + BOARD_SHADOW,
      BOARD_TOP + BOARD_SHADOW,
      BOARD_WIDTH,
      BOARD_HEIGHT,
      BOARD_RADIUS,
    );
    board.fillStyle(surface);
    board.fillRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD_WIDTH, BOARD_HEIGHT, BOARD_RADIUS);
    board.lineStyle(2, ink);
    board.strokeRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD_WIDTH, BOARD_HEIGHT, BOARD_RADIUS);

    board.fillStyle(canvas);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLUMNS; col += 1) {
        const { x, y } = cellCenter({ row, col });
        board.fillCircle(x, y, DISC_RADIUS);
        board.strokeCircle(x, y, DISC_RADIUS);
      }
    }
  }

  private drawGhost(): void {
    const layer = this.ghostLayer;
    layer.clear();
    if (this.phase !== 'playing' || this.dropping || this.hoverColumn === null) return;
    if (landingRow(this.state, this.hoverColumn) === null) return;
    const fill = this.playerColor(this.state.current);
    layer.fillStyle(fill, GHOST_ALPHA);
    layer.fillCircle(columnX(this.hoverColumn), GHOST_Y, DISC_RADIUS);
    layer.lineStyle(2, this.colors.ink, GHOST_ALPHA);
    layer.strokeCircle(columnX(this.hoverColumn), GHOST_Y, DISC_RADIUS);
  }

  private drawIndicator(): void {
    const layer = this.indicatorLayer;
    layer.clear();
    drawDisc(
      layer,
      LOGICAL_SIZE / 2,
      INDICATOR_Y,
      INDICATOR_RADIUS,
      this.playerColor(this.state.current),
      this.colors.ink,
      2,
    );
  }

  private drawResultBar(outcome: Outcome): void {
    const { ink, fgMuted } = this.colors;
    const fill = outcome.kind === 'win' ? this.playerColor(outcome.winner) : fgMuted;
    const layer = this.resultLayer;
    layer.clear();
    layer.fillStyle(fill);
    layer.fillRoundedRect(
      BOARD_LEFT,
      RESULT_BAR_Y,
      BOARD_WIDTH,
      RESULT_BAR_HEIGHT,
      RESULT_BAR_HEIGHT / 2,
    );
    layer.lineStyle(2, ink);
    layer.strokeRoundedRect(
      BOARD_LEFT,
      RESULT_BAR_Y,
      BOARD_WIDTH,
      RESULT_BAR_HEIGHT,
      RESULT_BAR_HEIGHT / 2,
    );
  }

  private highlightLine(line: Cell[]): void {
    const layer = this.highlightLayer;
    layer.clear();
    layer.lineStyle(4, this.colors.fg);
    for (const cell of line) {
      const { x, y } = cellCenter(cell);
      layer.strokeCircle(x, y, DISC_RADIUS + 5);
    }
    if (this.host.reducedMotion) return;
    this.tweens.add({
      targets: layer,
      alpha: 0.25,
      duration: PULSE_MS,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }
}

function columnAt(x: number): number | null {
  const col = Math.floor((x - BOARD_LEFT) / CELL_SIZE);
  return col >= 0 && col < COLUMNS ? col : null;
}

function columnX(col: number): number {
  return BOARD_LEFT + col * CELL_SIZE + CELL_SIZE / 2;
}

function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: columnX(cell.col), y: BOARD_TOP + cell.row * CELL_SIZE + CELL_SIZE / 2 };
}

function drawDisc(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  fill: number,
  ink: number,
  shadow: number,
): void {
  graphics.fillStyle(ink);
  graphics.fillCircle(x + shadow, y + shadow, radius);
  graphics.fillStyle(fill);
  graphics.fillCircle(x, y, radius);
  graphics.lineStyle(2, ink);
  graphics.strokeCircle(x, y, radius);
}
