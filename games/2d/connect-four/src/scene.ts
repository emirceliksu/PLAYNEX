import Phaser from 'phaser';
import type { GameHost, MatchOutcome, OnlineMessage, OnlineSession } from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import {
  COLUMNS,
  ROWS,
  cellIndex,
  createMatchState,
  dropDisc,
  landingRow,
  opponent,
  type Cell,
  type Drop,
  type MatchState,
  type Outcome,
  type Player,
  type Slot,
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

// Server view of the board; see `apps/realtime/src/matches/connect_four.rs`.
interface OnlineSnapshot {
  slots: Slot[];
  turn: number;
  moves: number;
  last: Cell | null;
  winLine: Cell[];
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
  private readonly online: OnlineSession | null;
  private awaitingServer = false;
  private serverWinLine: Cell[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('connect-four');
    this.colors = toColorNumbers(host.palette);
    this.online = host.session.mode === 'online' ? host.session : null;
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
      if (this.online) {
        this.unsubscribe = this.online.subscribe((message) => this.onServer(message));
      }
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
    if (this.phase !== 'playing' || this.online) return;
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
    if (this.online) return;
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
    this.unsubscribe?.();
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

  private myTurn(): boolean {
    return !this.online || this.state.current === this.online.seat + 1;
  }

  private dropAt(col: number): void {
    if (this.phase !== 'playing' || this.dropping) return;
    if (this.online) {
      if (!this.myTurn() || this.awaitingServer || landingRow(this.state, col) === null) return;
      this.awaitingServer = true;
      this.ghostLayer.clear();
      this.online.send({ column: col });
      return;
    }
    const drop = dropDisc(this.state, col);
    if (!drop) return;
    this.ghostLayer.clear();
    this.placeDisc(drop.cell, drop.player, () => this.afterDrop(drop));
  }

  private placeDisc(cell: Cell, player: Player, settled: () => void): void {
    const disc = this.add.graphics();
    drawDisc(disc, 0, 0, DISC_RADIUS, this.playerColor(player), this.colors.ink, DISC_SHADOW);
    disc.setPosition(columnX(cell.col), GHOST_Y);
    this.discs.push(disc);

    const landing = cellCenter(cell);
    const settle = () => {
      disc.setPosition(landing.x, landing.y);
      this.dropping = false;
      settled();
    };

    if (this.host.reducedMotion) {
      settle();
      return;
    }

    this.dropping = true;
    this.tweens.add({
      targets: disc,
      y: landing.y,
      duration: Math.min(DROP_MAX_MS, 80 + cell.row * 20),
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
    this.showOutcome(outcome);
    const winner = outcome.kind === 'win' ? outcome.winner : 0;
    const score = winner === 1 ? 1 : 0;
    this.host.onScore(score);
    this.host.onFinish({
      score,
      durationMs: Math.round(this.playTimeMs),
      stats: { moves: this.state.moves, winner },
      outcome: {
        placements: winner === 0 ? [1, 1] : winner === 1 ? [1, 2] : [2, 1],
        scores: [winner === 1 ? 1 : 0, winner === 2 ? 1 : 0],
        reason: outcome.kind === 'win' ? 'connect' : 'full',
      },
    });
    this.host.onStateChange('finished');
  }

  private showOutcome(outcome: Outcome): void {
    this.phase = 'finished';
    this.indicatorLayer.clear();
    this.ghostLayer.clear();
    this.drawResultBar(outcome);
    if (outcome.kind === 'win') {
      this.highlightLine(outcome.line);
    }
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot':
        this.applySnapshot(message.payload as OnlineSnapshot);
        return;
      case 'finish':
        this.finishOnline(message.outcome);
        return;
      case 'rejected':
        this.awaitingServer = false;
        this.drawGhost();
        return;
      case 'event':
        return;
    }
  }

  private applySnapshot(snapshot: OnlineSnapshot): void {
    this.awaitingServer = false;
    const changed = snapshot.slots.filter((slot, index) => slot !== this.state.slots[index]).length;
    const last = snapshot.last;
    const animate =
      changed === 1 && last !== null && this.state.slots[cellIndex(last)] === 0 && !this.dropping;

    this.state.slots = [...snapshot.slots];
    this.state.moves = snapshot.moves;
    this.state.current = (snapshot.turn + 1) as Player;
    this.serverWinLine = snapshot.winLine;

    const after = () => {
      this.drawIndicator();
      this.drawGhost();
    };
    if (animate) {
      this.placeDisc(last, snapshot.slots[cellIndex(last)] as Player, after);
    } else if (changed > 0) {
      this.redrawDiscs();
      after();
    } else {
      after();
    }
  }

  private redrawDiscs(): void {
    for (const disc of this.discs) disc.destroy();
    this.discs = [];
    this.state.slots.forEach((slot, index) => {
      if (slot === 0) return;
      const cell = { row: Math.floor(index / COLUMNS), col: index % COLUMNS };
      const disc = this.add.graphics();
      drawDisc(disc, 0, 0, DISC_RADIUS, this.playerColor(slot), this.colors.ink, DISC_SHADOW);
      const { x, y } = cellCenter(cell);
      disc.setPosition(x, y);
      this.discs.push(disc);
    });
  }

  private finishOnline(result: MatchOutcome): void {
    const draw = result.placements[0] === result.placements[1];
    const winner = (result.placements.indexOf(1) + 1) as Player;
    // A forfeit ends the match with no line on the board, so the highlight may be empty.
    this.showOutcome(draw ? { kind: 'draw' } : { kind: 'win', winner, line: this.serverWinLine });
    const seat = this.online?.seat ?? 0;
    const score = result.placements[seat] === 1 && !draw ? 1 : 0;
    this.host.onScore(score);
    this.host.onFinish({
      score,
      durationMs: Math.round(this.playTimeMs),
      stats: { moves: this.state.moves },
      outcome: result,
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
    if (!this.myTurn() || this.awaitingServer) return;
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
