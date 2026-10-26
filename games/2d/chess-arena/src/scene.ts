import Phaser from 'phaser';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  format,
  toError,
  type GameHost,
  type MatchOutcome,
  type OnlineMessage,
  type OnlineSession,
} from '@playnex/game-sdk';
import { toColorNumbers, type PaletteColors } from './colors';
import type { Difficulty, EngineMove } from './engine';
import { drawPiece } from './pieces';
import { other, timeoutVerdict, verdict, type Verdict } from './rules';
import type { Toolbar } from './toolbar';

export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 800;

const CELL = 78;
const BOARD = CELL * 8;
const BOARD_X = (LOGICAL_WIDTH - BOARD) / 2;
const BOARD_Y = 88;
const BOARD_SHADOW = 8;
const STRIP_HEIGHT = 56;
const CLOCK_WIDTH = 132;
const PROMOTIONS: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const FILES = 'abcdefgh';
// Before this many milliseconds remain the clock shows tenths as well.
const LOW_TIME_MS = 10_000;

type Phase = 'idle' | 'playing' | 'paused' | 'finished';

interface OnlineSnapshot {
  fen: string;
  whiteSeat: number;
  turn: Color;
  clocks: { white: number; black: number };
  lastMove: string | null;
  history: string[];
  drawOffer: number | null;
}

export interface SceneCallbacks {
  ready(): void;
  failed(error: Error): void;
}

export interface EngineClient {
  think(fen: string, difficulty: Difficulty): Promise<EngineMove | null>;
}

interface Strip {
  name: Phaser.GameObjects.Text;
  clock: Phaser.GameObjects.Text;
  plate: Phaser.GameObjects.Graphics;
}

export class ChessScene extends Phaser.Scene {
  private readonly colors: PaletteColors;
  private readonly online: OnlineSession | null;
  private readonly difficulty: Difficulty | null;
  private readonly clockMs: number;
  private chess = new Chess();
  private phase: Phase = 'idle';
  private round = 0;
  private bottom: Color = 'w';
  private humanColor: Color | null = null;
  private selected: Square | null = null;
  private targets: Move[] = [];
  private lastMove: { from: Square; to: Square } | null = null;
  private pendingPromotion: { from: Square; to: Square } | null = null;
  private clocks: Record<Color, number>;
  private clockSyncedAt = 0;
  private drawOffer: Color | null = null;
  private thinking = false;
  private playTimeMs = 0;
  private whiteSeat = 0;
  private lastFen = new Chess().fen();
  private labels: Phaser.GameObjects.Text[] = [];
  private unsubscribe: (() => void) | null = null;
  private fontFamily = 'sans-serif';
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private pieceLayer!: Phaser.GameObjects.Graphics;
  private promotionLayer!: Phaser.GameObjects.Graphics;
  private strips!: { top: Strip; bottom: Strip };

  constructor(
    private readonly host: GameHost,
    private readonly engine: EngineClient,
    private readonly toolbar: Toolbar,
    private readonly callbacks: SceneCallbacks,
  ) {
    super('chess-arena');
    this.colors = toColorNumbers(host.palette);
    const session = host.session;
    this.online = session.mode === 'online' ? session : null;
    this.difficulty =
      session.mode === 'solo'
        ? ((session.options.difficulty as Difficulty | undefined) ?? 'normal')
        : null;
    this.clockMs = Number(session.options.minutes ?? 5) * 60_000;
    this.clocks = { w: this.clockMs, b: this.clockMs };
    this.round = this.online?.round ?? 0;
    this.resetSides();
  }

