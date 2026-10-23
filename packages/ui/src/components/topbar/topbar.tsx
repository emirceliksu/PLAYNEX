import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface TopbarProps {
  // Shown on viewports without the sidebar; the sidebar carries the brand otherwise.
  brand?: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Topbar({ brand, search, actions, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-topbar items-center gap-3 border-b-2 border-border-subtle bg-surface-canvas px-4 md:gap-6 md:px-6',
        className,
      )}
    >
      {brand ? <div className="shrink-0 md:hidden">{brand}</div> : null}
      <div className="min-w-0 flex-1 md:max-w-xl">{search}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1 md:gap-2">{actions}</div> : null}
    </header>
  );
}
