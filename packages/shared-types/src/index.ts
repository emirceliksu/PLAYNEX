export type GameEngine = 'phaser' | 'babylon';
export type GameDimension = '2d' | '3d';
export type GameMode = 'solo' | '1v1' | 'party' | 'co-op';
export type GameStatus = 'live' | 'beta' | 'coming-soon';
export type GameCategory = 'arcade' | 'puzzle' | 'strategy' | 'party' | 'racing' | 'action';
export type GameScoring = 'high-score' | 'fastest-time' | 'wins';
export type GameOrientation = 'any' | 'landscape' | 'portrait';
export type AgeRating = '3+' | '7+' | '12+';
export type ControlScheme = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

// Signature color each game carries through its cover, badges and play screen.
export type AccentName = 'brand' | 'cyan' | 'yellow' | 'pink' | 'mint' | 'coral';

export interface Game {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  engine: GameEngine;
  dimension: GameDimension;
  mode: GameMode;
  category: GameCategory;
  status: GameStatus;
  accent: AccentName;
  players: { min: number; max: number };
  version: string;
  releasedAt: string;
  playCount: number;
  controls: ControlScheme[];
  ageRating: AgeRating;
  orientation: GameOrientation;
  scoring: GameScoring;
  estimatedMinutes: number;
  // Short, player-facing control instructions shown on the detail page and the ready screen.
  controlsGuide: string[];
}

export type PresenceStatus = 'online' | 'in-game' | 'offline';

export interface Player {
  id: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  status: PresenceStatus;
  joinedAt: string;
}

export type Trend = 'up' | 'down' | 'same';

export interface LeaderboardEntry {
  rank: number;
  player: Pick<Player, 'id' | 'username' | 'displayName' | 'avatarSeed' | 'level'>;
  gameSlug: string;
  score: number;
  achievedAt: string;
  trend: Trend;
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface GameSession {
  id: string;
  gameSlug: string;
  playerId: string;
  startedAt: string;
  endedAt: string;
  score: number;
  isPersonalBest: boolean;
  verification: VerificationStatus;
}

export interface Achievement {
  id: string;
  gameSlug: string | null;
  title: string;
  description: string;
  points: number;
  unlockedAt: string | null;
}

export type GamePlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'finished' | 'error';
