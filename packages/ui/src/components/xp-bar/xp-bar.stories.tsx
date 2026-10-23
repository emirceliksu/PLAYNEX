import type { Meta, StoryObj } from '@storybook/react-vite';

import { XpBar } from './xp-bar';

const meta = {
  title: 'Components/XpBar',
  component: XpBar,
  parameters: { layout: 'padded' },
  args: {
    value: 1240,
    max: 2000,
    label: 'Seviye 15',
    valueLabel: '1.240 / 2.000 XP',
    tone: 'yellow',
    size: 'md',
  },
  argTypes: {
    tone: { control: 'select', options: ['yellow', 'brand', 'mint', 'cyan'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof XpBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Level: Story = {
  render: (args) => (
    <div className="w-80">
      <XpBar {...args} />
    </div>
  ),
};

export const Quest: Story = {
  args: { value: 2, max: 3, label: '2/3 tamamlandı', valueLabel: undefined, size: 'sm' },
  render: (args) => (
    <div className="w-64">
      <XpBar {...args} />
    </div>
  ),
};

export const Complete: Story = {
  args: {
    value: 2000,
    max: 2000,
    label: 'Seviye atlandı',
    valueLabel: '2.000 / 2.000 XP',
    tone: 'mint',
  },
  render: (args) => (
    <div className="w-80">
      <XpBar {...args} />
    </div>
  ),
};
