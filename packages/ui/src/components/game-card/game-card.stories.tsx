import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../badge/badge';
import { GameCover } from '../game-cover/game-cover';
import { GameCard } from './game-card';

const meta = {
  title: 'Components/GameCard',
  component: GameCard,
  parameters: { layout: 'padded' },
  args: {
    variant: 'standard',
    title: 'Snake Rush',
    tagline: 'Yılanı büyüt, duvara çarpma, hız kesme.',
    description:
      'Klasik yılan, daha hızlı ve daha sinirli. Her beş elmada tempo artar, kısa süreliğine beliren bonuslar sıralamada fark yaratır.',
    accent: 'mint',
    status: 'live',
    cover: <GameCover slug="snake-rush" accent="mint" />,
    href: '#snake-rush',
    playHref: '#play',
    playLabel: 'Oyna',
    statusLabel: 'Oynanabilir',
    badges: (
      <>
        <Badge tone="mint">Tek kişilik</Badge>
        <Badge>2D</Badge>
      </>
    ),
    meta: '12.480 oynama',
  },
  argTypes: {
    variant: { control: 'select', options: ['featured', 'standard', 'compact'] },
  },
} satisfies Meta<typeof GameCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  render: (args) => (
    <div className="w-80">
      <GameCard {...args} />
    </div>
  ),
};

export const Featured: Story = {
  args: { variant: 'featured', eyebrow: 'Haftanın oyunu', playLabel: 'Hemen oyna' },
  render: (args) => (
    <div className="w-[56rem] max-w-full">
      <GameCard {...args} />
    </div>
  ),
};

export const Compact: Story = {
  args: { variant: 'compact', badges: undefined },
};

export const ComingSoon: Story = {
  args: {
    title: 'Connect Four',
    tagline: 'Dört diski hizala, rakibini kilitle.',
    accent: 'coral',
    status: 'coming-soon',
    statusLabel: 'Yakında',
    cover: <GameCover slug="connect-four" accent="coral" muted />,
    playHref: undefined,
    meta: '24 Kasım 2026',
    badges: (
      <>
        <Badge tone="coral">1v1</Badge>
        <Badge>2D</Badge>
      </>
    ),
  },
  render: (args) => (
    <div className="w-80">
      <GameCard {...args} />
    </div>
  ),
};

export const Grid: Story = {
  render: (args) => (
    <div className="grid w-[64rem] max-w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <GameCard {...args} className="sm:col-span-2" />
      <GameCard
        {...args}
        title="2048 Fusion"
        tagline="Karoları kaydır, eşleri birleştir."
        accent="yellow"
        cover={<GameCover slug="2048-fusion" accent="yellow" />}
        meta="9.310 oynama"
      />
      <GameCard
        {...args}
        title="Memory Flip"
        tagline="Kartları çevir, eşleri hatırla."
        accent="pink"
        cover={<GameCover slug="memory-flip" accent="pink" />}
        meta="7.604 oynama"
      />
      <GameCard
        {...args}
        title="Tuğla Tuğla"
        tagline="Parçaları yerleştir, satırları temizle."
        accent="cyan"
        status="coming-soon"
        statusLabel="Yakında"
        playHref={undefined}
        cover={<GameCover slug="tugla-tugla" accent="cyan" muted />}
        meta="10 Kasım 2026"
      />
    </div>
  ),
};
