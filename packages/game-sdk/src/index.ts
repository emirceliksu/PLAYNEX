import type { ControlScheme, GameOrientation, GameScoring, PlayMode } from '@playnex/shared-types';

export type { PlayMode };

export interface GameManifest {
  slug: string;
  version: string;
  engine: 'phaser' | 'babylon' | 'dom';
  orientation: GameOrientation;
  controls: ControlScheme[];
  scoring: GameScoring;
  modes: PlayMode[];
}

// Lifecycle as seen by the platform shell. "loading" and "error" belong to the shell itself.
export type GameRuntimeState = 'ready' | 'playing' | 'paused' | 'finished';

// Per-seat result of a match with more than one participant; 1 is first place.
export interface MatchOutcome {
  placements: number[];
  scores: number[];
  reason: string;
}

export interface GameResult {
  score: number;
  durationMs: number;
  stats?: Record<string, number>;
  outcome?: MatchOutcome;
}

// Colors arrive as sRGB hex because canvas engines cannot parse the OKLCH tokens.
export interface GamePalette {
  canvas: string;
  surface: string;
  ink: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentSoft: string;
  reward: string;
  danger: string;
}

export interface SessionPlayer {
  seat: number;
  nickname: string;
}

export interface LocalSession {
  mode: 'solo' | 'local';
  players: SessionPlayer[];
  options: Record<string, string>;
}

export type OnlineMessage =
  | { kind: 'snapshot'; payload: unknown }
  | { kind: 'event'; payload: unknown }
  | { kind: 'finish'; outcome: MatchOutcome }
  | { kind: 'rejected'; code: string };

// The server owns the match: the game sends inputs and renders what comes back.
export interface OnlineSession {
  mode: 'online';
  seat: number;
  round: number;
  players: SessionPlayer[];
  options: Record<string, string>;
  send(input: unknown): void;
  // Messages that arrive before the first subscriber are buffered and replayed to it.
  subscribe(listener: (message: OnlineMessage) => void): () => void;
}

export type PlaySession = LocalSession | OnlineSession;

export interface GameHost {
  locale: 'tr' | 'en';
  reducedMotion: boolean;
  palette: GamePalette;
  // Game-specific strings from `games.<slug>` in the web app's message files.
  messages: Record<string, string>;
  session: PlaySession;
  onScore(score: number): void;
  onStateChange(state: GameRuntimeState): void;
  onFinish(result: GameResult): void;
  onError(error: Error): void;
}

export interface GameInstance {
  // Leaves "ready" and begins play; restart() resets the board and starts again immediately.
  // Online sessions ignore pause/resume/restart: the room decides when a match runs.
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
}

export interface GameModule {
  manifest: GameManifest;
  // Resolves once assets are loaded and the game reports "ready".
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance>;
}

export function defineGame(module: GameModule): GameModule {
  return module;
}

export function hexToColorNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
