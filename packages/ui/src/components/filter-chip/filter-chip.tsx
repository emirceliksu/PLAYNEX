'use client';

import { ToggleGroup } from 'radix-ui';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export function FilterGroup({
  className,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroup.Root>) {
  return <ToggleGroup.Root className={cn('flex flex-wrap gap-2', className)} {...props} />;
}

export function FilterChip({
  className,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroup.Item>) {
  return (
    <ToggleGroup.Item
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-border-strong bg-surface-raised px-4',
        'font-display text-label-md whitespace-nowrap text-fg-secondary select-none',
        'transition-[background-color,border-color,color,transform] duration-(--pn-duration-fast) ease-out',
        'hover:border-fg-primary hover:text-fg-primary',
        'data-[state=on]:border-brand-solid data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-text',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&>svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
