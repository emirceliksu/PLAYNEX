import { type APIRequestContext, type Page, expect } from '@playwright/test';

// Code mails land in Mailpit; the code is read from the subject line.
const mailpit = process.env.PLAYWRIGHT_MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessage {
  Subject: string;
  Created: string;
}

// `since` skips older mails to the same address, e.g. the admin account reused across runs.
export async function latestCode(
  request: APIRequestContext,
  email: string,
  subject: string,
  since = 0,
): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailpit}/api/v1/search`, {
          params: { query: `to:"${email}" subject:"${subject}"` },
        });
        const body = (await response.json()) as { messages: MailpitMessage[] };
        const fresh = body.messages.find((message) => Date.parse(message.Created) >= since);
        code = /\d{6}/.exec(fresh?.Subject ?? '')?.[0] ?? '';
        return code;
      },
      { timeout: 20_000 },
    )
    .not.toBe('');
  return code;
}

// Every sign-in ends on the code screen; `since` is taken before the password is submitted so
// a code from an earlier sign-in to the same address is never picked up.
export async function enterLoginCode(
  page: Page,
  request: APIRequestContext,
  email: string,
  since: number,
): Promise<void> {
  await expect(page).toHaveURL(/\/login\/code$/);
  await page.getByLabel('Giriş kodu').fill(await latestCode(request, email, 'giriş', since));
  await page.getByRole('button', { name: 'Girişi tamamla' }).click();
}
