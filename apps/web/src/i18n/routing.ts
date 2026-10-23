import { hasLocale } from 'next-intl';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['tr', 'en'],
  defaultLocale: 'tr',
  // Turkish stays on clean URLs (/games); English is prefixed (/en/games).
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];

// For metadata helpers that receive the raw route param before the page validates it.
export function resolveLocale(candidate: string): Locale {
  return hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;
}
