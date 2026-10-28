'use client';

import { Avatar, Button, Logo, MobileNav, Sidebar, Topbar, type NavItem } from '@playnex/ui';
import { Compass, Gamepad2, LogIn, ShieldCheck, Trophy, User } from 'lucide-react';
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
      // The topbar hides "Sign in" on phones, so for guests this tab is the visible way in.
      label: user ? labels.profile : labels.signIn,
      icon: user ? <User /> : <LogIn />,
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
    // The skip link sits in the flow above the shell: when focused it pushes the topbar down
    // instead of floating over the search field on narrow screens.
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only self-start rounded-lg border-2 border-border-strong bg-surface-overlay font-display text-label-md text-fg-primary shadow-sticker focus-visible:not-sr-only focus-visible:mx-4 focus-visible:my-3 focus-visible:px-4 focus-visible:py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        {labels.skipToContent}
      </a>
      <div className="flex flex-1">
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
            search={
              <SearchForm label={labels.searchLabel} placeholder={labels.searchPlaceholder} />
            }
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
                    className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                  >
                    {/* Initials are decoration; an aria-label over them fails WCAG 2.5.3 (label in name). */}
                    <span aria-hidden className="block">
                      <Avatar name={user.displayName} seed={user.avatarSeed} size="sm" />
                    </span>
                    <span className="sr-only">{labels.myProfile}</span>
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
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-page flex-1 scroll-mt-topbar px-4 pt-6 pb-28 outline-none md:px-8 md:pt-8 md:pb-12"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileNav label={labels.mobileNav} items={items} linkComponent={NavLink} />
    </div>
  );
}
