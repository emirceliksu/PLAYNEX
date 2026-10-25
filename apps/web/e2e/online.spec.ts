import { type Browser, expect, type Page, test } from '@playwright/test';

const LOGICAL_SIZE = 720;

async function openPlayer(browser: Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

async function hostRoom(page: Page, nickname: string): Promise<string> {
  await page.getByRole('button', { name: /^Çevrim içi oda/ }).click({ timeout: 60_000 });
  await page.getByLabel('Takma ad').fill(nickname);
  await page.getByRole('button', { name: 'Bağlan', exact: true }).click();
  await page.getByRole('button', { name: 'Oda kur', exact: true }).click();
  const code = page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  return (await code.textContent()) ?? '';
}

async function joinRoom(browser: Browser, slug: string, code: string, nickname: string) {
  const page = await openPlayer(browser, `/play/${slug}?room=${code}`);
  await page.getByLabel('Takma ad').fill(nickname, { timeout: 60_000 });
  await page.getByRole('button', { name: `${code} odasına katıl` }).click();
  await page.getByTestId('room-ready').click();
  return page;
}

async function clickBoard(page: Page, logicalX: number, logicalY: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas is not on screen');
  const scale = box.width / LOGICAL_SIZE;
  await page.mouse.click(box.x + logicalX * scale, box.y + logicalY * scale);
}

test('connect four is played through an online room', async ({ browser }) => {
  const host = await openPlayer(browser, '/play/connect-four');
  const code = await hostRoom(host, 'Ev Sahibi');
  const guest = await joinRoom(browser, 'connect-four', code, 'Konuk');

  await expect(host.getByTestId('room-members').getByRole('listitem')).toHaveCount(2);
  await host.getByTestId('room-start').click();
  await expect(host.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
  await expect(guest.locator('canvas')).toHaveCount(1, { timeout: 90_000 });

  // Column centres from the scene layout: board left 66, 84 px cells.
  const column = (index: number) => 66 + index * 84 + 42;
  const moves: [Page, number][] = [
    [host, 0],
    [guest, 1],
    [host, 0],
    [guest, 1],
    [host, 0],
    [guest, 1],
    [host, 0],
  ];
  for (const [page, index] of moves) {
    // The server answers each drop before the next player may move.
    await page.waitForTimeout(600);
    await clickBoard(page, column(index), 400);
  }

  await expect(host.getByTestId('match-result')).toContainText('Kazandın', { timeout: 15_000 });
  await expect(guest.getByTestId('match-result')).toContainText('Kaybettin');

  await guest.getByRole('button', { name: 'Odaya dön' }).click();
  await expect(guest.getByTestId('room-code')).toHaveText(code);
});
