import { Search } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export interface SearchInputProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: string;
  shortcutHint?: string;
}

export function SearchInput({ label, shortcutHint, className, ...props }: SearchInputProps) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-muted"
      />
      <input
        type="search"
        className={cn(
          'h-11 w-full rounded-lg border-2 border-border-subtle bg-surface-sunken pr-4 pl-10 text-body-sm text-fg-primary',
          'placeholder:text-fg-muted',
          'transition-[border-color] duration-(--pn-duration-fast) ease-out',
          'hover:border-border-strong focus-visible:border-border-focus focus-visible:outline-none',
          shortcutHint && 'pr-12',
        )}
        {...props}
      />
      {shortcutHint ? (
        <kbd
          aria-hidden
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-xs border border-border-strong px-1.5 font-display text-label-sm text-fg-muted"
        >
          {shortcutHint}
        </kbd>
      ) : null}
    </label>
  );
}
