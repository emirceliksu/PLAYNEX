import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: {
    title: 'Bu filtrelere uyan oyun yok',
    description: 'Aramayı değiştir ya da filtreleri temizleyip tüm kataloğa dön.',
    action: <Button variant="secondary">Filtreleri temizle</Button>,
  },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'error', 'offline'] },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: (args) => (
    <div className="w-[32rem] max-w-full">
      <EmptyState {...args} />
    </div>
  ),
};

export const Error: Story = {
  args: {
    tone: 'error',
    title: 'Bir şeyler ters gitti',
    description: 'Sayfa yüklenirken hata oluştu. Tekrar denemek genellikle işe yarar.',
    action: <Button>Tekrar dene</Button>,
  },
  render: (args) => (
    <div className="w-[32rem] max-w-full">
      <EmptyState {...args} />
    </div>
  ),
};

export const Offline: Story = {
  args: {
    tone: 'offline',
    title: 'Bağlantı yok',
    description: 'Skorlar kaydedilemez; bağlantı gelince otomatik gönderilir.',
    action: undefined,
  },
  render: (args) => (
    <div className="w-[32rem] max-w-full">
      <EmptyState {...args} />
    </div>
  ),
};
