'use client';

import { Tabs as RadixTabs } from 'radix-ui';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex h-11 items-center gap-1 rounded-lg border-2 border-border-subtle bg-surface-sunken p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex h-full items-center gap-2 rounded-md px-4 font-display text-label-md whitespace-nowrap text-fg-secondary',
        'transition-[background-color,color,box-shadow] duration-(--pn-duration-fast) ease-out',
        'hover:text-fg-primary',
        'data-[state=active]:bg-surface-raised data-[state=active]:text-fg-primary data-[state=active]:shadow-raised',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn('mt-4 outline-none data-[state=active]:animate-fade-in', className)}
      {...props}
    />
  );
}
