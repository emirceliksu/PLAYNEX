import type { LeaderboardEntry } from '@playnex/shared-types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LeaderboardTable } from '@/features/leaderboard/leaderboard-table';
import { resolveLocale, routing } from '@/i18n/routing';
import { liveGames } from '@/lib/mock/games';
import {
  getLeaderboard,
  leaderboardGeneratedAt,
  leaderboardWindows,
  type LeaderboardWindow,
} from '@/lib/mock/leaderboard';
import { currentPlayer } from '@/lib/mock/players';

interface LeaderboardPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ game?: string }>;
}

export async function generateMetadata({
  params,
}: Pick<LeaderboardPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('leaderboard') };
}

export default async function LeaderboardPage({ params, searchParams }: LeaderboardPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('leaderboard');

  const boards: Record<string, Record<LeaderboardWindow, LeaderboardEntry[]>> = Object.fromEntries(
    liveGames.map((game) => [
      game.slug,
      Object.fromEntries(
        leaderboardWindows.map((window) => [window, getLeaderboard(game.slug, window)]),
      ) as Record<LeaderboardWindow, LeaderboardEntry[]>,
    ]),
  );
  const requested = query.game;
  const initialGame =
    requested && liveGames.some((game) => game.slug === requested) ? requested : liveGames[0]?.slug;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-display-md">{t('title')}</h1>
        <p className="text-body-md text-fg-secondary">{t('subtitle')}</p>
      </header>
      <LeaderboardTable
        games={liveGames.map((game) => ({
          slug: game.slug,
          title: game.title,
          accent: game.accent,
        }))}
        boards={boards}
        initialGame={initialGame ?? ''}
        currentPlayerId={currentPlayer.id}
        generatedAt={leaderboardGeneratedAt}
        locale={locale}
        labels={{
          chooseGame: t('chooseGame'),
          windows: Object.fromEntries(
            leaderboardWindows.map((window) => [window, t(`windows.${window}`)]),
          ) as Record<LeaderboardWindow, string>,
          rank: t('rank'),
          player: t('player'),
          score: t('score'),
          when: t('when'),
          trend: { up: t('trend.up'), down: t('trend.down'), same: t('trend.same') },
          emptyTitle: t('empty.title'),
          emptyDescription: t('empty.description'),
        }}
      />
    </div>
  );
}
