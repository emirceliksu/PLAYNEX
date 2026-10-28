'use client';

import { Avatar, Button, Logo, MobileNav, Sidebar, Topbar, type NavItem } from '@playnex/ui';
import { Compass, Gamepad2, ShieldCheck, Trophy, User } from 'lucide-react';
import type { ReactNode } from 'react';

import { Link, usePathname } from '@/i18n/navigation';

import { NavLink } from './nav-link';
import { NotificationsButton } from './notifications-button';
import { OfflineBanner } from './offline-banner';
import { SearchForm } from './search-form';

export interface PlatformShellLabels {
  mainNav: string;
  mobileNav: string;
  home: string;
  games: string;
  leaderboard: string;
  profile: string;
  admin: string;
  searchLabel: string;
  searchPlaceholder: string;
  notifications: string;
  notificationsEmpty: string;
  close: string;
  myProfile: string;
  skipToContent: string;
  signIn: string;
  signUp: string;
  offlineTitle: string;
  offlineDescription: string;
}

interface PlatformShellProps {
  labels: PlatformShellLabels;
  user: { username: string; displayName: string; avatarSeed: string; isAdmin: boolean } | null;
  notifications: {
    id: string;
    actor: string;
    actorSeed: string;
    text: string;
    when: string;
    unread: boolean;
  }[];
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function PlatformShell({ labels, user, notifications, children }: PlatformShellProps) {
  const pathname = usePathname();
  const profileHref = user ? `/profile/${user.username}` : '/login';

  const items: NavItem[] = [
    { href: '/', label: labels.home, icon: <Compass />, active: isActive(pathname, '/') },
    {
      href: '/games',
      label: labels.games,
      icon: <Gamepad2 />,
      active: isActive(pathname, '/games'),
    },
    {
      href: '/leaderboard',
      label: labels.leaderboard,
      icon: <Trophy />,
      active: isActive(pathname, '/leaderboard'),
    },
    {
      href: profileHref,
      label: labels.profile,
      icon: <User />,
      active: isActive(pathname, '/profile'),
    },
  ];
  if (user?.isAdmin) {
    items.push({
      href: '/admin',
      label: labels.admin,
      icon: <ShieldCheck />,
      active: isActive(pathname, '/admin'),
    });
  }

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg border-2 border-border-strong bg-surface-overlay px-4 py-3 font-display text-label-md text-fg-primary shadow-sticker focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        {labels.skipToContent}
      </a>
      <div className="sticky top-0 hidden h-dvh shrink-0 md:block">
        <Sidebar
          label={labels.mainNav}
          items={items}
          linkComponent={NavLink}
          brand={
            <Link href="/" aria-label="PLAYNEX" className="rounded-sm">
              <Logo compactBelowLg />
            </Link>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          brand={
            <Link href="/" aria-label="PLAYNEX" className="rounded-sm">
              <Logo compact />
            </Link>
          }
          search={<SearchForm label={labels.searchLabel} placeholder={labels.searchPlaceholder} />}
          actions={
            user ? (
              <>
                <NotificationsButton
                  label={labels.notifications}
                  emptyLabel={labels.notificationsEmpty}
                  closeLabel={labels.close}
                  items={notifications}
                />
                <Link
                  href={profileHref}
                  aria-label={labels.myProfile}
                  className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  <Avatar name={user.displayName} seed={user.avatarSeed} size="sm" />
                </Link>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
                  <Link href="/login">{labels.signIn}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">{labels.signUp}</Link>
                </Button>
              </>
            )
          }
        />
        <OfflineBanner title={labels.offlineTitle} description={labels.offlineDescription} />
        <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-page flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
          {children}
        </main>
      </div>
      <MobileNav label={labels.mobileNav} items={items} linkComponent={NavLink} />
    </div>
  );
}
