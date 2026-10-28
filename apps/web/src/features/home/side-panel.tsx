import type { Account } from '@playnex/shared-types';
import { Avatar, Badge, Button } from '@playnex/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';

export async function SidePanel({ account }: { account: Account | null }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  if (!account) {
    return (
      <aside className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
        <section className="grain flex flex-col gap-4 rounded-xl border-2 border-border-subtle bg-brand-soft p-5">
          <Badge tone="yellow" sticker size="sm" className="self-start">
            {t('auth.brand.eyebrow')}
          </Badge>
          <h2 className="font-display text-title-lg">{t('home.account.guestTitle')}</h2>
          <p className="text-body-sm text-fg-secondary">{t('home.account.guestBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/register">{t('common.signUp')}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/login">{t('common.signIn')}</Link>
            </Button>
          </div>
        </section>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
      <section className="flex flex-col gap-4 rounded-xl border-2 border-border-subtle bg-surface-raised p-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={`${account.firstName} ${account.lastName}`}
            seed={account.username}
            size="md"
          />
          <div className="min-w-0">
            <h2 className="truncate font-display text-title-sm">
              {t('home.account.greeting', { name: account.firstName })}
            </h2>
            <p className="truncate text-label-sm text-fg-muted">@{account.username}</p>
          </div>
        </div>
        <p className="text-body-sm text-fg-secondary">
          {t('home.account.memberSince', { date: formatDate(account.createdAt, locale) })}
        </p>
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={`/profile/${account.username}`}>{t('home.account.viewProfile')}</Link>
        </Button>
      </section>
    </aside>
  );
}
