import { Badge, GameCard, SceneCover } from '@playnex/ui';
import { getTranslations } from 'next-intl/server';

import { NavLink } from '@/components/nav-link';
import { coverBackground, sceneShapes } from '@/lib/creator/cover';

import type { CommunityGame } from './types';

export async function CommunityCard({ game }: { game: CommunityGame }) {
  const t = await getTranslations('creator.community');
  return (
    <GameCard
      title={game.title}
      tagline={game.description || undefined}
      accent={game.dimension === '2d' ? 'cyan' : 'pink'}
      status="live"
      cover={
        <SceneCover
          width={game.cover.width}
          height={game.cover.height}
          background={coverBackground(game.cover)}
          shapes={sceneShapes(game.cover)}
          title={game.title}
        />
      }
      href={`/community/${game.releaseId}`}
      playHref={`/play/u/${game.releaseId}`}
      playLabel={t('play')}
      badges={
        <Badge tone={game.dimension === '2d' ? 'cyan' : 'pink'}>
          {game.dimension.toUpperCase()}
        </Badge>
      }
      meta={
        <span className="text-body-sm text-fg-muted">
          {t('meta', { author: game.author, plays: game.plays, likes: game.likes })}
        </span>
      }
      linkComponent={NavLink}
    />
  );
}
