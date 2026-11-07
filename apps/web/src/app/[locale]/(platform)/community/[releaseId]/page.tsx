import { Avatar, Badge, Button, EmptyState, SceneCover } from '@playnex/ui';
import { Hammer, Play } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { LikeButton } from '@/features/creator/like-button';
import { loadLeaderboard, loadLikeState, loadRelease } from '@/features/creator/load';
import { ReportGameButton } from '@/features/creator/report-game-button';
import { Link } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount, sessionToken } from '@/lib/auth/session';
import { coverBackground, sceneShapes } from '@/lib/creator/cover';
import { formatDate } from '@/lib/format';
import { notFoundMetadata } from '@/lib/not-found-metadata';

interface ReleasePageProps {
  params: Promise<{ locale: string; releaseId: string }>;
}

export async function generateMetadata({ params }: ReleasePageProps): Promise<Metadata> {
  const { locale, releaseId } = await params;
  const release = await loadRelease(releaseId);
  if (!release) return notFoundMetadata(locale);
  return { title: release.title, description: release.description || undefined };
}

export default async function ReleasePage({ params }: ReleasePageProps) {
  const { locale, releaseId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(resolveLocale(locale));

  const release = await loadRelease(releaseId);
  if (!release) notFound();
  const [t, account, token, leaderboard] = await Promise.all([
    getTranslations('creator.game'),
    getCurrentAccount(),
    sessionToken(),
    loadLeaderboard(release.id),
  ]);
  const likeState = (token ? await loadLikeState(release.projectId, token) : null) ?? {
    liked: false,
    likes: release.likes,
  };
  const own = account?.username === release.author;
  const tone = release.dimension === '2d' ? 'cyan' : 'pink';

  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="overflow-hidden rounded-2xl border-2 border-border-strong shadow-sticker-lg">
          <SceneCover
            width={release.cover.width}
            height={release.cover.height}
            background={coverBackground(release.cover)}
            shapes={sceneShapes(release.cover)}
            title={release.title}
          />
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={tone}>{release.dimension.toUpperCase()}</Badge>
            <Badge>{t('version', { n: release.version })}</Badge>
          </div>
          <h1 className="font-display text-display-lg">{release.title}</h1>
          {release.description ? (
            <p className="text-body-lg text-fg-secondary">{release.description}</p>
          ) : null}
          <Link
            href={`/profile/${release.author}`}
            className="flex w-fit items-center gap-2 rounded-md text-body-md hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <Avatar name={release.author} seed={release.author} size="sm" />
            {t('by', { author: release.author })}
          </Link>
          <p className="text-body-sm text-fg-muted">
            {t('stats', { plays: release.plays, date: formatDate(release.publishedAt, locale) })}
          </p>
          {release.latest ? null : (
            <p className="rounded-lg border-2 border-yellow-solid bg-yellow-soft p-3 text-body-sm text-yellow-text">
              {t('olderVersion')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={`/play/u/${release.id}`}>
                <Play aria-hidden className="size-5" />
                {t('play')}
              </Link>
            </Button>
            <LikeButton
              projectId={release.projectId}
              initial={likeState}
              signedIn={Boolean(account)}
              next={`/community/${release.id}`}
            />
            {own ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/create/${release.projectId}`}>
                  <Hammer aria-hidden className="size-4" />
                  {t('edit')}
                </Link>
              </Button>
            ) : account ? (
              <ReportGameButton releaseId={release.id} />
            ) : null}
          </div>
          <p className="text-body-sm text-fg-muted">{t('controls')}</p>
        </div>
      </section>

      <section className="flex max-w-2xl flex-col gap-4">
        <SectionHeader title={t('leaderboard')} hint={t('leaderboardHint')} />
        {leaderboard.length === 0 ? (
          <EmptyState scene="podium" title={t('leaderboardEmpty')} />
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.map((entry, index) => (
              <li
                key={entry.username}
                className="flex items-center gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised px-3 py-2"
              >
                <span className="w-8 font-display text-score-md text-fg-muted tabular-nums">
                  {index + 1}
                </span>
                <Avatar name={entry.username} seed={entry.username} size="sm" />
                <Link
                  href={`/profile/${entry.username}`}
                  className="min-w-0 flex-1 truncate font-display text-body-md hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                >
                  {entry.username}
                </Link>
                <span className="font-display text-score-md tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
