import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bind mounts on Windows/macOS hosts do not deliver file events; see .env.example.
const usePolling = process.env.WATCH_POLLING !== '0';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@playnex/ui', '@playnex/design-tokens', '@playnex/shared-types'],
  ...(usePolling ? { watchOptions: { pollIntervalMs: 1000 } } : {}),
};

export default withNextIntl(nextConfig);
