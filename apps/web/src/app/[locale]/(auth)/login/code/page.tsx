import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuthFrame } from '@/features/auth/auth-frame';
import { LoginCodeForm } from '@/features/auth/login-code-form';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { loginChallenge } from '@/lib/auth/session';

// Matches the API's resend cooldown; the code was sent right before this screen opened.
const RESEND_AFTER_SECONDS = 60;

interface LoginCodePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LoginCodePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('loginCode') };
}

export default async function LoginCodePage({ params }: LoginCodePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const pending = await loginChallenge();
  if (!pending) {
    return redirect({ href: '/login', locale });
  }
  const t = await getTranslations('auth');

  return (
    <AuthFrame
      step={t('steps.loginCode')}
      title={t('loginCode.title')}
      lead={t.rich('loginCode.lead', {
        email: pending.email,
        b: (chunks) => <strong className="font-semibold text-fg-primary">{chunks}</strong>,
      })}
    >
      <LoginCodeForm resendAfter={RESEND_AFTER_SECONDS} />
      <p className="text-body-sm text-fg-secondary">
        {t('loginCode.otherAccount')}{' '}
        <Link
          href="/login"
          className="py-3 font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('loginCode.restart')}
        </Link>
      </p>
    </AuthFrame>
  );
}
