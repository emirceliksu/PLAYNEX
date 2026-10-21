import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

// Bind mounts on Windows/macOS hosts do not deliver file events; see .env.example.
const usePolling = process.env.WATCH_POLLING !== '0';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  core: {
    disableTelemetry: true,
  },
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      server: {
        watch: { usePolling, interval: 1000 },
      },
    }),
};

export default config;
