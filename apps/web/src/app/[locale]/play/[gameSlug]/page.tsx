import type { GamePlayerState } from '@playnex/shared-types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { GamePlayer } from '@/features/game-player/game-player';
import { playerLabels } from '@/features/game-player/labels';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';
import { hasGameModule } from '@/lib/games/registry';
import { getGameCopy, getGameText } from '@/lib/catalog/game-copy';
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

  const account = await getCurrentAccount();
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
        messages: await getGameText(locale, game.slug),
        scoring: game.scoring,
        setup: game.setup,
      }}
      roomCode={roomCode}
      viewer={account?.username ?? null}
      locale={locale}
      preview={preview}
      labels={await playerLabels()}
    />
  );
}
