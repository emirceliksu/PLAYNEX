import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export function Skeleton({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-overlay', className)}
      {...props}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

// Line widths vary so the placeholder reads as a paragraph, not a bar chart.
const lineWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3'];

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3.5', lineWidths[index % lineWidths.length])} />
      ))}
    </div>
  );
}

export function SkeletonCover({ className }: { className?: string }) {
  return <Skeleton className={cn('aspect-[16/10] w-full rounded-lg', className)} />;
}

export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn('size-10 rounded-full', className)} />;
}

export function SkeletonGameCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3', className)}>
      <SkeletonCover />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3.5 w-1/2" />
    </div>
  );
}

export function SkeletonListRow({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-3 py-2', className)}>
      <Skeleton className="h-5 w-6" />
      <SkeletonAvatar className="size-8" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}
