import { cn } from '@playnex/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

interface AdminHeaderProps {
  section: 'overview' | 'users';
  title: string;
  lead: string;
}

const sections = [
  { key: 'overview', href: '/admin' },
  { key: 'users', href: '/admin/users' },
] as const;

export async function AdminHeader({ section, title, lead }: AdminHeaderProps) {
  const t = await getTranslations('admin');

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-label-sm text-yellow-text uppercase">{t('eyebrow')}</p>
        <h1 className="font-display text-display-md">{title}</h1>
        <p className="max-w-prose text-body-md text-fg-secondary">{lead}</p>
      </div>
      <nav aria-label={t('tabs.label')} className="flex gap-2">
        {sections.map((item) => {
          const current = item.key === section;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center rounded-full border-2 px-4 font-display text-label-md',
                'transition-[background-color,border-color,color] duration-(--pn-duration-fast) ease-out',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                current
                  ? 'border-brand-solid bg-brand-soft text-brand-soft-text'
                  : 'border-border-strong bg-surface-raised text-fg-secondary hover:border-fg-primary hover:text-fg-primary',
              )}
            >
              {t(`tabs.${item.key}`)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
