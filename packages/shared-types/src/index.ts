export type GameEngine = 'phaser' | 'babylon' | 'dom';
export type GameDimension = '2d' | '3d';
export type GameMode = 'solo' | '1v1' | 'party' | 'co-op';
export type GameStatus = 'draft' | 'live' | 'beta' | 'coming-soon';
export type GameCategory =
  | 'arcade'
  | 'puzzle'
  | 'strategy'
  | 'party'
  | 'racing'
  | 'action'
  | 'board'
  | 'card'
  | 'shooter'
  | 'fighting'
  | 'sports'
  | 'platform'
  | 'word'
  | 'simulation';
export type GameScoring = 'high-score' | 'fastest-time' | 'wins';
export type GameOrientation = 'any' | 'landscape' | 'portrait';
export type AgeRating = '3+' | '7+' | '12+';
export type ControlScheme = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

// How a match is played: alone (or against the computer), several people on one device, or in an online room.
export type PlayMode = 'solo' | 'local' | 'online';
export type GameOptionKey = 'minutes' | 'difficulty' | 'category';
export type GameOptionValue =
  | '3'
  | '5'
  | 'easy'
  | 'normal'
  | 'hard'
  | 'mixed'
  | 'geography'
  | 'science'
  | 'history'
  | 'sports'
  | 'culture'
  | 'technology';

export interface GameOptionSpec {
  key: GameOptionKey;
  values: GameOptionValue[];
  defaultValue: GameOptionValue;
  modes: PlayMode[];
}

export interface GameSetup {
  modes: PlayMode[];
  // Seats on a shared device; only meaningful when `modes` includes 'local'.
  localPlayers?: { min: number; max: number };
  options: GameOptionSpec[];
}

// Signature color each game carries through its cover, badges and play screen.
export type AccentName = 'brand' | 'cyan' | 'yellow' | 'pink' | 'mint' | 'coral';

// Player-facing copy (tagline, description, controls) is translated, so it lives in the web
// app's message files under gameCopy.<slug> rather than on this record.
export interface Game {
  id: string;
  slug: string;
  title: string;
  engine: GameEngine;
  dimension: GameDimension;
  mode: GameMode;
  category: GameCategory;
  status: GameStatus;
  accent: AccentName;
  players: { min: number; max: number };
  version: string;
  releasedAt: string;
  controls: ControlScheme[];
  ageRating: AgeRating;
  orientation: GameOrientation;
  scoring: GameScoring;
  estimatedMinutes: number;
  setup: GameSetup;
  // Needs a mouse and pointer lock; the catalog card says so.
  desktopOnly?: boolean;
}

export type PresenceStatus = 'online' | 'in-game' | 'offline';

// What other visitors see: first name plus last-name initial, never the email or full name.
export interface Player {
  username: string;
  displayName: string;
  avatarSeed: string;
  joinedAt: string;
}

// The signed-in visitor's own record, as the API returns it.
export interface Account {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: 'tr' | 'en';
  role: AccountRole;
  createdAt: string;
}

export type AccountRole = 'player' | 'admin';

export type AdminAction = 'suspend' | 'unsuspend' | 'grant-admin' | 'revoke-admin' | 'end-sessions';
export type AdminUserFilter = 'all' | 'verified' | 'pending' | 'suspended' | 'admins';

// An account as the admin panel sees it, including state other players never get.
export interface ManagedUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AccountRole;
  verified: boolean;
  suspendedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  activeSessions: number;
}

export interface AdminLogEntry {
  actorUsername: string;
  targetUsername: string;
  action: 'suspend' | 'unsuspend' | 'grant_admin' | 'revoke_admin' | 'end_sessions';
  createdAt: string;
}

export interface AdminOverview {
  totals: {
    users: number;
    verified: number;
    pending: number;
    suspended: number;
    admins: number;
    joinedThisWeek: number;
    signedInPlayers: number;
  };
  recentUsers: ManagedUser[];
  recentActions: AdminLogEntry[];
}

export interface AdminUserPage {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}

export type Trend = 'up' | 'down' | 'same';

export interface LeaderboardEntry {
  rank: number;
  player: Pick<Player, 'username' | 'displayName' | 'avatarSeed'>;
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
