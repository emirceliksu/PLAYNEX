import {
  format,
  type GameHost,
  type MatchOutcome,
  type OnlineMessage,
  type OnlineSession,
  type SessionPlayer,
} from '@playnex/game-sdk';
import { Bot, type Difficulty } from './bots';
import { Controls } from './controls';
import {
  COUNTDOWN_MS,
  distance,
  freshProgress,
  gridSlot,
  type KartInput,
  type KartState,
  nearest,
  type Progress,
  step,
  TICK_SECONDS,
  track,
  updateProgress,
} from './model';
import { World } from './world';

const SOLO_FIELD = 4;
const KART_RADIUS = track.kart.radius;
const INTERPOLATION_DELAY_MS = 100;
const GO_BANNER_MS = 900;
const MAX_FRAME_SECONDS = 0.1;

type Phase = 'idle' | 'countdown' | 'racing' | 'paused' | 'finished';

interface Kart {
  state: KartState;
  previous: KartState;
  progress: Progress;
  finishedMs: number | null;
  bot: Bot | null;
  active: boolean;
}

interface ServerKart {
  x: number;
  z: number;
  h: number;
  s: number;
  lap: number;
  cp: number;
  idx: number;
  finishedMs: number | null;
  ack: number;
  active: boolean;
}

interface ServerSnapshot {
  phase: 'countdown' | 'racing' | 'done';
  countdownMs: number;
  raceMs: number;
  karts: ServerKart[];
}

export class Race {
  private readonly world: World;
  private readonly controls: Controls;
  private readonly online: OnlineSession | null;
  private readonly hud: Hud;
  private readonly canvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly players: SessionPlayer[];
  private karts: Kart[] = [];
  private phase: Phase = 'idle';
  private resumeTo: Phase = 'racing';
  private countdownMs = COUNTDOWN_MS;
  private raceMs = 0;
  private goBannerMs = 0;
  private accumulator = 0;
  private cameraSnapped = false;
  private unsubscribe: (() => void) | null = null;
  private seq = 0;
  private pending: { seq: number; input: KartInput }[] = [];
  private snapshots: { at: number; snapshot: ServerSnapshot }[] = [];
  private lastSnapshotAt = 0;

  constructor(
    container: HTMLElement,
    private readonly host: GameHost,
  ) {
    const session = host.session;
    this.online = session.mode === 'online' ? session : null;
    const difficulty = (session.options.difficulty as Difficulty | undefined) ?? 'normal';
    this.players = this.online
      ? session.players
      : [
          { seat: 0, nickname: host.messages.you ?? '' },
          ...[1, 2, 3].map((n) => ({ seat: n, nickname: host.messages[`bot_${n}`] ?? '' })),
        ];

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'absolute inset-0 block size-full touch-none outline-none';
    container.append(this.canvas);
    this.world = new World(
      this.canvas,
      host.palette,
      this.online ? this.players.length : SOLO_FIELD,
    );
    this.hud = new Hud(container, host.messages);
    this.controls = new Controls({
      left: host.messages.left ?? '',
      right: host.messages.right ?? '',
      gas: host.messages.gas ?? '',
      brake: host.messages.brake ?? '',
      drift: host.messages.drift ?? '',
    });
    container.append(this.controls.touchLayer);
    this.resizeObserver = new ResizeObserver(() => this.world.resize());
    this.resizeObserver.observe(container);

    this.resetKarts(difficulty);
    if (this.online) {
      this.unsubscribe = this.online.subscribe((message) => this.onServer(message));
    }
    this.world.engine.runRenderLoop(() => this.frame());
  }

  start(): void {
    this.phase = 'countdown';
    this.countdownMs = COUNTDOWN_MS;
    this.host.onStateChange('playing');
  }

  restart(): void {
    if (this.online) return;
    this.resetKarts((this.host.session.options.difficulty as Difficulty | undefined) ?? 'normal');
    this.raceMs = 0;
    this.accumulator = 0;
    this.cameraSnapped = false;
    this.host.onScore(0);
    this.start();
  }

