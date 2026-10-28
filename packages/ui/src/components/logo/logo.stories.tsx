import type { Meta, StoryObj } from '@storybook/react-vite';

import { Logo, LogoMark } from './logo';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  args: { compact: false, compactBelowLg: false },
} satisfies Meta<typeof Logo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Wordmark: Story = {};

export const Compact: Story = {
  args: { compact: true },
};

export const MarkSizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <LogoMark className="size-6" />
      <LogoMark />
      <LogoMark className="size-16" />
      <LogoMark className="size-28" />
    </div>
  ),
};
