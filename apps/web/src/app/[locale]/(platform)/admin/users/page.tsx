import type { AdminUserFilter, AdminUserPage } from '@playnex/shared-types';
import { Avatar, Badge, Button, EmptyState, SearchInput, cn } from '@playnex/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminHeader } from '@/features/admin/admin-header';
import { adminMetadata, requireAdmin } from '@/features/admin/admin-session';
import { UserActions } from '@/features/admin/user-actions';
import { UserStatus } from '@/features/admin/user-status';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { callApi } from '@/lib/auth/api';
import { formatDate, formatRelative } from '@/lib/format';

const filters: readonly AdminUserFilter[] = ['all', 'verified', 'pending', 'suspended', 'admins'];

interface AdminUsersPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}

export async function generateMetadata({
  params,
}: Pick<AdminUsersPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, 'adminUsers');
}

function listHref(q: string, filter: AdminUserFilter, page = 1): string {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (filter !== 'all') query.set('filter', filter);
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/admin/users?${search}` : '/admin/users';
}

export default async function AdminUsersPage({ params, searchParams }: AdminUsersPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const { account, token } = await requireAdmin();
  const q = query.q?.trim() ?? '';
  const filter = filters.find((value) => value === query.filter) ?? 'all';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const apiQuery = new URLSearchParams({ q, filter, page: String(page) });
  const [t, common, result] = await Promise.all([
    getTranslations('admin'),
    getTranslations('common'),
    callApi<AdminUserPage>(`/v1/admin/users?${apiQuery.toString()}`, { token }),
  ]);
  if (!result.ok) {
    throw new Error(`admin users failed: ${result.body.error}`);
  }
  const { users, total, pageSize } = result.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader section="users" title={t('users.title')} lead={t('users.lead')} />

      <div className="flex flex-col gap-4 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 md:p-5">
        <form role="search" aria-label={t('users.searchLabel')} className="flex gap-3">
          {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
          <SearchInput
            name="q"
            label={t('users.searchLabel')}
            placeholder={t('users.searchPlaceholder')}
            defaultValue={q}
            autoComplete="off"
            className="flex-1"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-11">
            {t('users.searchSubmit')}
          </Button>
        </form>
        <nav aria-label={t('users.filtersLabel')} className="flex flex-wrap gap-2">
          {filters.map((value) => {
            const current = value === filter;
            return (
              <Link
                key={value}
                href={listHref(q, value)}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'inline-flex h-10 items-center rounded-full border-2 px-4 font-display text-label-md',
                  'transition-[background-color,border-color,color] duration-(--pn-duration-fast) ease-out',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                  current
                    ? 'border-brand-solid bg-brand-soft text-brand-soft-text'
                    : 'border-border-strong bg-surface-raised text-fg-secondary hover:border-fg-primary hover:text-fg-primary',
                )}
              >
                {t(`users.filters.${value}`)}
              </Link>
            );
          })}
        </nav>
      </div>

      <p className="text-label-md text-fg-muted" aria-live="polite">
        {t('users.count', { total })}
      </p>

      {users.length === 0 ? (
        <EmptyState title={t('users.empty.title')} description={t('users.empty.description')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((user) => {
            const isYou = user.username === account.username;
            return (
              <li
                key={user.username}
                className={cn(
                  'grid gap-4 rounded-xl border-2 bg-surface-raised p-4 md:p-5',
                  'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center',
                  user.suspendedAt ? 'border-coral-solid/40' : 'border-border-subtle',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={`${user.firstName} ${user.lastName}`}
                    seed={user.username}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-display text-label-md text-fg-primary">
                      {user.firstName} {user.lastName}
                      {isYou ? (
                        <Badge tone="neutral" size="sm">
                          {t('status.you')}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-label-sm text-fg-muted">@{user.username}</p>
                    <p className="truncate text-body-sm text-fg-secondary">{user.email}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <UserStatus user={user} />
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-label-sm">
                    <dt className="text-fg-muted">{t('users.columns.joined')}</dt>
                    <dd className="text-fg-secondary">
                      <time dateTime={user.createdAt}>{formatDate(user.createdAt, locale)}</time>
                    </dd>
                    <dt className="text-fg-muted">{t('users.columns.lastSignIn')}</dt>
                    <dd className="text-fg-secondary">
                      {user.lastSignInAt ? (
                        <time dateTime={user.lastSignInAt}>
                          {formatRelative(user.lastSignInAt, locale, now)}
                        </time>
                      ) : (
                        t('users.never')
                      )}
                    </dd>
                    <dt className="text-fg-muted">{t('users.columns.sessions')}</dt>
                    <dd className="text-fg-secondary tabular-nums">{user.activeSessions}</dd>
                  </dl>
                </div>

                <div className="lg:justify-self-end">
                  {isYou ? null : <UserActions user={user} closeLabel={common('close')} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={listHref(q, filter, page - 1)}>
                <ChevronLeft aria-hidden />
                {t('users.previous')}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-label-md text-fg-muted tabular-nums">
            {t('users.page', { page, pages })}
          </span>
          {page < pages ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={listHref(q, filter, page + 1)}>
                {t('users.next')}
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
