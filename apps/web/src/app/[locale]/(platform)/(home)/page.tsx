import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CatalogGameCard } from '@/components/catalog-game-card';
import { ComingSoonStrip } from '@/features/home/coming-soon-strip';
import { PopularGrid } from '@/features/home/popular-grid';
import { QuickPlayShelf } from '@/features/home/quick-play-shelf';
import { RankingList } from '@/features/home/ranking-list';
import { SidePanel } from '@/features/home/side-panel';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';
import { comingSoonGames, findGame, liveGames } from '@/lib/catalog/games';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'nav' });
  return { title: t('home') };
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const [t, account] = await Promise.all([getTranslations('home'), getCurrentAccount()]);

  const featured = findGame('snake-rush');
  if (!featured) {
    notFound();
  }

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-10">
      <div className="flex min-w-0 flex-col gap-14">
        {/* The featured card already carries the visual headline; the page name is for outline and screen readers. */}
        <h1 className="sr-only">{t('title')}</h1>
        <section className="animate-rise-in">
          <CatalogGameCard game={featured} variant="featured" eyebrow={t('featuredEyebrow')} />
        </section>
        <QuickPlayShelf games={liveGames} />
        <PopularGrid games={[...liveGames, ...comingSoonGames].slice(0, 6)} />
        <RankingList entries={[]} currentUsername={account?.username} />
        {comingSoonGames.length > 0 ? <ComingSoonStrip games={comingSoonGames} /> : null}
      </div>
      <SidePanel account={account} />
    </div>
  );
}
