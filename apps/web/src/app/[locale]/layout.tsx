import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { routing } from '@/i18n/routing';

import '@/styles/globals.css';

// Font files are shared with Storybook through the design-tokens package.
const displayFont = localFont({
  src: '../../../../../packages/design-tokens/fonts/SpaceGrotesk-Variable.woff2',
  weight: '300 700',
  variable: '--font-display-src',
  display: 'swap',
});

const bodyFont = localFont({
  src: [
    {
      path: '../../../../../packages/design-tokens/fonts/PlusJakartaSans-Variable.woff2',
      weight: '200 800',
      style: 'normal',
    },
    {
      path: '../../../../../packages/design-tokens/fonts/PlusJakartaSans-Italic-Variable.woff2',
      weight: '200 800',
      style: 'italic',
    },
  ],
  variable: '--font-body-src',
  display: 'swap',
});

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      data-theme="dark"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
