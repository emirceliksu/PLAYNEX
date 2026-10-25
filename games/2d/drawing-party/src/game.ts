import {
  format,
  type GameHost,
  type MatchOutcome,
  type OnlineMessage,
  type OnlineSession,
} from '@playnex/game-sdk';
import words from '../data/words.json';
import { BRUSH_SIZES, Sketch, type Stroke } from './sketch';

// Mirrors `apps/realtime/src/matches/drawing.rs` for the shared-device mode.
const DRAW_MS = 80_000;
const LOW_TIME_MS = 10_000;
const GUESS_POINTS = 100;
const TIME_POINTS = 50;
const DRAWER_POINTS = 25;
const MAX_GUESS = 40;

type LocalStage =
  | { kind: 'idle' }
  | { kind: 'handoff'; drawer: number }
  | { kind: 'peek'; drawer: number }
  | { kind: 'drawing'; drawer: number; started: number; deadline: number }
  | { kind: 'roundEnd'; drawer: number; guesser: number | null }
  | { kind: 'finished' };

interface OnlineSnapshot {
  phase: 'leadIn' | 'drawing' | 'intermission' | 'done';
  round: number;
  total: number;
  drawer: number;
  wordShape: number[];
  revealed: [number, string][];
  remainingMs: number;
  guessed: boolean[];
  scores: number[];
}

type OnlineEvent =
  | { kind: 'word'; word: string }
  | { kind: 'stroke'; id: number; color: number; size: number; points: [number, number][] }
  | { kind: 'strokes'; strokes: Stroke[] }
  | { kind: 'clear' }
  | { kind: 'undo' }
  | { kind: 'guessed'; seat: number; scores: number[] }
  | { kind: 'close' }
  | { kind: 'wrong' }
  | { kind: 'hint'; index: number; letter: string }
  | { kind: 'roundEnd'; word: string; gained: number[]; scores: number[] };

export class DrawingGame {
  private readonly root: HTMLDivElement;
  private readonly online: OnlineSession | null;
  private readonly sketch: Sketch;
  private readonly names: string[];
  private scores: number[];
  private stage: LocalStage = { kind: 'idle' };
  private pool: string[];
  private word = '';
  private round = 0;
  private paused: number | null = null;
  private startedAt = 0;
  private frame = 0;
  private timerFill: HTMLDivElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private snapshot: OnlineSnapshot | null = null;
  private snapshotAt = 0;
  private revealed = new Map<number, string>();
  private feedback: 'close' | 'wrong' | null = null;
  private lastRound: { word: string; gained: number[] } | null = null;
  private guessDraft = '';

  constructor(
    container: HTMLElement,
    private readonly host: GameHost,
  ) {
    const session = host.session;
    this.online = session.mode === 'online' ? session : null;
    this.names = session.players.map((player) => player.nickname);
    this.scores = this.names.map(() => 0);
    this.pool = [...(host.locale === 'tr' ? words.tr : words.en)];
    const palette = host.palette;
    const colors = [
      palette.ink,
      palette.accent,
      palette.reward,
      palette.danger,
      palette.accentSoft,
      palette.fgMuted,
      palette.surface,
      palette.fg,
    ];
    this.sketch = new Sketch(palette.fg, colors, (chunk) =>
      this.online?.send({ action: 'stroke', ...chunk }),
    );
    this.root = document.createElement('div');
    this.root.className = 'absolute inset-0 overflow-y-auto';
    container.append(this.root);
    if (this.online) {
      this.unsubscribe = this.online.subscribe((message) => this.onServer(message));
    }
    this.render();
  }

  start(): void {
    this.startedAt = performance.now();
    this.host.onStateChange('playing');
    if (!this.online) {
      this.round = 0;
      this.stage = { kind: 'handoff', drawer: 0 };
    }
    this.render();
    this.tick();
  }

