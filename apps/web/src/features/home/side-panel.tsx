import { Avatar, Badge, ScoreValue, XpBar } from '@playnex/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { localeTag } from '@/lib/format';
import { getOverallRanking } from '@/lib/mock/leaderboard';
import { currentPlayer, friends } from '@/lib/mock/players';

const quest = { done: 2, total: 3, xp: 120 };

export async function SidePanel() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const online = friends.filter((friend) => friend.status !== 'offline').length;
  const ranking = getOverallRanking(3);

  return (
    <aside className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
      <section className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-title-sm">{t('home.friends')}</h2>
          <span className="text-label-sm text-mint-text">
            {t('home.friendsOnline', { count: online })}
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {friends.map((friend) => (
            <li key={friend.id} className="flex items-center gap-3">
              <Avatar
                name={friend.displayName}
                seed={friend.avatarSeed}
                size="sm"
                status={friend.status}
                statusLabel={t(`common.status.${friend.status}`)}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/profile/${friend.username}`}
                  className="block truncate font-display text-label-md text-fg-primary hover:underline"
                >
                  {friend.displayName}
                </Link>
                <p className="text-label-sm text-fg-muted">{t(`common.status.${friend.status}`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-title-sm">{t('home.quest')}</h2>
          <Badge tone="yellow" sticker size="sm">
            {t('home.questReward', { xp: quest.xp })}
          </Badge>
        </div>
        <p className="mb-3 text-body-sm text-fg-secondary">{t('home.questTitle')}</p>
        <XpBar
          value={quest.done}
          max={quest.total}
          label={t('home.questProgress', { done: quest.done, total: quest.total })}
          size="sm"
        />
      </section>

      <section className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4">
        <h2 className="mb-3 font-display text-title-sm">{t('home.ranking')}</h2>
        <ol className="flex flex-col gap-2">
          {ranking.map((entry) => (
            <li key={entry.player.id} className="flex items-center gap-2.5">
              <span className="w-4 font-display text-label-md text-fg-muted tabular-nums">
                {entry.rank}
              </span>
              <Avatar name={entry.player.displayName} seed={entry.player.avatarSeed} size="xs" />
              <span className="min-w-0 flex-1 truncate text-label-md text-fg-primary">
                {entry.player.displayName}
              </span>
              <ScoreValue
                value={entry.score}
                locale={localeTag(locale)}
                animate={false}
                className="text-label-md text-fg-secondary"
              />
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-2.5 border-t-2 border-border-subtle pt-3">
          <span className="w-4 font-display text-label-md text-brand-soft-text tabular-nums">
            14
          </span>
          <Avatar name={currentPlayer.displayName} seed={currentPlayer.avatarSeed} size="xs" />
          <span className="min-w-0 flex-1 truncate text-label-md text-fg-primary">
            {t('home.yourRank')}
          </span>
          <ScoreValue
            value={4110}
            locale={localeTag(locale)}
            animate={false}
            className="text-label-md text-fg-secondary"
          />
        </div>
      </section>
    </aside>
  );
}
