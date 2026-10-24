import type { LeaderboardEntry, Trend } from '@playnex/shared-types';

import { liveGames } from './games';
import { players } from './players';

export type LeaderboardWindow = 'daily' | 'weekly' | 'all-time';

export const leaderboardWindows: LeaderboardWindow[] = ['daily', 'weekly', 'all-time'];

// Score bands per game so the numbers look like real play, not random noise.
const scoreBands: Record<string, { top: number; floor: number }> = {
  'snake-rush': { top: 12480, floor: 1900 },
  '2048-fusion': { top: 48210, floor: 6400 },
  'memory-flip': { top: 1180, floor: 610 },
  'tugla-tugla': { top: 6400, floor: 900 },
  // Connect Four ranks by wins, so the band is a win count.
  'connect-four': { top: 38, floor: 4 },
};

const windowHours: Record<LeaderboardWindow, number> = {
  daily: 24,
  weekly: 24 * 7,
  'all-time': 24 * 60,
};

function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) {
    state = (state * 31 + char.charCodeAt(0)) >>> 0;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

const trends: Trend[] = ['up', 'same', 'down', 'up', 'same'];

// Frozen reference time so server and client render identical relative times.
export const leaderboardGeneratedAt = '2026-10-20T21:30:00+03:00';

export function getLeaderboard(gameSlug: string, window: LeaderboardWindow): LeaderboardEntry[] {
  const band = scoreBands[gameSlug] ?? { top: 10000, floor: 1000 };
  const random = seededRandom(`${gameSlug}:${window}`);
  const ranked = shuffled(players, random).slice(0, 10);
  const generatedAt = new Date(leaderboardGeneratedAt).getTime();
  const spread = band.top - band.floor;

  return ranked.map((player, index) => {
    // Scores decay from the top with a little jitter, rounded like real game scores.
    const share = 1 - index / 10;
    const jitter = (random() - 0.5) * 0.06;
    const raw = band.floor + spread * (share + jitter) * (window === 'all-time' ? 1 : 0.82);
    const score = Math.max(band.floor, Math.round(raw / 10) * 10);
    const hoursAgo = random() * windowHours[window];

    return {
      rank: index + 1,
      player: {
        id: player.id,
        username: player.username,
        displayName: player.displayName,
        avatarSeed: player.avatarSeed,
        level: player.level,
      },
      gameSlug,
      score,
      achievedAt: new Date(generatedAt - hoursAgo * 3_600_000).toISOString(),
      trend: trends[Math.floor(random() * trends.length)] ?? 'same',
    };
  });
}

// Compact cross-game ranking for the home page: best weekly placing per player.
export function getOverallRanking(limit = 5): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const game of liveGames) {
    for (const entry of getLeaderboard(game.slug, 'weekly')) {
      const existing = best.get(entry.player.id);
      if (!existing || entry.rank < existing.rank) {
        best.set(entry.player.id, entry);
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank || b.score - a.score)
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
