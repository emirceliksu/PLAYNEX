import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCover,
  SkeletonGameCard,
  SkeletonListRow,
  SkeletonText,
} from './skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Text: Story = {
  render: () => (
    <div className="w-80">
      <SkeletonText lines={4} />
    </div>
  ),
};

export const Cover: Story = {
  render: () => (
    <div className="w-80">
      <SkeletonCover />
    </div>
  ),
};

export const GameCard: Story = {
  render: () => (
    <div className="grid w-[48rem] max-w-full grid-cols-3 gap-6">
      <SkeletonGameCard />
      <SkeletonGameCard />
      <SkeletonGameCard />
    </div>
  ),
};

export const ListRows: Story = {
  render: () => (
    <div className="w-[32rem] max-w-full rounded-xl border-2 border-border-subtle bg-surface-raised px-4">
      <SkeletonListRow />
      <SkeletonListRow />
      <SkeletonListRow />
      <SkeletonListRow />
    </div>
  ),
};

export const Avatar: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <SkeletonAvatar />
      <Skeleton className="h-4 w-32" />
    </div>
  ),
};
