import path from 'node:path';

import { test } from '@playwright/test';

// Design review captures (PLAN.md section 3): every screen at the four reference widths,
// plus each GamePlayer shell state on phone and desktop.
const widths = [375, 768, 1280, 1440] as const;

const routes = [
  { name: 'home', path: '/' },
  { name: 'games', path: '/games' },
  { name: 'games-filtered', path: '/games?category=puzzle&sort=new' },
  { name: 'games-empty', path: '/games?q=zzzz' },
  { name: 'game-detail', path: '/games/snake-rush' },
  { name: 'game-detail-coming-soon', path: '/games/connect-four' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'profile', path: '/profile/emre_k' },
  { name: 'not-found', path: '/games/olmayan-oyun' },
] as const;

const playerStates = ['loading', 'ready', 'playing', 'paused', 'finished', 'error'] as const;

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

for (const state of playerStates) {
  for (const width of [375, 1280] as const) {
    test(`player ${state} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 800 });
      await page.goto(`/play/snake-rush?state=${state}`);
      await page.waitForLoadState('networkidle');
      // Give the game engine a moment to draw its idle board behind the overlay.
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outputDir, 'player', `${state}-${width}.png`) });
    });
  }
}
