import type { AccentName, GameStatus } from '@playnex/shared-types';
import { Play } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { DefaultLink } from '../../lib/default-link';
import type { LinkComponent } from '../../lib/link';
import { Badge } from '../badge/badge';
import { Button } from '../button/button';

const accentSurfaces: Record<AccentName, string> = {
  brand: 'bg-brand-soft',
  cyan: 'bg-cyan-soft',
  yellow: 'bg-yellow-soft',
  pink: 'bg-pink-soft',
  mint: 'bg-mint-soft',
  coral: 'bg-coral-soft',
};

const accentText: Record<AccentName, string> = {
  brand: 'text-brand-soft-text',
  cyan: 'text-cyan-text',
  yellow: 'text-yellow-text',
  pink: 'text-pink-text',
  mint: 'text-mint-text',
  coral: 'text-coral-text',
};

export interface GameCardProps {
  variant?: 'featured' | 'standard' | 'compact';
  title: string;
  tagline?: string;
  description?: string;
  accent: AccentName;
  status: GameStatus;
  cover: ReactNode;
  // Detail page; the whole card is this link.
  href: string;
  // Direct play target; omitted for games that cannot be played yet.
  playHref?: string;
  playLabel: string;
  statusLabel?: string;
  eyebrow?: string;
  badges?: ReactNode;
  meta?: ReactNode;
  linkComponent?: LinkComponent;
  className?: string;
}

export function GameCard({
  variant = 'standard',
  title,
  tagline,
  description,
  accent,
  status,
  cover,
  href,
  playHref,
  playLabel,
  statusLabel,
  eyebrow,
  badges,
  meta,
  linkComponent,
  className,
}: GameCardProps) {
  const Link = linkComponent ?? DefaultLink;
  const playable = status === 'live' && Boolean(playHref);
  const muted = status === 'coming-soon';

  const coverFrame = (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border-2 border-border-subtle',
        'transition-[border-color,transform] duration-(--pn-duration-base) ease-out',
        'group-hover:border-border-strong motion-safe:group-hover:-translate-y-0.5',
        accentSurfaces[accent],
      )}
    >
      <div className="transition-transform duration-(--pn-duration-base) ease-out motion-safe:group-hover:scale-[1.02]">
        {cover}
      </div>
      {statusLabel && status !== 'live' ? (
        <Badge
          sticker
          tone={status === 'beta' ? 'cyan' : 'yellow'}
          className="absolute top-3 left-3"
        >
          {statusLabel}
        </Badge>
      ) : null}
    </div>
  );

  // The title link is stretched over the card; the play button sits above it in the stacking order.
  const titleLink = (
    <Link
      href={href}
      className="font-display text-fg-primary after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-border-focus"
    >
      {title}
    </Link>
  );

  const playButton = playable ? (
    <Button asChild size={variant === 'featured' ? 'lg' : 'sm'} className="relative z-10">
      <Link href={playHref ?? href}>
        <Play aria-hidden className="size-[1.1em]" />
        {playLabel}
      </Link>
    </Button>
  ) : null;

  if (variant === 'compact') {
    return (
      <article
        className={cn('group relative flex w-40 flex-col gap-2', muted && 'opacity-80', className)}
      >
        {coverFrame}
        <h3 className="truncate text-label-md">{titleLink}</h3>
        {meta ? <div className="text-label-sm text-fg-muted">{meta}</div> : null}
      </article>
    );
  }

  if (variant === 'featured') {
    return (
      <article
        className={cn(
          'group relative grid gap-6 rounded-2xl border-2 border-border-subtle bg-surface-raised p-4 md:grid-cols-[3fr_2fr] md:p-6',
          className,
        )}
      >
        {coverFrame}
        <div className="flex flex-col justify-center gap-4">
          {eyebrow ? (
            <p className={cn('text-label-sm uppercase', accentText[accent])}>{eyebrow}</p>
          ) : null}
          <div className="flex flex-col gap-2">
            <h2 className="text-display-md">{titleLink}</h2>
            {tagline ? <p className="text-title-sm text-fg-secondary">{tagline}</p> : null}
            {description ? (
              <p className="max-w-[48ch] text-body-sm text-fg-secondary">{description}</p>
            ) : null}
          </div>
          {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {playButton}
            {meta ? <div className="text-label-md text-fg-muted">{meta}</div> : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn('group relative flex flex-col gap-3', muted && 'opacity-80', className)}>
      {coverFrame}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-title-sm">{titleLink}</h3>
          {tagline ? <p className="truncate text-body-sm text-fg-secondary">{tagline}</p> : null}
          {badges || meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-label-sm text-fg-muted">
              {badges}
              {meta}
            </div>
          ) : null}
        </div>
        {playButton}
      </div>
    </article>
  );
}
