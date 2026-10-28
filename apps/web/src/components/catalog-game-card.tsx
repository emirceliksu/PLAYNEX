import type { Game } from '@playnex/shared-types';
import { Badge, GameCard, GameCover } from '@playnex/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { getGameCopy } from '@/lib/catalog/game-copy';
import { formatDate } from '@/lib/format';

import { NavLink } from './nav-link';

interface CatalogGameCardProps {
  game: Game;
  variant?: 'featured' | 'standard' | 'compact';
  eyebrow?: string;
  className?: string;
}

export async function CatalogGameCard({
  game,
  variant = 'standard',
  eyebrow,
  className,
}: CatalogGameCardProps) {
  const locale = await getLocale();
  const [t, common, copyOf] = await Promise.all([
    getTranslations('game'),
    getTranslations('common'),
    getGameCopy(locale),
  ]);
  const copy = copyOf(game.slug);
  const live = game.status === 'live';

  return (
    <GameCard
      variant={variant}
      title={game.title}
      tagline={variant === 'compact' ? undefined : copy.tagline}
      description={variant === 'featured' ? copy.description : undefined}
      accent={game.accent}
      status={game.status}
      cover={<GameCover slug={game.slug} accent={game.accent} muted={!live} />}
      href={`/games/${game.slug}`}
      playHref={live ? `/play/${game.slug}` : undefined}
      playLabel={variant === 'featured' ? common('playNow') : common('play')}
      statusLabel={t(`statuses.${game.status}`)}
      eyebrow={eyebrow}
      badges={
        variant === 'compact' ? undefined : (
          <>
            <Badge tone={game.accent}>{t(`modes.${game.mode}`)}</Badge>
            <Badge>{t(`dimensions.${game.dimension}`)}</Badge>
            {variant === 'featured' ? <Badge>{t(`categories.${game.category}`)}</Badge> : null}
          </>
        )
      }
      meta={
        live
          ? common('minutes', { count: game.estimatedMinutes })
          : formatDate(game.releasedAt, locale)
      }
      linkComponent={NavLink}
      className={className}
    />
  );
}
