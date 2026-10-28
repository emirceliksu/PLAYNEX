import type { AdminOverview } from '@playnex/shared-types';
import { Avatar, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { AdminHeader } from '@/features/admin/admin-header';
import { adminMetadata, requireAdmin } from '@/features/admin/admin-session';
import { UserStatus } from '@/features/admin/user-status';
import { routing } from '@/i18n/routing';
import { callApi } from '@/lib/auth/api';
import { formatNumber, formatRelative } from '@/lib/format';

interface AdminPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AdminPageProps): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, 'admin');
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const { token } = await requireAdmin();
  const [t, result] = await Promise.all([
    getTranslations('admin'),
    callApi<AdminOverview>('/v1/admin/overview', { token }),
  ]);
  if (!result.ok) {
    throw new Error(`admin overview failed: ${result.body.error}`);
  }
  const { totals, recentUsers, recentActions } = result.data;
  const now = new Date().toISOString();
  const number = (value: number) => formatNumber(value, locale);

  const smallTiles = [
    { key: 'joinedThisWeek', value: totals.joinedThisWeek, accent: 'text-mint-text' },
    { key: 'signedInPlayers', value: totals.signedInPlayers, accent: 'text-cyan-text' },
    { key: 'pending', value: totals.pending, accent: 'text-yellow-text' },
    { key: 'suspended', value: totals.suspended, accent: 'text-coral-text' },
  ] as const;

  return (
    <div className="flex flex-col gap-10">
      <AdminHeader section="overview" title={t('overview.title')} lead={t('overview.lead')} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between gap-6 rounded-2xl border-2 border-(--pn-shadow-ink) bg-brand-soft p-6 shadow-sticker-lg sm:col-span-2 lg:row-span-2">
          <p className="text-label-sm text-brand-soft-text uppercase">
            {t('overview.totals.users')}
          </p>
          <div className="flex flex-col gap-2">
            <p className="font-display text-display-xl leading-none text-fg-primary tabular-nums">
              {number(totals.users)}
            </p>
            <p className="text-body-md text-fg-secondary">
              {t('overview.totals.breakdown', {
                verified: number(totals.verified),
                admins: number(totals.admins),
              })}
            </p>
          </div>
        </div>
        {smallTiles.map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised p-5"
          >
            <p className="text-label-sm text-fg-muted uppercase">
              {t(`overview.totals.${tile.key}`)}
            </p>
            <p className={`font-display text-score-lg tabular-nums ${tile.accent}`}>
              {number(tile.value)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-5">
          <SectionHeader
            title={t('overview.recentUsers')}
            href="/admin/users"
            linkLabel={t('overview.viewAll')}
          />
          {recentUsers.length === 0 ? (
            <EmptyState title={t('overview.noUsers')} />
          ) : (
            <ul className="divide-y-2 divide-border-subtle rounded-xl border-2 border-border-subtle bg-surface-raised">
              {recentUsers.map((user) => (
                <li key={user.username} className="flex items-center gap-3 px-4 py-3">
                  <Avatar
                    name={`${user.firstName} ${user.lastName}`}
                    seed={user.username}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-label-md text-fg-primary">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-label-sm text-fg-muted">@{user.username}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <UserStatus user={user} />
                    <time dateTime={user.createdAt} className="text-label-sm text-fg-muted">
                      {formatRelative(user.createdAt, locale, now)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader title={t('overview.recentActions')} />
          {recentActions.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-border-subtle px-4 py-6 text-body-sm text-fg-muted">
              {t('overview.noActions')}
            </p>
          ) : (
            <ol className="flex flex-col gap-4 border-l-2 border-border-subtle pl-5">
              {recentActions.map((entry) => (
                <li
                  key={`${entry.createdAt}-${entry.targetUsername}`}
                  className="flex flex-col gap-0.5"
                >
                  <p className="text-body-sm text-fg-secondary">
                    {t.rich(`log.${entry.action}`, {
                      actor: entry.actorUsername,
                      target: entry.targetUsername,
                      b: (chunks) => (
                        <strong className="font-semibold text-fg-primary">{chunks}</strong>
                      ),
                    })}
                  </p>
                  <time dateTime={entry.createdAt} className="text-label-sm text-fg-muted">
                    {formatRelative(entry.createdAt, locale, now)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
