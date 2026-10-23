import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Compass, Gamepad2, Trophy, User } from 'lucide-react';

import { Avatar } from '../avatar/avatar';
import { IconButton } from '../icon-button/icon-button';
import { Logo } from '../logo/logo';
import { MobileNav } from '../mobile-nav/mobile-nav';
import { SearchInput } from '../search-input/search-input';
import { Topbar } from '../topbar/topbar';
import { Sidebar, type NavItem } from './sidebar';

const items: NavItem[] = [
  { href: '#home', label: 'Keşfet', icon: <Compass />, active: true },
  { href: '#games', label: 'Oyunlar', icon: <Gamepad2 /> },
  { href: '#leaderboard', label: 'Sıralama', icon: <Trophy /> },
  { href: '#profile', label: 'Profil', icon: <User /> },
];

const meta = {
  title: 'Navigation/Shell',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const SidebarOnly: Story = {
  render: () => (
    <div className="h-[32rem]">
      <Sidebar label="Ana menü" items={items} brand={<Logo compactBelowLg />} />
    </div>
  ),
};

export const TopbarOnly: Story = {
  render: () => (
    <Topbar
      brand={<Logo compact />}
      search={<SearchInput label="Oyun ara" placeholder="Oyun ara…" />}
      actions={
        <>
          <IconButton label="Bildirimler">
            <Bell />
          </IconButton>
          <Avatar name="Emre K." seed="emre_k" size="sm" />
        </>
      }
    />
  ),
};

export const MobileNavOnly: Story = {
  render: () => (
    <div className="relative h-40">
      <MobileNav label="Alt menü" items={items} className="absolute" />
    </div>
  ),
};

export const FullShell: Story = {
  render: () => (
    <div className="flex h-[36rem]">
      <Sidebar label="Ana menü" items={items} brand={<Logo compactBelowLg />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          search={<SearchInput label="Oyun ara" placeholder="Oyun ara…" />}
          actions={
            <>
              <IconButton label="Bildirimler">
                <Bell />
              </IconButton>
              <Avatar name="Emre K." seed="emre_k" size="sm" />
            </>
          }
        />
        <main className="flex-1 p-8 text-body-md text-fg-secondary">İçerik alanı</main>
      </div>
    </div>
  ),
};
