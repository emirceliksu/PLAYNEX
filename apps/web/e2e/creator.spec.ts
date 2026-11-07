import { expect, test } from '@playwright/test';

// Guest paths through the creator. Building and publishing need an account and
// run against the API in apps/api; here the pages must load, guard and boot.

test('community page lists player games with filters', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('heading', { level: 1, name: 'Topluluk' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sıralama' })).toBeVisible();
  await page.getByRole('link', { name: '3D', exact: true }).click();
  await expect(page).toHaveURL(/d=3d/);
});

test('workshop asks guests to sign in', async ({ page }) => {
  await page.goto('/create');
  await expect(page).toHaveURL(/\/login\?next=%2Fcreate/);
});

test('a published game boots to ready for a guest', async ({ page }) => {
  await page.goto('/community');
  const play = page.getByRole('link', { name: 'Oyna', exact: true }).first();
  test.skip((await play.count()) === 0, 'no published game in this database');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await play.click();
  await expect(page).toHaveURL(/\/play\/u\//);
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  const start = page.getByRole('button', { name: 'Başla', exact: true });
  await expect(start).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
  await start.click();
  await expect(start).toBeHidden();
});
