import type { LeaderboardEntry } from '@playnex/shared-types';
import { Avatar, Badge, ScoreValue } from '@playnex/ui';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { Link } from '@/i18n/navigation';
import { localeTag } from '@/lib/format';
import { findGame } from '@/lib/mock/games';
import { currentPlayer } from '@/lib/mock/players';

const trendIcons = {
  up: <TrendingUp aria-hidden className="size-4 text-mint-text" />,
  down: <TrendingDown aria-hidden className="size-4 text-coral-text" />,
  same: <Minus aria-hidden className="size-4 text-fg-muted" />,
} as const;

export async function RankingList({ entries }: { entries: LeaderboardEntry[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={t('home.ranking')}
        hint={t('home.rankingHint')}
        href="/leaderboard"
        linkLabel={t('common.viewAll')}
      />
      <ol className="divide-y-2 divide-border-subtle rounded-xl border-2 border-border-subtle bg-surface-raised">
        {entries.map((entry) => {
          const game = findGame(entry.gameSlug);
          const isYou = entry.player.id === currentPlayer.id;
          return (
            <li
              key={`${entry.player.id}-${entry.gameSlug}`}
              className={`flex items-center gap-3 px-3 py-2.5 md:gap-4 md:px-4 ${isYou ? 'bg-brand-soft/40' : ''}`}
            >
              <span className="w-6 shrink-0 font-display text-title-sm text-fg-muted tabular-nums">
                {entry.rank}
              </span>
              <Avatar name={entry.player.displayName} seed={entry.player.avatarSeed} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/profile/${entry.player.username}`}
                    className="truncate font-display text-label-md text-fg-primary hover:underline"
                  >
                    {entry.player.displayName}
                  </Link>
                  {isYou ? (
                    <Badge tone="brand" size="sm">
                      {t('common.you')}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-label-sm text-fg-muted">
                  {t('common.levelShort', { level: entry.player.level })} · {game?.title}
                </p>
              </div>
              <span title={t(`leaderboard.trend.${entry.trend}`)}>{trendIcons[entry.trend]}</span>
              <ScoreValue
                value={entry.score}
                locale={localeTag(locale)}
                animate={false}
                className="w-20 text-right text-title-sm text-fg-primary"
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
