import Phaser from 'phaser';
import type { GameHost, MatchOutcome, OnlineMessage, OnlineSession } from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import { Cpu, type Difficulty } from './cpu';
import {
  clampToHalf,
  createTable,
  setTarget,
  step,
  table,
  type Point,
  type TableState,
} from './physics';

export const LOGICAL_WIDTH = 400;
export const LOGICAL_HEIGHT = 720;

const TABLE_X = (LOGICAL_WIDTH - table.width) / 2;
const TABLE_Y = (LOGICAL_HEIGHT - table.height) / 2;
const TABLE_RADIUS = 18;
const TABLE_SHADOW = 8;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const PIP_RADIUS = 5;
const PIP_GAP = 16;
const KEY_SPEED = 520;
// Online, remote objects are drawn this far in the past so two snapshots always bracket them.
const INTERPOLATION_DELAY_MS = 100;
const INPUT_INTERVAL_MS = 16;
const GOAL_FLASH_MS = 260;

const CAPTURED_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
];

type Phase = 'idle' | 'playing' | 'paused' | 'finished';
type Seat = 0 | 1;

interface ServerSnapshot {
  tick: number;
  puck: [number, number, number, number];
  paddles: [[number, number], [number, number]];
  score: [number, number];
  serveMs: number;
}

