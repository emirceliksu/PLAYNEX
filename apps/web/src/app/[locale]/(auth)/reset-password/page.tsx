import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuthFrame } from '@/features/auth/auth-frame';
import { ResetForm } from '@/features/auth/reset-form';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { resetEmail } from '@/lib/auth/session';

// Matches the API's resend cooldown; the code was requested right before this screen opened.
const RESEND_AFTER_SECONDS = 60;

interface ResetPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ResetPasswordPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('resetPassword') };
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const email = await resetEmail();
  if (!email) {
    return redirect({ href: '/forgot-password', locale });
  }
  const t = await getTranslations('auth');

  return (
    <AuthFrame
      step={t('steps.reset')}
      title={t('reset.title')}
      lead={t.rich('reset.lead', {
        email,
        b: (chunks) => <strong className="font-semibold text-fg-primary">{chunks}</strong>,
      })}
    >
      <ResetForm resendAfter={RESEND_AFTER_SECONDS} />
      <p className="text-body-sm text-fg-secondary">
        {t('reset.wrongEmail')}{' '}
        <Link
          href="/forgot-password"
          className="font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('reset.restart')}
        </Link>
      </p>
    </AuthFrame>
  );
}
