import type { Account } from '@playnex/shared-types';
import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@/i18n/routing';
import { getCurrentAccount, sessionToken } from '@/lib/auth/session';

// admin/layout.tsx already answers non-admins with a 403; pages call this for the session token
// and a non-null account. The API enforces the same rule on every admin endpoint.
export async function requireAdmin(): Promise<{ account: Account; token: string }> {
  const [account, token] = await Promise.all([getCurrentAccount(), sessionToken()]);
  if (!account || !token || account.role !== 'admin') {
    forbidden();
  }
  return { account, token };
}

// forbidden.tsx names the tab in the 403 response, but page metadata still streams in after it
// and replaces that title in the browser, so the admin pages pick the no-access title too.
export async function adminMetadata(
  locale: string,
  page: 'admin' | 'adminUsers',
): Promise<Metadata> {
  const account = await getCurrentAccount();
  if (account?.role !== 'admin') {
    const t = await getTranslations({
      locale: resolveLocale(locale),
      namespace: 'errors.forbidden',
    });
    return { title: t('title'), robots: { index: false } };
  }
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'meta' });
  return { title: t(page) };
}
