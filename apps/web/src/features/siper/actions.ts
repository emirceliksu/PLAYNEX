'use server';

import { revalidatePath } from 'next/cache';

import { callApi } from '@/lib/auth/api';
import { sessionToken } from '@/lib/auth/session';

export interface ActionState {
  ok?: boolean;
  error?: string;
  at?: number;
}

const reasons = ['cheating', 'abuse', 'name', 'griefing', 'other'];

export async function reportPlayer(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const username = form.get('username');
  const reason = form.get('reason');
  const note = form.get('note');
  if (!token) return { error: 'unauthorized', at: Date.now() };
  if (typeof username !== 'string' || typeof reason !== 'string' || !reasons.includes(reason)) {
    return { error: 'invalid_input', at: Date.now() };
  }
  const result = await callApi('/v1/reports', {
    method: 'POST',
    token,
    body: { username, reason, note: typeof note === 'string' ? note : '' },
  });
  return result.ok ? { ok: true, at: Date.now() } : { error: result.body.error, at: Date.now() };
}

export async function friendAction(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const username = form.get('username');
  const intent = form.get('intent');
  if (!token) return { error: 'unauthorized', at: Date.now() };
  if (typeof username !== 'string' || !username.trim()) {
    return { error: 'invalid_input', at: Date.now() };
  }
  const name = encodeURIComponent(username.trim().toLowerCase());
  const result =
    intent === 'accept'
      ? await callApi(`/v1/friends/${name}/accept`, { method: 'POST', token })
      : intent === 'remove'
        ? await callApi(`/v1/friends/${name}`, { method: 'DELETE', token })
        : await callApi('/v1/friends', {
            method: 'POST',
            token,
            body: { username: username.trim() },
          });
  if (!result.ok) return { error: result.body.error, at: Date.now() };
  revalidatePath('/[locale]/friends', 'page');
  revalidatePath('/[locale]/profile/[username]', 'page');
  return { ok: true, at: Date.now() };
}

export async function equipCosmetics(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  if (!token) return { error: 'unauthorized', at: Date.now() };
  const pick = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value ? value : null;
  };
  const result = await callApi('/v1/me/siper/loadout', {
    method: 'POST',
    token,
    body: { skin: pick('skin'), outfit: pick('outfit') },
  });
  if (!result.ok) return { error: result.body.error, at: Date.now() };
  revalidatePath('/[locale]/profile/[username]', 'page');
  return { ok: true, at: Date.now() };
}

export async function resolveReport(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const id = form.get('id');
  const status = form.get('status');
  if (!token || typeof id !== 'string' || (status !== 'resolved' && status !== 'dismissed')) {
    return { error: 'invalid_input', at: Date.now() };
  }
  // The API checks the admin role again.
  const result = await callApi(`/v1/admin/reports/${encodeURIComponent(id)}`, {
    method: 'POST',
    token,
    body: { status },
  });
  if (!result.ok) return { error: result.body.error, at: Date.now() };
  revalidatePath('/[locale]/admin/reports', 'page');
  return { ok: true, at: Date.now() };
}
