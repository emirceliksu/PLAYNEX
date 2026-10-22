import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['tr', 'en'],
  defaultLocale: 'tr',
  // Turkish stays on clean URLs (/games); English is prefixed (/en/games).
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