  create(): void {
    try {
      this.fontFamily =
        getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() ||
        this.fontFamily;
      this.drawBoard();
      this.highlightLayer = this.add.graphics();
      this.pieceLayer = this.add.graphics();
      this.promotionLayer = this.add.graphics().setDepth(2);
      this.strips = {
        top: this.createStrip(BOARD_Y - STRIP_HEIGHT - 16),
        bottom: this.createStrip(BOARD_Y + BOARD + 16),
      };
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.onPointer(pointer.x, pointer.y),
      );
      if (this.online) {
        this.unsubscribe = this.online.subscribe((message) => this.onServer(message));
      }
      this.renderAll();
    } catch (error) {
      this.callbacks.failed(toError(error));
      return;
    }
    this.callbacks.ready();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;
    this.playTimeMs += delta;
    if (!this.online) {
      const turn = this.chess.turn();
      this.clocks[turn] = Math.max(0, this.clocks[turn] - delta);
      if (this.clocks[turn] === 0) {
        this.finishLocal(timeoutVerdict(this.chess, turn));
        return;
      }
    }
    this.renderStrips();
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
    this.host.onStateChange('paused');
    this.renderToolbar();
  }

  resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.host.onStateChange('playing');
    this.renderToolbar();
    this.maybeEngineMove();
  }

  restartRun(): void {
    if (this.online) return;
    this.round += 1;
    this.chess = new Chess();
    this.clocks = { w: this.clockMs, b: this.clockMs };
    this.selected = null;
    this.targets = [];
    this.lastMove = null;
    this.pendingPromotion = null;
    this.drawOffer = null;
    this.thinking = false;
    this.playTimeMs = 0;
    this.resetSides();
    this.renderAll();
    this.beginPlay();
  }

  teardown(): void {
    this.unsubscribe?.();
    this.input.removeAllListeners();
  }

  private beginPlay(): void {
    this.phase = 'playing';
    this.host.onStateChange('playing');
    this.renderAll();
    this.maybeEngineMove();
  }

  // Solo players alternate colours between games; online the server decides.
  private resetSides(): void {
    if (this.online) {
      this.bottom = this.whiteSeat === this.online.seat ? 'w' : 'b';
      this.humanColor = this.bottom;
      return;
    }
    if (this.difficulty) {
      this.humanColor = this.round % 2 === 0 ? 'w' : 'b';
      this.bottom = this.humanColor;
      return;
    }
    this.humanColor = null;
    this.bottom = 'w';
  }

  private seatOf(color: Color): number {
    if (this.online) return color === 'w' ? this.whiteSeat : 1 - this.whiteSeat;
    if (this.difficulty) return color === this.humanColor ? 0 : 1;
    return color === 'w' ? 0 : 1;
  }

  private nameOf(color: Color): string {
    if (this.difficulty) {
      return (color === this.humanColor ? this.host.messages.you : this.host.messages.cpu) ?? '';
    }
    const seat = this.seatOf(color);
    return this.host.session.players.find((player) => player.seat === seat)?.nickname ?? '';
  }

  private canAct(): boolean {
    if (this.phase !== 'playing' || this.thinking) return false;
    return this.humanColor === null || this.chess.turn() === this.humanColor;
  }

  private onPointer(x: number, y: number): void {
    if (this.pendingPromotion) {
      this.pickPromotion(x, y);
      return;
    }
    if (!this.canAct()) return;
    const square = this.squareAt(x, y);
    if (!square) return;

    const target = this.targets.find((move) => move.to === square);
    if (this.selected && target) {
      if (target.promotion) {
        this.pendingPromotion = { from: target.from, to: target.to };
        this.renderPromotion();
        return;
      }
      this.play({ from: target.from, to: target.to });
      return;
    }

    const piece = this.chess.get(square);
    if (piece?.color === this.chess.turn()) {
      this.selected = square;
      this.targets = this.chess.moves({ square, verbose: true });
    } else {
      this.selected = null;
      this.targets = [];
    }
    this.renderHighlights();
  }

  private pickPromotion(x: number, y: number): void {
    const pending = this.pendingPromotion;
    if (!pending) return;
    const options = this.promotionCells(pending.to);
    const hit = options.find(
      (option) => x >= option.x && x < option.x + CELL && y >= option.y && y < option.y + CELL,
    );
    this.pendingPromotion = null;
    this.promotionLayer.clear();
    if (hit) this.play({ from: pending.from, to: pending.to, promotion: hit.piece });
  }

  private play(move: { from: string; to: string; promotion?: string }): void {
    const color = this.chess.turn();
    this.chess.move(move);
    this.lastMove = { from: move.from as Square, to: move.to as Square };
    this.selected = null;
    this.targets = [];
    if (this.drawOffer === other(color)) this.drawOffer = null;

    if (this.online) {
      this.online.send({ action: 'move', uci: `${move.from}${move.to}${move.promotion ?? ''}` });
      this.renderAll();
      return;
    }

    this.renderAll();
    const result = verdict(this.chess);
    if (result) {
      this.finishLocal(result);
      return;
    }
    this.maybeEngineMove();
  }

  private maybeEngineMove(): void {
    if (!this.difficulty || this.phase !== 'playing' || this.thinking) return;
    if (this.chess.turn() === this.humanColor) return;
    this.thinking = true;
    this.renderToolbar();
    const fen = this.chess.fen();
    const round = this.round;
    void this.engine.think(fen, this.difficulty).then((move) => {
      // A restart or a finished game while thinking makes the answer stale.
      if (round !== this.round || this.phase === 'finished' || this.chess.fen() !== fen) return;
      this.thinking = false;
      if (move) this.play(move);
      else this.renderToolbar();
    });
  }

  resign(): void {
    if (this.phase !== 'playing') return;
    if (this.online) {
      this.online.send({ action: 'resign' });
      return;
    }
    const loser = this.humanColor ?? this.chess.turn();
    this.finishLocal({ winner: other(loser), reason: 'resign' });
  }

  offerDraw(): void {
    if (this.phase !== 'playing' || this.drawOffer) return;
    if (this.online) {
      this.online.send({ action: 'offerDraw' });
      return;
    }
    // On a shared device the side to move offers and the other side answers right away.
    this.drawOffer = this.chess.turn();
    this.renderToolbar();
  }

  answerDraw(accept: boolean): void {
    if (this.phase !== 'playing' || !this.drawOffer) return;
    if (this.online) {
      this.online.send({ action: accept ? 'acceptDraw' : 'declineDraw' });
      return;
    }
    if (accept) {
      this.finishLocal({ winner: null, reason: 'agreement' });
      return;
    }
    this.drawOffer = null;
    this.renderToolbar();
  }

  private finishLocal(result: Verdict): void {
    this.phase = 'finished';
    this.thinking = false;
    this.renderAll();
    const placements = [1, 1];
    const scores = [0, 0];
    if (result.winner) {
      const winnerSeat = this.seatOf(result.winner);
      placements[winnerSeat] = 1;
      placements[1 - winnerSeat] = 2;
      scores[winnerSeat] = 1;
    }
    this.report({ placements, scores, reason: result.reason });
  }

  private report(outcome: MatchOutcome): void {
    const mySeat = this.online?.seat ?? 0;
    const won = outcome.placements[mySeat] === 1 && outcome.placements[1 - mySeat] === 2;
    this.host.onScore(won ? 1 : 0);
    this.host.onFinish({
      score: won ? 1 : 0,
      durationMs: Math.round(this.playTimeMs),
      stats: { moves: this.chess.history().length },
      outcome,
    });
    this.host.onStateChange('finished');
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot':
        this.applySnapshot(message.payload as OnlineSnapshot);
        return;
      case 'finish':
        this.phase = 'finished';
        this.renderAll();
        this.report(message.outcome);
        return;
      case 'rejected':
        // The optimistic move was refused; the last snapshot is the truth.
        this.chess.load(this.lastFen);
        this.renderAll();
        return;
      case 'event':
        return;
    }
  }

  private applySnapshot(snapshot: OnlineSnapshot): void {
    this.lastFen = snapshot.fen;
    this.chess.load(snapshot.fen);
    this.whiteSeat = snapshot.whiteSeat;
    this.resetSides();
    this.clocks = { w: snapshot.clocks.white, b: snapshot.clocks.black };
    this.clockSyncedAt = performance.now();
    this.lastMove = snapshot.lastMove
      ? {
          from: snapshot.lastMove.slice(0, 2) as Square,
          to: snapshot.lastMove.slice(2, 4) as Square,
        }
      : null;
    this.drawOffer =
      snapshot.drawOffer === null ? null : snapshot.drawOffer === this.whiteSeat ? 'w' : 'b';
    this.selected = null;
    this.targets = [];
    this.renderAll();
  }

  private displayedClock(color: Color): number {
    if (!this.online || this.phase !== 'playing' || this.chess.turn() !== color) {
      return this.clocks[color];
    }
    return Math.max(0, this.clocks[color] - (performance.now() - this.clockSyncedAt));
  }

  private renderAll(): void {
    this.renderHighlights();
    this.renderPieces();
    this.renderStrips();
    this.renderToolbar();
  }

  private renderToolbar(): void {
    const messages = this.host.messages;
    const playing = this.phase === 'playing';
    const answering =
      this.drawOffer !== null &&
      (this.humanColor === null ? true : this.drawOffer !== this.humanColor);
    let status = '';
    if (this.thinking) status = messages.thinking ?? '';
    else if (answering && this.drawOffer)
      status = format(messages.drawOffered ?? '', { name: this.nameOf(this.drawOffer) });
    else if (this.drawOffer) status = messages.drawSent ?? '';
    this.toolbar.render({
      visible: playing,
      status,
      canResign: playing,
      canOfferDraw: playing && this.difficulty === null && this.drawOffer === null,
      answeringDraw: playing && answering,
    });
  }

  private squareAt(x: number, y: number): Square | null {
    const col = Math.floor((x - BOARD_X) / CELL);
    const row = Math.floor((y - BOARD_Y) / CELL);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = this.bottom === 'w' ? col : 7 - col;
    const rank = this.bottom === 'w' ? 7 - row : row;
    return `${FILES[file]}${rank + 1}` as Square;
  }

  private squareOrigin(square: Square): { x: number; y: number } {
    const file = FILES.indexOf(square[0] ?? 'a');
    const rank = Number(square[1]) - 1;
    const col = this.bottom === 'w' ? file : 7 - file;
    const row = this.bottom === 'w' ? 7 - rank : rank;
    return { x: BOARD_X + col * CELL, y: BOARD_Y + row * CELL };
  }

  private drawBoard(): void {
    const { ink, fgMuted, accentSoft } = this.colors;
    const g = this.add.graphics();
    g.fillStyle(ink);
    g.fillRect(BOARD_X + BOARD_SHADOW, BOARD_Y + BOARD_SHADOW, BOARD, BOARD);
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        g.fillStyle((row + col) % 2 === 0 ? fgMuted : accentSoft);
        g.fillRect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL);
      }
    }
    g.lineStyle(2, ink);
    g.strokeRect(BOARD_X, BOARD_Y, BOARD, BOARD);
  }

  private renderCoordinates(): void {
    for (const label of this.labels) label.destroy();
    this.labels = [];
    const style = { fontFamily: this.fontFamily, fontSize: '13px', fontStyle: '600' };
    for (let i = 0; i < 8; i += 1) {
      const file = this.bottom === 'w' ? FILES[i] : FILES[7 - i];
      const rank = this.bottom === 'w' ? 8 - i : i + 1;
      const fileColor = (7 + i) % 2 === 0 ? this.colors.accentSoft : this.colors.fgMuted;
      const rankColor = i % 2 === 0 ? this.colors.accentSoft : this.colors.fgMuted;
      this.labels.push(
        this.add
          .text(BOARD_X + i * CELL + CELL - 4, BOARD_Y + BOARD - 4, file ?? '', {
            ...style,
            color: hex(fileColor),
          })
          .setOrigin(1, 1),
        this.add
          .text(BOARD_X + 4, BOARD_Y + i * CELL + 3, String(rank), {
            ...style,
            color: hex(rankColor),
          })
          .setOrigin(0, 0),
      );
    }
  }

  private renderHighlights(): void {
    const g = this.highlightLayer;
    g.clear();
    const tint = (square: Square, color: number, alpha: number) => {
      const { x, y } = this.squareOrigin(square);
      g.fillStyle(color, alpha);
      g.fillRect(x, y, CELL, CELL);
    };
    if (this.lastMove) {
      tint(this.lastMove.from, this.colors.reward, 0.35);
      tint(this.lastMove.to, this.colors.reward, 0.5);
    }
    if (this.chess.inCheck()) {
      const king = this.chess.findPiece({ type: 'k', color: this.chess.turn() })[0];
      if (king) tint(king, this.colors.danger, 0.65);
    }
    if (this.selected) tint(this.selected, this.colors.accent, 0.55);
    for (const move of this.targets) {
      const { x, y } = this.squareOrigin(move.to);
      g.lineStyle(4, this.colors.ink, 0.45);
      g.fillStyle(this.colors.ink, 0.4);
      if (move.captured) g.strokeCircle(x + CELL / 2, y + CELL / 2, CELL / 2 - 5);
      else g.fillCircle(x + CELL / 2, y + CELL / 2, 11);
    }
    this.renderCoordinates();
  }

  private renderPieces(): void {
    const g = this.pieceLayer;
    g.clear();
    const inset = 6;
    for (const rank of this.chess.board()) {
      for (const piece of rank) {
        if (!piece) continue;
        const { x, y } = this.squareOrigin(piece.square);
        const white = piece.color === 'w';
        drawPiece(
          g,
          piece.type,
          x + inset,
          y + inset,
          CELL - inset * 2,
          white ? this.colors.fg : this.colors.ink,
          white ? this.colors.ink : this.colors.fg,
        );
      }
    }
  }

  private promotionCells(to: Square): { piece: PieceSymbol; x: number; y: number }[] {
    const { x, y } = this.squareOrigin(to);
    const downwards = y === BOARD_Y;
    return PROMOTIONS.map((piece, index) => ({
      piece,
      x,
      y: downwards ? y + index * CELL : y - index * CELL,
    }));
  }

  private renderPromotion(): void {
    const g = this.promotionLayer;
    g.clear();
    const pending = this.pendingPromotion;
    if (!pending) return;
    const color = this.chess.turn();
    for (const cell of this.promotionCells(pending.to)) {
      g.fillStyle(this.colors.ink);
      g.fillRect(cell.x + 4, cell.y + 4, CELL, CELL);
      g.fillStyle(this.colors.surface);
      g.fillRect(cell.x, cell.y, CELL, CELL);
      g.lineStyle(2, this.colors.ink);
      g.strokeRect(cell.x, cell.y, CELL, CELL);
      drawPiece(
        g,
        cell.piece,
        cell.x + 8,
        cell.y + 8,
        CELL - 16,
        color === 'w' ? this.colors.fg : this.colors.ink,
        color === 'w' ? this.colors.ink : this.colors.fg,
      );
    }
  }

  private createStrip(y: number): Strip {
    const plate = this.add.graphics();
    plate.setPosition(BOARD_X + BOARD - CLOCK_WIDTH, y);
    const style = { fontFamily: this.fontFamily, fontStyle: '700' };
    const name = this.add
      .text(BOARD_X, y + STRIP_HEIGHT / 2, '', {
        ...style,
        fontSize: '22px',
        color: hex(this.colors.fg),
      })
      .setOrigin(0, 0.5);
    const clock = this.add
      .text(BOARD_X + BOARD - CLOCK_WIDTH / 2, y + STRIP_HEIGHT / 2, '', {
        ...style,
        fontSize: '28px',
      })
      .setOrigin(0.5, 0.5);
    return { name, clock, plate };
  }

  private renderStrips(): void {
    const sides: [Strip, Color][] = [
      [this.strips.top, other(this.bottom)],
      [this.strips.bottom, this.bottom],
    ];
    for (const [strip, color] of sides) {
      const active = this.phase === 'playing' && this.chess.turn() === color;
      const ms = this.displayedClock(color);
      strip.name.setText(this.nameOf(color));
      strip.clock.setText(formatClock(ms));
      strip.clock.setColor(hex(active ? this.colors.ink : this.colors.fg));
      strip.plate.clear();
      strip.plate.fillStyle(this.colors.ink);
      strip.plate.fillRoundedRect(4, 4, CLOCK_WIDTH, STRIP_HEIGHT, 10);
      strip.plate.fillStyle(
        active ? (ms < LOW_TIME_MS ? this.colors.danger : this.colors.accent) : this.colors.surface,
      );
      strip.plate.fillRoundedRect(0, 0, CLOCK_WIDTH, STRIP_HEIGHT, 10);
      strip.plate.lineStyle(2, this.colors.ink);
      strip.plate.strokeRoundedRect(0, 0, CLOCK_WIDTH, STRIP_HEIGHT, 10);
    }
  }
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (ms < LOW_TIME_MS) {
    return `0:${(ms / 1000).toFixed(1).padStart(4, '0')}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
