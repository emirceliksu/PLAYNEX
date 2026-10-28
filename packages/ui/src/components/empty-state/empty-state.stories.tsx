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

export const Scenes: Story = {
  render: () => (
    <div className="grid w-[56rem] max-w-full gap-4 md:grid-cols-2">
      <EmptyState scene="no-match" title="Bu filtrelere uyan oyun yok" />
      <EmptyState scene="off-board" title="Burada bir şey yok" />
      <EmptyState scene="podium" title="Sıralama henüz boş" />
      <EmptyState scene="locked" title="Bu sayfa yöneticilere açık" />
    </div>
  ),
};
