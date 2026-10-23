import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trophy } from 'lucide-react';

import { Badge } from './badge';

const tones = ['neutral', 'brand', 'cyan', 'yellow', 'pink', 'mint', 'coral'] as const;

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Tek kişilik', tone: 'brand', size: 'md', sticker: false },
  argTypes: {
    tone: { control: 'select', options: tones },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Soft: Story = {};

export const Sticker: Story = {
  args: { sticker: true, tone: 'yellow', children: 'Yakında' },
};

export const WithIcon: Story = {
  args: {
    tone: 'yellow',
    children: (
      <>
        <Trophy aria-hidden />
        Rekor
      </>
    ),
  },
};

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {tones.map((tone) => (
          <Badge key={tone} tone={tone} sticker>
            {tone}
          </Badge>
        ))}
      </div>
    </div>
  ),
};
