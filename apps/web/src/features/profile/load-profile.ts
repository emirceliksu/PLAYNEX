import type { Account } from '@playnex/shared-types';
import { cache } from 'react';

import { callApi } from '@/lib/auth/api';
import { getCurrentAccount } from '@/lib/auth/session';

export interface ProfileView {
  username: string;
  displayName: string;
  joinedAt: string;
  own: Account | null;
}

// The layout, metadata and page all need the profile; cache() keeps it to one API call per request.
export const loadProfile = cache(async (username: string): Promise<ProfileView | null> => {
  const account = await getCurrentAccount();
  if (account?.username === username.toLowerCase()) {
    return {
      username: account.username,
      displayName: `${account.firstName} ${account.lastName}`,
      joinedAt: account.createdAt,
      own: account,
    };
  }

  const result = await callApi<{ username: string; displayName: string; createdAt: string }>(
    `/v1/players/${encodeURIComponent(username)}`,
  );
  if (!result.ok) return null;
  return {
    username: result.data.username,
    displayName: result.data.displayName,
    joinedAt: result.data.createdAt,
    own: null,
  };
});
