import type { Account } from '@playnex/shared-types';
import { notFound } from 'next/navigation';

import { getCurrentAccount, sessionToken } from '@/lib/auth/session';

// Non-admins get the ordinary 404 so the panel does not reveal that it exists. The API
// enforces the same rule on every admin endpoint.
export async function requireAdmin(): Promise<{ account: Account; token: string }> {
  const [account, token] = await Promise.all([getCurrentAccount(), sessionToken()]);
  if (!account || !token || account.role !== 'admin') {
    notFound();
  }
  return { account, token };
}
