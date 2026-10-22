import path from 'node:path';

import { test } from '@playwright/test';

// Design review captures (PLAN.md section 3): every screen at the four reference widths.
const widths = [375, 768, 1280, 1440] as const;

const routes = [{ name: 'home', path: '/' }] as const;

const outputDir = path.resolve(__dirname, '../../../docs/design/screenshots');

for (const route of routes) {
  for (const width of widths) {
    test(`${route.name} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: path.join(outputDir, route.name, `${width}.png`),
        fullPage: true,
      });
    });
  }
}