interface BufferedSnapshot {
  at: number;
  snapshot: ServerSnapshot;
}

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class AirHockeyScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private readonly online: OnlineSession | null;
  private readonly cpu: Cpu | null;
  private readonly flipped: boolean;
  private state: TableState;
  private round = 0;
  private phase: Phase = 'idle';
  private accumulator = 0;
  private playTimeMs = 0;
  private keys = new Set<string>();
  private pointerSeats = new Map<number, Seat>();
  private ownTarget: Point;
  private ownPaddle: Point;
  private lastSentAt = 0;
  private lastSent: Point | null = null;
  private snapshots: BufferedSnapshot[] = [];
  private unsubscribe: (() => void) | null = null;
  private dynamicLayer!: Phaser.GameObjects.Graphics;
  private pipLayer!: Phaser.GameObjects.Graphics;
  private flashLayer!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('air-hockey');
    this.colors = toColorNumbers(host.palette);
    const session = host.session;
    this.online = session.mode === 'online' ? session : null;
    this.cpu =
      session.mode === 'solo'
        ? new Cpu((session.options.difficulty as Difficulty | undefined) ?? 'normal')
        : null;
    // Online the local player always defends the bottom of the screen.
    this.flipped = this.online?.seat === 1;
    this.state = createTable(this.online?.round ?? 0);
    const home = this.state.paddles[this.mySeat()];
    this.ownTarget = { x: home.x, y: home.y };
    this.ownPaddle = { x: home.x, y: home.y };
  }

  create(): void {
    try {
      this.drawTable();
      this.pipLayer = this.add.graphics();
      this.flashLayer = this.add.graphics();
      this.dynamicLayer = this.add.graphics();
      this.input.addPointer(2);
      this.bindInput();
      if (this.online) {
        this.unsubscribe = this.online.subscribe((message) => this.onServer(message));
      }
      this.render();
    } catch (error) {
      this.callbacks.failed(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    this.callbacks.ready();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;
    this.playTimeMs += delta;

    if (this.online) {
      this.applyKeys(delta / 1000);
      this.moveOwnPaddle(delta / 1000);
      this.sendInput();
      this.render();
      return;
    }

    this.applyKeys(delta / 1000);
    this.accumulator += delta / 1000;
    let steps = 0;
    while (this.accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= STEP_SECONDS;
      steps += 1;
      if (this.cpu) {
        const target = this.cpu.next(this.state, STEP_SECONDS);
        setTarget(this.state, 1, target.x, target.y);
      }
      const scorer = step(this.state, STEP_SECONDS);
      if (scorer !== null) {
        this.onGoal(scorer);
        if (this.phase !== 'playing') break;
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    this.render();
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
    this.keys.clear();
    this.input.keyboard?.removeCapture(CAPTURED_KEYS);
    this.tweens.pauseAll();
    this.host.onStateChange('paused');
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.accumulator = 0;
    this.input.keyboard?.addCapture(CAPTURED_KEYS);
    this.tweens.resumeAll();
    this.host.onStateChange('playing');
  }

  restartRun(): void {
    if (this.online) return;
    this.tweens.killAll();
    this.flashLayer.clear().setAlpha(1);
    this.round += 1;
    this.state = createTable(this.round % 2);
    this.cpu?.reroll();
    this.playTimeMs = 0;
    this.accumulator = 0;
    this.host.onScore(0);
    this.render();
    this.beginPlay();
  }

  teardown(): void {
    this.unsubscribe?.();
    this.tweens.killAll();
    this.input.keyboard?.removeCapture(CAPTURED_KEYS);
    this.input.removeAllListeners();
  }

  private mySeat(): Seat {
    return (this.online?.seat ?? 0) as Seat;
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.input.keyboard?.addCapture(CAPTURED_KEYS);
    this.host.onStateChange('playing');
  }

  private toScreen(point: Point): Point {
    return this.flipped
      ? { x: TABLE_X + table.width - point.x, y: TABLE_Y + table.height - point.y }
      : { x: TABLE_X + point.x, y: TABLE_Y + point.y };
  }

  private toTable(x: number, y: number): Point {
    return this.flipped
      ? { x: table.width - (x - TABLE_X), y: table.height - (y - TABLE_Y) }
      : { x: x - TABLE_X, y: y - TABLE_Y };
  }

  private bindInput(): void {
    const steer = (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing') return;
      const seat = this.pointerSeats.get(pointer.id) ?? this.seatForPointer(pointer);
      this.pointerSeats.set(pointer.id, seat);
      const point = this.toTable(pointer.x, pointer.y);
      this.aim(seat, point.x, point.y);
    };
    this.input.on('pointerdown', steer);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Mouse users steer by hovering; touches only while the finger is down.
      if (pointer.wasTouch && !pointer.isDown) return;
      steer(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeats.delete(pointer.id);
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase === 'playing' && CAPTURED_KEYS.includes(event.code)) this.keys.add(event.code);
    });
    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      this.keys.delete(event.code);
    });
  }

  // On a shared device each half of the table belongs to the player sitting there.
  private seatForPointer(pointer: Phaser.Input.Pointer): Seat {
    if (this.host.session.mode !== 'local') return this.mySeat();
    return pointer.y > TABLE_Y + table.height / 2 ? 0 : 1;
  }

  private aim(seat: Seat, x: number, y: number): void {
    if (this.online) {
      if (seat !== this.mySeat()) return;
      this.ownTarget = clampToHalf(seat, x, y);
      return;
    }
    if (seat === 1 && this.cpu) return;
    setTarget(this.state, seat, x, y);
  }

  private applyKeys(dt: number): void {
    if (this.keys.size === 0) return;
    // `mirrored` covers a player who sees the table upside down: the top seat on a
    // shared device, or seat 1 online where the view is flipped.
    const nudge = (seat: Seat, keys: [string, string, string, string], mirrored: boolean) => {
      const [up, down, left, right] = keys;
      const sign = mirrored ? -1 : 1;
      const dx = sign * ((this.keys.has(right) ? 1 : 0) - (this.keys.has(left) ? 1 : 0));
      const dy = sign * ((this.keys.has(down) ? 1 : 0) - (this.keys.has(up) ? 1 : 0));
      if (dx === 0 && dy === 0) return;
      const target = this.online ? this.ownTarget : this.state.targets[seat];
      const x = target.x + dx * KEY_SPEED * dt;
      const y = target.y + dy * KEY_SPEED * dt;
      if (this.online) {
        this.ownTarget = clampToHalf(seat, x, y);
      } else {
        setTarget(this.state, seat, x, y);
      }
    };
    nudge(this.mySeat(), ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], this.flipped);
    if (this.host.session.mode === 'local') {
      nudge(1, ['KeyW', 'KeyS', 'KeyA', 'KeyD'], true);
    }
  }

  private moveOwnPaddle(dt: number): void {
    const dx = this.ownTarget.x - this.ownPaddle.x;
    const dy = this.ownTarget.y - this.ownPaddle.y;
    const distance = Math.hypot(dx, dy);
    const reach = table.maxPaddleSpeed * dt;
    const scale = distance > reach ? reach / distance : 1;
    this.ownPaddle = { x: this.ownPaddle.x + dx * scale, y: this.ownPaddle.y + dy * scale };
  }

  private sendInput(): void {
    const now = performance.now();
    if (now - this.lastSentAt < INPUT_INTERVAL_MS) return;
    const target = this.ownTarget;
    if (this.lastSent?.x === target.x && this.lastSent.y === target.y) return;
    this.lastSentAt = now;
    this.lastSent = target;
    this.online?.send({ x: Math.round(target.x * 10) / 10, y: Math.round(target.y * 10) / 10 });
  }

  private onGoal(scorer: Seat): void {
    this.cpu?.reroll();
    this.host.onScore(this.state.score[this.mySeat()]);
    this.flashGoal(scorer);
    if (this.state.score[scorer] >= table.winScore) {
      this.finishLocal(scorer);
    }
  }

  private finishLocal(winner: Seat): void {
    this.phase = 'finished';
    this.input.keyboard?.removeCapture(CAPTURED_KEYS);
    const score = this.state.score;
    this.host.onFinish({
      score: score[0],
      durationMs: Math.round(this.playTimeMs),
      stats: { goalsFor: score[0], goalsAgainst: score[1] },
      outcome: {
        placements: winner === 0 ? [1, 2] : [2, 1],
        scores: [score[0], score[1]],
        reason: 'score',
      },
    });
    this.host.onStateChange('finished');
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot': {
        const snapshot = message.payload as ServerSnapshot;
        const previous = this.snapshots.at(-1)?.snapshot;
        this.snapshots.push({ at: performance.now(), snapshot });
        if (this.snapshots.length > 30) this.snapshots.shift();
        if (previous && snapshot.score.some((goals, seat) => goals !== previous.score[seat])) {
          const scorer = snapshot.score[0] !== previous.score[0] ? 0 : 1;
          this.flashGoal(scorer);
          this.host.onScore(snapshot.score[this.mySeat()]);
        }
        if (this.phase !== 'playing') this.render();
        return;
      }
      case 'finish':
        this.finishOnline(message.outcome);
        return;
      case 'event':
      case 'rejected':
        return;
    }
  }

  private finishOnline(outcome: MatchOutcome): void {
    this.phase = 'finished';
    this.render();
    this.host.onFinish({
      score: outcome.scores[this.mySeat()] ?? 0,
      durationMs: Math.round(this.playTimeMs),
      outcome,
    });
    this.host.onStateChange('finished');
  }

  // Remote state, drawn slightly in the past and blended between the two
  // snapshots that surround that moment.
  private interpolated(): TableState | null {
    const latest = this.snapshots.at(-1);
    if (!latest) return null;
    const renderAt = performance.now() - INTERPOLATION_DELAY_MS;
    let older = latest;
    let newer = latest;
    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      const entry = this.snapshots[i];
      if (!entry) continue;
      if (entry.at <= renderAt) {
        older = entry;
        newer = this.snapshots[i + 1] ?? entry;
        break;
      }
      older = entry;
    }
    const span = newer.at - older.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderAt - older.at) / span)) : 1;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const a = older.snapshot;
    const b = newer.snapshot;
    // A goal teleports the puck to the serve spot; blending across it would streak.
    const jump = Math.hypot(b.puck[0] - a.puck[0], b.puck[1] - a.puck[1]) > table.height / 3;
    const puck = jump ? b.puck : a.puck.map((value, i) => lerp(value, b.puck[i] ?? value));
    return {
      puck: { x: puck[0] ?? 0, y: puck[1] ?? 0, vx: 0, vy: 0 },
      paddles: [
        {
          x: lerp(a.paddles[0][0], b.paddles[0][0]),
          y: lerp(a.paddles[0][1], b.paddles[0][1]),
          vx: 0,
          vy: 0,
        },
        {
          x: lerp(a.paddles[1][0], b.paddles[1][0]),
          y: lerp(a.paddles[1][1], b.paddles[1][1]),
          vx: 0,
          vy: 0,
        },
      ],
      targets: this.state.targets,
      score: b.score,
      serveMs: b.serveMs,
    };
  }

  private render(): void {
    const view = this.online ? (this.interpolated() ?? this.state) : this.state;
    const layer = this.dynamicLayer;
    layer.clear();

    const paddles = view.paddles.map((paddle, seat) =>
      this.online && seat === this.mySeat() ? this.ownPaddle : paddle,
    );
    paddles.forEach((paddle, seat) => {
      const { x, y } = this.toScreen(paddle);
      const fill = seat === 0 ? this.colors.accent : this.colors.reward;
      layer.fillStyle(this.colors.ink);
      layer.fillCircle(x + 3, y + 3, table.paddleRadius);
      layer.fillStyle(fill);
      layer.fillCircle(x, y, table.paddleRadius);
      layer.lineStyle(2, this.colors.ink);
      layer.strokeCircle(x, y, table.paddleRadius);
      layer.fillStyle(this.colors.ink);
      layer.fillCircle(x, y, table.paddleRadius * 0.38);
    });

    const puck = this.toScreen(view.puck);
    const serving = view.serveMs > 0;
    layer.fillStyle(this.colors.ink);
    layer.fillCircle(puck.x + 2, puck.y + 2, table.puckRadius);
    layer.fillStyle(serving ? this.colors.fgMuted : this.colors.fg);
    layer.fillCircle(puck.x, puck.y, table.puckRadius);
    layer.lineStyle(2, this.colors.ink);
    layer.strokeCircle(puck.x, puck.y, table.puckRadius);

    this.drawPips(view.score);
  }

  private drawPips(score: [number, number]): void {
    const layer = this.pipLayer;
    layer.clear();
    const row = (seat: Seat, y: number) => {
      const fill = seat === 0 ? this.colors.accent : this.colors.reward;
      const width = (table.winScore - 1) * PIP_GAP;
      for (let i = 0; i < table.winScore; i += 1) {
        const x = LOGICAL_WIDTH / 2 - width / 2 + i * PIP_GAP;
        layer.lineStyle(2, this.colors.ink);
        layer.fillStyle(i < score[seat] ? fill : this.colors.surface);
        layer.fillCircle(x, y, PIP_RADIUS);
        layer.strokeCircle(x, y, PIP_RADIUS);
      }
    };
    // Each player's tally sits beside the goal they defend.
    const bottomSeat: Seat = this.flipped ? 1 : 0;
    row(bottomSeat, LOGICAL_HEIGHT - TABLE_Y / 2);
    row((1 - bottomSeat) as Seat, TABLE_Y / 2);
  }

  private flashGoal(scorer: Seat): void {
    // The goal that was hit belongs to the other seat.
    const defender = (1 - scorer) as Seat;
    const atBottom = (defender === 0) !== this.flipped;
    const y = atBottom ? TABLE_Y + table.height - 4 : TABLE_Y - 4;
    const layer = this.flashLayer;
    layer.clear().setAlpha(1);
    layer.fillStyle(scorer === 0 ? this.colors.accent : this.colors.reward);
    layer.fillRect(LOGICAL_WIDTH / 2 - table.goalWidth / 2, y, table.goalWidth, 8);
    if (this.host.reducedMotion) return;
    this.tweens.add({ targets: layer, alpha: 0, duration: GOAL_FLASH_MS, delay: 400 });
  }

  private drawTable(): void {
    const { surface, ink, canvas, fgMuted } = this.colors;
    const g = this.add.graphics();
    g.fillStyle(ink);
    g.fillRoundedRect(
      TABLE_X + TABLE_SHADOW,
      TABLE_Y + TABLE_SHADOW,
      table.width,
      table.height,
      TABLE_RADIUS,
    );
    g.fillStyle(surface);
    g.fillRoundedRect(TABLE_X, TABLE_Y, table.width, table.height, TABLE_RADIUS);
    g.lineStyle(2, ink);
    g.strokeRoundedRect(TABLE_X, TABLE_Y, table.width, table.height, TABLE_RADIUS);

    g.lineStyle(2, fgMuted, 0.6);
    g.lineBetween(
      TABLE_X,
      TABLE_Y + table.height / 2,
      TABLE_X + table.width,
      TABLE_Y + table.height / 2,
    );
    g.strokeCircle(LOGICAL_WIDTH / 2, TABLE_Y + table.height / 2, 48);
    g.beginPath();
    g.arc(LOGICAL_WIDTH / 2, TABLE_Y, 70, 0, Math.PI, false);
    g.strokePath();
    g.beginPath();
    g.arc(LOGICAL_WIDTH / 2, TABLE_Y + table.height, 70, Math.PI, Math.PI * 2, false);
    g.strokePath();

    // Goal mouths are cut into the rail so it is obvious where the puck can leave.
    g.fillStyle(canvas);
    const mouthX = LOGICAL_WIDTH / 2 - table.goalWidth / 2;
    g.fillRect(mouthX, TABLE_Y - 3, table.goalWidth, 8);
    g.fillRect(mouthX, TABLE_Y + table.height - 5, table.goalWidth, 8);
    g.fillStyle(ink);
    g.fillRect(mouthX - 4, TABLE_Y - 6, 4, 14);
    g.fillRect(mouthX + table.goalWidth, TABLE_Y - 6, 4, 14);
    g.fillRect(mouthX - 4, TABLE_Y + table.height - 8, 4, 14);
    g.fillRect(mouthX + table.goalWidth, TABLE_Y + table.height - 8, 4, 14);
  }
}