  restart(): void {
    if (this.online) return;
    cancelAnimationFrame(this.frame);
    this.scores = this.names.map(() => 0);
    this.pool = [...(this.host.locale === 'tr' ? words.tr : words.en)];
    this.paused = null;
    this.sketch.clear();
    this.host.onScore(0);
    this.start();
  }

  pause(): void {
    if (this.online || this.paused !== null || this.stage.kind !== 'drawing') return;
    this.paused = this.stage.deadline - performance.now();
    this.sketch.setEnabled(false);
    this.host.onStateChange('paused');
    this.render();
  }

  resume(): void {
    if (this.paused === null || this.stage.kind !== 'drawing') return;
    const deadline = performance.now() + this.paused;
    this.stage = { ...this.stage, deadline, started: deadline - DRAW_MS };
    this.paused = null;
    this.host.onStateChange('playing');
    this.render();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.unsubscribe?.();
    this.sketch.destroy();
    this.root.remove();
  }

  private text(key: string, values: Record<string, string | number> = {}): string {
    return format(this.host.messages[key] ?? '', values);
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const remaining = this.remaining();
    if (this.timerFill) {
      this.timerFill.style.width = `${Math.max(0, remaining / DRAW_MS) * 100}%`;
      this.timerFill.className = `h-full rounded-full ${remaining < LOW_TIME_MS ? 'bg-coral-solid' : 'bg-yellow-solid'}`;
    }
    if (this.online || this.paused !== null) return;
    if (this.stage.kind === 'drawing' && remaining <= 0) this.endLocalRound(null);
  };

  private remaining(): number {
    if (this.online) {
      if (this.snapshot?.phase !== 'drawing') return 0;
      return this.snapshot.remainingMs - (performance.now() - this.snapshotAt);
    }
    if (this.paused !== null) return this.paused;
    return this.stage.kind === 'drawing' ? this.stage.deadline - performance.now() : 0;
  }

  private drawWord(): string {
    const index = Math.floor(Math.random() * this.pool.length);
    const [word] = this.pool.splice(index, 1);
    return word ?? '';
  }

  private beginDrawing(drawer: number): void {
    const now = performance.now();
    this.sketch.clear();
    this.stage = { kind: 'drawing', drawer, started: now, deadline: now + DRAW_MS };
    this.render();
  }

  private endLocalRound(guesser: number | null): void {
    if (this.stage.kind !== 'drawing') return;
    const { drawer, started, deadline } = this.stage;
    if (guesser !== null) {
      const left = Math.max(0, deadline - performance.now()) / (deadline - started);
      this.scores[guesser] =
        (this.scores[guesser] ?? 0) + GUESS_POINTS + Math.round(TIME_POINTS * left);
      this.scores[drawer] = (this.scores[drawer] ?? 0) + DRAWER_POINTS;
    }
    this.host.onScore(Math.max(...this.scores));
    this.stage = { kind: 'roundEnd', drawer, guesser };
    this.render();
  }

