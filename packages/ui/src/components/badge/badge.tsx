import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-sm font-display text-label-sm whitespace-nowrap uppercase [&>svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-overlay text-fg-secondary',
        brand: 'bg-brand-soft text-brand-soft-text',
        cyan: 'bg-cyan-soft text-cyan-text',
        yellow: 'bg-yellow-soft text-yellow-text',
        pink: 'bg-pink-soft text-pink-text',
        mint: 'bg-mint-soft text-mint-text',
        coral: 'bg-coral-soft text-coral-text',
      },
      size: {
        sm: 'h-5 px-1.5',
        md: 'h-6 px-2',
      },
      // Sticker: solid fill, ink outline, hard shadow and a slight tilt.
      sticker: {
        true: '-rotate-2 border-2 border-(--pn-shadow-ink) shadow-sticker',
        false: '',
      },
    },
    compoundVariants: [
      { sticker: true, tone: 'neutral', class: 'bg-surface-inverse text-fg-inverse' },
      { sticker: true, tone: 'brand', class: 'bg-brand-solid text-fg-on-brand' },
      { sticker: true, tone: 'cyan', class: 'bg-cyan-solid text-ink-950' },
      { sticker: true, tone: 'yellow', class: 'bg-yellow-solid text-ink-950' },
      { sticker: true, tone: 'pink', class: 'bg-pink-solid text-ink-950' },
      { sticker: true, tone: 'mint', class: 'bg-mint-solid text-ink-950' },
      { sticker: true, tone: 'coral', class: 'bg-coral-solid text-ink-950' },
    ],
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
      sticker: false,
    },
  },
);

export interface BadgeProps
  extends ComponentPropsWithRef<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, sticker, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size, sticker }), className)} {...props} />;
}
