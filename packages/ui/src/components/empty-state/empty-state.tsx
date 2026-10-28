import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

import { type EmptyScene, EmptySceneIllustration } from './empty-scenes';

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

export interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  title: string;
  // Pages that are nothing but this state (404, no access) need it to be their h1.
  titleAs?: 'p' | 'h1' | 'h2';
  description?: string;
  // A built-in scene drawn from a game motif; `illustration` overrides it with custom art.
  scene?: EmptyScene;
  illustration?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  titleAs: Title = 'p',
  description,
  scene = 'shelf',
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
      <div className={iconTones[resolvedTone]}>
        {illustration ?? <EmptySceneIllustration scene={scene} />}
      </div>
      <div className="flex max-w-[36ch] flex-col gap-1">
        <Title className="font-display text-title-md text-fg-primary">{title}</Title>
        {description ? <p className="text-body-sm text-fg-secondary">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
