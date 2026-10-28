import { cn } from '../../lib/cn';
import { DefaultLink } from '../../lib/default-link';
import type { LinkComponent } from '../../lib/link';
import type { NavItem } from '../sidebar/sidebar';

export interface MobileNavProps {
  label: string;
  // Four destinations (PLAN.md 4.6); more would shrink below the 44px touch target.
  items: NavItem[];
  linkComponent?: LinkComponent;
  className?: string;
}

export function MobileNav({ label, items, linkComponent, className }: MobileNavProps) {
  const Link = linkComponent ?? DefaultLink;

  return (
    <nav
      aria-label={label}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t-2 border-border-subtle bg-surface-raised pb-safe md:hidden',
        className,
      )}
    >
      <ul className="grid h-mobile-nav auto-cols-fr grid-flow-col">
        {items.map((item) => (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 font-display text-[0.6875rem] font-semibold tracking-wide',
                '[&>svg]:size-5',
                item.active ? 'text-brand-soft-text' : 'text-fg-muted',
              )}
            >
              {item.active ? (
                <span
                  aria-hidden
                  className="absolute top-0 h-1 w-8 rounded-b-full bg-brand-solid"
                />
              ) : null}
              {item.icon}
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
