import { Badge, EmptyState } from '@playnex/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminHeader } from '@/features/admin/admin-header';
import { adminMetadata, requireAdmin } from '@/features/admin/admin-session';
import { ReportActions } from '@/features/siper/report-actions';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { callApi } from '@/lib/auth/api';
import { formatRelative } from '@/lib/format';

interface AdminReportsPageProps {
  params: Promise<{ locale: string }>;
}

interface PlayerReport {
  id: string;
  reporter: string | null;
  target: string;
  reason: string;
  note: string;
  status: string;
  createdAt: string;
  targetReports: number;
}

export async function generateMetadata({ params }: AdminReportsPageProps): Promise<Metadata> {
  const { locale } = await params;
  return adminMetadata(locale, 'adminReports');
}

export default async function AdminReportsPage({ params }: AdminReportsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { token } = await requireAdmin();
  const [t, result] = await Promise.all([
    getTranslations('admin.reports'),
    callApi<PlayerReport[]>('/v1/admin/reports', { token }),
  ]);
  if (!result.ok) {
    throw new Error(`admin reports failed: ${result.body.error}`);
  }
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader section="reports" title={t('title')} lead={t('lead')} />
      {result.data.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.description')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.data.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 md:flex-row md:items-start"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/profile/${report.target}`}
                    className="font-display text-title-sm hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                  >
                    @{report.target}
                  </Link>
                  <Badge tone="coral">{t(`reasons.${report.reason}` as 'reasons.other')}</Badge>
                  {report.targetReports > 1 ? (
                    <Badge tone="yellow">{t('repeat', { n: report.targetReports })}</Badge>
                  ) : null}
                </p>
                {report.note ? (
                  <p className="text-body-sm break-words text-fg-secondary">{report.note}</p>
                ) : null}
                <p className="text-label-sm text-fg-muted">
                  {t('by', {
                    name: report.reporter ?? t('deleted'),
                    when: formatRelative(report.createdAt, locale, now),
                  })}
                </p>
              </div>
              <ReportActions id={report.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
