import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { name: 'Ayşe Çelik', seed: 'ayse.c', size: 'md' },
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    status: { control: 'select', options: [undefined, 'online', 'in-game', 'offline'] },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const WithStatus: Story = {
  args: { status: 'online', statusLabel: 'Çevrim içi' },
};

export const WithImage: Story = {
  args: {
    name: 'Kaan Demir',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="%23364f6b"/><circle cx="20" cy="16" r="8" fill="%23f5f7fa"/><rect x="6" y="28" width="28" height="12" rx="6" fill="%23f5f7fa"/></svg>',
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-4">
      <Avatar {...args} size="xs" />
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" status="online" statusLabel="Çevrim içi" />
      <Avatar {...args} size="lg" status="in-game" statusLabel="Oyunda" />
      <Avatar {...args} size="xl" status="offline" statusLabel="Çevrimdışı" />
    </div>
  ),
};

export const SeedColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {['emre_k', 'kaan.d', 'ayse.c', 'mertcan', 'selin.ak', 'burak_61', 'elifnur', 'yigit.gg'].map(
        (seed) => (
          <Avatar key={seed} name={seed} seed={seed} />
        ),
      )}
    </div>
  ),
};
