import path from 'node:path';

import { expect, test } from '@playwright/test';

import { enterLoginCode, latestCode } from './mailpit';

const outputDir = path.resolve(__dirname, '../../../docs/design/screenshots');

test('a visitor signs up, verifies the email, signs out and signs back in', async ({
  page,
  request,
}) => {
  const id = Date.now().toString(36);
  const username = `e2e_${id}`;
  const email = `${username}@example.com`;
  const password = 'uzun bir deneme cumlesi';

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/register');
  await page.getByLabel('Ad', { exact: true }).fill('Deniz');
  await page.getByLabel('Soyad').fill('Yılmaz');
  await page.getByLabel('Kullanıcı adı').fill(username);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();

  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel('Doğrulama kodu').fill('000000');
  await page.getByRole('button', { name: 'Doğrula ve başla' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Kod eşleşmedi' })).toBeVisible();

  await page.getByLabel('Doğrulama kodu').fill(await latestCode(request, email, 'doğrulama'));
  await page.getByRole('button', { name: 'Doğrula ve başla' }).click();

  await expect(page).toHaveURL(new RegExp(`/profile/${username}\\?welcome=1$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deniz Yılmaz');
  await expect(page.getByRole('status').filter({ hasText: 'Hesabın hazır' })).toBeVisible();

  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.screenshot({
      path: path.join(outputDir, 'profile', `${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Kayıt ol' }).first()).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Kullanıcı adı veya e-posta').fill(username);
  await page.getByLabel('Şifre', { exact: true }).fill('yanlis sifre denemesi');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'hatalı' })).toBeVisible();

  await page.getByLabel('Şifre', { exact: true }).fill(password);
  const signInAt = Date.now() - 1_000;
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page).toHaveURL(/\/login\/code$/);
  await page.getByLabel('Giriş kodu').fill('000000');
  await page.getByRole('button', { name: 'Girişi tamamla' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Kod eşleşmedi' })).toBeFocused();
  await enterLoginCode(page, request, email, signInAt);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Profilim' })).toBeVisible();

  await page.goto('/profile/olmayan_oyuncu');
  await expect(page.getByText('Burada bir şey yok')).toBeVisible();
});

test('the sign-up form keeps the typed values when the server rejects them', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Ad', { exact: true }).fill('Ece');
  await page.getByLabel('Soyad').fill('Kara');
  await page.getByLabel('Kullanıcı adı').fill('ece.k');
  await page.getByLabel('E-posta').fill('ece@localhost.example');
  await page.getByLabel('Şifre', { exact: true }).fill('kisa');
  // Skip the browser's own minlength check so the API's answer is what gets rendered.
  await page.locator('form').evaluate((form) => form.setAttribute('novalidate', ''));
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();

  await expect(page.getByText('Şifre 10–128 karakter olmalı.')).toBeVisible();
  await expect(page.getByLabel('Kullanıcı adı')).toHaveValue('ece.k');
});
