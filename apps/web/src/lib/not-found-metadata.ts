import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@/i18n/routing';

// generateMetadata runs before the page calls notFound(), so a page that is about to 404
// has to name the tab itself; otherwise it shows the bare site name or, for the admin
// panel, a title that gives away the route.
export async function notFoundMetadata(locale: string): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'errors.notFound' });
  return { title: t('title') };
}
