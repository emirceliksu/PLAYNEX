import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bind mounts on Windows/macOS hosts do not deliver file events; see infrastructure/development.env.
const usePolling = process.env.WATCH_POLLING !== '0';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enables forbidden() so the admin panel can answer non-admins with a 403 and its own screen.
  experimental: { authInterrupts: true },
  // The production image ships only the traced server; tracing starts at the monorepo root
  // so workspace packages and game data end up in it.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // The Playwright container reaches the dev server as http://web:3000.
  allowedDevOrigins: ['web', 'web:3000'],
  transpilePackages: [
    '@playnex/ui',
    '@playnex/design-tokens',
    '@playnex/shared-types',
    '@playnex/game-sdk',
    '@playnex/game-snake-rush',
    '@playnex/game-2048-fusion',
    '@playnex/game-memory-flip',
    '@playnex/game-tugla-tugla',
    '@playnex/game-connect-four',
    '@playnex/game-air-hockey',
    '@playnex/game-chess-arena',
    '@playnex/game-trivia-battle',
    '@playnex/game-drawing-party',
    '@playnex/game-neon-kart-racing',
    '@playnex/game-siper',
  ],
  ...(usePolling ? { watchOptions: { pollIntervalMs: 1000 } } : {}),
};

export default withNextIntl(nextConfig);
