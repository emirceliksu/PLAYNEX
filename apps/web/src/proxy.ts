import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Usernames may contain dots (/profile/kaan.d), so only real asset extensions are skipped.
  matcher:
    '/((?!api|_next|_vercel|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff2|txt|xml|json|webmanifest|ogg)$).*)',
};
