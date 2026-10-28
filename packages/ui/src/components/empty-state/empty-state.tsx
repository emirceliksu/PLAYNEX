import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

const emptyStateVariants = cva(
  'flex flex-col items-center gap-4 rounded-xl border-2 px-6 py-10 text-center',
  {
    variants: {
      tone: {
        neutral: 'border-dashed border-border-strong bg-surface-raised/40',
        error: 'border-coral-solid/40 bg-coral-soft',
        offline: 'border-yellow-solid/40 bg-yellow-soft',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const iconTones = {
  neutral: 'text-fg-muted',
  error: 'text-coral-text',
  offline: 'text-yellow-text',
} as const;

// Default illustration: an empty arcade shelf drawn with the ink outline language.
function ShelfIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className={cn('h-16 w-24', className)}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="8" y="10" width="80" height="44" rx="6" />
        <path d="M8 32h80" />
        <path d="M24 10v22M72 10v22" strokeDasharray="3 4" />
        <circle cx="48" cy="21" r="4" />
        <path d="M30 46h12M54 46h12" />
      </g>
    </svg>
  );
}

export interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  title: string;
  // Pages that are nothing but this state (404, no access) need it to be their h1.
  titleAs?: 'p' | 'h1' | 'h2';
  description?: string;
  illustration?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  titleAs: Title = 'p',
  description,
  illustration,
  action,
  tone,
  className,
}: EmptyStateProps) {
  const resolvedTone = tone ?? 'neutral';

  return (
    <div
      role={resolvedTone === 'error' ? 'alert' : undefined}
      className={cn(emptyStateVariants({ tone }), className)}
    >
      <div className={iconTones[resolvedTone]}>{illustration ?? <ShelfIllustration />}</div>
      <div className="flex max-w-[36ch] flex-col gap-1">
        <Title className="font-display text-title-md text-fg-primary">{title}</Title>
        {description ? <p className="text-body-sm text-fg-secondary">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
