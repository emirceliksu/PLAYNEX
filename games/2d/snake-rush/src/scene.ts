import Phaser from 'phaser';
import { toError, type GameHost } from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import {
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  DIRECTION_DELTAS,
  GRID_SIZE,
  MIN_STEP_MS,
  advance,
  createSnakeState,
  queueDirection,
  stepIntervalMs,
  type Cell,
  type Direction,
  type SnakeState,
} from './snake';

export const LOGICAL_SIZE = 720;

const BOARD_MARGIN = 40;
const BOARD_SIZE = LOGICAL_SIZE - BOARD_MARGIN * 2;
const BOARD_RADIUS = 12;
const BOARD_SHADOW = 8;
const CELL_SIZE = BOARD_SIZE / GRID_SIZE;
const SEGMENT_INSET = 2;
const SEGMENT_RADIUS = 8;
const SWIPE_THRESHOLD = 24;
const DEATH_FLASH_MS = 220;
const BONUS_BLINK_FROM_MS = 1500;
const BONUS_BLINK_PERIOD_MS = 150;

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

type Phase = 'idle' | 'playing' | 'paused' | 'dying' | 'finished';

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class SnakeScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private state: SnakeState;
  private phase: Phase = 'idle';
  private stepAccumulator = 0;
  private playTimeMs = 0;
  private bonusRemainingMs = 0;
  private reachedMaxSpeed = false;
  private swipeOrigin: Phaser.Math.Vector2 | null = null;
  private deathTimer: Phaser.Time.TimerEvent | null = null;
  private keyboard!: Phaser.Input.Keyboard.KeyboardPlugin;
  private snakeLayer!: Phaser.GameObjects.Graphics;
  private foodLayer!: Phaser.GameObjects.Graphics;
  private bonusLayer!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('snake-rush');
    this.colors = toColorNumbers(host.palette);
    this.state = createSnakeState(Math.random);
  }

  create(): void {
    try {
      this.drawBoard();
      this.snakeLayer = this.add.graphics();
      this.foodLayer = this.add.graphics();
      this.bonusLayer = this.add.graphics();
      this.drawSnake(this.colors.accent);
      this.drawFood();
      this.bindInput();
    } catch (error) {
      this.callbacks.failed(toError(error));
      return;
    }
    this.callbacks.ready();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;

    this.playTimeMs += delta;
    this.tickBonus(delta);

    const interval = stepIntervalMs(this.state.apples);
    // Cap the backlog so a stalled tab does not replay a burst of steps at once.
    this.stepAccumulator = Math.min(this.stepAccumulator + delta, interval * 2);
    while (this.stepAccumulator >= interval && this.phase === 'playing') {
      this.stepAccumulator -= interval;
      this.step();
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
    this.host.onStateChange('paused');
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.keyboard.addCapture(CAPTURED_KEYS);
    this.host.onStateChange('playing');
  }

  restartRun(): void {
    this.deathTimer?.remove();
    this.deathTimer = null;
    this.state = createSnakeState(Math.random);
    this.stepAccumulator = 0;
    this.playTimeMs = 0;
    this.bonusRemainingMs = 0;
    this.reachedMaxSpeed = false;
    this.swipeOrigin = null;
    this.bonusLayer.setAlpha(1);
    this.drawSnake(this.colors.accent);
    this.drawFood();
    this.host.onScore(0);
    this.beginPlay();
  }

  teardown(): void {
    this.deathTimer?.remove();
    this.keyboard.removeCapture(CAPTURED_KEYS);
    this.keyboard.removeAllListeners();
    this.input.removeAllListeners();
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.keyboard.addCapture(CAPTURED_KEYS);
    this.host.onStateChange('playing');
  }

  private step(): void {
    const outcome = advance(this.state, Math.random);
    if (outcome === 'died') {
      this.die();
      return;
    }
    if (outcome === 'apple') {
      this.host.onScore(this.state.score);
      if (this.state.apples % BONUS_EVERY === 0) {
        this.bonusRemainingMs = BONUS_LIFETIME_MS;
        this.bonusLayer.setAlpha(1);
      }
      if (stepIntervalMs(this.state.apples) === MIN_STEP_MS) {
        this.reachedMaxSpeed = true;
      }
      this.drawFood();
    } else if (outcome === 'bonus') {
      this.host.onScore(this.state.score);
      this.drawFood();
    }
    this.drawSnake(this.colors.accent);
  }

  private tickBonus(delta: number): void {
    if (!this.state.bonus) return;
    this.bonusRemainingMs -= delta;
    if (this.bonusRemainingMs <= 0) {
      this.state.bonus = null;
      this.drawFood();
      return;
    }
    if (this.host.reducedMotion || this.bonusRemainingMs > BONUS_BLINK_FROM_MS) return;
    const blinkOn = Math.floor(this.bonusRemainingMs / BONUS_BLINK_PERIOD_MS) % 2 === 0;
    this.bonusLayer.setAlpha(blinkOn ? 1 : 0.35);
  }

  private die(): void {
    this.phase = 'dying';
    this.keyboard.removeCapture(CAPTURED_KEYS);
    if (this.host.reducedMotion) {
      this.finish();
      return;
    }
    this.drawSnake(this.colors.danger);
    this.deathTimer = this.time.delayedCall(DEATH_FLASH_MS, () => this.finish());
  }

  private finish(): void {
    this.phase = 'finished';
    this.deathTimer = null;
    this.host.onFinish({
      score: this.state.score,
      durationMs: Math.round(this.playTimeMs),
      stats: {
        apples: this.state.apples,
        length: this.state.segments.length,
        maxSpeedReached: this.reachedMaxSpeed ? 1 : 0,
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
      if (this.phase !== 'playing') return;
      const direction = KEY_DIRECTIONS[event.code];
      if (direction) {
        queueDirection(this.state, direction);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.swipeOrigin = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.swipeOrigin || this.phase !== 'playing') return;
      const dx = pointer.x - this.swipeOrigin.x;
      const dy = pointer.y - this.swipeOrigin.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      queueDirection(this.state, swipeDirection(dx, dy));
      // Re-anchor so one long drag can steer through several turns.
      this.swipeOrigin.set(pointer.x, pointer.y);
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
    board.fillStyle(surface);
    board.fillRoundedRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);

    board.lineStyle(1, ink, 0.45);
    for (let line = 1; line < GRID_SIZE; line += 1) {
      const offset = BOARD_MARGIN + line * CELL_SIZE;
      board.lineBetween(offset, BOARD_MARGIN, offset, BOARD_MARGIN + BOARD_SIZE);
      board.lineBetween(BOARD_MARGIN, offset, BOARD_MARGIN + BOARD_SIZE, offset);
    }

    board.lineStyle(2, ink);
    board.strokeRoundedRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);
  }

  private drawSnake(fill: number): void {
    const { ink, canvas } = this.colors;
    const layer = this.snakeLayer;
    layer.clear();

    const [head, ...body] = this.state.segments;
    const size = CELL_SIZE - SEGMENT_INSET * 2;
    layer.fillStyle(fill);
    layer.lineStyle(2, ink);
    for (const segment of [...body, head]) {
      const x = BOARD_MARGIN + segment.x * CELL_SIZE + SEGMENT_INSET;
      const y = BOARD_MARGIN + segment.y * CELL_SIZE + SEGMENT_INSET;
      layer.fillRoundedRect(x, y, size, size, SEGMENT_RADIUS);
      layer.strokeRoundedRect(x, y, size, size, SEGMENT_RADIUS);
    }

    const center = cellCenter(head);
    const forward = DIRECTION_DELTAS[this.state.direction];
    const side = { x: -forward.y, y: forward.x };
    layer.fillStyle(canvas);
    layer.fillCircle(
      center.x + forward.x * 6 + side.x * 7,
      center.y + forward.y * 6 + side.y * 7,
      3,
    );
    layer.fillCircle(
      center.x + forward.x * 6 - side.x * 7,
      center.y + forward.y * 6 - side.y * 7,
      3,
    );
  }

  private drawFood(): void {
    const { ink, danger, accent, reward } = this.colors;
    const food = this.foodLayer;
    food.clear();
    if (this.state.apple) {
      const { x, y } = cellCenter(this.state.apple);
      food.fillStyle(danger);
      food.fillCircle(x, y, 10);
      food.lineStyle(2, ink);
      food.strokeCircle(x, y, 10);
      food.fillStyle(accent);
      food.fillRoundedRect(x + 1, y - 15, 9, 5, 2);
    }

    const bonus = this.bonusLayer;
    bonus.clear();
    if (this.state.bonus) {
      const { x, y } = cellCenter(this.state.bonus);
      const diamond = (cx: number, cy: number) => [
        new Phaser.Math.Vector2(cx, cy - 13),
        new Phaser.Math.Vector2(cx + 13, cy),
        new Phaser.Math.Vector2(cx, cy + 13),
        new Phaser.Math.Vector2(cx - 13, cy),
      ];
      bonus.fillStyle(ink);
      bonus.fillPoints(diamond(x + 3, y + 3), true);
      bonus.fillStyle(reward);
      bonus.fillPoints(diamond(x, y), true);
      bonus.lineStyle(2, ink);
      bonus.strokePoints(diamond(x, y), true, true);
    }
  }
}

function cellCenter(cell: Cell): Cell {
  return {
    x: BOARD_MARGIN + cell.x * CELL_SIZE + CELL_SIZE / 2,
    y: BOARD_MARGIN + cell.y * CELL_SIZE + CELL_SIZE / 2,
  };
}

function swipeDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
