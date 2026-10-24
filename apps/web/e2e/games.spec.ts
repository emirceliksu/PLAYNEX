import { expect, test } from '@playwright/test';

// Every playable game must boot its engine and reach the "ready" overlay in the shell.
const playableGames = ['snake-rush', '2048-fusion', 'memory-flip', 'tugla-tugla', 'connect-four'];

for (const slug of playableGames) {
  test(`${slug} boots and reports ready`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/play/${slug}`);

    // Cold Turbopack compiles of a game bundle can take a while on the first visit.
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
    const start = page.getByRole('button', { name: 'Başla', exact: true });
    await expect(start).toBeVisible({ timeout: 30_000 });
    expect(pageErrors).toEqual([]);

    await start.click();
    await expect(start).toHaveCount(0);
  });
}
