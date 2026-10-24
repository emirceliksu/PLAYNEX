import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { PlatformShell } from '@/components/platform-shell';
import { currentPlayer } from '@/lib/mock/players';

// Mock inbox until notifications exist server-side.
const notifications = [
  {
    id: 'n_1',
    actor: 'ayse.c',
    actorSeed: 'ayse.c',
    text: 'Snake Rush rekorunu geçti: 4 520',
    when: '12 dk önce',
    unread: true,
  },
  {
    id: 'n_2',
    actor: 'kaan.d',
    actorSeed: 'kaan.d',
    text: 'seni Connect Four beta listesine ekledi',
    when: '2 sa önce',
    unread: true,
  },
  {
    id: 'n_3',
    actor: 'PLAYNEX',
    actorSeed: 'playnex',
    text: 'Haftalık sıralama sıfırlandı. Yeni hafta, yeni rekor.',
    when: 'Dün',
    unread: false,
  },
];

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <PlatformShell
      labels={{
        mainNav: t('common.mainNav'),
        mobileNav: t('common.mobileNav'),
        home: t('nav.home'),
        games: t('nav.games'),
        leaderboard: t('nav.leaderboard'),
        profile: t('nav.profile'),
        searchLabel: t('common.search.label'),
        searchPlaceholder: t('common.search.placeholder'),
        notifications: t('common.notifications'),
        close: t('common.close'),
        myProfile: t('common.myProfile'),
        offlineTitle: t('errors.offline.title'),
        offlineDescription: t('errors.offline.description'),
      }}
      user={{
        username: currentPlayer.username,
        displayName: currentPlayer.displayName,
        avatarSeed: currentPlayer.avatarSeed,
      }}
      notifications={notifications}
    >
      {children}
    </PlatformShell>
  );
}
