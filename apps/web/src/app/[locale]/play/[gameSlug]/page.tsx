import type { GamePlayerState } from '@playnex/shared-types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { GamePlayer } from '@/features/game-player/game-player';
import { resolveLocale, routing } from '@/i18n/routing';
import { hasGameModule } from '@/lib/games/registry';
import { getGameCopy } from '@/lib/catalog/game-copy';
import { findGame } from '@/lib/catalog/games';
import { notFoundMetadata } from '@/lib/not-found-metadata';

interface PlayPageProps {
  params: Promise<{ locale: string; gameSlug: string }>;
  searchParams: Promise<{ state?: string; room?: string }>;
}

const previewStates: GamePlayerState[] = [
  'loading',
  'ready',
  'playing',
  'paused',
  'finished',
  'error',
];

export async function generateMetadata({
  params,
}: Pick<PlayPageProps, 'params'>): Promise<Metadata> {
  const { locale, gameSlug } = await params;
  const game = findGame(gameSlug);
  if (game?.status !== 'live' || !hasGameModule(game.slug)) return notFoundMetadata(locale);
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('play', { title: game.title }) };
}

export default async function PlayPage({ params, searchParams }: PlayPageProps) {
  const [{ locale, gameSlug }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const game = findGame(gameSlug);
  if (game?.status !== 'live' || !hasGameModule(game.slug)) {
    notFound();
  }

  const t = await getTranslations('player');
  // Shell-state preview is a development aid for design review; production ignores it.
  const preview =
    process.env.NODE_ENV === 'development' && previewStates.includes(query.state as GamePlayerState)
      ? (query.state as GamePlayerState)
      : undefined;

  const roomCode =
    typeof query.room === 'string' && /^[A-Za-z0-9]{6}$/.test(query.room)
      ? query.room.toUpperCase()
      : undefined;

  return (
    <GamePlayer
      game={{
        slug: game.slug,
        title: game.title,
        accent: game.accent,
        controlsGuide: (await getGameCopy(locale))(game.slug).controls,
        scoring: game.scoring,
        setup: game.setup,
      }}
      roomCode={roomCode}
      locale={locale}
      preview={preview}
      labels={{
        backToGame: t('backToGame'),
        score: t('score'),
        best: t('best'),
        time: t('time'),
        pause: t('pause'),
        resume: t('resume'),
        restart: t('restart'),
        fullscreen: t('fullscreen'),
        exitFullscreen: t('exitFullscreen'),
        quit: t('quit'),
        localBestNote: t('localBestNote'),
        loadingTitle: t('states.loading.title'),
        loadingHint: t('states.loading.hint'),
        readyTitle: t('states.ready.title'),
        start: t('states.ready.start'),
        controls: t('states.ready.controls'),
        pausedTitle: t('states.paused.title'),
        pausedHint: t('states.paused.hint'),
        finishedTitle: t('states.finished.title'),
        newRecord: t('states.finished.newRecord'),
        playAgain: t('states.finished.playAgain'),
        backToCatalog: t('states.finished.backToCatalog'),
        errorTitle: t('states.error.title'),
        errorDescription: t('states.error.description'),
        retry: t('states.error.retry'),
      }}
    />
  );
}
