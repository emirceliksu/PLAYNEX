'use client';

import type { AccentName, LeaderboardEntry } from '@playnex/shared-types';
import {
  Avatar,
  Badge,
  EmptyState,
  FilterChip,
  FilterGroup,
  GameCover,
  ScoreValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@playnex/ui';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { formatRelative, localeTag } from '@/lib/format';
import { leaderboardWindows, type LeaderboardWindow } from '@/lib/mock/leaderboard';

interface LeaderboardTableProps {
  games: { slug: string; title: string; accent: AccentName }[];
  boards: Record<string, Record<LeaderboardWindow, LeaderboardEntry[]>>;
  initialGame: string;
  currentPlayerId: string;
  generatedAt: string;
  locale: string;
  labels: {
    chooseGame: string;
    windows: Record<LeaderboardWindow, string>;
    rank: string;
    player: string;
    score: string;
    when: string;
    trend: Record<LeaderboardEntry['trend'], string>;
    emptyTitle: string;
    emptyDescription: string;
  };
}

const trendIcons = {
  up: <TrendingUp aria-hidden className="size-4 text-mint-text" />,
  down: <TrendingDown aria-hidden className="size-4 text-coral-text" />,
  same: <Minus aria-hidden className="size-4 text-fg-muted" />,
} as const;

const podium = [
  'bg-yellow-solid text-ink-950',
  'bg-ink-300 text-ink-950',
  'bg-coral-solid text-ink-950',
];

export function LeaderboardTable({
  games,
  boards,
  initialGame,
  currentPlayerId,
  generatedAt,
  locale,
  labels,
}: LeaderboardTableProps) {
  const [gameSlug, setGameSlug] = useState(initialGame);
  const activeGame = games.find((game) => game.slug === gameSlug) ?? games[0];

  return (
    <div className="flex flex-col gap-6">
      <FilterGroup
        type="single"
        value={gameSlug}
        aria-label={labels.chooseGame}
        onValueChange={(value) => {
          if (value) setGameSlug(value);
        }}
      >
        {games.map((game) => (
          <FilterChip key={game.slug} value={game.slug}>
            <span className="h-5 w-8 overflow-hidden rounded-xs">
              <GameCover slug={game.slug} accent={game.accent} />
            </span>
            {game.title}
          </FilterChip>
        ))}
      </FilterGroup>

      <Tabs defaultValue="weekly">
        <TabsList aria-label={labels.when}>
          {leaderboardWindows.map((window) => (
            <TabsTrigger key={window} value={window}>
              {labels.windows[window]}
            </TabsTrigger>
          ))}
        </TabsList>
        {leaderboardWindows.map((window) => {
          const entries = activeGame ? (boards[activeGame.slug]?.[window] ?? []) : [];
          return (
            <TabsContent key={window} value={window}>
              {entries.length === 0 ? (
                <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />
              ) : (
                <div className="overflow-hidden rounded-xl border-2 border-border-subtle bg-surface-raised">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-border-subtle text-left text-label-sm text-fg-muted uppercase">
                        <th scope="col" className="w-14 px-3 py-3 md:px-4">
                          {labels.rank}
                        </th>
                        <th scope="col" className="px-3 py-3 md:px-4">
                          {labels.player}
                        </th>
                        <th scope="col" className="hidden px-4 py-3 md:table-cell">
                          {labels.when}
                        </th>
                        <th scope="col" className="px-3 py-3 text-right md:px-4">
                          {labels.score}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-border-subtle">
                      {entries.map((entry) => {
                        const isYou = entry.player.id === currentPlayerId;
                        const medal = podium[entry.rank - 1];
                        return (
                          <tr
                            key={entry.player.id}
                            className={isYou ? 'bg-brand-soft/40' : undefined}
                          >
                            <td className="px-3 py-2.5 md:px-4">
                              <span
                                className={`inline-flex size-7 items-center justify-center rounded-full font-display text-label-md tabular-nums ${medal ?? 'text-fg-muted'}`}
                              >
                                {entry.rank}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 md:px-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  name={entry.player.displayName}
                                  seed={entry.player.avatarSeed}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/profile/${entry.player.username}`}
                                      className="truncate font-display text-label-md text-fg-primary hover:underline"
                                    >
                                      {entry.player.displayName}
                                    </Link>
                                    {isYou ? (
                                      <Badge tone="brand" size="sm">
                                        ●
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="text-label-sm text-fg-muted">
                                    @{entry.player.username}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="hidden px-4 py-2.5 text-body-sm text-fg-muted md:table-cell">
                              {formatRelative(entry.achievedAt, locale, generatedAt)}
                            </td>
                            <td className="px-3 py-2.5 text-right md:px-4">
                              <span className="inline-flex items-center justify-end gap-2">
                                <span title={labels.trend[entry.trend]}>
                                  {trendIcons[entry.trend]}
                                </span>
                                <ScoreValue
                                  value={entry.score}
                                  locale={localeTag(locale)}
                                  animate={false}
                                  className="text-title-sm"
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
