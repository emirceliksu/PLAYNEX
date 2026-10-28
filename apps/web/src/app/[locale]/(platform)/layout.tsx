import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { PlatformShell } from '@/components/platform-shell';
import { getCurrentAccount } from '@/lib/auth/session';

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const [t, account] = await Promise.all([getTranslations(), getCurrentAccount()]);

  return (
    <PlatformShell
      labels={{
        mainNav: t('common.mainNav'),
        mobileNav: t('common.mobileNav'),
        home: t('nav.home'),
        games: t('nav.games'),
        leaderboard: t('nav.leaderboard'),
        profile: t('nav.profile'),
        admin: t('common.admin'),
        searchLabel: t('common.search.label'),
        searchPlaceholder: t('common.search.placeholder'),
        notifications: t('common.notifications'),
        notificationsEmpty: t('common.notificationsEmpty'),
        close: t('common.close'),
        myProfile: t('common.myProfile'),
        skipToContent: t('common.skipToContent'),
        signIn: t('common.signIn'),
        signUp: t('common.signUp'),
        offlineTitle: t('errors.offline.title'),
        offlineDescription: t('errors.offline.description'),
      }}
      user={
        account
          ? {
              username: account.username,
              displayName: `${account.firstName} ${account.lastName}`,
              avatarSeed: account.username,
              isAdmin: account.role === 'admin',
            }
          : null
      }
      notifications={[]}
    >
      {children}
    </PlatformShell>
  );
}
