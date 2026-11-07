import { defineConfig } from 'vitest/config';

// Unit tests live next to the code; e2e/ belongs to Playwright.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
