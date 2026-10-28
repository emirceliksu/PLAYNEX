import { Button, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { notFoundMetadata } from '@/lib/not-found-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata(await getLocale());
}

// Missing games, players and unknown paths keep the sidebar and search, so the visitor can
// carry on from here instead of starting over from the home page.
export default async function PlatformNotFound() {
  const t = await getTranslations();

  return (
    <EmptyState
      titleAs="h1"
      title={t('errors.notFound.title')}
      description={t('errors.notFound.description')}
      className="mx-auto mt-10 max-w-lg"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/games">{t('errors.notFound.browse')}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">{t('errors.notFound.action')}</Link>
          </Button>
        </div>
      }
    />
  );
}