  private nextLocalRound(): void {
    this.round += 1;
    if (this.round >= this.names.length) {
      this.stage = { kind: 'finished' };
      cancelAnimationFrame(this.frame);
      this.render();
      this.host.onFinish({
        score: Math.max(...this.scores),
        durationMs: Math.round(performance.now() - this.startedAt),
        outcome: {
          placements: this.scores.map(
            (score) => 1 + this.scores.filter((other) => other > score).length,
          ),
          scores: [...this.scores],
          reason: 'rounds',
        },
      });
      this.host.onStateChange('finished');
      return;
    }
    this.stage = { kind: 'handoff', drawer: this.round };
    this.render();
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot': {
        const snapshot = message.payload as OnlineSnapshot;
        if (snapshot.round !== this.snapshot?.round || snapshot.phase === 'leadIn') {
          if (snapshot.phase === 'drawing' && this.snapshot?.phase !== 'drawing') {
            this.sketch.clear();
            this.word = '';
            this.feedback = null;
            this.revealed = new Map(snapshot.revealed);
          }
        }
        this.snapshot = snapshot;
        this.snapshotAt = performance.now();
        this.scores = snapshot.scores;
        for (const [index, letter] of snapshot.revealed) this.revealed.set(index, letter);
        this.host.onScore(snapshot.scores[this.online?.seat ?? 0] ?? 0);
        this.render();
        return;
      }
      case 'event':
        this.applyEvent(message.payload as OnlineEvent);
        return;
      case 'finish':
        this.finishOnline(message.outcome);
        return;
      case 'rejected':
        return;
    }
  }

  private applyEvent(event: OnlineEvent): void {
    switch (event.kind) {
      case 'word':
        this.word = event.word;
        break;
      case 'stroke':
        this.sketch.add(event);
        return;
      case 'strokes':
        this.sketch.load(event.strokes);
        return;
      case 'clear':
        this.sketch.clear();
        return;
      case 'undo':
        this.sketch.undo();
        return;
      case 'guessed':
        this.scores = event.scores;
        this.host.onScore(event.scores[this.online?.seat ?? 0] ?? 0);
        if (this.snapshot) this.snapshot.guessed[event.seat] = true;
        break;
      case 'close':
      case 'wrong':
        this.feedback = event.kind;
        break;
      case 'hint':
        this.revealed.set(event.index, event.letter);
        break;
      case 'roundEnd':
        this.lastRound = { word: event.word, gained: event.gained };
        this.scores = event.scores;
        this.host.onScore(event.scores[this.online?.seat ?? 0] ?? 0);
        break;
    }
    this.render();
  }

  private finishOnline(outcome: MatchOutcome): void {
    cancelAnimationFrame(this.frame);
    this.sketch.setEnabled(false);
    this.host.onFinish({
      score: outcome.scores[this.online?.seat ?? 0] ?? 0,
      durationMs: Math.round(performance.now() - this.startedAt),
      outcome,
    });
    this.host.onStateChange('finished');
  }

  private render(): void {
    this.timerFill = null;
    const drawerSeat = this.currentDrawer();
    const drawingNow = this.isDrawingPhase();
    const amDrawer = this.online ? drawerSeat === this.online.seat : true;
    this.sketch.setEnabled(drawingNow && amDrawer && this.paused === null);

    const page = el('div', 'mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 p-4 md:p-6');
    page.append(this.renderScoreboard(drawerSeat));

    const interstitial = this.renderInterstitial();
    if (interstitial) {
      page.append(interstitial);
      this.root.replaceChildren(page);
      return;
    }

    const board = el('div', 'flex w-full flex-col gap-3');
    board.append(this.renderTimer(), this.renderPrompt(drawerSeat, amDrawer));
    const canvasBox = el('div', 'mx-auto w-full max-w-[min(100%,62dvh)]');
    canvasBox.append(this.sketch.element);
    board.append(canvasBox);
    if (drawingNow && amDrawer) board.append(this.renderTools());

    const layout = el('div', 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start');
    layout.append(board, this.renderSide(drawerSeat, amDrawer));
    page.append(layout);
    this.root.replaceChildren(page);
  }

  private currentDrawer(): number {
    if (this.online) return this.snapshot?.drawer ?? 0;
    return 'drawer' in this.stage ? this.stage.drawer : 0;
  }

  private isDrawingPhase(): boolean {
    return this.online ? this.snapshot?.phase === 'drawing' : this.stage.kind === 'drawing';
  }

  private renderScoreboard(drawer: number): HTMLElement {
    const list = el('ol', 'flex flex-wrap gap-2');
    list.setAttribute('aria-label', this.text('scoreboard'));
    const mySeat = this.online?.seat ?? null;
    this.names.forEach((name, seat) => {
      const guessed = this.online && this.snapshot?.guessed[seat];
      const item = el(
        'li',
        `flex items-center gap-2 rounded-full border-2 px-3 py-1 ${
          seat === mySeat
            ? 'border-brand-solid bg-brand-soft'
            : 'border-border-subtle bg-surface-raised'
        }`,
        [
          el('span', 'font-display text-label-md', name),
          el(
            'span',
            'font-display text-label-md tabular-nums text-fg-secondary',
            String(this.scores[seat] ?? 0),
          ),
        ],
      );
      if (seat === drawer && this.isDrawingPhase()) {
        item.append(el('span', 'text-label-sm text-yellow-text', this.text('drawerTag')));
      } else if (guessed) {
        item.append(el('span', 'text-label-sm text-mint-text', this.text('guessed')));
      }
      list.append(item);
    });
    return list;
  }

  private renderInterstitial(): HTMLElement | null {
    const center = (children: HTMLElement[]) =>
      el('div', 'mx-auto mt-8 flex max-w-md flex-col items-center gap-4 text-center', children);

    if (this.online) {
      const snapshot = this.snapshot;
      if (!snapshot || snapshot.phase === 'leadIn') {
        return center([el('p', 'font-display text-display-sm', this.text('getReady'))]);
      }
      if (snapshot.phase === 'intermission' && this.lastRound) {
        return center([
          el('p', 'text-label-sm text-fg-muted uppercase', this.text('roundOver')),
          el(
            'p',
            'font-display text-display-sm',
            this.text('theWordWas', { word: this.lastRound.word }),
          ),
          this.renderGains(this.lastRound.gained),
        ]);
      }
      return null;
    }

    const stage = this.stage;
    if (stage.kind === 'handoff') {
      const name = this.names[stage.drawer] ?? '';
      const show = el('button', PRIMARY, this.text('showWord'));
      show.addEventListener('click', () => {
        this.word = this.drawWord();
        this.stage = { kind: 'peek', drawer: stage.drawer };
        this.render();
      });
      queueMicrotask(() => show.focus());
      return center([
        el(
          'p',
          'text-label-sm text-fg-muted uppercase',
          this.text('round', { n: this.round + 1, total: this.names.length }),
        ),
        el('p', 'font-display text-display-sm', this.text('yourTurnDraw', { name })),
        el('p', 'text-body-md text-fg-secondary', this.text('lookAway')),
        show,
      ]);
    }
    if (stage.kind === 'peek') {
      const go = el('button', PRIMARY, this.text('hideAndStart'));
      go.addEventListener('click', () => this.beginDrawing(stage.drawer));
      queueMicrotask(() => go.focus());
      return center([
        el('p', 'text-label-sm text-fg-muted uppercase', this.text('yourWord')),
        el('p', 'font-display text-display-lg', this.word),
        el('p', 'text-body-md text-fg-secondary', this.text('memorise')),
        go,
      ]);
    }
    if (stage.kind === 'roundEnd') {
      const next = el(
        'button',
        PRIMARY,
        this.text(this.round + 1 >= this.names.length ? 'seeResults' : 'nextRound'),
      );
      next.addEventListener('click', () => this.nextLocalRound());
      queueMicrotask(() => next.focus());
      const who =
        stage.guesser === null
          ? this.text('nobodyGuessed')
          : this.text('guessedBy', { name: this.names[stage.guesser] ?? '' });
      return center([
        el('p', 'text-label-sm text-fg-muted uppercase', this.text('roundOver')),
        el('p', 'font-display text-display-sm', this.text('theWordWas', { word: this.word })),
        el('p', 'text-body-md text-fg-secondary', who),
        next,
      ]);
    }
    return null;
  }

  private renderGains(gained: number[]): HTMLElement {
    const list = el('ul', 'flex w-full flex-col gap-1.5');
    this.names.forEach((name, seat) => {
      const points = gained[seat] ?? 0;
      list.append(
        el(
          'li',
          'flex items-center justify-between rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-2',
          [
            el('span', 'font-display text-body-md', name),
            el(
              'span',
              `font-display text-body-md tabular-nums ${points > 0 ? 'text-mint-text' : 'text-fg-muted'}`,
              points > 0 ? `+${points}` : '0',
            ),
          ],
        ),
      );
    });
    return list;
  }

  private renderTimer(): HTMLElement {
    const track = el(
      'div',
      'h-2.5 w-full overflow-hidden rounded-full border-2 border-border-subtle bg-surface-sunken',
    );
    this.timerFill = el('div', 'h-full rounded-full bg-yellow-solid');
    track.append(this.timerFill);
    return track;
  }

  private renderPrompt(drawer: number, amDrawer: boolean): HTMLElement {
    const name = this.names[drawer] ?? '';
    if (this.online && amDrawer) {
      return el('p', 'font-display text-title-md', this.text('drawThis', { word: this.word }));
    }
    if (this.online) {
      return el('div', 'flex flex-wrap items-baseline justify-between gap-2', [
        el('p', 'text-body-md text-fg-secondary', this.text('drawing', { name })),
        this.renderMask(),
      ]);
    }
    return el('p', 'text-body-md text-fg-secondary', this.text('drawingLocal', { name }));
  }

  // Underscores per hidden letter, words separated by wide gaps; revealed hint letters fill in.
  private renderMask(): HTMLElement {
    const known = this.word;
    const shape = this.snapshot?.wordShape ?? [];
    const letters: string[] = [];
    let index = 0;
    shape.forEach((length, wordIndex) => {
      if (wordIndex > 0) {
        letters.push(' ');
        index += 1;
      }
      for (let i = 0; i < length; i += 1) {
        letters.push(known ? ([...known][index] ?? '_') : (this.revealed.get(index) ?? '_'));
        index += 1;
      }
    });
    const mask = el('p', 'font-display text-title-lg tracking-[0.3em]', letters.join(''));
    mask.setAttribute(
      'aria-label',
      this.text('letters', { n: shape.reduce((sum, n) => sum + n, 0) }),
    );
    return mask;
  }

  private renderTools(): HTMLElement {
    const tools = el('div', 'flex flex-wrap items-center justify-center gap-3');
    const swatches = el('div', 'flex flex-wrap gap-1.5');
    swatches.setAttribute('role', 'radiogroup');
    swatches.setAttribute('aria-label', this.text('color'));
    const palette = this.host.palette;
    [
      palette.ink,
      palette.accent,
      palette.reward,
      palette.danger,
      palette.accentSoft,
      palette.fgMuted,
      palette.surface,
      palette.fg,
    ].forEach((color, index) => {
      const swatch = el(
        'button',
        `size-10 rounded-full border-2 ${this.sketch.color === index ? 'border-fg-primary ring-2 ring-border-focus' : 'border-border-strong'}`,
      );
      swatch.style.backgroundColor = color;
      swatch.setAttribute('role', 'radio');
      swatch.setAttribute('aria-checked', String(this.sketch.color === index));
      swatch.setAttribute('aria-label', this.text(index === 7 ? 'eraser' : `color_${index}`));
      swatch.addEventListener('click', () => {
        this.sketch.color = index;
        this.render();
      });
      swatches.append(swatch);
    });
    const sizes = el('div', 'flex gap-1.5');
    sizes.setAttribute('role', 'radiogroup');
    sizes.setAttribute('aria-label', this.text('size'));
    BRUSH_SIZES.forEach((size, index) => {
      const button = el(
        'button',
        `grid size-10 place-items-center rounded-md border-2 ${this.sketch.size === index ? 'border-brand-solid bg-brand-soft' : 'border-border-strong bg-surface-raised'}`,
      );
      const dot = el('span', 'rounded-full bg-fg-primary');
      const px = `${Math.max(4, Math.round(size / 1.6))}px`;
      dot.style.width = px;
      dot.style.height = px;
      button.append(dot);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(this.sketch.size === index));
      button.setAttribute('aria-label', this.text(`size_${index}`));
      button.addEventListener('click', () => {
        this.sketch.size = index;
        this.render();
      });
      sizes.append(button);
    });
    const undo = el('button', SECONDARY, this.text('undo'));
    undo.addEventListener('click', () => {
      this.sketch.undo();
      this.online?.send({ action: 'undo' });
    });
    const clear = el('button', SECONDARY, this.text('clear'));
    clear.addEventListener('click', () => {
      this.sketch.clear();
      this.online?.send({ action: 'clear' });
    });
    tools.append(swatches, sizes, undo, clear);
    return tools;
  }

  private renderSide(drawer: number, amDrawer: boolean): HTMLElement {
    const side = el(
      'div',
      'flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised p-4',
    );
    if (!this.online) {
      // On one screen the room shouts guesses aloud; the drawer marks who got it first.
      side.append(el('p', 'text-label-sm text-fg-muted uppercase', this.text('whoGuessed')));
      this.names.forEach((name, seat) => {
        if (seat === drawer) return;
        const button = el('button', `${SECONDARY} w-full`, name);
        button.addEventListener('click', () => this.endLocalRound(seat));
        side.append(button);
      });
      const nobody = el(
        'button',
        'h-10 text-label-md text-fg-secondary underline-offset-4 hover:underline',
        this.text('nobody'),
      );
      nobody.addEventListener('click', () => this.endLocalRound(null));
      side.append(nobody);
      return side;
    }

    if (amDrawer) {
      side.append(el('p', 'text-body-md text-fg-secondary', this.text('drawerHint')));
      return side;
    }
    const mySeat = this.online.seat;
    if (this.snapshot?.guessed[mySeat]) {
      side.append(
        el(
          'p',
          'font-display text-title-sm text-mint-text',
          this.text('youGuessed', { word: this.word }),
        ),
      );
      return side;
    }
    const form = el('form', 'flex flex-col gap-2');
    const input = el(
      'input',
      'h-12 w-full rounded-lg border-2 border-border-subtle bg-surface-sunken px-4 text-body-md text-fg-primary placeholder:text-fg-muted focus-visible:border-border-focus focus-visible:outline-none',
    );
    input.maxLength = MAX_GUESS;
    input.placeholder = this.text('guessPlaceholder');
    input.setAttribute('aria-label', this.text('guessPlaceholder'));
    input.autocomplete = 'off';
    input.value = this.guessDraft;
    input.addEventListener('input', () => {
      this.guessDraft = input.value;
    });
    const submit = el('button', PRIMARY_SMALL, this.text('guess'));
    submit.type = 'submit';
    form.append(input, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const guess = input.value.trim();
      if (!guess) return;
      this.online?.send({ action: 'guess', text: guess });
      this.guessDraft = '';
      input.value = '';
    });
    side.append(el('p', 'text-label-sm text-fg-muted uppercase', this.text('yourGuess')), form);
    if (this.feedback) {
      const line = el(
        'p',
        `text-body-sm ${this.feedback === 'close' ? 'text-yellow-text' : 'text-fg-secondary'}`,
        this.text(this.feedback),
      );
      line.setAttribute('role', 'status');
      side.append(line);
    }
    if (this.isDrawingPhase()) queueMicrotask(() => input.focus({ preventScroll: true }));
    return side;
  }
}

const PRIMARY =
  'inline-flex h-14 items-center justify-center rounded-md border-2 border-transparent bg-brand-solid px-7 font-display text-title-sm text-fg-on-brand shadow-sticker transition-[transform,background-color,box-shadow] duration-(--pn-duration-fast) ease-out hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-brand-solid-hover hover:shadow-sticker-lg focus-visible:outline-border-focus';
const PRIMARY_SMALL =
  'inline-flex h-11 items-center justify-center rounded-md border-2 border-transparent bg-brand-solid px-5 font-display text-label-md text-fg-on-brand hover:bg-brand-solid-hover focus-visible:outline-border-focus';
const SECONDARY =
  'inline-flex h-10 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-4 font-display text-label-md text-fg-primary hover:border-fg-primary focus-visible:outline-border-focus';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string | (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (typeof content === 'string') node.textContent = content;
  else if (content) node.append(...content);
  return node;
}
