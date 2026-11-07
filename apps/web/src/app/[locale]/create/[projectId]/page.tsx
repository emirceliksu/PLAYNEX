import { Button, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CreatorEditor } from '@/features/creator/editor/creator-editor';
import { loadProject } from '@/features/creator/load';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount, sessionToken } from '@/lib/auth/session';

interface EditorPageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

export async function generateMetadata({ params }: EditorPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('editor'), robots: { index: false } };
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { locale, projectId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [account, token] = await Promise.all([getCurrentAccount(), sessionToken()]);
  if (!account || !token) {
    return redirect({ href: `/login?next=${encodeURIComponent(`/create/${projectId}`)}`, locale });
  }
  const project = await loadProject(projectId, token);
  if (!project) notFound();
  const t = await getTranslations('creator.editor.desktopOnly');

  return (
    <>
      <main className="flex min-h-dvh items-center justify-center p-6 lg:hidden">
        <EmptyState
          scene="locked"
          titleAs="h1"
          title={t('title')}
          description={t('description')}
          action={
            <Button asChild>
              <Link href="/create">{t('back')}</Link>
            </Button>
          }
        />
      </main>
      <main className="hidden lg:block">
        <CreatorEditor project={project} locale={locale} />
      </main>
    </>
  );
}
