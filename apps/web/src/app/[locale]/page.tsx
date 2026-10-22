import { Button } from '@playnex/ui';
import { ArrowRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-center px-6 py-16 md:px-12">
      <p className="text-label-sm text-cyan-text uppercase">{t('eyebrow')}</p>
      <h1 className="mt-4 max-w-[14ch] font-display text-display-lg text-fg-primary md:text-display-2xl">
        {t('title')}
      </h1>
      <p className="mt-6 max-w-[48ch] text-body-lg text-fg-secondary">{t('intro')}</p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Button asChild size="lg">
          <Link href="/">
            {t('primaryCta')}
            <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Button>
        <Button variant="secondary" size="lg">
          {t('secondaryCta')}
        </Button>
      </div>
    </main>
  );
}
