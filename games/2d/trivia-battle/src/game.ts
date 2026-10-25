import {
  format,
  type GameHost,
  type MatchOutcome,
  type OnlineMessage,
  type OnlineSession,
} from '@playnex/game-sdk';
import {
  findQuestion,
  LEAD_IN_MS,
  pickQuestions,
  pointsFor,
  QUESTION_MS,
  REVEAL_MS,
  type Question,
} from './quiz';

const LETTERS = ['A', 'B', 'C', 'D'];
const LOW_TIME_MS = 5_000;

type Stage =
  | { kind: 'idle' }
  | { kind: 'leadIn'; deadline: number }
  | { kind: 'handoff'; seat: number }
  | { kind: 'question'; seat: number; opened: number; deadline: number }
  | { kind: 'reveal'; deadline: number }
  | { kind: 'finished' };

interface Seat {
  nickname: string;
  score: number;
  streak: number;
}

interface Answer {
  choice: number | null;
  takenMs: number;
}

interface RevealView {
  correct: number;
  choices: (number | null)[];
  gained: number[];
}

interface OnlineSnapshot {
  phase: 'leadIn' | 'question' | 'reveal' | 'done';
  round: number;
  total: number;
  questionId: string | null;
  remainingMs: number;
  answered: boolean[];
  scores: number[];
}

interface OnlineEvent {
  kind: 'answered' | 'reveal';
  seat?: number;
  correct?: number;
  choices?: (number | null)[];
  gained?: number[];
  scores?: number[];
  streaks?: number[];
}

// DOM rather than canvas: questions are long, localized text and the answers
// must be real buttons for screen readers and keyboards.
export class TriviaGame {
  private readonly root: HTMLDivElement;
  private readonly online: OnlineSession | null;
  private readonly category: string;
  private stage: Stage = { kind: 'idle' };
  private questions: Question[] = [];
  private question: Question | null = null;
  private round = 0;
  private total = 0;
  private seats: Seat[];
  private answers: Answer[] = [];
  private answered: boolean[] = [];
  private reveal: RevealView | null = null;
  private paused: { remaining: number } | null = null;
  private frame = 0;
  private startedAt = 0;
  private unsubscribe: (() => void) | null = null;
  private timerFill: HTMLDivElement | null = null;
  private timerLabel: HTMLSpanElement | null = null;
  private readonly onKey = (event: KeyboardEvent) => this.handleKey(event);

  constructor(
    container: HTMLElement,
    private readonly host: GameHost,
  ) {
    const session = host.session;
    this.online = session.mode === 'online' ? session : null;
    this.category = session.options.category ?? 'mixed';
    const players = session.players.length > 0 ? session.players : [{ seat: 0, nickname: '' }];
    this.seats = players.map((player) => ({ nickname: player.nickname, score: 0, streak: 0 }));
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
    window.addEventListener('keydown', this.onKey);
    this.host.onStateChange('playing');
    if (this.online) {
      this.render();
      return;
    }
    this.questions = pickQuestions(this.category);
    this.total = this.questions.length;
    this.round = 0;
    this.stage = { kind: 'leadIn', deadline: performance.now() + LEAD_IN_MS };
    this.render();
    this.tick();
  }

  restart(): void {
    if (this.online) return;
    cancelAnimationFrame(this.frame);
    this.seats = this.seats.map((seat) => ({ ...seat, score: 0, streak: 0 }));
    this.reveal = null;
    this.paused = null;
    this.host.onScore(0);
    this.start();
  }

  pause(): void {
    if (this.online || this.paused) return;
    const deadline = 'deadline' in this.stage ? this.stage.deadline : null;
    if (this.stage.kind === 'finished' || this.stage.kind === 'idle') return;
    this.paused = { remaining: deadline === null ? 0 : deadline - performance.now() };
    cancelAnimationFrame(this.frame);
    this.host.onStateChange('paused');
    this.render();
  }