  pause(): void {
    if (this.online || (this.phase !== 'racing' && this.phase !== 'countdown')) return;
    this.resumeTo = this.phase;
    this.phase = 'paused';
    this.controls.setActive(false);
    this.host.onStateChange('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.resumeTo;
    this.host.onStateChange('playing');
  }

  destroy(): void {
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    this.world.engine.stopRenderLoop();
    this.world.dispose();
    this.controls.destroy();
    this.hud.destroy();
    this.canvas.remove();
  }

  private mySeat(): number {
    return this.online?.seat ?? 0;
  }

  private resetKarts(difficulty: Difficulty): void {
    const count = this.online ? this.players.length : SOLO_FIELD;
    const lanes = [0, -0.6, 0.6, 0.2];
    this.karts = Array.from({ length: count }, (_, seat) => {
      const state = gridSlot(seat);
      return {
        state,
        previous: { ...state },
        progress: freshProgress(nearest(state.x, state.z).index),
        finishedMs: null,
        bot: !this.online && seat > 0 ? new Bot(difficulty, lanes[seat] ?? 0) : null,
        active: true,
      };
    });
    this.karts.forEach((kart, seat) => this.world.placeKart(seat, kart.state));
  }

  private frame(): void {
    const dt = Math.min(this.world.engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    if (this.online) this.onlineFrame(dt);
    else this.localFrame(dt);

    const alpha = this.accumulator / TICK_SECONDS;
    this.karts.forEach((kart, seat) => {
      if (!kart.active) {
        this.world.hideKart(seat);
        return;
      }
      this.world.placeKart(seat, lerpState(kart.previous, kart.state, Math.min(1, alpha)));
    });
    const me = this.karts[this.mySeat()];
    if (me) {
      this.world.follow(
        lerpState(me.previous, me.state, Math.min(1, alpha)),
        dt,
        !this.cameraSnapped,
      );
      this.cameraSnapped = true;
    }
    this.goBannerMs = Math.max(0, this.goBannerMs - dt * 1000);
    this.renderHud();
    this.world.render();
  }

  private localFrame(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdownMs -= dt * 1000;
      if (this.countdownMs <= 0) {
        this.phase = 'racing';
        this.goBannerMs = GO_BANNER_MS;
      }
      return;
    }
    if (this.phase !== 'racing') return;
    this.controls.setActive(true);
    this.accumulator += dt;
    while (this.accumulator >= TICK_SECONDS) {
      this.accumulator -= TICK_SECONDS;
      this.raceMs += TICK_SECONDS * 1000;
      this.tickLocal();
      if (this.phase !== 'racing') break;
    }
  }

  private tickLocal(): void {
    const human = this.controls.read();
    for (const kart of this.karts) {
      kart.previous = { ...kart.state };
      if (kart.finishedMs !== null) continue;
      step(kart.state, kart.bot ? kart.bot.drive(kart.state) : human, TICK_SECONDS);
    }
    separate(this.karts);
    for (const kart of this.karts) {
      if (kart.finishedMs !== null) continue;
      updateProgress(kart.progress, nearest(kart.state.x, kart.state.z).index);
      if (kart.progress.lap >= track.laps) {
        kart.finishedMs = Math.round(this.raceMs);
        kart.state.speed = 0;
      }
    }
    // The race is over for the player once they cross the line; bots still
    // on track are ranked by how far they got.
    if (this.karts[0]?.finishedMs != null) this.finishLocal();
  }

  private finishLocal(): void {
    this.phase = 'finished';
    this.controls.setActive(false);
    const order = this.karts
      .map((kart, seat) => ({ kart, seat }))
      .sort((a, b) => {
        const af = a.kart.finishedMs ?? Infinity;
        const bf = b.kart.finishedMs ?? Infinity;
        if (af !== bf) return af - bf;
        return distance(b.kart.progress) - distance(a.kart.progress);
      });
    const placements = this.karts.map(() => 0);
    order.forEach(({ seat }, place) => (placements[seat] = place + 1));
    const outcome: MatchOutcome = {
      placements,
      scores: this.karts.map((kart) => kart.finishedMs ?? 0),
      reason: 'race',
    };
    const myTime = this.karts[0]?.finishedMs ?? 0;
    this.host.onScore(myTime);
    this.host.onFinish({
      score: myTime,
      durationMs: Math.round(this.raceMs),
      outcome,
      participants: this.players,
    });
    this.host.onStateChange('finished');
  }

  private onlineFrame(dt: number): void {
    const latest = this.snapshots.at(-1)?.snapshot;
    if (!latest || this.phase === 'finished') return;
    this.raceMs =
      latest.raceMs + (latest.phase === 'racing' ? performance.now() - this.lastSnapshotAt : 0);
    this.countdownMs = latest.countdownMs - (performance.now() - this.lastSnapshotAt);

    const me = this.karts[this.mySeat()];
    if (latest.phase === 'racing' && me?.finishedMs === null) {
      this.controls.setActive(true);
      this.accumulator += dt;
      while (this.accumulator >= TICK_SECONDS) {
        this.accumulator -= TICK_SECONDS;
        const input = this.controls.read();
        this.seq += 1;
        this.pending.push({ seq: this.seq, input });
        this.online?.send({ seq: this.seq, ...input });
        me.previous = { ...me.state };
        step(me.state, input, TICK_SECONDS);
      }
    }
    this.interpolateOthers();
  }

  private onServer(message: OnlineMessage): void {
    switch (message.kind) {
      case 'snapshot':
        this.applySnapshot(message.payload as ServerSnapshot);
        return;
      case 'finish':
        this.finishOnline(message.outcome);
        return;
      case 'event':
      case 'rejected':
        return;
    }
  }

  private applySnapshot(snapshot: ServerSnapshot): void {
    const now = performance.now();
    if (this.snapshots.at(-1)?.snapshot.phase === 'countdown' && snapshot.phase === 'racing') {
      this.goBannerMs = GO_BANNER_MS;
    }
    this.snapshots.push({ at: now, snapshot });
    if (this.snapshots.length > 20) this.snapshots.shift();
    this.lastSnapshotAt = now;

    snapshot.karts.forEach((view, seat) => {
      const kart = this.karts[seat];
      if (!kart) return;
      kart.progress = { lap: view.lap, nextCheckpoint: view.cp, index: view.idx };
      kart.finishedMs = view.finishedMs;
      kart.active = view.active;
    });

    // Reconcile: take the server's word for our kart, then replay what it has not seen yet.
    const own = snapshot.karts[this.mySeat()];
    const me = this.karts[this.mySeat()];
    if (own && me) {
      this.pending = this.pending.filter((entry) => entry.seq > own.ack);
      const corrected: KartState = { x: own.x, z: own.z, heading: own.h, speed: own.s };
      if (snapshot.phase === 'racing') {
        for (const entry of this.pending) step(corrected, entry.input, TICK_SECONDS);
      }
      me.state = corrected;
    }
  }

  private interpolateOthers(): void {
    const renderAt = performance.now() - INTERPOLATION_DELAY_MS;
    let older = this.snapshots[0];
    let newer = this.snapshots[0];
    for (const entry of this.snapshots) {
      if (entry.at <= renderAt) older = entry;
      else {
        newer = entry;
        break;
      }
      newer = entry;
    }
    if (!older || !newer) return;
    const span = newer.at - older.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderAt - older.at) / span)) : 1;
    this.karts.forEach((kart, seat) => {
      if (seat === this.mySeat()) return;
      const a = older.snapshot.karts[seat];
      const b = newer.snapshot.karts[seat];
      if (!a || !b) return;
      const state = {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: a.h + wrapAngle(b.h - a.h) * t,
        speed: b.s,
      };
      kart.previous = state;
      kart.state = state;
    });
  }

  private finishOnline(outcome: MatchOutcome): void {
    this.phase = 'finished';
    this.controls.setActive(false);
    const time = outcome.scores[this.mySeat()] ?? 0;
    this.host.onScore(time);
    this.host.onFinish({ score: time, durationMs: Math.round(this.raceMs), outcome });
    this.host.onStateChange('finished');
  }

  private renderHud(): void {
    const me = this.karts[this.mySeat()];
    const myDistance = me ? distance(me.progress) : 0;
    const ahead = this.karts.filter((kart, seat) => {
      if (seat === this.mySeat() || !kart.active) return false;
      if (kart.finishedMs !== null && me?.finishedMs === null) return true;
      return distance(kart.progress) > myDistance;
    }).length;
    const countingDown = this.online
      ? this.snapshots.at(-1)?.snapshot.phase === 'countdown'
      : this.phase === 'countdown' || (this.phase === 'paused' && this.resumeTo === 'countdown');
    this.hud.update({
      lap: Math.min(track.laps, (me?.progress.lap ?? 0) + 1),
      laps: track.laps,
      position: ahead + 1,
      field: this.karts.filter((kart) => kart.active).length,
      raceMs: me?.finishedMs ?? this.raceMs,
      countdown: countingDown ? Math.max(1, Math.ceil(this.countdownMs / 1000)) : null,
      go: this.goBannerMs > 0,
      finished: me?.finishedMs != null,
    });
  }
}

