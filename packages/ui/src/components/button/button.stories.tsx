import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Play } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Hemen oyna',
    variant: 'primary',
    size: 'md',
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Detayları gör' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Vazgeç' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Oyundan çık' },
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Play aria-hidden className="size-[1.1em]" />
        Hemen oyna
      </>
    ),
  },
};

export const Loading: Story = {
  args: { isLoading: true, loadingLabel: 'Yükleniyor', children: 'Oyun başlatılıyor' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Yakında' },
};

export const AsLink: Story = {
  args: {
    asChild: true,
    variant: 'secondary',
    children: (
      <a href="#oyunlar">
        Tüm oyunlar
        <ArrowRight aria-hidden className="size-[1.1em]" />
      </a>
    ),
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-end gap-4">
      <Button {...args} size="sm">
        Küçük
      </Button>
      <Button {...args} size="md">
        Orta
      </Button>
      <Button {...args} size="lg">
        Büyük
      </Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button {...args} variant="primary">
        Hemen oyna
      </Button>
      <Button {...args} variant="secondary">
        Detayları gör
      </Button>
      <Button {...args} variant="ghost">
        Vazgeç
      </Button>
      <Button {...args} variant="danger">
        Oyundan çık
      </Button>
    </div>
  ),
};
