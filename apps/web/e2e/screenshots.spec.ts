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
  { name: 'game-detail-modes', path: '/games/chess-arena' },
  { name: 'play-lobby', path: '/play/chess-arena' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'register', path: '/register' },
  { name: 'login', path: '/login' },
  { name: 'forgot-password', path: '/forgot-password' },
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

for (const slug of [
  'tugla-tugla',
  'connect-four',
  '2048-fusion',
  'memory-flip',
  'air-hockey',
  'chess-arena',
  'trivia-battle',
  'neon-kart-racing',
] as const) {
  test(`${slug} board at 1280px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/play/${slug}?state=playing`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(outputDir, 'player', `${slug}-board-1280.png`) });
  });
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

for (const width of widths) {
  test(`verify at ${width}px`, async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: 'playnex_pending_email', value: 'oyuncu@example.com', url: baseURL ?? '' },
    ]);
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.goto('/verify');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(outputDir, 'verify', `${width}.png`), fullPage: true });
  });
}

for (const width of widths) {
  test(`reset-password at ${width}px`, async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: 'playnex_reset_email', value: 'oyuncu@example.com', url: baseURL ?? '' },
    ]);
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.goto('/reset-password');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(outputDir, 'reset-password', `${width}.png`),
      fullPage: true,
    });
  });
}
