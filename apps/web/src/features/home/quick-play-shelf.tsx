import type { Game } from '@playnex/shared-types';
import { getTranslations } from 'next-intl/server';

import { CatalogGameCard } from '@/components/catalog-game-card';
import { SectionHeader } from '@/components/section-header';

export async function QuickPlayShelf({ games }: { games: Game[] }) {
  const t = await getTranslations();

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={t('home.quickPlay')}
        hint={t('home.quickPlayHint')}
        href="/games"
        linkLabel={t('common.viewAll')}
      />
      <div className="-mx-4 shelf gap-4 px-4 pb-2 md:mx-0 md:px-0">
        {games.map((game) => (
          <CatalogGameCard key={game.slug} game={game} variant="compact" className="w-44 md:w-52" />
        ))}
      </div>
    </section>
  );
}
