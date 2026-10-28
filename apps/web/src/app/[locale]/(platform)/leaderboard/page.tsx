import type { LeaderboardEntry } from '@playnex/shared-types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LeaderboardTable } from '@/features/leaderboard/leaderboard-table';
import { SiperBoard, siperOrder } from '@/features/siper/siper-board';
import { leaderboardWindows, type LeaderboardWindow } from '@/features/leaderboard/windows';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';
import { liveGames } from '@/lib/catalog/games';

interface LeaderboardPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ game?: string; siper?: string }>;
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
  const [t, account] = await Promise.all([getTranslations('leaderboard'), getCurrentAccount()]);

  const boards: Record<string, Record<LeaderboardWindow, LeaderboardEntry[]>> = Object.fromEntries(
    liveGames.map((game) => [
      game.slug,
      Object.fromEntries(
        leaderboardWindows.map((window) => [window, [] as LeaderboardEntry[]]),
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
      <SiperBoard
        by={siperOrder(query.siper)}
        locale={locale}
        currentUsername={account?.username}
      />
      <LeaderboardTable
        games={liveGames.map((game) => ({
          slug: game.slug,
          title: game.title,
          accent: game.accent,
        }))}
        boards={boards}
        initialGame={initialGame ?? ''}
        currentUsername={account?.username}
        generatedAt={new Date().toISOString()}
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
