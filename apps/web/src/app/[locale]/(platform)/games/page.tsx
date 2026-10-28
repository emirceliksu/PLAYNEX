import type { Game, GameCategory, GameDimension, GameMode } from '@playnex/shared-types';
import { Button, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CatalogGameCard } from '@/components/catalog-game-card';
import { FilterBar, type CatalogFilters } from '@/features/catalog/filter-bar';
import { Link } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { comingSoonGames, games, liveGames } from '@/lib/catalog/games';

interface GamesPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const categories: GameCategory[] = ['arcade', 'puzzle', 'strategy', 'party', 'racing', 'action'];
const dimensions: GameDimension[] = ['2d', '3d'];
const modes: GameMode[] = ['solo', '1v1', 'party', 'co-op'];
const categoryKeys: (GameCategory | 'all')[] = ['all', ...categories];
const dimensionKeys: (GameDimension | 'all')[] = ['all', ...dimensions];
const modeKeys: (GameMode | 'all')[] = ['all', ...modes];

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | 'all' {
  const single = Array.isArray(value) ? value[0] : value;
  return allowed.includes(single as T) ? (single as T) : 'all';
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function filterGames(filters: CatalogFilters): Game[] {
  const query = normalize(filters.q.trim());
  const matched = games.filter((game) => {
    if (filters.category !== 'all' && game.category !== filters.category) return false;
    if (filters.dimension !== 'all' && game.dimension !== filters.dimension) return false;
    if (filters.mode !== 'all' && game.mode !== filters.mode) return false;
    if (!query) return true;
    return [game.title, game.tagline, game.category, game.mode].some((field) =>
      normalize(field).includes(query),
    );
  });

  return matched.sort((a, b) => {
    // Playable games first in every ordering; nobody wants "coming soon" at the top of "popular".
    if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
    if (filters.sort === 'new') return b.releasedAt.localeCompare(a.releasedAt);
    // Featured keeps the curated catalog order; there is no play-count data to rank by yet.
    return 0;
  });
}

export async function generateMetadata({
  params,
}: Pick<GamesPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('games') };
}

export default async function GamesPage({ params, searchParams }: GamesPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('games');

  const filters: CatalogFilters = {
    q: (Array.isArray(query.q) ? query.q[0] : query.q) ?? '',
    category: pick(query.category, categories),
    dimension: pick(query.dimension, dimensions),
    mode: pick(query.mode, modes),
    sort: pick(query.sort, ['popular', 'new'] as const) === 'new' ? 'new' : 'popular',
  };
  const results = filterGames(filters);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-display-md">{t('title')}</h1>
        <p className="text-body-md text-fg-secondary">
          {t('subtitle', { live: liveGames.length, soon: comingSoonGames.length })}
        </p>
      </header>

      <FilterBar
        filters={filters}
        labels={{
          search: t('searchPlaceholder'),
          category: t('filters.category'),
          dimension: t('filters.dimension'),
          mode: t('filters.mode'),
          sort: t('filters.sort'),
          clear: t('clearFilters'),
          categories: Object.fromEntries(categoryKeys.map((key) => [key, t(`category.${key}`)])),
          dimensions: Object.fromEntries(dimensionKeys.map((key) => [key, t(`dimension.${key}`)])),
          modes: Object.fromEntries(modeKeys.map((key) => [key, t(`mode.${key}`)])),
          sorts: { popular: t('sort.popular'), new: t('sort.new') },
        }}
      />

      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-title-lg">{t('allGames')}</h2>
        <p className="font-display text-label-md text-fg-muted" aria-live="polite">
          {t('resultCount', { count: results.length })}
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Button asChild variant="secondary">
              <Link href="/games">{t('empty.action')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {results.map((game) => (
            <CatalogGameCard key={game.slug} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
