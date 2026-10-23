import type { ControlScheme, GameOrientation, GameScoring } from '@playnex/shared-types';

export interface GameManifest {
  slug: string;
  version: string;
  engine: 'phaser';
  orientation: GameOrientation;
  controls: ControlScheme[];
  scoring: GameScoring;
}

// Lifecycle as seen by the platform shell. "loading" and "error" belong to the shell itself.
export type GameRuntimeState = 'ready' | 'playing' | 'paused' | 'finished';

export interface GameResult {
  score: number;
  durationMs: number;
  stats?: Record<string, number>;
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

export interface GameHost {
  locale: 'tr' | 'en';
  reducedMotion: boolean;
  palette: GamePalette;
  onScore(score: number): void;
  onStateChange(state: GameRuntimeState): void;
  onFinish(result: GameResult): void;
  onError(error: Error): void;
}

export interface GameInstance {
  // Leaves "ready" and begins play; restart() resets the board and starts again immediately.
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
