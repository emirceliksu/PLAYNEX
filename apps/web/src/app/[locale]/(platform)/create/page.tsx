import { templates } from '@playnex/creator-templates';
import { Badge, Button } from '@playnex/ui';
import { Pencil, Play } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { DeleteProjectButton } from '@/features/creator/delete-project-button';
import { loadMyProjects } from '@/features/creator/load';
import { NewProjectForm, type TemplateChoice } from '@/features/creator/new-project-form';
import { Link, redirect } from '@/i18n/navigation';
import { resolveLocale, routing } from '@/i18n/routing';
import { getCurrentAccount, sessionToken } from '@/lib/auth/session';
import { coverBackground, documentCover, sceneShapes } from '@/lib/creator/cover';
import { formatDate } from '@/lib/format';

interface WorkshopPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: WorkshopPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t('workshop') };
}

export default async function WorkshopPage({ params }: WorkshopPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [account, token] = await Promise.all([getCurrentAccount(), sessionToken()]);
  if (!account || !token) {
    return redirect({ href: `/login?next=${encodeURIComponent('/create')}`, locale });
  }
  const [t, projects] = await Promise.all([
    getTranslations('creator.workshop'),
    loadMyProjects(token),
  ]);

  const choices: TemplateChoice[] = templates.map((template) => {
    const cover = documentCover(template.document);
    return {
      id: template.id,
      dimension: template.dimension,
      title: t(`templates.${template.id}.title`),
      description: t(`templates.${template.id}.description`),
      cover: {
        width: cover.width,
        height: cover.height,
        background: coverBackground(cover),
        shapes: sceneShapes(cover),
      },
    };
  });

  return (
    <div className="flex flex-col gap-14">
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-label-sm text-yellow-text uppercase">{t('eyebrow')}</p>
        <h1 className="font-display text-display-lg">{t('title')}</h1>
        <p className="text-body-lg text-fg-secondary">{t('subtitle')}</p>
      </header>

      {projects.length > 0 ? (
        <section className="flex flex-col gap-5">
          <SectionHeader title={t('mine')} hint={t('mineHint', { n: projects.length })} />
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised px-4 py-3"
              >
                <Badge tone={project.dimension === '2d' ? 'cyan' : 'pink'}>
                  {project.dimension.toUpperCase()}
                </Badge>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/create/${project.id}`}
                    className="truncate font-display text-title-sm hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                  >
                    {project.title}
                  </Link>
                  <span className="text-body-sm text-fg-muted">
                    {project.currentReleaseId
                      ? t('publishedMeta', { plays: project.plays, likes: project.likes })
                      : t('draft')}
                    {' · '}
                    {t('updated', { date: formatDate(project.updatedAt, locale) })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.currentReleaseId ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/community/${project.currentReleaseId}`}>
                        <Play aria-hidden className="size-4" />
                        {t('open')}
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/create/${project.id}`}>
                      <Pencil aria-hidden className="size-4" />
                      {t('edit')}
                    </Link>
                  </Button>
                  <DeleteProjectButton id={project.id} title={project.title} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-5">
        <SectionHeader title={t('new')} size="lg" />
        <NewProjectForm templates={choices} />
      </section>

      <aside className="grid gap-6 rounded-2xl border-2 border-border-subtle bg-surface-raised p-6 md:grid-cols-3">
        {(['shapes', 'blocks', 'publish'] as const).map((step, index) => (
          <div key={step} className="flex flex-col gap-2">
            <span className="font-display text-score-md text-brand-soft-text tabular-nums">
              {index + 1}
            </span>
            <h2 className="font-display text-title-md">{t(`steps.${step}.title`)}</h2>
            <p className="text-body-sm text-fg-secondary">{t(`steps.${step}.body`)}</p>
          </div>
        ))}
      </aside>
      <p className="max-w-3xl text-body-sm text-fg-muted">{t('safety')}</p>
    </div>
  );
}
