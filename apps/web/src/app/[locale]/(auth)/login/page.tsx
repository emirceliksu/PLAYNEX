import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuthFrame } from '@/features/auth/auth-frame';
import { LoginForm } from '@/features/auth/login-form';
import { redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reset?: string }>;
}

export async function generateMetadata({
  params,
}: Pick<LoginPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('login') };
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const account = await getCurrentAccount();
  if (account) {
    redirect({ href: `/profile/${account.username}`, locale });
  }
  const t = await getTranslations('auth.login');

  return (
    <AuthFrame title={t('title')} lead={t('lead')}>
      <LoginForm next={query.next} resetDone={query.reset === '1'} />
    </AuthFrame>
  );
}
