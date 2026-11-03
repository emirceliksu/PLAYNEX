import Phaser from 'phaser';
import { GameAudio } from '@playnex/game-audio';
import { createRng, dailySeed, ProgressStore, TutorialOverlay, type Rng } from '@playnex/game-kit';
import { PhaserJuice } from '@playnex/game-kit/phaser';
import {
  format,
  toColorNumbers,
  toError,
  type GameHost,
  type PaletteColors,
} from '@playnex/game-sdk';

import { achievements, earnedAtEnd, earnedInPlay } from './achievements';
import {
  createField,
  remainingMs,
  riseOf,
  speedFactor,
  START_LIVES,
  step,
  STEP_MS,
  whack,
  type Difficulty,
  type FieldEvent,
  type FieldState,
  type TargetKind,
  type WhackResult,
} from './field';

export const LOGICAL_SIZE = 720;

const SLUG = 'tokmak-telasi';
const HUD_Y = 46;
const BOARD_X = 60;
const BOARD_Y = 96;
const BOARD_SIZE = 600;
const BOARD_RADIUS = 14;
const BOARD_SHADOW = 8;
const KNOCK_MS = 220;
const SWING_MS = 90;
const MALLET_HEAD = { x: 14, y: -71 };
const LAST_SECONDS = 5;
const FONT_FALLBACK = 'system-ui, sans-serif';

const KEY_ROWS: Record<number, string[][]> = {
  3: [
    ['KeyQ', 'KeyW', 'KeyE'],
    ['KeyA', 'KeyS', 'KeyD'],
    ['KeyZ', 'KeyX', 'KeyC'],
  ],
  4: [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
  ],
};
// The numeric keypad mirrors the 3x3 field: 7 is top left, 3 is bottom right.
const NUMPAD_ROWS = [
  ['Numpad7', 'Numpad8', 'Numpad9'],
  ['Numpad4', 'Numpad5', 'Numpad6'],
  ['Numpad1', 'Numpad2', 'Numpad3'],
];

type Phase = 'idle' | 'playing' | 'paused' | 'finished';

interface Knocked {
  hole: number;
  kind: TargetKind;
  ms: number;
}

interface HoleGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