  resume(): void {
    if (!this.paused) return;
    const shift = performance.now() + this.paused.remaining;
    if ('deadline' in this.stage) {
      const opened =
        this.stage.kind === 'question' ? shift - (this.stage.deadline - this.stage.opened) : 0;
      this.stage =
        this.stage.kind === 'question'
          ? { ...this.stage, deadline: shift, opened }
          : { ...this.stage, deadline: shift };
    }
    this.paused = null;
    this.host.onStateChange('playing');
    this.render();
    this.tick();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKey);
    this.unsubscribe?.();
    this.root.remove();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    if (this.paused) return;
    const now = performance.now();
    this.updateTimer(now);
    if (this.online) return;
    const stage = this.stage;
    if (!('deadline' in stage) || now < stage.deadline) return;
    if (stage.kind === 'leadIn') this.openRound();
    else if (stage.kind === 'question') this.answer(null);
    else if (stage.kind === 'reveal') this.nextRound();
  };

  private multi(): boolean {
    return this.seats.length > 1;
  }

  private openRound(): void {
    this.question = this.questions[this.round] ?? null;
    this.answers = this.seats.map(() => ({ choice: null, takenMs: QUESTION_MS }));
    this.reveal = null;
    this.handTo(0);
  }

  private handTo(seat: number): void {
    // Passing the device needs a deliberate tap so the next player is not
    // shown the question before they are holding it.
    if (this.multi()) {
      this.stage = { kind: 'handoff', seat };
      this.render();
      return;
    }
    this.openQuestion(seat);
  }

  private openQuestion(seat: number): void {
    const now = performance.now();
    this.stage = { kind: 'question', seat, opened: now, deadline: now + QUESTION_MS };
    this.render();
  }

  private answer(choice: number | null): void {
    const stage = this.stage;
    if (stage.kind !== 'question' || this.paused) return;
    if (this.online) {
      if (choice === null || this.answers[0]?.choice != null) return;
      this.answers = [{ choice, takenMs: 0 }];
      this.online.send({ round: this.round, choice });
      this.render();
      return;
    }
    this.answers[stage.seat] = {
      choice,
      takenMs: Math.min(QUESTION_MS, performance.now() - stage.opened),
    };
    if (stage.seat + 1 < this.seats.length) {
      this.handTo(stage.seat + 1);
      return;
    }
    this.revealLocal();
  }

  private revealLocal(): void {
    const correct = this.question?.correct ?? 0;
    const gained = this.seats.map((seat, index) => {
      const answer = this.answers[index];
      const right = answer?.choice === correct;
      seat.streak = right ? seat.streak + 1 : 0;
      const points = pointsFor(right, answer?.takenMs ?? QUESTION_MS, seat.streak);
      seat.score += points;
      return points;
    });
    this.reveal = { correct, choices: this.answers.map((answer) => answer.choice), gained };
    this.host.onScore(Math.max(...this.seats.map((seat) => seat.score)));
    this.stage = { kind: 'reveal', deadline: performance.now() + REVEAL_MS };
    this.render();
  }

  private nextRound(): void {
    this.round += 1;
    if (this.round >= this.questions.length) {
      this.finishLocal();
      return;
    }
    this.openRound();
  }

  private finishLocal(): void {
    this.stage = { kind: 'finished' };
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKey);
    const scores = this.seats.map((seat) => seat.score);
    const durationMs = Math.round(performance.now() - this.startedAt);
    this.render();
    if (!this.multi()) {
      this.host.onFinish({ score: scores[0] ?? 0, durationMs });
    } else {
      this.host.onFinish({ score: Math.max(...scores), durationMs, outcome: ranked(scores) });
    }
    this.host.onStateChange('finished');
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot':
        this.applySnapshot(message.payload as OnlineSnapshot);
        return;
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

  private applySnapshot(snapshot: OnlineSnapshot): void {
    const now = performance.now();
    const roundChanged = snapshot.round !== this.round || this.question === null;
    this.round = snapshot.round;
    this.total = snapshot.total;
    this.answered = snapshot.answered;
    snapshot.scores.forEach((score, seat) => {
      const entry = this.seats[seat];
      if (entry) entry.score = score;
    });
    if (snapshot.questionId) this.question = findQuestion(snapshot.questionId) ?? null;
    const deadline = now + snapshot.remainingMs;
    if (snapshot.phase === 'leadIn') this.stage = { kind: 'leadIn', deadline };
    if (snapshot.phase === 'question') {
      if (roundChanged || this.stage.kind !== 'question') {
        this.answers = [{ choice: null, takenMs: 0 }];
        this.reveal = null;
      }
      this.stage = {
        kind: 'question',
        seat: this.online?.seat ?? 0,
        opened: deadline - QUESTION_MS,
        deadline,
      };
    }
    if (snapshot.phase === 'reveal') this.stage = { kind: 'reveal', deadline };
    this.render();
    cancelAnimationFrame(this.frame);
    this.tick();
  }

  private applyEvent(event: OnlineEvent): void {
    if (event.kind === 'answered' && event.seat !== undefined) {
      this.answered[event.seat] = true;
      this.render();
      return;
    }
    if (event.kind === 'reveal' && event.correct !== undefined) {
      this.reveal = {
        correct: event.correct,
        choices: event.choices ?? [],
        gained: event.gained ?? [],
      };
      event.scores?.forEach((score, seat) => {
        const entry = this.seats[seat];
        if (entry) entry.score = score;
      });
      event.streaks?.forEach((streak, seat) => {
        const entry = this.seats[seat];
        if (entry) entry.streak = streak;
      });
      this.host.onScore(this.seats[this.online?.seat ?? 0]?.score ?? 0);
      this.render();
    }
  }

  private finishOnline(outcome: MatchOutcome): void {
    this.stage = { kind: 'finished' };
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKey);
    this.render();
    this.host.onFinish({
      score: outcome.scores[this.online?.seat ?? 0] ?? 0,
      durationMs: Math.round(performance.now() - this.startedAt),
      outcome,
    });
    this.host.onStateChange('finished');
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.stage.kind !== 'question' || this.paused) return;
    const index =
      ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(
        event.code,
      ) % 4;
    if (index < 0 || event.repeat) return;
    event.preventDefault();
    this.answer(index);
  }

  private text(key: string, values: Record<string, string | number> = {}): string {
    return format(this.host.messages[key] ?? '', values);
  }

  private render(): void {
    const page = el('div', 'mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 p-4 md:p-8');
    this.timerFill = null;
    this.timerLabel = null;
    if (this.multi()) page.append(this.renderScoreboard());

    const stage = this.stage;
    if (stage.kind === 'leadIn') {
      page.append(
        el('p', 'mt-10 text-center font-display text-display-md', this.text('getReady')),
        this.renderTimer(),
      );
    } else if (stage.kind === 'handoff') {
      const name = this.seats[stage.seat]?.nickname ?? '';
      const ready = el('button', `${PRIMARY} mx-auto`, this.text('ready'));
      ready.addEventListener('click', () => this.openQuestion(stage.seat));
      page.append(
        el('div', 'mt-10 flex flex-col items-center gap-4 text-center', [
          el('p', 'text-label-sm text-fg-muted uppercase', this.roundLabel()),
          el('p', 'font-display text-display-sm', this.text('yourTurn', { name })),
          el('p', 'max-w-sm text-body-md text-fg-secondary', this.text('passDevice', { name })),
          ready,
        ]),
      );
      queueMicrotask(() => ready.focus());
    } else if ((stage.kind === 'question' || stage.kind === 'reveal') && this.question) {
      page.append(this.renderQuestion(this.question, stage));
    }

    this.root.replaceChildren(page);
    if (this.paused) this.root.setAttribute('aria-hidden', 'true');
    else this.root.removeAttribute('aria-hidden');
  }

  private roundLabel(): string {
    return this.text('round', { n: this.round + 1, total: this.total || this.questions.length });
  }

  private renderScoreboard(): HTMLElement {
    const mySeat = this.online?.seat ?? null;
    const list = el('ol', 'flex flex-wrap gap-2');
    list.setAttribute('aria-label', this.text('scoreboard'));
    this.seats.forEach((seat, index) => {
      const answered =
        this.stage.kind === 'question' &&
        (this.online ? this.answered[index] : this.answers[index]?.choice != null);
      const item = el(
        'li',
        `flex items-center gap-2 rounded-full border-2 px-3 py-1 ${
          index === mySeat
            ? 'border-brand-solid bg-brand-soft'
            : 'border-border-subtle bg-surface-raised'
        }`,
        [
          el('span', 'font-display text-label-md', seat.nickname),
          el(
            'span',
            'font-display text-label-md tabular-nums text-fg-secondary',
            String(seat.score),
          ),
        ],
      );
      if (answered) item.append(el('span', 'text-label-sm text-mint-text', this.text('answered')));
      list.append(item);
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
    this.timerLabel = el('span', 'sr-only');
    const wrap = el('div', 'flex flex-col gap-1', [track, this.timerLabel]);
    this.updateTimer(performance.now());
    return wrap;
  }

  private updateTimer(now: number): void {
    if (!this.timerFill) return;
    const stage = this.stage;
    if (!('deadline' in stage)) return;
    const span =
      stage.kind === 'question' ? QUESTION_MS : stage.kind === 'leadIn' ? LEAD_IN_MS : REVEAL_MS;
    const remaining = this.paused ? this.paused.remaining : Math.max(0, stage.deadline - now);
    this.timerFill.style.width = `${(remaining / span) * 100}%`;
    this.timerFill.className = `h-full rounded-full ${
      stage.kind === 'question' && remaining < LOW_TIME_MS ? 'bg-coral-solid' : 'bg-yellow-solid'
    }`;
    const seconds = String(Math.ceil(remaining / 1000));
    if (this.timerLabel && this.timerLabel.textContent !== seconds) {
      this.timerLabel.textContent = seconds;
    }
  }

  private renderQuestion(question: Question, stage: Stage): HTMLElement {
    const copy = question[this.host.locale];
    const revealing = stage.kind === 'reveal' && this.reveal !== null;
    const answerSeat = this.online ? 0 : stage.kind === 'question' ? stage.seat : 0;
    const mine = this.answers[answerSeat]?.choice ?? null;
    const viewSeat = this.online?.seat ?? 0;

    const header = el('div', 'flex items-center justify-between gap-3', [
      el('p', 'text-label-sm text-fg-muted uppercase', this.roundLabel()),
      el(
        'span',
        'rounded-sm bg-surface-overlay px-2 py-0.5 font-display text-label-sm text-fg-secondary uppercase',
        this.text(`category_${question.category}`),
      ),
    ]);

    const grid = el('div', 'grid gap-3 sm:grid-cols-2');
    copy.a.forEach((answer, index) => {
      const button = el('button', ANSWER);
      button.type = 'button';
      button.append(
        el(
          'span',
          'grid size-9 shrink-0 place-items-center rounded-md border-2 border-border-strong bg-surface-sunken font-display text-label-md',
          LETTERS[index] ?? '',
        ),
        el('span', 'font-display text-title-sm', answer),
      );
      // On a shared device the reveal lists everyone below, so only the right answer is marked.
      const sharedReveal = revealing && this.multi() && !this.online;
      const chosen = revealing
        ? !sharedReveal && this.reveal?.choices[viewSeat] === index
        : mine === index;
      let tone = ANSWER_IDLE;
      if (revealing) {
        button.disabled = true;
        if (index === this.reveal?.correct) tone = ANSWER_RIGHT;
        else if (chosen) tone = ANSWER_WRONG;
        else tone = ANSWER_DIMMED;
      } else if (mine !== null) {
        button.disabled = true;
        tone = chosen ? ANSWER_PICKED : ANSWER_DIMMED;
      }
      button.className = `${ANSWER} ${tone}`;
      if (!button.disabled) {
        button.addEventListener('click', () => this.answer(index));
      }
      button.setAttribute('aria-keyshortcuts', String(index + 1));
      grid.append(button);
    });

    const parts: HTMLElement[] = [header];
    if (stage.kind === 'question') parts.push(this.renderTimer());
    parts.push(el('h2', 'font-display text-title-lg md:text-display-sm', copy.q), grid);

    if (revealing && this.reveal) parts.push(this.renderRevealSummary(this.reveal));
    else if (this.online && mine !== null) {
      parts.push(el('p', 'text-center text-body-md text-fg-secondary', this.text('waitingOthers')));
    }
    if (stage.kind === 'question' && mine === null) {
      queueMicrotask(() => grid.querySelector('button')?.focus({ preventScroll: true }));
    }
    return el('div', 'flex flex-col gap-5', parts);
  }

  private renderRevealSummary(reveal: RevealView): HTMLElement {
    if (!this.multi() || this.online) {
      const seat = this.online?.seat ?? 0;
      const gained = reveal.gained[seat] ?? 0;
      const choice = reveal.choices[seat];
      const line =
        gained > 0
          ? this.text('correct', { points: gained })
          : choice === null || choice === undefined
            ? this.text('timeUp')
            : this.text('wrong');
      const streak = this.seats[seat]?.streak ?? 0;
      return el(
        'p',
        `text-center font-display text-title-md ${gained > 0 ? 'text-mint-text' : 'text-coral-text'}`,
        [
          line,
          ...(streak > 1
            ? [el('span', 'ml-2 text-fg-secondary', this.text('streak', { n: streak }))]
            : []),
        ],
      );
    }
    const list = el('ul', 'flex flex-col gap-1.5');
    this.seats.forEach((seat, index) => {
      const gained = reveal.gained[index] ?? 0;
      list.append(
        el(
          'li',
          'flex items-center justify-between rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-2',
          [
            el('span', 'font-display text-body-md', seat.nickname),
            el(
              'span',
              `font-display text-body-md tabular-nums ${gained > 0 ? 'text-mint-text' : 'text-fg-muted'}`,
              gained > 0 ? `+${gained}` : this.text('noPoints'),
            ),
          ],
        ),
      );
    });
    return list;
  }
}

const PRIMARY =
  'inline-flex h-14 items-center justify-center rounded-md border-2 border-transparent bg-brand-solid px-7 font-display text-title-sm text-fg-on-brand shadow-sticker transition-[transform,background-color,box-shadow] duration-(--pn-duration-fast) ease-out hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-brand-solid-hover hover:shadow-sticker-lg focus-visible:outline-border-focus';

const ANSWER =
  'flex min-h-16 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-[transform,border-color,background-color] duration-(--pn-duration-fast) ease-out focus-visible:outline-border-focus enabled:active:translate-y-0.5 disabled:cursor-default';
const ANSWER_IDLE = 'border-border-strong bg-surface-raised hover:border-fg-primary';
const ANSWER_PICKED = 'border-brand-solid bg-brand-soft';
const ANSWER_RIGHT = 'border-mint-solid bg-mint-soft';
const ANSWER_WRONG = 'border-coral-solid bg-coral-soft';
const ANSWER_DIMMED = 'border-border-subtle bg-surface-raised opacity-60';

function ranked(scores: number[]): MatchOutcome {
  return {
    placements: scores.map((score) => 1 + scores.filter((other) => other > score).length),
    scores,
    reason: 'rounds',
  };
}

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
