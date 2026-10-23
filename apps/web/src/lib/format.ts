const localeTags: Record<string, string> = {
  tr: 'tr-TR',
  en: 'en-GB',
};

export function localeTag(locale: string): string {
  return localeTags[locale] ?? locale;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

// 12 480 -> "12,5 bin" style compact numbers for play counts.
export function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function formatRelative(iso: string, locale: string, now: string): string {
  const diff = new Date(iso).getTime() - new Date(now).getTime();
  const formatter = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  for (const [unit, ms] of relativeUnits) {
    if (Math.abs(diff) >= ms) {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return formatter.format(0, 'minute');
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMinutes(totalMinutes: number, locale: string): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unitFormat = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(localeTag(locale), { style: 'unit', unit, unitDisplay: 'narrow' }).format(
      value,
    );
  return hours > 0
    ? `${unitFormat(hours, 'hour')} ${unitFormat(minutes, 'minute')}`
    : unitFormat(minutes, 'minute');
}
