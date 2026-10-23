import { cva, type VariantProps } from 'class-variance-authority';
import { Avatar as RadixAvatar } from 'radix-ui';
import type { PresenceStatus } from '@playnex/shared-types';

import { cn } from '../../lib/cn';

const avatarVariants = cva(
  'relative inline-flex shrink-0 overflow-visible rounded-full align-middle select-none',
  {
    variants: {
      size: {
        xs: 'size-6 text-[0.625rem]',
        sm: 'size-8 text-label-sm',
        md: 'size-10 text-label-md',
        lg: 'size-14 text-title-sm',
        xl: 'size-24 text-display-sm',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// Fallback tint is derived from the seed so a player keeps the same color everywhere.
const fallbackTones = [
  'bg-brand-soft text-brand-soft-text',
  'bg-cyan-soft text-cyan-text',
  'bg-yellow-soft text-yellow-text',
  'bg-pink-soft text-pink-text',
  'bg-mint-soft text-mint-text',
  'bg-coral-soft text-coral-text',
] as const;

const statusTones: Record<PresenceStatus, string> = {
  online: 'bg-mint-solid',
  'in-game': 'bg-yellow-solid',
  offline: 'bg-ink-600',
};

function toneFromSeed(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return fallbackTones[hash % fallbackTones.length] ?? fallbackTones[0];
}

function initialsOf(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('');
}

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  seed?: string;
  src?: string;
  status?: PresenceStatus;
  // Accessible description of the status dot, e.g. "Çevrim içi".
  statusLabel?: string;
  className?: string;
}

export function Avatar({ name, seed, src, status, statusLabel, size, className }: AvatarProps) {
  return (
    <RadixAvatar.Root className={cn(avatarVariants({ size }), className)}>
      {src ? (
        <RadixAvatar.Image
          src={src}
          alt={name}
          className="size-full rounded-full border-2 border-border-strong object-cover"
        />
      ) : null}
      {/* No delay without an image: the fallback must render on the server too. */}
      <RadixAvatar.Fallback
        delayMs={src ? 400 : undefined}
        className={cn(
          'flex size-full items-center justify-center rounded-full border-2 border-border-strong font-display font-bold',
          toneFromSeed(seed ?? name),
        )}
      >
        {initialsOf(name)}
      </RadixAvatar.Fallback>
      {status ? (
        <span
          role="img"
          aria-label={statusLabel ?? status}
          className={cn(
            'absolute right-0 bottom-0 size-[28%] min-h-2.5 min-w-2.5 rounded-full border-2 border-surface-raised',
            statusTones[status],
          )}
        />
      ) : null}
    </RadixAvatar.Root>
  );
}
