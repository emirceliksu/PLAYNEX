import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuthFrame } from '@/features/auth/auth-frame';
import { RegisterForm } from '@/features/auth/register-form';
import { redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';

interface RegisterPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('register') };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const account = await getCurrentAccount();
  if (account) {
    redirect({ href: `/profile/${account.username}`, locale });
  }
  const t = await getTranslations('auth');

  return (
    <AuthFrame step={t('steps.register')} title={t('register.title')} lead={t('register.lead')}>
      <RegisterForm />
    </AuthFrame>
  );
}
