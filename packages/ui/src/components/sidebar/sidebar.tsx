import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { DefaultLink } from '../../lib/default-link';
import type { LinkComponent } from '../../lib/link';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}

export interface SidebarProps {
  // Accessible name for the navigation landmark.
  label: string;
  items: NavItem[];
  brand: ReactNode;
  footer?: ReactNode;
  linkComponent?: LinkComponent;
  className?: string;
}

// Collapses to icons below the lg breakpoint purely with CSS, so there is no layout flash.
export function Sidebar({ label, items, brand, footer, linkComponent, className }: SidebarProps) {
  const Link = linkComponent ?? DefaultLink;

  return (
    <aside
      className={cn(
        'flex h-full w-sidebar-compact flex-col border-r-2 border-border-subtle bg-surface-raised lg:w-sidebar',
        className,
      )}
    >
      <div className="flex h-topbar items-center px-4 lg:px-5">{brand}</div>
      <nav aria-label={label} className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.label}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center justify-center gap-3 rounded-md px-3 font-display text-label-md lg:justify-start',
                  'transition-[background-color,color] duration-(--pn-duration-fast) ease-out',
                  '[&>svg]:size-5 [&>svg]:shrink-0',
                  item.active
                    ? 'bg-brand-soft text-brand-soft-text'
                    : 'text-fg-secondary hover:bg-surface-overlay hover:text-fg-primary',
                )}
              >
                {item.icon}
                <span className="max-lg:sr-only">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {footer ? <div className="border-t-2 border-border-subtle p-3">{footer}</div> : null}
    </aside>
  );
}
