import { expect, type Page, test } from '@playwright/test';

// Every playable game must boot its engine and reach the "ready" overlay in the shell.
// Games with more than one way to play first go through the mode picker and setup.
const playableGames: { slug: string; mode?: string }[] = [
  { slug: 'snake-rush' },
  { slug: '2048-fusion' },
  { slug: 'memory-flip' },
  { slug: 'tugla-tugla' },
  { slug: 'connect-four', mode: 'Aynı cihazda' },
  { slug: 'air-hockey', mode: 'Tek başına' },
  { slug: 'chess-arena', mode: 'Aynı cihazda' },
];

async function chooseMode(page: Page, mode: string) {
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Devam', exact: true }).click();
}

for (const { slug, mode } of playableGames) {
  test(`${slug} boots and reports ready`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/play/${slug}`);
    if (mode) await chooseMode(page, mode);

    // Cold Turbopack compiles of a game bundle can take a while on the first visit.
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
    const start = page.getByRole('button', { name: 'Başla', exact: true });
    await expect(start).toBeVisible({ timeout: 30_000 });
    expect(pageErrors).toEqual([]);

    await start.click();
    await expect(start).toHaveCount(0);
  });
}
