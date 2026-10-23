import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Windows: Story = {
  render: () => (
    <Tabs defaultValue="weekly" className="w-[28rem] max-w-full">
      <TabsList aria-label="Zaman aralığı">
        <TabsTrigger value="daily">Bugün</TabsTrigger>
        <TabsTrigger value="weekly">Bu hafta</TabsTrigger>
        <TabsTrigger value="all-time">Tüm zamanlar</TabsTrigger>
        <TabsTrigger value="season" disabled>
          Sezon
        </TabsTrigger>
      </TabsList>
      <TabsContent value="daily" className="text-body-sm text-fg-secondary">
        Bugün doğrulanan 128 skor.
      </TabsContent>
      <TabsContent value="weekly" className="text-body-sm text-fg-secondary">
        Bu hafta doğrulanan 1.204 skor.
      </TabsContent>
      <TabsContent value="all-time" className="text-body-sm text-fg-secondary">
        Toplam 41.870 doğrulanmış skor.
      </TabsContent>
    </Tabs>
  ),
};
