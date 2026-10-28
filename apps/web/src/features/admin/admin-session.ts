import type { Account } from '@playnex/shared-types';
import { forbidden } from 'next/navigation';

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
