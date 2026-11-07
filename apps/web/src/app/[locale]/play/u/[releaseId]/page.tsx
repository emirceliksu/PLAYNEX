import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CreatorPlayer } from '@/features/creator/creator-player';
import { loadRelease } from '@/features/creator/load';
import { playerLabels } from '@/features/game-player/labels';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount } from '@/lib/auth/session';
import { notFoundMetadata } from '@/lib/not-found-metadata';

interface CreatorPlayPageProps {
  params: Promise<{ locale: string; releaseId: string }>;
}

export async function generateMetadata({ params }: CreatorPlayPageProps): Promise<Metadata> {
  const { locale, releaseId } = await params;
  const release = await loadRelease(releaseId);
  if (!release) return notFoundMetadata(locale);
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('play', { title: release.title }) };
}

export default async function CreatorPlayPage({ params }: CreatorPlayPageProps) {
  const { locale, releaseId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const release = await loadRelease(releaseId);
  if (!release) notFound();
  const [t, account, labels] = await Promise.all([
    getTranslations('creator.game'),
    getCurrentAccount(),
    playerLabels(),
  ]);

  return (
    <CreatorPlayer
      release={{ id: release.id, title: release.title, document: release.document }}
      controlsGuide={[t('controlsMove'), t('controlsJump'), t('controlsAction')]}
      labels={{ ...labels, backToGame: t('back'), backToCatalog: t('backToCommunity') }}
      locale={locale}
      viewer={account?.username ?? null}
    />
  );
}
