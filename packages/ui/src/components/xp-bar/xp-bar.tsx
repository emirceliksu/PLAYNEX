import { cn } from '../../lib/cn';

const tones = {
  yellow: 'bg-yellow-solid',
  brand: 'bg-brand-solid',
  mint: 'bg-mint-solid',
  cyan: 'bg-cyan-solid',
} as const;

export interface XpBarProps {
  value: number;
  max: number;
  label: string;
  // Right-aligned text such as "1 240 / 2 000 XP".
  valueLabel?: string;
  tone?: keyof typeof tones;
  size?: 'sm' | 'md';
  className?: string;
}

export function XpBar({
  value,
  max,
  label,
  valueLabel,
  tone = 'yellow',
  size = 'md',
  className,
}: XpBarProps) {
  const percent = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-label-md">
        <span className="text-fg-secondary">{label}</span>
        {valueLabel ? (
          <span className="font-display text-fg-primary tabular-nums">{valueLabel}</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn(
          'overflow-hidden rounded-full border-2 border-border-subtle bg-surface-sunken',
          size === 'sm' ? 'h-2.5' : 'h-3.5',
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-(--pn-duration-xp) ease-out',
            tones[tone],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
