import { Badge, Button, EmptyState, XpBar } from '@playnex/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { SectionHeader } from '@/components/section-header';
import { Link } from '@/i18n/navigation';
import { callApi } from '@/lib/auth/api';
import { formatDate } from '@/lib/format';

import { CosmeticsForm } from './cosmetics-form';
import { ACHIEVEMENTS, type SiperMine, type SiperStats } from './types';

const rankTone = {
  bronze: 'coral',
  silver: 'neutral',
  gold: 'yellow',
  platinum: 'cyan',
  diamond: 'brand',
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-2">
      <dt className="text-label-sm text-fg-muted">{label}</dt>
      <dd className="font-display text-title-md tabular-nums">{value}</dd>
    </div>
  );
}

export async function SiperProfile({
  username,
  locale,
  token,
}: {
  username: string;
  locale: string;
  // Only on the owner's own profile: unlocks quests and the cosmetics form.
  token: string | null;
}) {
  const t = await getTranslations('siper.profile');
  const [stats, mine] = await Promise.all([
    callApi<SiperStats>(`/v1/players/${encodeURIComponent(username)}/siper`),
    token ? callApi<SiperMine>('/v1/me/siper', { token }) : Promise.resolve(null),
  ]);
  if (!stats.ok) return null;
  const s = stats.data;
  const number = new Intl.NumberFormat(locale);
  const unlocked = new Set(s.achievements.map((a) => a.achievement));

  return (
    <section className="flex flex-col gap-5" aria-labelledby="siper-profile">
      <SectionHeader title={t('title')} hint={t('hint')} />
      <h2 id="siper-profile" className="sr-only">
        {t('title')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-4 rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-display-sm">{t('level', { n: s.level.level })}</p>
            <Badge sticker tone={rankTone[s.rank]} className="text-label-md">
              {t(`rank.${s.rank}`)}
            </Badge>
          </div>
          <XpBar
            value={s.level.into}
            max={s.level.need}
            label={t('xpLabel')}
            valueLabel={`${number.format(s.level.into)} / ${number.format(s.level.need)} XP`}
          />
          <p className="text-body-sm text-fg-secondary">
            {t('rating', { n: number.format(s.rating) })}
          </p>
          {s.matches === 0 ? (
            <EmptyState
              title={t('empty.title')}
              description={t('empty.description')}
              action={
                <Button asChild variant="secondary">
                  <Link href="/play/siper">{t('empty.action')}</Link>
                </Button>
              }
            />
          ) : (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label={t('stat.matches')} value={number.format(s.matches)} />
              <Stat label={t('stat.wins')} value={number.format(s.wins)} />
              <Stat label={t('stat.kd')} value={s.kd.toFixed(2)} />
              <Stat label={t('stat.kills')} value={number.format(s.kills)} />
              <Stat label={t('stat.accuracy')} value={`%${s.accuracy}`} />
              <Stat label={t('stat.headshots')} value={`%${s.headshotRate}`} />
              <Stat label={t('stat.bestStreak')} value={number.format(s.bestStreak)} />
              <Stat label={t('stat.plants')} value={number.format(s.plants + s.defuses)} />
              <Stat
                label={t('stat.favorite')}
                value={s.favoriteWeapon ? t(`weapon.${s.favoriteWeapon}` as 'weapon.rifle') : '—'}
              />
            </dl>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {mine?.ok ? (
            <div className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
              <p className="mb-3 font-display text-title-md">{t('quests')}</p>
              <ul className="flex flex-col gap-3">
                {mine.data.quests.map((quest) => (
                  <li key={quest.key} className="flex items-center gap-3">
                    {quest.done ? (
                      <CheckCircle2
                        aria-label={t('questDone')}
                        className="size-5 shrink-0 text-mint-text"
                      />
                    ) : (
                      <Circle aria-hidden className="size-5 shrink-0 text-fg-muted" />
                    )}
                    <XpBar
                      className="flex-1"
                      size="sm"
                      value={quest.progress}
                      max={quest.target}
                      label={t(`quest.${quest.key}` as 'quest.play3')}
                      valueLabel={`${quest.progress}/${quest.target} · +${quest.xp} XP`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
            <p className="mb-3 font-display text-title-md">
              {t('achievements', { n: unlocked.size, total: ACHIEVEMENTS.length })}
            </p>
            <ul className="flex flex-wrap gap-2">
              {ACHIEVEMENTS.map((key) => (
                <li key={key}>
                  <Badge
                    tone={unlocked.has(key) ? 'mint' : 'neutral'}
                    title={t(`achievement.${key}.hint`)}
                  >
                    {unlocked.has(key) ? <CheckCircle2 aria-hidden className="size-3.5" /> : null}
                    {t(`achievement.${key}.name`)}
                    <span className="sr-only">
                      {unlocked.has(key) ? t('unlocked') : t('locked')}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          {s.recent.length > 0 ? (
            <div className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
              <p className="mb-3 font-display text-title-md">{t('recent')}</p>
              <table className="w-full text-body-sm tabular-nums">
                <thead>
                  <tr className="text-left text-label-sm text-fg-muted">
                    <th className="py-1">{t('match')}</th>
                    <th className="text-right">K / D</th>
                    <th className="text-right">XP</th>
                    <th className="hidden text-right sm:table-cell">{t('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((match) => (
                    <tr key={match.createdAt} className="border-t border-border-subtle">
                      <td className="py-1.5">
                        <Badge tone={match.won ? 'mint' : 'coral'} className="mr-2">
                          {match.won ? t('won') : t('lost')}
                        </Badge>
                        {t(`mode.${match.mode}` as 'mode.tdm')} ·{' '}
                        {t(`map.${match.map}` as 'map.liman')}
                      </td>
                      <td className="text-right">
                        {match.kills} / {match.deaths}
                      </td>
                      <td className="text-right">+{match.xp}</td>
                      <td className="hidden text-right text-fg-muted sm:table-cell">
                        {formatDate(match.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {mine?.ok ? (
        <div className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
          <p className="mb-3 font-display text-title-md">{t('cosmetics')}</p>
          <CosmeticsForm
            skins={mine.data.skins}
            outfits={mine.data.outfits}
            skin={mine.data.equippedSkin}
            outfit={mine.data.equippedOutfit}
          />
        </div>
      ) : null}
    </section>
  );
}
