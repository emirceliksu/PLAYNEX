import { Button, EmptyState, Logo } from '@playnex/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <main className="grain flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <Link href="/" aria-label="PLAYNEX">
        <Logo />
      </Link>
      <EmptyState
        title={t('title')}
        description={t('description')}
        className="w-full max-w-md bg-surface-raised"
        action={
          <Button asChild>
            <Link href="/">{t('action')}</Link>
          </Button>
        }
      />
    </main>
  );
}
