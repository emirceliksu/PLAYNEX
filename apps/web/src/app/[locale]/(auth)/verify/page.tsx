import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuthFrame } from '@/features/auth/auth-frame';
import { VerifyForm } from '@/features/auth/verify-form';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { pendingEmail } from '@/lib/auth/session';

// Matches the API's resend cooldown; the code was sent right before this screen opened.
const RESEND_AFTER_SECONDS = 60;

interface VerifyPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mail?: string }>;
}

export async function generateMetadata({
  params,
}: Pick<VerifyPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('verify') };
}

export default async function VerifyPage({ params, searchParams }: VerifyPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const email = await pendingEmail();
  if (!email) {
    return redirect({ href: '/register', locale });
  }
  const t = await getTranslations('auth');

  return (
    <AuthFrame
      step={t('steps.verify')}
      title={t('verify.title')}
      lead={t.rich('verify.lead', {
        email,
        b: (chunks) => <strong className="font-semibold text-fg-primary">{chunks}</strong>,
      })}
    >
      <VerifyForm mailFailed={query.mail === 'failed'} resendAfter={RESEND_AFTER_SECONDS} />
      <p className="text-body-sm text-fg-secondary">
        {t('verify.wrongEmail')}{' '}
        <Link
          href="/register"
          className="py-3 font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('verify.restart')}
        </Link>
      </p>
    </AuthFrame>
  );
}
