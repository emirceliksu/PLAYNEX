import { GameAudio, type SfxName } from '@playnex/game-audio';
import type { GameHost } from '@playnex/game-sdk';

import { archetypesOf, type GameDocument, type SoundRecipe } from './document';
import {
  compileGame,
  readFrame,
  stride,
  type CreatorGame,
  type CreatorWorld,
  type Diagnostic,
  type FrameInfo,
  type Outcome,
} from './engine';
import { Hud } from './hud';
import { CreatorInput } from './input';
import { createRenderer2d } from './render2d';
import { createRenderer3d } from './render3d';
import type { Renderer } from './view';

const STEP_MS = 1000 / 60;
// After a long stall (tab in background) the game slows down instead of
// fast-forwarding through seconds of play the player never saw.
const MAX_STEPS_PER_FRAME = 5;

const recipeSounds: Record<SoundRecipe, SfxName> = {
  coin: 'coin',
  jump: 'jump',
  hit: 'hit',
  explosion: 'explosion',
  powerUp: 'powerup',
  laser: 'laser',
  click: 'ui-click',
  win: 'win',
  lose: 'lose',
};

export interface CreatorRun {
  seed: number;
  inputLog: Uint8Array;
  score: number;
  ticks: number;
  outcome: Outcome;
}

export interface SessionOptions {
  swatches: string[];
  // Ranked play asks the server for the seed so a run can be replayed and verified.
  seedSource?: () => Promise<number>;
  onRun?: (run: CreatorRun) => void;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
}

export class CreatorSession {
  private world: CreatorWorld | null = null;
  private seed = 0;
  private frameHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private lastScore = Number.NaN;
  private diagnosticCount = 0;
  private running = false;
  private finished = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly host: GameHost,
    private readonly document: GameDocument,
    private readonly options: SessionOptions,
    private readonly game: CreatorGame,
    private readonly renderer: Renderer,
    private readonly input: CreatorInput,
    private readonly hud: Hud,
    private readonly audio: GameAudio,
  ) {}

  static async mount(
    container: HTMLElement,
    host: GameHost,
    document: GameDocument,
    options: SessionOptions,
  ): Promise<CreatorSession> {
    const game = await compileGame(document);
    const root = window.document.createElement('div');
    root.className = 'relative size-full overflow-hidden';
    container.append(root);

    const setup = {
      document,
      archetypes: archetypesOf(document),
      swatches: options.swatches,
      ink: host.palette.ink,
      fontFamily: getComputedStyle(container).fontFamily || 'sans-serif',
      reducedMotion: host.reducedMotion,
    };
    let renderer: Renderer;
    try {
      renderer =
        document.dimension === '2d'
          ? await createRenderer2d(root, setup)
          : createRenderer3d(root, setup);
    } catch (error) {
      game.free();
      root.remove();
      throw error;
    }

    const text = (key: string) => host.messages[key] ?? '';
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const input = new CreatorInput(
      root,
      {
        joystick: text('joystick'),
        jump: text('jump'),
        primary: text('primary'),
        secondary: text('secondary'),
      },
      touch,
    );
    const hud = new Hud(root, document.hud ?? [], {
      score: text('score'),
      timer: text('timer'),
      lives: text('lives'),
    });
    const audio = new GameAudio({ seed: 1, mood: 'bright' });
    audio.unlockOn(root);

    const session = new CreatorSession(
      root,
      host,
      document,
      options,
      game,
      renderer,
      input,
      hud,
      audio,
    );
    session.world = game.start(0);
    session.render(readFrame(session.world));
    return session;
  }

  async start(): Promise<void> {
    this.stopLoop();
    this.seed = this.options.seedSource ? await this.options.seedSource() : randomSeed();
    this.world?.free();
    this.world = this.game.start(this.seed);
    this.finished = false;
    this.lastScore = Number.NaN;
    this.host.onStateChange('playing');
    this.resume();
  }

  pause(): void {
    if (!this.running) return;
    this.stopLoop();
    this.input.setEnabled(false);
    this.host.onStateChange('paused');
  }

  resume(): void {
    if (this.running || this.finished) return;
    this.running = true;
    this.input.setEnabled(true);
    this.lastTime = performance.now();
    this.accumulator = 0;
    if (this.host.session.mode !== 'online') this.host.onStateChange('playing');
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.stopLoop();
    this.input.destroy();
    this.hud.destroy();
    this.audio.destroy();
    this.renderer.destroy();
    this.world?.free();
    this.world = null;
    this.game.free();
    this.root.remove();
  }

  private readonly frame = (now: number) => {
    if (!this.running || !this.world) return;
    this.accumulator += now - this.lastTime;
    this.lastTime = now;
    let latest: FrameInfo | null = null;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const sample = this.input.sample();
      this.world.step(sample.buttons, sample.axisX, sample.axisY);
      latest = readFrame(this.world);
      this.playSounds(latest);
      this.accumulator -= STEP_MS;
      steps += 1;
      if (this.world.finished()) break;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    if (latest) this.render(latest);

    if (this.world.finished()) {
      this.finish(latest ?? readFrame(this.world));
      return;
    }
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private render(frame: FrameInfo): void {
    if (!this.world) return;
    this.renderer.sync({ entities: this.world.entities(), stride: stride(), frame });
    this.hud.update(frame.hud);
    const score = Math.round(frame.score);
    if (score !== this.lastScore) {
      this.lastScore = score;
      this.host.onScore(score);
    }
    if (frame.diagnostics.length !== this.diagnosticCount) {
      this.diagnosticCount = frame.diagnostics.length;
      this.options.onDiagnostics?.(frame.diagnostics);
    }
  }

  private playSounds(frame: FrameInfo): void {
    const sounds = this.document.sounds ?? [];
    for (const event of frame.events) {
      if (event.kind !== 'sound') continue;
      const sound = sounds[event.index];
      if (sound)
        this.audio.sfx(recipeSounds[sound.recipe], {
          pitch: sound.pitch ?? 1,
          gain: sound.volume ?? 1,
        });
    }
  }

  private finish(frame: FrameInfo): void {
    if (!this.world) return;
    this.stopLoop();
    this.finished = true;
    this.input.setEnabled(false);
    const ticks = this.world.tick();
    const score = Math.round(frame.score);
    if (frame.outcome === 'won') this.audio.sfx('win');
    if (frame.outcome === 'lost') this.audio.sfx('lose');
    this.options.onRun?.({
      seed: this.seed,
      inputLog: this.world.inputLog(),
      score,
      ticks,
      outcome: frame.outcome,
    });
    this.host.onFinish({ score, durationMs: Math.round(ticks * STEP_MS), stats: { ticks } });
    this.host.onStateChange('finished');
  }

  private stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
