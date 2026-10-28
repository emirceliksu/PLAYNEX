import { Avatar, EmptyState } from '@playnex/ui';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { AddFriendForm } from '@/features/siper/add-friend-form';
import { FriendButton } from '@/features/siper/friend-button';
import type { FriendList } from '@/features/siper/types';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { callApi } from '@/lib/auth/api';
import { getCurrentAccount, sessionToken } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';

interface FriendsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: FriendsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('friends') };
}

function Person({ username, children }: { username: string; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised px-3 py-2">
      <Avatar name={username} seed={username} size="sm" />
      <Link
        href={`/profile/${username}`}
        className="min-w-0 flex-1 truncate font-display text-body-md hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
      >
        {username}
      </Link>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

export default async function FriendsPage({ params }: FriendsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const [account, token] = await Promise.all([getCurrentAccount(), sessionToken()]);
  if (!account || !token) {
    return redirect({ href: `/login?next=${encodeURIComponent('/friends')}`, locale });
  }
  const [t, result] = await Promise.all([
    getTranslations('siper.friends'),
    callApi<FriendList>('/v1/friends', { token }),
  ]);
  if (!result.ok) {
    throw new Error(`friends failed: ${result.body.error}`);
  }
  const { friends, incoming, outgoing } = result.data;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-display-md">{t('title')}</h1>
        <p className="max-w-prose text-body-md text-fg-secondary">{t('subtitle')}</p>
      </header>

      <AddFriendForm />

      {incoming.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader title={t('incoming', { n: incoming.length })} />
          <ul className="grid gap-2 md:grid-cols-2">
            {incoming.map((request) => (
              <Person key={request.username} username={request.username}>
                <FriendButton
                  username={request.username}
                  intent="accept"
                  label={t('accept')}
                  variant="primary"
                />
                <FriendButton
                  username={request.username}
                  intent="remove"
                  label={t('decline')}
                  variant="ghost"
                  decline
                />
              </Person>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHeader title={t('list', { n: friends.length })} hint={t('partyHint')} />
        {friends.length === 0 ? (
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {friends.map((friend) => (
              <Person key={friend.username} username={friend.username}>
                <span className="hidden text-label-sm text-fg-muted sm:inline">
                  {t('since', { date: formatDate(friend.since, locale) })}
                </span>
                <FriendButton
                  username={friend.username}
                  intent="remove"
                  label={t('remove')}
                  variant="ghost"
                />
              </Person>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader title={t('outgoing', { n: outgoing.length })} />
          <ul className="grid gap-2 md:grid-cols-2">
            {outgoing.map((request) => (
              <Person key={request.username} username={request.username}>
                <FriendButton
                  username={request.username}
                  intent="remove"
                  label={t('cancel')}
                  variant="ghost"
                  decline
                />
              </Person>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
