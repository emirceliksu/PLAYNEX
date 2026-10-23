import Phaser from 'phaser';
import type { GameHost } from '@playnex/game-sdk';
import { mixColors, toColorNumbers, type PaletteColors } from './colors';
import {
  CARD_COUNT,
  computeScore,
  createMatchState,
  flipCard,
  isComplete,
  type MatchState,
  type Shape,
} from './deck';
import { drawShape } from './shapes';

export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 800;

const COLUMNS = 4;
const ROWS = CARD_COUNT / COLUMNS;
const CARD_WIDTH = 140;
const CARD_HEIGHT = 160;
const CARD_RADIUS = 12;
const CARD_SHADOW = 4;
const GAP = 16;
const GRID_WIDTH = COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP;
const GRID_HEIGHT = ROWS * CARD_HEIGHT + (ROWS - 1) * GAP;
const ORIGIN_X = (LOGICAL_WIDTH - GRID_WIDTH) / 2;
const ORIGIN_Y = (LOGICAL_HEIGHT - GRID_HEIGHT) / 2;
const FLIP_HALF_MS = 80;
const MISMATCH_HOLD_MS = 600;
const HOVER_LIFT = 2;

type Phase = 'idle' | 'playing' | 'paused' | 'finished';
type FaceStyle = 'open' | 'matched' | 'mismatched';

