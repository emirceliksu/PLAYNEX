'use client';

import type { MatchOutcome, SessionPlayer } from '@playnex/game-sdk';
import type { GameScoring } from '@playnex/shared-types';
import { cn } from '@playnex/ui';
import { useTranslations } from 'next-intl';

import { formatDuration, formatNumber } from '@/lib/format';

export function ResultSummary({
  outcome,
  players,
  selfSeat,
  scoring,
  locale,
}: {
  outcome: MatchOutcome;
  players: SessionPlayer[];
  // Set for online matches, where the result is told from the viewer's side.
  selfSeat: number | null;
  scoring: GameScoring;
  locale: string;
}) {
  const t = useTranslations('lobby');
  const nameOf = (seat: number) =>
    players.find((player) => player.seat === seat)?.nickname ??
    t('local.playerName', { n: seat + 1 });
  const reason = t.has(`reasons.${outcome.reason}` as 'reasons.forfeit')
    ? t(`reasons.${outcome.reason}` as 'reasons.forfeit')
    : null;
  const formatScore = (score: number) =>
    scoring === 'fastest-time'
      ? score > 0
        ? formatDuration(score)
        : t('result.dnf')
      : formatNumber(score, locale);

  if (outcome.placements.length === 2) {
    const draw = outcome.placements[0] === outcome.placements[1];
    const winner = outcome.placements.indexOf(1);
    const title = draw
      ? t('result.draw')
      : selfSeat === null
        ? t('result.winner', { name: nameOf(winner) })
        : winner === selfSeat
          ? t('result.youWon')
          : t('result.youLost');
    const showScores = outcome.scores.some((score) => score > 1);

    return (
      <div className="flex flex-col items-center gap-2" data-testid="match-result">
        <p id="result-title" className="font-display text-display-sm">
          {title}
        </p>
        {showScores ? (
          <p className="font-display text-display-md tabular-nums">
            {formatScore(outcome.scores[0] ?? 0)} – {formatScore(outcome.scores[1] ?? 0)}
          </p>
        ) : null}
        {reason ? <p className="text-body-sm text-fg-secondary">{reason}</p> : null}
      </div>
    );
  }

  const ranking = outcome.placements
    .map((place, seat) => ({ place, seat, score: outcome.scores[seat] ?? 0 }))
    .sort((a, b) => a.place - b.place);

  return (
    <div className="flex w-full flex-col gap-3" data-testid="match-result">
      <p id="result-title" className="font-display text-title-lg">
        {selfSeat !== null && outcome.placements[selfSeat] === 1
          ? t('result.youWon')
          : t('result.winner', { name: nameOf(ranking[0]?.seat ?? 0) })}
      </p>
      <ol className="flex flex-col gap-1.5 text-left">
        {ranking.map(({ place, seat, score }) => (
          <li
            key={seat}
            className={cn(
              'flex items-center gap-3 rounded-lg border-2 px-3 py-2',
              seat === selfSeat
                ? 'border-brand-solid bg-brand-soft'
                : 'border-border-subtle bg-surface-sunken',
            )}
          >
            <span className="w-6 font-display text-title-sm tabular-nums">{place}</span>
            <span className="truncate font-display text-body-md">{nameOf(seat)}</span>
            <span className="ml-auto font-display text-body-md tabular-nums">
              {formatScore(score)}
            </span>
          </li>
        ))}
      </ol>
      {reason ? <p className="text-body-sm text-fg-secondary">{reason}</p> : null}
    </div>
  );
}
