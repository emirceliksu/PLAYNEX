import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Heart, Pause, Settings } from 'lucide-react';

import { IconButton } from './icon-button';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: {
    label: 'Bildirimler',
    variant: 'ghost',
    size: 'md',
    children: <Bell />,
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', label: 'Ayarlar', children: <Settings /> },
};

export const Primary: Story = {
  args: { variant: 'primary', label: 'Duraklat', children: <Pause /> },
};

export const Disabled: Story = {
  args: { disabled: true, label: 'Favorilere ekle', children: <Heart /> },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-4">
      <IconButton {...args} size="sm" />
      <IconButton {...args} size="md" />
      <IconButton {...args} size="lg" />
    </div>
  ),
};
