import { Badge, cn, EmptyState } from '@playnex/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { callApi } from '@/lib/auth/api';

import type { SiperBoardEntry } from './types';

const orders = ['rating', 'level', 'kills'] as const;
export type SiperOrder = (typeof orders)[number];

export function siperOrder(value: string | undefined): SiperOrder {
  return orders.find((order) => order === value) ?? 'rating';
}

export async function SiperBoard({
  by,
  locale,
  currentUsername,
}: {
  by: SiperOrder;
  locale: string;
  currentUsername?: string;
}) {
  const t = await getTranslations('siper.board');
  const result = await callApi<{ by: string; entries: SiperBoardEntry[] }>(
    `/v1/leaderboards/siper?by=${by}`,
  );
  const entries = result.ok ? result.data.entries : [];
  const number = new Intl.NumberFormat(locale);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="siper-board">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="siper-board" className="font-display text-title-lg">
            {t('title')}
          </h2>
          <p className="text-body-sm text-fg-secondary">{t('subtitle')}</p>
        </div>
        <nav aria-label={t('orderLabel')} className="flex gap-2">
          {orders.map((order) => (
            <Link
              key={order}
              href={`/leaderboard?siper=${order}`}
              aria-current={order === by ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center rounded-full border-2 px-4 font-display text-label-md',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                order === by
                  ? 'border-coral-solid bg-coral-soft text-coral-text'
                  : 'border-border-strong bg-surface-raised text-fg-secondary hover:text-fg-primary',
              )}
            >
              {t(`order.${order}`)}
            </Link>
          ))}
        </nav>
      </div>
      {entries.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.description')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-border-subtle bg-surface-raised">
          <table className="w-full min-w-[520px] text-body-sm tabular-nums">
            <thead>
              <tr className="text-left text-label-sm text-fg-muted">
                <th className="w-12 px-3 py-2">#</th>
                <th className="py-2">{t('player')}</th>
                <th className="text-right">{t('level')}</th>
                <th className="text-right">{t('rank')}</th>
                <th className="text-right">{t('kills')}</th>
                <th className="px-3 text-right">K/D</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.username}
                  className={cn(
                    'border-t border-border-subtle',
                    entry.username === currentUsername && 'bg-yellow-soft',
                  )}
                >
                  <td className="px-3 py-2 font-display">{entry.place}</td>
                  <td className="py-2">
                    <Link
                      href={`/profile/${entry.username}`}
                      className="font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                    >
                      {entry.username}
                    </Link>
                  </td>
                  <td className="text-right">{entry.level}</td>
                  <td className="text-right">
                    <Badge>
                      {t(`ranks.${entry.rank}`)} · {number.format(entry.rating)}
                    </Badge>
                  </td>
                  <td className="text-right">{number.format(entry.kills)}</td>
                  <td className="px-3 text-right">{entry.kd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
