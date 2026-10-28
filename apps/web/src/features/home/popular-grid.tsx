import type { Game } from '@playnex/shared-types';
import { getTranslations } from 'next-intl/server';

import { CatalogGameCard } from '@/components/catalog-game-card';
import { SectionHeader } from '@/components/section-header';

// First card spans two columns: importance decides size, not the grid.
export async function PopularGrid({ games }: { games: Game[] }) {
  const t = await getTranslations();

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={t('home.popular')}
        hint={t('home.popularHint')}
        size="lg"
        href="/games?sort=popular"
        linkLabel={t('common.viewAll')}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game, index) => (
          <CatalogGameCard
            key={game.slug}
            game={game}
            className={index === 0 ? 'sm:col-span-2' : undefined}
          />
        ))}
      </div>
    </section>
  );
}
