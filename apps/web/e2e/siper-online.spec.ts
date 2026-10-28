import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';

import { latestCode } from './mailpit';

const SHOTS = '../../docs/design/screenshots';

async function signUp(
  browser: Browser,
  request: APIRequestContext,
  tag: string,
): Promise<{ page: Page; username: string }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const username = `sp_${tag}_${Date.now().toString(36)}`.slice(0, 20);
  const email = `${username}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Ad', { exact: true }).fill('Siper');
  await page.getByLabel('Soyad').fill('Oyuncu');
  await page.getByLabel('Kullanıcı adı').fill(username);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill('uzun bir deneme cumlesi');
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();
  await expect(page).toHaveURL(/\/verify$/, { timeout: 30_000 });
  await page.getByLabel('Doğrulama kodu').fill(await latestCode(request, email, 'doğrulama'));
  await page.getByRole('button', { name: 'Doğrula ve başla' }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${username}`), { timeout: 30_000 });
  return { page, username };
}

test('two signed-in players meet in a quick match under their usernames', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const host = await signUp(browser, request, 'a');
  const guest = await signUp(browser, request, 'b');

  // A fresh profile shows the empty Siper card, with quests and cosmetics for the owner.
  await expect(host.page.getByText('Günlük görevler')).toBeVisible();
  await expect(host.page.getByText('Henüz maç yok')).toBeVisible();

  for (const player of [host, guest]) {
    await player.page.goto('/play/siper');
    await player.page.getByRole('radio', { name: 'Herkes Tek' }).click({ timeout: 90_000 });
    await player.page.getByRole('button', { name: 'Hızlı eşleş' }).click({ timeout: 30_000 });
    await expect(player.page.locator('canvas:not([role="img"])')).toHaveCount(1, {
      timeout: 90_000,
    });
  }

  await host.page.keyboard.down('Tab');
  const board = host.page.getByRole('dialog', { name: 'Skor tablosu' });
  await expect(board).toContainText(host.username);
  await expect(board).toContainText(guest.username, { timeout: 15_000 });
  await host.page.getByTestId('siper-gate').evaluate((gate) => (gate.style.display = 'none'));
  await host.page.screenshot({ path: `${SHOTS}/siper-scoreboard-1280.png` });
  await host.page.keyboard.up('Tab');

  // Friends: one asks from the other's profile, the other accepts on the friends page.
  await host.page.goto(`/profile/${guest.username}`);
  await host.page.getByRole('button', { name: 'Arkadaş ekle' }).click();
  await guest.page.goto('/friends');
  await guest.page.getByRole('button', { name: 'Kabul et' }).click();
  await expect(guest.page.getByRole('link', { name: host.username })).toBeVisible();
  await guest.page.screenshot({ path: `${SHOTS}/siper-friends-1280.png`, fullPage: true });
});

test('ticket endpoint refuses visitors without a session', async ({ request }) => {
  const response = await request.post('/api/realtime/ticket');
  expect(response.status()).toBe(401);
});
