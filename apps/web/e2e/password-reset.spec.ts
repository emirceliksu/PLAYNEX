import { expect, test } from '@playwright/test';

import { enterLoginCode, latestCode } from './mailpit';

test('a player resets a forgotten password with a mailed code', async ({ page, request }) => {
  const id = Date.now().toString(36);
  const username = `e2e_${id}`;
  const email = `${username}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Ad', { exact: true }).fill('Ada');
  await page.getByLabel('Soyad').fill('Demir');
  await page.getByLabel('Kullanıcı adı').fill(username);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill('ilk sifre cumlesi');
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();
  await page.getByLabel('Doğrulama kodu').fill(await latestCode(request, email, 'doğrulama'));
  await page.getByRole('button', { name: 'Doğrula ve başla' }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${username}`));
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByRole('link', { name: 'Şifremi unuttum' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('E-posta').fill(email);
  await page.getByRole('button', { name: 'Kodu gönder' }).click();

  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel('Sıfırlama kodu').fill('000000');
  await page.getByLabel('Yeni şifre').fill('yeni sifre cumlesi');
  await page.getByRole('button', { name: 'Şifreyi güncelle' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Kod eşleşmedi' })).toBeVisible();

  await page.getByLabel('Sıfırlama kodu').fill(await latestCode(request, email, 'sıfırlama'));
  await page.getByLabel('Yeni şifre').fill('yeni sifre cumlesi');
  await page.getByRole('button', { name: 'Şifreyi güncelle' }).click();

  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(page.getByRole('status').filter({ hasText: 'Şifren güncellendi' })).toBeVisible();
  await page.getByLabel('Kullanıcı adı veya e-posta').fill(username);
  await page.getByLabel('Şifre', { exact: true }).fill('ilk sifre cumlesi');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'hatalı' })).toBeVisible();

  await page.getByLabel('Şifre', { exact: true }).fill('yeni sifre cumlesi');
  const signInAt = Date.now() - 1_000;
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await enterLoginCode(page, request, email, signInAt);
  await expect(page.getByRole('link', { name: 'Profilim' })).toBeVisible();
});
