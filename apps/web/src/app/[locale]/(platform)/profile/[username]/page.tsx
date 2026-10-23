import { Avatar, Badge, Button, EmptyState, GameCover, ScoreValue, XpBar } from '@playnex/ui';
import { Lock, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { Link } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { formatDate, formatDateTime, formatMinutes, formatNumber, localeTag } from '@/lib/format';
import { findGame, liveGames } from '@/lib/mock/games';
import { currentPlayer, findPlayer } from '@/lib/mock/players';
import { achievements, playerStats, sessions } from '@/lib/mock/sessions';

interface ProfilePageProps {
  params: Promise<{ locale: string; username: string }>;
}

const verificationTones = { verified: 'mint', pending: 'yellow', rejected: 'coral' } as const;

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { locale, username } = await params;
  const player = findPlayer(username);
  if (!player) return {};
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('profile', { name: player.displayName }) };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, username } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const player = findPlayer(username);
  if (!player) {
    notFound();
  }

  const [t, common] = await Promise.all([getTranslations('profile'), getTranslations('common')]);
  const isOwn = player.id === currentPlayer.id;
  // Mock history and bests exist for the signed-in player only.
  const history = isOwn ? sessions : [];
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt !== null);
  const tag = localeTag(locale);

  const stats = [
    { label: t('stats.games'), value: formatNumber(isOwn ? playerStats.gamesPlayed : 37, locale) },
    {
      label: t('stats.minutes'),
      value: formatMinutes(isOwn ? playerStats.totalMinutes : 210, locale),
    },
    {
      label: t('stats.achievements'),
      value: `${isOwn ? unlocked.length : 2}/${achievements.length}`,
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <header className="relative overflow-hidden rounded-2xl border-2 border-border-subtle bg-surface-raised">
        <div className="grain h-28 bg-brand-soft md:h-36" aria-hidden />
        <div className="flex flex-col gap-5 px-5 pb-6 md:flex-row md:items-end md:gap-6 md:px-8">
          <Avatar
            name={player.displayName}
            seed={player.avatarSeed}
            size="xl"
            status={player.status}
            statusLabel={common(`status.${player.status}`)}
            className="-mt-12 shrink-0 md:-mt-14"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-display-sm md:text-display-md">
                {player.displayName}
              </h1>
              <Badge sticker tone="brand">
                {common('levelShort', { level: player.level })}
              </Badge>
            </div>
            <p className="text-body-sm text-fg-muted">
              @{player.username} · {t('joined', { date: formatDate(player.joinedAt, locale) })}
            </p>
            <XpBar
              value={player.xp}
              max={player.xpToNextLevel}
              label={common('level', { level: player.level + 1 })}
              valueLabel={t('xp', {
                xp: formatNumber(player.xp, locale),
                max: formatNumber(player.xpToNextLevel, locale),
              })}
              className="max-w-md"
            />
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-4 md:gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="text-label-sm text-fg-muted uppercase">{stat.label}</dt>
                <dd className="font-display text-title-lg text-fg-primary tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <section className="flex flex-col gap-5">
        <SectionHeader title={t('bestScores')} />
        <div className="grid gap-4 sm:grid-cols-3">
          {liveGames.map((game) => {
            const best = isOwn ? playerStats.bestScores[game.slug] : undefined;
            return (
              <Link
                key={game.slug}
                href={`/games/${game.slug}`}
                className="group flex items-center gap-4 rounded-xl border-2 border-border-subtle bg-surface-raised p-3 transition-[border-color] hover:border-border-strong"
              >
                <span className="w-20 shrink-0 overflow-hidden rounded-md border-2 border-border-subtle">
                  <GameCover slug={game.slug} accent={game.accent} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-display text-label-md text-fg-primary">
                    {game.title}
                  </span>
                  <span className="text-label-sm text-fg-muted">{t('personalBest')}</span>
                  {best !== undefined ? (
                    <ScoreValue
                      value={best}
                      locale={tag}
                      animate={false}
                      className="text-title-md text-fg-primary"
                    />
                  ) : (
                    <span className="font-display text-title-md text-fg-muted">—</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
        <section className="flex flex-col gap-5">
          <SectionHeader title={t('history')} hint={t('historyHint')} />
          {history.length === 0 ? (
            <EmptyState
              title={t('emptyHistory.title')}
              description={t('emptyHistory.description')}
              action={
                <Button asChild variant="secondary">
                  <Link href="/games">{t('emptyHistory.action')}</Link>
                </Button>
              }
            />
          ) : (
            <ol className="divide-y-2 divide-border-subtle rounded-xl border-2 border-border-subtle bg-surface-raised">
              {history.map((session) => {
                const game = findGame(session.gameSlug);
                return (
                  <li
                    key={session.id}
                    className="flex items-center gap-3 px-3 py-2.5 md:gap-4 md:px-4"
                  >
                    <span className="w-14 shrink-0 overflow-hidden rounded-sm">
                      {game ? <GameCover slug={game.slug} accent={game.accent} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-label-md text-fg-primary">
                          {game?.title}
                        </span>
                        {session.isPersonalBest ? (
                          <Badge tone="yellow" size="sm">
                            <Trophy aria-hidden />
                            {t('personalBest')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-label-sm text-fg-muted">
                        {formatDateTime(session.endedAt, locale)}
                      </p>
                    </div>
                    <Badge
                      tone={verificationTones[session.verification]}
                      size="sm"
                      className="hidden sm:inline-flex"
                    >
                      {t(`verification.${session.verification}`)}
                    </Badge>
                    <ScoreValue
                      value={session.score}
                      locale={tag}
                      animate={false}
                      className="w-20 text-right text-title-sm"
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader
            title={t('achievements')}
            hint={t('achievementsHint', {
              unlocked: isOwn ? unlocked.length : 2,
              total: achievements.length,
            })}
          />
          <ul className="flex flex-col gap-3">
            {achievements.map((achievement, index) => {
              const isUnlocked = isOwn ? achievement.unlockedAt !== null : index < 2;
              return (
                <li
                  key={achievement.id}
                  className={`flex items-start gap-3 rounded-lg border-2 p-3 ${
                    isUnlocked
                      ? 'border-border-subtle bg-surface-raised'
                      : 'border-dashed border-border-subtle opacity-70'
                  }`}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-md ${
                      isUnlocked
                        ? 'bg-yellow-soft text-yellow-text'
                        : 'bg-surface-sunken text-fg-muted'
                    }`}
                  >
                    {isUnlocked ? (
                      <Trophy aria-hidden className="size-5" />
                    ) : (
                      <Lock aria-hidden className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-label-md text-fg-primary">
                      {achievement.title}
                    </p>
                    <p className="text-body-sm text-fg-secondary">{achievement.description}</p>
                  </div>
                  <span className="shrink-0 text-label-sm text-fg-muted">
                    {isUnlocked ? t('points', { points: achievement.points }) : t('locked')}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
