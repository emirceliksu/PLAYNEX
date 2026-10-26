import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bind mounts on Windows/macOS hosts do not deliver file events; see .env.example.
const usePolling = process.env.WATCH_POLLING !== '0';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
  ],
  ...(usePolling ? { watchOptions: { pollIntervalMs: 1000 } } : {}),
};

export default withNextIntl(nextConfig);
