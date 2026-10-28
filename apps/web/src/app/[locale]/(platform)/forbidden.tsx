import { Button, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getCurrentAccount } from '@/lib/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors.forbidden');
  return { title: t('title'), robots: { index: false } };
}

export default async function PlatformForbidden() {
  const [t, tCommon, account] = await Promise.all([
    getTranslations('errors.forbidden'),
    getTranslations('common'),
    getCurrentAccount(),
  ]);

  return (
    <EmptyState
      titleAs="h1"
      title={t('title')}
      description={account ? t('description') : t('guestDescription')}
      className="mx-auto mt-10 max-w-lg"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {account ? null : (
            <Button asChild>
              <Link href="/login?next=/admin">{tCommon('signIn')}</Link>
            </Button>
          )}
          <Button asChild variant={account ? 'primary' : 'ghost'}>
            <Link href="/">{t('action')}</Link>
          </Button>
        </div>
      }
    />
  );
}
