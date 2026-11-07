import { cn } from '@playnex/ui';

import { Link } from '@/i18n/navigation';

// Filters as plain links: the community page is server rendered and every
// filter state has its own shareable URL.
export function ChipLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 items-center rounded-full border-2 px-4 font-display text-label-md whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
            item.active
              ? 'border-brand-solid bg-brand-soft text-brand-soft-text'
              : 'border-border-strong bg-surface-raised text-fg-secondary hover:border-fg-primary hover:text-fg-primary',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