function keyLabel(code: string): string {
  return code.replace('Key', '').replace('Digit', '');
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export class TokmakScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private readonly difficulty: Difficulty;
  private readonly daily: boolean;
  private readonly progress = new ProgressStore(SLUG);
  private readonly audio: GameAudio;
  private readonly keyHoles = new Map<string, number>();
  private state: FieldState;
  private rng: Rng;
  private phase: Phase = 'idle';
  private accumulator = 0;
  private pendingWhacks: number[] = [];
  private knocked: Knocked[] = [];
  private lastWholeSecond = 0;
  private lastMultiplier = 1;
  private tutorial: TutorialOverlay | null = null;
  private tutorialStep = 0;
  private fontFamily = FONT_FALLBACK;
  private holes: HoleGeometry[] = [];
  private juice!: PhaserJuice;
  private fieldLayer!: Phaser.GameObjects.Graphics;
  private livesLayer!: Phaser.GameObjects.Graphics;
  private mallet!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  constructor(
    private readonly host: GameHost,
    private readonly container: HTMLElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    super(SLUG);
    this.colors = toColorNumbers(host.palette);
    const options = host.session.options;
    this.difficulty =
      (['easy', 'normal', 'hard'] as const).find((value) => value === options.difficulty) ??
      'normal';
    this.daily = options.seed === 'daily';
    this.state = createField(this.difficulty);
    const seed = this.runSeed();
    this.rng = createRng(seed);
    this.audio = new GameAudio({ seed, mood: 'bright' });
  }

  create(): void {
    try {
      this.fontFamily =
        getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() ||
        FONT_FALLBACK;
      this.juice = new PhaserJuice(this, this.host.reducedMotion);
      this.layoutHoles();
      this.drawBoard();
      this.fieldLayer = this.add.graphics();
      this.livesLayer = this.add.graphics();
      this.drawHud();
      this.mallet = this.drawMallet();
      this.bindInput();
      this.audio.unlockOn(this.container);
      this.render();
    } catch (error) {
      this.callbacks.failed(toError(error));
      return;
    }
    this.callbacks.ready();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;
    if (this.juice.frozen) {
      this.render();
      return;
    }
    // Fixed steps keep a run reproducible from its seed and the frames the whacks landed on.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 6);
    while (this.accumulator >= STEP_MS && this.phase === 'playing') {
      this.accumulator -= STEP_MS;
      this.tick();
    }
    this.knocked = this.knocked
      .map((knock) => ({ ...knock, ms: knock.ms + delta }))
      .filter((knock) => knock.ms < KNOCK_MS);
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
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.audio.stopMusic();
    this.input.setDefaultCursor('');
    this.host.onStateChange('paused');
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.audio.gameMusic(this.musicIntensity());
    this.input.setDefaultCursor('none');
    this.host.onStateChange('playing');
  }

  restartRun(): void {
    this.state = createField(this.difficulty);
    this.rng = createRng(this.runSeed());
    this.accumulator = 0;
    this.pendingWhacks = [];
    this.knocked = [];
    this.lastMultiplier = 1;
    this.tutorial?.destroy();
    this.tutorial = null;
    this.host.onScore(0);
    this.beginPlay();
  }

  teardown(): void {
    this.tutorial?.destroy();
    this.audio.destroy();
    this.input.keyboard?.removeAllListeners();
    this.input.removeAllListeners();
  }

  private runSeed(): number {
    return this.daily ? dailySeed(SLUG) : freshSeed();
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.lastWholeSecond = Math.ceil(remainingMs(this.state) / 1000);
    this.input.setDefaultCursor('none');
    this.audio.gameMusic(1);
    this.juice.fadeIn();
    if (!this.progress.progress.tutorialSeen) this.showTutorial();
    this.host.onStateChange('playing');
  }

  private showTutorial(): void {
    this.tutorialStep = 0;
    this.tutorial = new TutorialOverlay(
      this.container,
      ['tutorial_hit', 'tutorial_hedgehog', 'tutorial_combo'].map((key) => ({
        text: this.text(key),
      })),
      () => {
        this.tutorial = null;
        this.progress.update({ tutorialSeen: true });
      },
    );
  }

  private advanceTutorial(stepIndex: number): void {
    if (!this.tutorial || this.tutorialStep !== stepIndex) return;
    this.tutorialStep += 1;
    this.tutorial.next();
  }

  private tick(): void {
    for (const hole of this.pendingWhacks.splice(0)) {
      this.applyWhack(whack(this.state, hole));
      if (this.state.over) break;
    }
    if (!this.state.over) {
      for (const event of step(this.state, this.rng)) this.onFieldEvent(event);
    }
    if (this.state.over) {
      this.finish();
      return;
    }

    const wholeSecond = Math.ceil(remainingMs(this.state) / 1000);
    if (wholeSecond !== this.lastWholeSecond) {
      this.lastWholeSecond = wholeSecond;
      if (wholeSecond <= LAST_SECONDS && wholeSecond > 0) this.audio.sfx('countdown-tick');
      this.audio.setIntensity(this.musicIntensity());
    }
  }

  private musicIntensity(): number {
    return 1 + (1 - speedFactor(this.state.elapsedMs)) * 2.7;
  }

  private onFieldEvent(event: FieldEvent): void {
    if (event.type === 'spawn') {
      this.audio.sfx('pop', { gain: 0.5, pitch: event.kind === 'quick' ? 1.4 : 1 });
      return;
    }
    if (event.type === 'escape') {
      if (event.kind === 'hedgehog') {
        this.advanceTutorial(1);
        return;
      }
      this.audio.sfx('whoosh', { gain: 0.6 });
      this.lastMultiplier = 1;
    }
  }

  private applyWhack(result: WhackResult): void {
    const hole = this.holes[result.hole];
    if (!hole) return;
    this.swingMallet(hole);

    if (result.type === 'miss') {
      this.audio.sfx('buzz', { gain: 0.5 });
      this.lastMultiplier = 1;
      return;
    }

    if (result.type === 'hedgehog') {
      this.knocked.push({ hole: result.hole, kind: 'hedgehog', ms: 0 });
      this.audio.sfx('hurt');
      this.audio.vibrate([40, 30, 40]);
      this.juice.shake(0.01, 180);
      this.juice.floatText(
        hole.x,
        hole.y - hole.radius * 2,
        this.text('hedgehog_penalty'),
        this.host.palette.danger,
      );
      this.lastMultiplier = 1;
      this.host.onScore(this.state.score);
      this.advanceTutorial(1);
      return;
    }

    this.knocked.push({ hole: result.hole, kind: result.kind, ms: 0 });
    this.audio.sfx('hit', { pitch: 1 + Math.min(this.state.combo, 20) * 0.03 });
    this.audio.vibrate(15);
    this.juice.hitStop(35);
    const burstColor = result.kind === 'quick' ? this.colors.reward : this.colors.accent;
    this.juice.burst(hole.x, hole.y - hole.radius, burstColor, { count: 10, speed: 220 });
    this.juice.floatText(
      hole.x,
      hole.y - hole.radius * 2,
      `+${result.points}`,
      this.host.palette.fg,
    );
    if (result.multiplier > this.lastMultiplier) this.audio.sfx('combo');
    this.lastMultiplier = result.multiplier;
    this.host.onScore(this.state.score);
    this.advanceTutorial(0);
    if (this.state.combo >= 5) this.advanceTutorial(2);
    this.unlock(earnedInPlay(this.state));
  }

  private unlock(ids: string[]): void {
    for (const id of ids) {
      if (!this.progress.unlock(id)) continue;
      const achievement = achievements.find((entry) => entry.id === id);
      if (!achievement) continue;
      this.audio.sfx('level-up');
      this.juice.floatText(
        LOGICAL_SIZE / 2,
        BOARD_Y + 40,
        format(this.text('achievement_unlocked'), { title: this.text(achievement.titleKey) }),
        this.host.palette.reward,
      );
    }
  }

  private finish(): void {
    this.phase = 'finished';
    this.audio.stopMusic();
    this.input.setDefaultCursor('');
    this.tutorial?.destroy();
    this.tutorial = null;

    const survived = this.state.lives > 0;
    this.audio.sfx(survived ? 'win' : 'lose');
    if (survived && this.state.score >= 800) {
      this.juice.confetti([this.colors.accent, this.colors.reward, this.colors.danger]);
    }
    this.unlock([...earnedInPlay(this.state), ...earnedAtEnd(this.state, this.daily)]);
    if (this.daily) this.progress.update({ dailyPlayed: new Date().toISOString().slice(0, 10) });
    this.render();

    this.host.onFinish({
      score: this.state.score,
      durationMs: Math.round(this.state.elapsedMs),
      stats: {
        hits: this.state.hits,
        misses: this.state.misses,
        escaped: this.state.escaped,
        bestCombo: this.state.bestCombo,
        hedgehogHits: this.state.hedgehogHits,
      },
    });
    this.host.onStateChange('finished');
  }

  private bindInput(): void {
    const rows = KEY_ROWS[this.state.size] ?? [];
    const layouts = this.state.size === 3 ? [rows, NUMPAD_ROWS] : [rows];
    for (const layout of layouts) {
      layout.flat().forEach((code, hole) => this.keyHoles.set(code, hole));
    }

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.phase !== 'playing') return;
      const hole = this.keyHoles.get(event.code);
      if (hole === undefined) return;
      event.preventDefault();
      this.pendingWhacks.push(hole);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.aimMallet(pointer.x, pointer.y);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing') return;
      this.aimMallet(pointer.x, pointer.y);
      const hole = this.holeAt(pointer.x, pointer.y);
      if (hole !== null) this.pendingWhacks.push(hole);
    });
  }

  private holeAt(x: number, y: number): number | null {
    const cell = BOARD_SIZE / this.state.size;
    const col = Math.floor((x - BOARD_X) / cell);
    const row = Math.floor((y - BOARD_Y) / cell);
    if (col < 0 || row < 0 || col >= this.state.size || row >= this.state.size) return null;
    return row * this.state.size + col;
  }

  private layoutHoles(): void {
    const { size } = this.state;
    const cell = BOARD_SIZE / size;
    this.holes = Array.from({ length: size * size }, (_, index) => ({
      x: BOARD_X + (index % size) * cell + cell / 2,
      y: BOARD_Y + Math.floor(index / size) * cell + cell * 0.56,
      width: cell * 0.7,
      height: cell * 0.22,
      radius: cell * 0.22,
    }));
  }

  private drawBoard(): void {
    const { surface, ink, accentSoft, canvas } = this.colors;
    const board = this.add.graphics();
    board.fillStyle(ink);
    board.fillRoundedRect(
      BOARD_X + BOARD_SHADOW,
      BOARD_Y + BOARD_SHADOW,
      BOARD_SIZE,
      BOARD_SIZE,
      BOARD_RADIUS,
    );
    board.fillStyle(surface);
    board.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);
    board.lineStyle(2, ink);
    board.strokeRoundedRect(BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS);

    const rows = KEY_ROWS[this.state.size] ?? [];
    const labels = rows.flat().map(keyLabel);
    this.holes.forEach((hole, index) => {
      board.fillStyle(accentSoft);
      board.fillEllipse(hole.x, hole.y + 4, hole.width * 1.25, hole.height * 1.9);
      board.lineStyle(2, ink);
      board.strokeEllipse(hole.x, hole.y + 4, hole.width * 1.25, hole.height * 1.9);
      board.fillStyle(canvas);
      board.fillEllipse(hole.x, hole.y, hole.width, hole.height);
      board.strokeEllipse(hole.x, hole.y, hole.width, hole.height);
      this.add
        .text(hole.x, hole.y + hole.height * 1.15 + 2, labels[index] ?? '', {
          fontFamily: this.fontFamily,
          fontSize: '15px',
          fontStyle: '700',
          color: this.host.palette.fgMuted,
        })
        .setOrigin(0.5, 0);
    });
  }

  private drawHud(): void {
    const style = {
      fontFamily: this.fontFamily,
      fontSize: '28px',
      fontStyle: '700',
      color: this.host.palette.fg,
    };
    this.timeText = this.add.text(BOARD_X, HUD_Y, '', style).setOrigin(0, 0.5);
    this.comboText = this.add.text(LOGICAL_SIZE / 2, HUD_Y, '', style).setOrigin(0.5, 0.5);
  }

  private drawMallet(): Phaser.GameObjects.Graphics {
    const { ink, accent, fgMuted } = this.colors;
    const mallet = this.add.graphics();
    // Drawn around the grip so a swing pivots there; aimMallet puts the head on the pointer.
    mallet.fillStyle(fgMuted);
    mallet.fillRoundedRect(10, -60, 12, 64, 4);
    mallet.lineStyle(2, ink);
    mallet.strokeRoundedRect(10, -60, 12, 64, 4);
    mallet.fillStyle(ink);
    mallet.fillRoundedRect(-14, -84, 64, 34, 8);
    mallet.fillStyle(accent);
    mallet.fillRoundedRect(-18, -88, 64, 34, 8);
    mallet.strokeRoundedRect(-18, -88, 64, 34, 8);
    mallet.setPosition(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2);
    mallet.setDepth(10);
    mallet.setVisible(false);
    return mallet;
  }

  private aimMallet(x: number, y: number): void {
    this.mallet.setPosition(x - MALLET_HEAD.x, y - MALLET_HEAD.y);
  }

  private swingMallet(hole: HoleGeometry): void {
    this.mallet.setVisible(true);
    this.aimMallet(hole.x, hole.y - hole.radius);
    if (this.host.reducedMotion) return;
    this.mallet.setAngle(-35);
    this.tweens.add({ targets: this.mallet, angle: 0, duration: SWING_MS, ease: 'Back.easeOut' });
  }

  private render(): void {
    const layer = this.fieldLayer;
    layer.clear();
    this.holes.forEach((hole, index) => {
      const target = this.state.holes[index];
      if (target) {
        this.drawTarget(layer, target.kind, hole, riseOf(target), false);
        return;
      }
      const knock = this.knocked.find((entry) => entry.hole === index);
      if (knock) this.drawTarget(layer, knock.kind, hole, 1 - knock.ms / KNOCK_MS, true);
    });

    this.mallet.setVisible(this.phase === 'playing');
    const seconds = Math.ceil(remainingMs(this.state) / 1000);
    this.timeText.setText(format(this.text('time_left'), { seconds }));
    const { danger, fg } = this.host.palette;
    this.timeText.setColor(seconds <= LAST_SECONDS ? danger : fg);
    const multiplier = this.lastMultiplier;
    this.comboText.setText(multiplier > 1 ? format(this.text('combo'), { multiplier }) : '');
    this.drawLives();
  }

  private drawLives(): void {
    const { danger, ink, surface } = this.colors;
    const layer = this.livesLayer;
    layer.clear();
    for (let life = 0; life < START_LIVES; life += 1) {
      const x = BOARD_X + BOARD_SIZE - 14 - life * 36;
      layer.fillStyle(life < this.state.lives ? danger : surface);
      layer.lineStyle(2, ink);
      const heart = heartPoints(x, HUD_Y, 13);
      layer.fillPoints(heart, true);
      layer.strokePoints(heart, true, true);
    }
  }

  // Shapes are cut at the hole's rim line, so a target looks like it climbs out of the hole.
  private drawTarget(
    layer: Phaser.GameObjects.Graphics,
    kind: TargetKind,
    hole: HoleGeometry,
    rise: number,
    knocked: boolean,
  ): void {
    if (rise <= 0) return;
    const { ink, fgMuted, reward, danger, accentSoft, surface } = this.colors;
    const r = hole.radius;
    const rim = hole.y;
    const cx = hole.x;
    const cy = rim + r * 1.15 - rise * r * 2.05;
    const clip = (points: Phaser.Math.Vector2[]) =>
      points.map((point) => new Phaser.Math.Vector2(point.x, Math.min(point.y, rim)));
    const shape = (points: Phaser.Math.Vector2[], fill: number) => {
      const clipped = clip(points);
      layer.fillStyle(fill);
      layer.fillPoints(clipped, true);
      layer.lineStyle(2, ink);
      layer.strokePoints(clipped, true, true);
    };
    const dot = (x: number, y: number, radius: number, fill: number) => {
      if (y + radius > rim) return;
      layer.fillStyle(fill);
      layer.fillCircle(x, y, radius);
    };

    if (kind === 'hedgehog') {
      shape(spikePoints(cx, cy, r * 1.3, r * 0.95, 16), ink);
      shape(circlePoints(cx, cy + r * 0.15, r * 0.78), surface);
      this.drawEyes(layer, cx, cy, r, knocked, rim);
      dot(cx, cy + r * 0.45, r * 0.14, ink);
      return;
    }

    const head = kind === 'quick' ? reward : fgMuted;
    for (const side of [-1, 1]) {
      shape(circlePoints(cx + side * r * 0.72, cy - r * 0.72, r * 0.42), head);
      dot(cx + side * r * 0.72, cy - r * 0.72, r * 0.2, accentSoft);
    }
    shape(circlePoints(cx, cy, r), head);
    if (kind === 'quick') {
      layer.lineStyle(3, danger);
      const band = cy - r * 0.55;
      if (band < rim) layer.lineBetween(cx - r * 0.8, band, cx + r * 0.8, band);
    }
    this.drawEyes(layer, cx, cy, r, knocked, rim);
    dot(cx, cy + r * 0.3, r * 0.14, danger);
  }

  private drawEyes(
    layer: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    knocked: boolean,
    rim: number,
  ): void {
    const eyeY = cy - r * 0.12;
    if (eyeY + r * 0.15 > rim) return;
    for (const side of [-1, 1]) {
      const x = cx + side * r * 0.36;
      if (knocked) {
        const s = r * 0.13;
        layer.lineStyle(2, this.colors.ink);
        layer.lineBetween(x - s, eyeY - s, x + s, eyeY + s);
        layer.lineBetween(x - s, eyeY + s, x + s, eyeY - s);
      } else {
        layer.fillStyle(this.colors.ink);
        layer.fillCircle(x, eyeY, r * 0.11);
      }
    }
  }

  private text(key: string): string {
    return this.host.messages[key] ?? key;
  }
}

function circlePoints(cx: number, cy: number, radius: number, count = 28): Phaser.Math.Vector2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  });
}

function spikePoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  spikes: number,
): Phaser.Math.Vector2[] {
  return Array.from({ length: spikes * 2 }, (_, i) => {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    return new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  });
}

function heartPoints(cx: number, cy: number, size: number): Phaser.Math.Vector2[] {
  return Array.from({ length: 32 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return new Phaser.Math.Vector2(cx + (x / 16) * size, cy - (y / 16) * size);
  });
}