interface CardView {
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Graphics;
  face: Phaser.GameObjects.Graphics;
  shape: Shape;
  faceUp: boolean;
  raised: boolean;
}

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export class MemoryScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private readonly tints: Record<Shape, number>;
  private state: MatchState;
  private cards: CardView[] = [];
  private phase: Phase = 'idle';
  private playTimeMs = 0;
  private inputLocked = false;

  constructor(
    private readonly host: GameHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('memory-flip');
    this.colors = toColorNumbers(host.palette);
    this.tints = shapeTints(this.colors);
    this.state = createMatchState(Math.random);
  }

  create(): void {
    try {
      this.buildCards();
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
    for (const card of this.cards) {
      card.container.destroy();
    }
    this.state = createMatchState(Math.random);
    this.playTimeMs = 0;
    this.inputLocked = false;
    this.buildCards();
    this.beginPlay();
  }

  teardown(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const card of this.cards) {
      card.container.removeAllListeners();
    }
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.host.onStateChange('playing');
    this.host.onScore(this.currentScore());
  }

  private currentScore(): number {
    return computeScore(this.state, this.elapsedSeconds());
  }

  private elapsedSeconds(): number {
    return Math.floor(this.playTimeMs / 1000);
  }

  private buildCards(): void {
    this.cards = this.state.cards.map((shape, index) => this.createCard(index, shape));
  }

  private createCard(index: number, shape: Shape): CardView {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = ORIGIN_X + col * (CARD_WIDTH + GAP) + CARD_WIDTH / 2;
    const y = ORIGIN_Y + row * (CARD_HEIGHT + GAP) + CARD_HEIGHT / 2;

    const back = this.add.graphics();
    this.drawBack(back);
    const face = this.add.graphics();
    face.setVisible(false);

    const container = this.add.container(x, y, [back, face]);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    const card: CardView = { container, back, face, shape, faceUp: false, raised: false };
    this.drawFace(card, 'open');

    container.on('pointerdown', () => this.pressCard(index));
    container.on('pointerover', () => {
      if (this.phase !== 'playing' || this.inputLocked || card.faceUp || card.raised) return;
      card.raised = true;
      container.y -= HOVER_LIFT;
    });
    container.on('pointerout', () => this.lowerCard(card));
    return card;
  }

  private pressCard(index: number): void {
    if (this.phase !== 'playing' || this.inputLocked) return;
    const card = this.cards[index];
    if (!card) return;

    const outcome = flipCard(this.state, index);
    if (outcome.kind === 'ignored') return;

    this.lowerCard(card);
    if (outcome.kind === 'opened') {
      this.flip(card, true);
      return;
    }

    this.inputLocked = true;
    this.host.onScore(this.currentScore());
    const pair = this.pairViews(outcome.pair);

    this.flip(card, true, () => {
      if (outcome.kind === 'matched') {
        for (const view of pair) {
          this.drawFace(view, 'matched');
        }
        this.inputLocked = false;
        if (isComplete(this.state)) {
          this.finish();
        }
        return;
      }

      for (const view of pair) {
        this.drawFace(view, 'mismatched');
      }
      this.time.delayedCall(MISMATCH_HOLD_MS, () => {
        let pending = pair.length;
        for (const view of pair) {
          this.drawFace(view, 'open');
          this.flip(view, false, () => {
            pending -= 1;
            if (pending === 0) {
              this.inputLocked = false;
            }
          });
        }
      });
    });
  }

  private pairViews(pair: [number, number]): CardView[] {
    return pair.flatMap((index) => {
      const view = this.cards[index];
      return view ? [view] : [];
    });
  }

  private flip(card: CardView, faceUp: boolean, onDone?: () => void): void {
    const reveal = () => {
      card.faceUp = faceUp;
      card.back.setVisible(!faceUp);
      card.face.setVisible(faceUp);
    };

    if (this.host.reducedMotion) {
      reveal();
      onDone?.();
      return;
    }

    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: FLIP_HALF_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        reveal();
        this.tweens.add({
          targets: card.container,
          scaleX: 1,
          duration: FLIP_HALF_MS,
          ease: 'Quad.easeOut',
          onComplete: () => onDone?.(),
        });
      },
    });
  }

  private lowerCard(card: CardView): void {
    if (!card.raised) return;
    card.raised = false;
    card.container.y += HOVER_LIFT;
  }

  private finish(): void {
    this.phase = 'finished';
    this.host.onFinish({
      score: this.currentScore(),
      durationMs: Math.round(this.playTimeMs),
      stats: {
        moves: this.state.moves,
        mismatches: this.state.mismatches,
        elapsedSeconds: this.elapsedSeconds(),
      },
    });
    this.host.onStateChange('finished');
  }

  private drawBack(graphics: Phaser.GameObjects.Graphics): void {
    const { surface, ink, accent } = this.colors;
    const left = -CARD_WIDTH / 2;
    const top = -CARD_HEIGHT / 2;
    graphics.fillStyle(ink);
    graphics.fillRoundedRect(
      left + CARD_SHADOW,
      top + CARD_SHADOW,
      CARD_WIDTH,
      CARD_HEIGHT,
      CARD_RADIUS,
    );
    graphics.fillStyle(surface);
    graphics.fillRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    graphics.lineStyle(2, ink);
    graphics.strokeRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);

    graphics.lineStyle(2, ink, 0.6);
    graphics.strokeRoundedRect(left + 12, top + 12, CARD_WIDTH - 24, CARD_HEIGHT - 24, 8);
    graphics.fillStyle(accent);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(0, -12),
        new Phaser.Math.Vector2(12, 0),
        new Phaser.Math.Vector2(0, 12),
        new Phaser.Math.Vector2(-12, 0),
      ],
      true,
    );
  }

  // Matched cards flatten (no shadow, accent outline) like a pressed sticker; mismatches warn in danger.
  private drawFace(card: CardView, style: FaceStyle): void {
    const { surface, ink, accent, danger } = this.colors;
    const graphics = card.face;
    const left = -CARD_WIDTH / 2;
    const top = -CARD_HEIGHT / 2;
    const outline = style === 'matched' ? accent : style === 'mismatched' ? danger : ink;

    graphics.clear();
    if (style !== 'matched') {
      graphics.fillStyle(ink);
      graphics.fillRoundedRect(
        left + CARD_SHADOW,
        top + CARD_SHADOW,
        CARD_WIDTH,
        CARD_HEIGHT,
        CARD_RADIUS,
      );
    }
    graphics.fillStyle(surface);
    graphics.fillRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    graphics.lineStyle(2, outline);
    graphics.strokeRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    drawShape(graphics, card.shape, this.tints[card.shape], ink);
  }
}

// Shapes already differ in form; the tints only help tell them apart faster.
function shapeTints(colors: PaletteColors): Record<Shape, number> {
  const { accent, reward, danger, fg } = colors;
  return {
    circle: accent,
    square: reward,
    triangle: danger,
    diamond: fg,
    ring: mixColors(accent, reward, 0.5),
    cross: mixColors(accent, danger, 0.5),
    star: mixColors(reward, danger, 0.5),
    hexagon: mixColors(accent, fg, 0.5),
  };
}
