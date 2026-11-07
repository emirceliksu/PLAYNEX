import { Button, EmptyState } from '@playnex/ui';
import { Hammer } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ChipLinks } from '@/features/creator/chip-links';
import { CommunityCard } from '@/features/creator/community-card';
import { type CommunitySort, loadCommunity } from '@/features/creator/load';
import { Link } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';

interface CommunityPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string; d?: string }>;
}

const sorts: CommunitySort[] = ['new', 'popular', 'liked'];

export async function generateMetadata({
  params,
}: Pick<CommunityPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('community') };
}

export default async function CommunityPage({ params, searchParams }: CommunityPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const sort = sorts.includes(query.sort as CommunitySort) ? (query.sort as CommunitySort) : 'new';
  const dimension = query.d === '2d' || query.d === '3d' ? query.d : null;
  const [t, games] = await Promise.all([
    getTranslations('creator.community'),
    loadCommunity(sort, dimension),
  ]);
  const href = (next: { sort?: CommunitySort; d?: string | null }) => {
    const search = new URLSearchParams();
    const s = next.sort ?? sort;
    const d = next.d === undefined ? dimension : next.d;
    if (s !== 'new') search.set('sort', s);
    if (d) search.set('d', d);
    const text = search.toString();
    return text ? `/community?${text}` : '/community';
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-label-sm text-pink-text uppercase">{t('eyebrow')}</p>
          <h1 className="font-display text-display-lg">{t('title')}</h1>
          <p className="text-body-lg text-fg-secondary">{t('subtitle')}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/create">
            <Hammer aria-hidden className="size-5" />
            {t('make')}
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <ChipLinks
          label={t('sortLabel')}
          items={sorts.map((value) => ({
            href: href({ sort: value }),
            label: t(`sorts.${value}`),
            active: sort === value,
          }))}
        />
        <ChipLinks
          label={t('dimensionLabel')}
          items={[
            { href: href({ d: null }), label: t('dimensions.all'), active: dimension === null },
            { href: href({ d: '2d' }), label: '2D', active: dimension === '2d' },
            { href: href({ d: '3d' }), label: '3D', active: dimension === '3d' },
          ]}
        />
      </div>

      {games.length === 0 ? (
        <EmptyState
          scene="shelf"
          title={t('empty')}
          description={t('emptyHint')}
          action={
            <Button asChild>
              <Link href="/create">{t('make')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <li key={game.releaseId}>
              <CommunityCard game={game} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
