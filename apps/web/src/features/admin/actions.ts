'use server';

import type { AdminAction, ManagedUser } from '@playnex/shared-types';
import { revalidatePath } from 'next/cache';

import { callApi } from '@/lib/auth/api';
import { sessionToken } from '@/lib/auth/session';

export interface AdminActionState {
  done?: AdminAction;
  error?: string;
  // Lets the row show the newest answer even when two in a row read the same.
  at?: number;
}

const knownActions: readonly AdminAction[] = [
  'suspend',
  'unsuspend',
  'grant-admin',
  'revoke-admin',
  'end-sessions',
];

function isAdminAction(value: string): value is AdminAction {
  return (knownActions as readonly string[]).includes(value);
}

export async function runAdminAction(
  _: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const token = await sessionToken();
  const username = form.get('username');
  const action = form.get('action');
  if (
    !token ||
    typeof username !== 'string' ||
    typeof action !== 'string' ||
    !isAdminAction(action)
  ) {
    return { error: 'failed', at: Date.now() };
  }

  // The API checks the role again; this server never decides who is an admin.
  const result = await callApi<ManagedUser>(
    `/v1/admin/users/${encodeURIComponent(username)}/${action}`,
    { method: 'POST', token },
  );
  if (!result.ok) {
    return { error: result.body.error, at: Date.now() };
  }
  revalidatePath('/[locale]/admin', 'layout');
  return { done: action, at: Date.now() };
}
