// Responses of the API's Siper endpoints (apps/api/src/siper.rs).

export interface SiperLevel {
  level: number;
  into: number;
  need: number;
}

export interface SiperStats {
  username: string;
  level: SiperLevel;
  xp: number;
  rating: number;
  rank: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  plants: number;
  defuses: number;
  bestStreak: number;
  bestMulti: number;
  kd: number;
  accuracy: number;
  headshotRate: number;
  favoriteWeapon: string | null;
  equippedSkin: string | null;
  equippedOutfit: string | null;
  achievements: { achievement: string; unlockedAt: string }[];
  recent: {
    mode: string;
    map: string;
    won: boolean;
    kills: number;
    deaths: number;
    xp: number;
    ratingChange: number;
    createdAt: string;
  }[];
}

export interface SiperQuest {
  key: string;
  target: number;
  progress: number;
  xp: number;
  done: boolean;
}

export interface SiperMine {
  level: SiperLevel;
  quests: SiperQuest[];
  skins: { id: string; unlocked: boolean }[];
  outfits: { id: string; unlocked: boolean }[];
  equippedSkin: string | null;
  equippedOutfit: string | null;
}

export interface SiperBoardEntry {
  place: number;
  username: string;
  level: number;
  rating: number;
  rank: SiperStats['rank'];
  matches: number;
  wins: number;
  kills: number;
  kd: number;
}

export interface FriendList {
  friends: { username: string; since: string }[];
  incoming: { username: string; since: string }[];
  outgoing: { username: string; since: string }[];
}

export const ACHIEVEMENTS = [
  'first_win',
  'sharpshooter',
  'headhunter',
  'knife_master',
  'demolition',
  'defuser',
  'ace',
  'veteran',
  'unstoppable',
  'level_10',
] as const;
