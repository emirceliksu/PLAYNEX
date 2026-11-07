import type { Meta, StoryObj } from '@storybook/react-vite';
import { creatorSwatches, oklchToHex } from '@playnex/design-tokens';

import { SceneCover, type SceneShape } from './scene-cover';

const swatch = (index: number) => oklchToHex(creatorSwatches[index] ?? creatorSwatches[0]!);

const box = (x: number, y: number, w: number, h: number, color: number): SceneShape => ({
  points: [
    [x - w / 2, y - h / 2],
    [x + w / 2, y - h / 2],
    [x + w / 2, y + h / 2],
    [x - w / 2, y + h / 2],
  ],
  fill: swatch(color),
});

const ring = (x: number, y: number, r: number, color: number): SceneShape => ({
  points: Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r] as [number, number];
  }),
  fill: swatch(color),
});

const platformer: SceneShape[] = [
  box(-20, -7.5, 20, 1, 14),
  box(3, -7.5, 18, 1, 14),
  box(-14, -4, 4, 0.6, 11),
  box(6, -4, 4, 0.6, 11),
  ring(-18, -6, 0.4, 10),
  ring(0, -6, 0.4, 10),
  box(-27, -6, 1, 1, 18),
  box(28, -5.5, 0.6, 3, 13),
];

const meta = {
  title: 'Components/SceneCover',
  component: SceneCover,
  parameters: { layout: 'padded' },
  args: {
    width: 60,
    height: 16,
    background: swatch(4),
    shapes: platformer,
    title: 'Platform Koşusu',
  },
} satisfies Meta<typeof SceneCover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Platformer: Story = {
  render: (args) => (
    <div className="w-80 overflow-hidden rounded-lg border-2 border-border-strong">
      <SceneCover {...args} />
    </div>
  ),
};

export const TopDownScene: Story = {
  args: {
    width: 30,
    height: 30,
    background: swatch(15),
    title: 'Top Toplama 3D',
    shapes: [
      box(0, 0, 24, 24, 13),
      box(6, 6, 6, 6, 12),
      ring(0, -6, 0.5, 18),
      ring(-8, -8, 0.35, 22),
    ],
  },
  render: Platformer.render,
};

export const Empty: Story = {
  args: { shapes: [], title: 'Boş sahne' },
  render: Platformer.render,
};
