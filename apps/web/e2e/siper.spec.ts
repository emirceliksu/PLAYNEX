import { expect, test } from '@playwright/test';

const SHOTS = '../../docs/design/screenshots';

test('a guest plays siper against bots on the server', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play/siper');

  await expect(page.getByRole('button', { name: 'Maça başla' })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${SHOTS}/siper-lobby-1440.png` });
  await page.getByRole('button', { name: 'Maça başla' }).click();

  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
  // The mouse is not captured yet, so the play gate with the settings is up.
  await expect(page.getByRole('button', { name: 'Oynamak için tıkla' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Takım Ölüm Maçı · Liman/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/siper-gate-1440.png` });

  // Bots fight on their own; within half a minute someone goes down.
  await page.keyboard.down('Tab');
  await expect(page.getByRole('dialog', { name: 'Skor tablosu' })).toBeVisible();
  await page.keyboard.up('Tab');
  await expect(
    page
      .locator('li')
      .filter({
        hasText:
          /Tabanca|Piyade tüfeği|Karabina|Bıçak|Pompalı|Hafif makineli|Altıpatlar|Keskin nişancı/,
      })
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  // Pointer lock cannot be granted headless; hide the gate to see the match itself.
  await page.getByTestId('siper-gate').evaluate((gate) => (gate.style.display = 'none'));
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${SHOTS}/siper-match-1440.png` });
  expect(pageErrors).toEqual([]);
});

test('online play asks guests to sign in', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/play/siper');
  await page.getByRole('radio', { name: 'Çevrim içi' }).click({ timeout: 90_000 });
  await expect(page.getByText('Çevrim içi maçlar için hesap gerekir')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
    'href',
    /\/login\?next=%2Fplay%2Fsiper/,
  );
  await page.screenshot({ path: `${SHOTS}/siper-lobby-375.png`, fullPage: true });
});

for (const width of [375, 768, 1280]) {
  test(`siper lobby at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/play/siper');
    await expect(page.getByRole('button', { name: 'Maça başla' })).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: `${SHOTS}/siper-lobby-${width}.png`, fullPage: true });
  });
}
