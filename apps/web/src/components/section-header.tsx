import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';

interface SectionHeaderProps {
  title: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
  actions?: ReactNode;
  // Visual scale varies per section so the page keeps a rhythm instead of a template grid.
  size?: 'md' | 'lg';
}

export function SectionHeader({
  title,
  hint,
  href,
  linkLabel,
  actions,
  size = 'md',
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h2
          className={size === 'lg' ? 'font-display text-display-sm' : 'font-display text-title-lg'}
        >
          {title}
        </h2>
        {hint ? <p className="mt-1 text-body-sm text-fg-muted">{hint}</p> : null}
      </div>
      {actions}
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-sm font-display text-label-md text-fg-secondary hover:text-fg-primary"
        >
          {linkLabel}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
