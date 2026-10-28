import { Avatar, Button, EmptyState, GameCover } from '@playnex/ui';
import { LogOut } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { logout } from '@/features/auth/actions';
import { FormAlert } from '@/features/auth/form-alert';
import { loadProfile } from '@/features/profile/load-profile';
import { Link } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { liveGames } from '@/lib/catalog/games';
import { formatDate } from '@/lib/format';
import { notFoundMetadata } from '@/lib/not-found-metadata';

interface ProfilePageProps {
  params: Promise<{ locale: string; username: string }>;
  searchParams: Promise<{ welcome?: string }>;
}

export async function generateMetadata({
  params,
}: Pick<ProfilePageProps, 'params'>): Promise<Metadata> {
  const { locale, username } = await params;
  const profile = await loadProfile(decodeURIComponent(username));
  if (!profile) return notFoundMetadata(locale);
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('profile', { name: profile.displayName }) };
}

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const [{ locale, username }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const profile = await loadProfile(decodeURIComponent(username));
  if (!profile) {
    notFound();
  }

  const t = await getTranslations('profile');
  const welcome = profile.own && query.welcome === '1';

  return (
    <div className="flex flex-col gap-12">
      {welcome && profile.own ? (
        <FormAlert tone="success">{t('welcome', { name: profile.own.firstName })}</FormAlert>
      ) : null}

      <header className="relative overflow-hidden rounded-2xl border-2 border-border-subtle bg-surface-raised">
        <div className="grain h-28 bg-brand-soft md:h-36" aria-hidden />
        <div className="flex flex-col gap-5 px-5 pb-6 md:flex-row md:items-end md:gap-6 md:px-8">
          <Avatar
            name={profile.displayName}
            seed={profile.username}
            size="xl"
            className="-mt-12 shrink-0 md:-mt-14"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="font-display text-display-sm break-words md:text-display-md">
              {profile.displayName}
            </h1>
            <p className="text-body-sm text-fg-muted">
              @{profile.username} · {t('joined', { date: formatDate(profile.joinedAt, locale) })}
            </p>
          </div>
          {profile.own ? (
            <form action={logout} className="shrink-0">
              <Button type="submit" variant="secondary" size="sm">
                <LogOut aria-hidden />
                {t('signOut')}
              </Button>
            </form>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-5">
        <SectionHeader title={t('bestScores')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liveGames.map((game) => (
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
                <span className="font-display text-title-md text-fg-muted">—</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeader title={t('history')} hint={t('historyHint')} />
        <EmptyState
          title={t('emptyHistory.title')}
          description={t('emptyHistory.description')}
          action={
            <Button asChild variant="secondary">
              <Link href="/games">{t('emptyHistory.action')}</Link>
            </Button>
          }
        />
      </section>
    </div>
  );
}
