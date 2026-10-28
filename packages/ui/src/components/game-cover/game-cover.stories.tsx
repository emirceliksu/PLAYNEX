import type { AccentName } from '@playnex/shared-types';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { GameCover } from './game-cover';

const covers: { slug: string; accent: AccentName; title: string }[] = [
  { slug: 'snake-rush', accent: 'mint', title: 'Snake Rush' },
  { slug: 'memory-flip', accent: 'pink', title: 'Memory Flip' },
  { slug: '2048-fusion', accent: 'yellow', title: '2048 Fusion' },
  { slug: 'tugla-tugla', accent: 'cyan', title: 'Tuğla Tuğla' },
  { slug: 'connect-four', accent: 'coral', title: 'Connect Four' },
  { slug: 'air-hockey', accent: 'cyan', title: 'Air Hockey' },
  { slug: 'chess-arena', accent: 'brand', title: 'Chess Arena' },
  { slug: 'drawing-party', accent: 'pink', title: 'Drawing Party' },
  { slug: 'trivia-battle', accent: 'yellow', title: 'Trivia Battle' },
  { slug: 'neon-kart-racing', accent: 'brand', title: 'Neon Kart Racing' },
];

const meta = {
  title: 'Components/GameCover',
  component: GameCover,
  parameters: { layout: 'padded' },
  args: { slug: 'snake-rush', accent: 'mint', title: 'Snake Rush' },
  argTypes: {
    accent: { control: 'select', options: ['brand', 'cyan', 'yellow', 'pink', 'mint', 'coral'] },
  },
} satisfies Meta<typeof GameCover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: (args) => (
    <div className="w-80 overflow-hidden rounded-lg border-2 border-border-strong">
      <GameCover {...args} />
    </div>
  ),
};

export const Muted: Story = {
  args: { slug: 'connect-four', accent: 'coral', title: 'Connect Four', muted: true },
  render: (args) => (
    <div className="w-80 overflow-hidden rounded-lg border-2 border-border-subtle">
      <GameCover {...args} />
    </div>
  ),
};

export const Catalog: Story = {
  render: () => (
    <div className="grid w-[64rem] max-w-full grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {covers.map((cover) => (
        <figure key={cover.slug} className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-lg border-2 border-border-subtle">
            <GameCover slug={cover.slug} accent={cover.accent} title={cover.title} />
          </div>
          <figcaption className="font-display text-label-md text-fg-secondary">
            {cover.title}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};

// Hover or focus a tile to run its attract demo; reduced motion keeps every cover still.
export const AttractOnHover: Story = {
  render: () => (
    <div className="grid w-[64rem] max-w-full grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {covers.map((cover) => (
        <button
          key={cover.slug}
          type="button"
          className="group overflow-hidden rounded-lg border-2 border-border-subtle text-left"
        >
          <GameCover slug={cover.slug} accent={cover.accent} title={cover.title} />
        </button>
      ))}
    </div>
  ),
};

export const PlayOnArrival: Story = {
  args: { playOnArrival: true },
  render: (args) => (
    <div className="w-[32rem] max-w-full overflow-hidden rounded-lg border-2 border-border-strong">
      <GameCover {...args} />
    </div>
  ),
};
