import { Badge, Button, EmptyState, GameCover } from '@playnex/ui';
import {
  Clock,
  Gamepad2,
  Globe,
  Keyboard,
  MousePointer2,
  Pointer,
  Play,
  User,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { CatalogGameCard } from '@/components/catalog-game-card';
import { SectionHeader } from '@/components/section-header';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getGameCopy } from '@/lib/catalog/game-copy';
import { findGame, games } from '@/lib/catalog/games';
import { formatDate } from '@/lib/format';
import { notFoundMetadata } from '@/lib/not-found-metadata';

interface GamePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

const controlIcons: Record<string, ReactNode> = {
  keyboard: <Keyboard aria-hidden className="size-4" />,
  mouse: <MousePointer2 aria-hidden className="size-4" />,
  touch: <Pointer aria-hidden className="size-4" />,
  gamepad: <Gamepad2 aria-hidden className="size-4" />,
};

export function generateStaticParams() {
  return games.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const game = findGame(slug);
  if (!game) return notFoundMetadata(locale);
  const { tagline } = (await getGameCopy(locale))(game.slug);
  return {
    title: game.title,
    description: tagline,
    alternates: { canonical: `/games/${game.slug}` },
    openGraph: { title: game.title, description: tagline, type: 'website' },
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const game = findGame(slug);
  if (!game) {
    notFound();
  }

  const [t, common, lobby, board, copyOf] = await Promise.all([
    getTranslations('game'),
    getTranslations('common'),
    getTranslations('lobby'),
    getTranslations('leaderboard'),
    getGameCopy(locale),
  ]);
  const copy = copyOf(game.slug);
  const modeIcons = { solo: User, local: Users, online: Globe } as const;
  const live = game.status === 'live';
  const similar = games
    .filter((other) => other.slug !== game.slug && other.category === game.category)
    .slice(0, 4);

  const facts: { label: string; value: string }[] = [
    {
      label: t('players'),
      value: t('playersRange', { min: game.players.min, max: game.players.max }),
    },
    { label: t('duration'), value: common('minutes', { count: game.estimatedMinutes }) },
    { label: t('age'), value: game.ageRating },
    { label: t('version'), value: game.version },
    { label: t('released'), value: formatDate(game.releasedAt, locale) },
    { label: t('scoringLabel'), value: t(`scoring.${game.scoring}`) },
  ];

  return (
    <div className="flex flex-col gap-14">
      <section className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center md:gap-10">
        <div className="overflow-hidden rounded-2xl border-2 border-border-strong shadow-sticker-lg">
          <GameCover slug={game.slug} accent={game.accent} title={game.title} muted={!live} />
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={game.accent}>{t(`modes.${game.mode}`)}</Badge>
            <Badge>{t(`categories.${game.category}`)}</Badge>
            <Badge>{t(`dimensions.${game.dimension}`)}</Badge>
            {!live ? (
              <Badge sticker tone="yellow">
                {t(`statuses.${game.status}`)}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display-lg md:text-display-xl">{game.title}</h1>
            <p className="text-title-sm text-fg-secondary">{copy.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-label-md text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden className="size-4" />
              {t('playersRange', { min: game.players.min, max: game.players.max })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="size-4" />
              {common('minutes', { count: game.estimatedMinutes })}
            </span>
          </div>
          {live ? (
            <ul aria-label={t('playModes')} className="flex flex-wrap gap-2">
              {game.setup.modes.map((mode) => {
                const Icon = modeIcons[mode];
                return (
                  <li
                    key={mode}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-border-subtle bg-surface-raised px-3 py-1 text-label-md text-fg-secondary"
                  >
                    <Icon aria-hidden className="size-4" />
                    {lobby(`modes.${mode}.title`)}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {live ? (
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={`/play/${game.slug}`}>
                  <Play aria-hidden className="size-5" />
                  {common('playNow')}
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/leaderboard">{t('leaderboard')}</Link>
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border-2 border-yellow-solid/40 bg-yellow-soft px-4 py-3 text-body-sm text-yellow-text">
              {t('comingSoonNotice')}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-4">
            <SectionHeader title={t('about')} />
            <p className="max-w-[64ch] text-body-lg text-fg-secondary">{copy.description}</p>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeader title={t('controls')} />
            <div className="flex flex-wrap gap-2">
              {game.controls.map((control) => (
                <Badge key={control} tone="neutral" className="gap-1.5 normal-case">
                  {controlIcons[control]}
                  {t(`controlNames.${control}`)}
                </Badge>
              ))}
            </div>
            <ol className="flex flex-col gap-2">
              {copy.controls.map((line, index) => (
                <li key={line} className="flex gap-3 text-body-md text-fg-secondary">
                  <span className="w-5 shrink-0 font-display text-fg-muted tabular-nums">
                    {index + 1}.
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeader title={t('details')} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-0.5">
                  <dt className="text-label-sm text-fg-muted uppercase">{fact.label}</dt>
                  <dd className="font-display text-title-sm text-fg-primary">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {live ? (
          <section className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <SectionHeader
              title={t('leaderboard')}
              href="/leaderboard"
              linkLabel={common('viewAll')}
            />
            <EmptyState title={board('empty.title')} description={board('empty.description')} />
          </section>
        ) : null}
      </div>

      {similar.length > 0 ? (
        <section className="flex flex-col gap-5">
          <SectionHeader title={t('similar')} />
          <div className="-mx-4 shelf gap-4 px-4 pb-2 md:mx-0 md:px-0">
            {similar.map((other) => (
              <CatalogGameCard
                key={other.slug}
                game={other}
                variant="compact"
                className="w-44 md:w-52"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