interface HudView {
  lap: number;
  laps: number;
  position: number;
  field: number;
  raceMs: number;
  countdown: number | null;
  go: boolean;
  finished: boolean;
}

// Plain DOM over the canvas so numbers stay crisp and readable by assistive tech.
class Hud {
  private readonly element: HTMLDivElement;
  private readonly lap: HTMLParagraphElement;
  private readonly position: HTMLParagraphElement;
  private readonly time: HTMLParagraphElement;
  private readonly banner: HTMLParagraphElement;
  private last = '';

  constructor(
    container: HTMLElement,
    private readonly messages: Record<string, string>,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'pointer-events-none absolute inset-0 flex flex-col p-3 md:p-5';
    const top = document.createElement('div');
    top.className = 'flex items-start justify-between gap-3';
    this.lap = stat();
    this.time = stat();
    this.position = stat();
    top.append(this.lap, this.time, this.position);
    this.banner = document.createElement('p');
    this.banner.className =
      'm-auto rounded-2xl border-2 border-(--pn-shadow-ink) bg-surface-overlay px-8 py-4 font-display text-display-lg shadow-sticker-lg';
    this.banner.setAttribute('role', 'status');
    this.element.append(top, this.banner);
    container.append(this.element);
  }

  update(view: HudView): void {
    const key = JSON.stringify({ ...view, raceMs: Math.floor(view.raceMs / 100) });
    if (key === this.last) return;
    this.last = key;
    this.lap.textContent = format(this.messages.lap ?? '', { n: view.lap, total: view.laps });
    this.position.textContent = format(this.messages.position ?? '', {
      n: view.position,
      total: view.field,
    });
    this.time.textContent = formatRaceTime(view.raceMs);
    const banner =
      view.countdown !== null
        ? String(view.countdown)
        : view.go
          ? (this.messages.go ?? '')
          : view.finished
            ? (this.messages.finished ?? '')
            : '';
    this.banner.textContent = banner;
    this.banner.hidden = banner === '';
  }

  destroy(): void {
    this.element.remove();
  }
}

function stat(): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className =
    'rounded-lg border-2 border-(--pn-shadow-ink) bg-surface-overlay px-3 py-1.5 font-display text-title-md tabular-nums shadow-sticker';
  return node;
}

function formatRaceTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}

function lerpState(a: KartState, b: KartState, t: number): KartState {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    heading: a.heading + wrapAngle(b.heading - a.heading) * t,
    speed: b.speed,
  };
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Same push-apart as the server, so solo bumps feel like online ones.
function separate(karts: Kart[]): void {
  const reach = KART_RADIUS * 2;
  for (let i = 0; i < karts.length; i += 1) {
    for (let j = i + 1; j < karts.length; j += 1) {
      const a = karts[i];
      const b = karts[j];
      if (!a?.active || !b?.active) continue;
      const dx = b.state.x - a.state.x;
      const dz = b.state.z - a.state.z;
      const gap = Math.hypot(dx, dz);
      if (gap >= reach || gap === 0) continue;
      const push = (reach - gap) / 2;
      const nx = dx / gap;
      const nz = dz / gap;
      a.state.x -= nx * push;
      a.state.z -= nz * push;
      b.state.x += nx * push;
      b.state.z += nz * push;
    }
  }
}
