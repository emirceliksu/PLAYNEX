import path from 'node:path';

import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

import { latestCode } from './mailpit';

// compose.yaml promotes this address (ADMIN_EMAILS) once it is verified.
const adminEmail = 'admin@playnex.localhost';
const adminPassword = 'yonetici deneme cumlesi';
const outputDir = path.resolve(__dirname, '../../../docs/design/screenshots');

async function signUp(
  page: Page,
  request: APIRequestContext,
  account: { username: string; email: string; password: string; firstName: string },
) {
  await page.goto('/register');
  await page.getByLabel('Ad', { exact: true }).fill(account.firstName);
  await page.getByLabel('Soyad').fill('Test');
  await page.getByLabel('Kullanıcı adı').fill(account.username);
  await page.getByLabel('E-posta').fill(account.email);
  await page.getByLabel('Şifre', { exact: true }).fill(account.password);
  const since = Date.now() - 1_000;
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();
  await page
    .getByLabel('Doğrulama kodu')
    .fill(await latestCode(request, account.email, 'doğrulama', since));
  await page.getByRole('button', { name: 'Doğrula ve başla' }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${account.username}`));
}

// The admin account survives between runs unless the database is reset, so sign in first.
async function signInAsAdmin(page: Page, request: APIRequestContext) {
  await page.goto('/login');
  await page.getByLabel('Kullanıcı adı veya e-posta').fill(adminEmail);
  await page.getByLabel('Şifre', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  const signedIn = await page
    .getByRole('link', { name: 'Profilim' })
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!signedIn) {
    await signUp(page, request, {
      username: `e2e_admin_${Date.now().toString(36).slice(-4)}`,
      email: adminEmail,
      password: adminPassword,
      firstName: 'Yönetici',
    });
  }
}

async function captureWidths(page: Page, name: string) {
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.screenshot({ path: path.join(outputDir, name, `${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('an admin suspends a player and lifts the suspension', async ({ browser, request }) => {
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  const username = `e2e_${Date.now().toString(36)}`;
  const email = `${username}@example.com`;
  await signUp(player, request, {
    username,
    email,
    password: 'oyuncu deneme cumlesi',
    firstName: 'Mert',
  });

  const denied = await player.goto('/admin');
  expect(denied?.status()).toBe(403);
  await expect(player.getByRole('heading', { level: 1 })).toHaveText('Bu sayfa yöneticilere açık');

  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminContext.newPage();
  await signInAsAdmin(admin, request);

  await admin.getByRole('link', { name: 'Yönetim' }).first().click();
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Salonun durumu');
  await expect(admin.getByText(`@${username}`)).toBeVisible();
  await captureWidths(admin, 'admin');

  await admin.getByRole('link', { name: 'Oyuncular', exact: true }).click();
  await admin.getByRole('searchbox', { name: 'Oyuncu ara' }).fill(username);
  await admin.getByRole('button', { name: 'Ara' }).click();
  await expect(admin.getByText('1 hesap')).toBeVisible();
  const row = admin.getByRole('listitem').filter({ hasText: `@${username}` });

  await row.getByRole('button', { name: 'Askıya al' }).click();
  const dialog = admin.getByRole('dialog');
  await expect(dialog).toContainText(`${username} askıya alınsın mı?`);
  await dialog.getByRole('button', { name: 'Askıya al' }).click();
  await expect(row.getByRole('status')).toHaveText(`${username} askıya alındı.`);
  await expect(row.getByText('Askıda')).toBeVisible();

  await player.goto('/');
  await expect(player.getByRole('link', { name: 'Kayıt ol' }).first()).toBeVisible();
  await player.goto('/login');
  await player.getByLabel('Kullanıcı adı veya e-posta').fill(username);
  await player.getByLabel('Şifre', { exact: true }).fill('oyuncu deneme cumlesi');
  await player.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(player.getByRole('alert').filter({ hasText: 'askıya alındı' })).toBeVisible();

  await admin.goto('/admin/users?filter=suspended');
  await captureWidths(admin, 'admin-users');
  await admin.goto(`/admin/users?q=${username}`);
  await admin
    .getByRole('listitem')
    .filter({ hasText: `@${username}` })
    .getByRole('button', { name: 'Askıyı kaldır' })
    .click();
  await expect(admin.getByText(`${username} hesabının askısı kaldırıldı.`)).toBeVisible();

  await player.getByLabel('Şifre', { exact: true }).fill('oyuncu deneme cumlesi');
  await player.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(player.getByRole('link', { name: 'Profilim' })).toBeVisible();

  await playerContext.close();
  await adminContext.close();
});
