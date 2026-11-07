'use server';

import type { DocumentError, GameDocument } from '@playnex/creator-runtime';
import { findTemplate } from '@playnex/creator-templates';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { callApi } from '@/lib/auth/api';
import { sessionToken } from '@/lib/auth/session';

import type { LikeState, PublishResult, RunVerdict, SaveResult } from './types';

export interface ActionState {
  ok?: boolean;
  error?: string;
  at?: number;
}

const projectId = /^[0-9a-f-]{36}$/;

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const template = findTemplate(formText(form, 'template'));
  const title = formText(form, 'title').trim();
  if (!token) return { error: 'unauthorized', at: Date.now() };
  if (!template || !title) return { error: 'invalid_input', at: Date.now() };
  const result = await callApi<{ id: string }>('/v1/creator/projects', {
    method: 'POST',
    token,
    body: { title, template: template.id, document: template.document },
  });
  if (!result.ok) return { error: result.body.error, at: Date.now() };
  return redirect({ href: `/create/${result.data.id}`, locale: await getLocale() });
}

export async function saveProject(
  id: string,
  draft: { title: string; document: GameDocument; revision: number },
): Promise<SaveResult> {
  const token = await sessionToken();
  if (!token || !projectId.test(id)) return { ok: false, error: 'unauthorized' };
  const result = await callApi<{ revision: number }>(`/v1/creator/projects/${id}`, {
    method: 'PUT',
    token,
    body: draft,
  });
  if (!result.ok) {
    const field = result.body.fields ? Object.values(result.body.fields)[0] : undefined;
    return { ok: false, error: field ?? result.body.error };
  }
  return { ok: true, revision: result.data.revision };
}

export async function publishProject(id: string, description: string): Promise<PublishResult> {
  const token = await sessionToken();
  if (!token || !projectId.test(id)) return { ok: false, error: 'unauthorized' };
  const result = await callApi<{ releaseId: string }>(`/v1/creator/projects/${id}/publish`, {
    method: 'POST',
    token,
    body: { description },
  });
  if (!result.ok) {
    const body = result.body as typeof result.body & { errors?: DocumentError[] };
    return { ok: false, error: body.error, errors: body.errors };
  }
  revalidatePath('/[locale]/community', 'page');
  return { ok: true, releaseId: result.data.releaseId };
}

export async function deleteProject(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const id = formText(form, 'id');
  if (!token || !projectId.test(id)) return { error: 'unauthorized', at: Date.now() };
  const result = await callApi(`/v1/creator/projects/${id}`, { method: 'DELETE', token });
  if (!result.ok) return { error: result.body.error, at: Date.now() };
  revalidatePath('/[locale]/create', 'page');
  return { ok: true, at: Date.now() };
}

// Guests play without a server run: their seed is local and their score is not ranked.
export async function startRun(releaseId: string): Promise<{ id: string; seed: number } | null> {
  const token = await sessionToken();
  if (!token || !projectId.test(releaseId)) return null;
  const result = await callApi<{ id: string; seed: number }>(
    `/v1/creator/releases/${releaseId}/runs`,
    { method: 'POST', token },
  );
  return result.ok ? result.data : null;
}

export async function finishRun(
  runId: string,
  run: { inputLog: string; score: number; ticks: number },
): Promise<RunVerdict | null> {
  const token = await sessionToken();
  if (!token || !projectId.test(runId)) return null;
  const result = await callApi<RunVerdict>(`/v1/creator/runs/${runId}/finish`, {
    method: 'POST',
    token,
    body: run,
  });
  return result.ok ? result.data : null;
}

export async function countPlay(releaseId: string): Promise<void> {
  if (!projectId.test(releaseId)) return;
  await callApi(`/v1/creator/releases/${releaseId}/plays`, { method: 'POST' });
}

export async function setLike(id: string, liked: boolean): Promise<LikeState | null> {
  const token = await sessionToken();
  if (!token || !projectId.test(id)) return null;
  const result = await callApi<LikeState>(`/v1/creator/projects/${id}/like`, {
    method: liked ? 'POST' : 'DELETE',
    token,
  });
  return result.ok ? result.data : null;
}

const reportReasons = ['content', 'name', 'abuse', 'other'];

export async function reportGame(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await sessionToken();
  const id = formText(form, 'id');
  const reason = formText(form, 'reason');
  const note = formText(form, 'note');
  if (!token) return { error: 'unauthorized', at: Date.now() };
  if (!projectId.test(id) || !reportReasons.includes(reason)) {
    return { error: 'invalid_input', at: Date.now() };
  }
  const result = await callApi(`/v1/creator/releases/${id}/report`, {
    method: 'POST',
    token,
    body: { reason, note },
  });
  return result.ok ? { ok: true, at: Date.now() } : { error: result.body.error, at: Date.now() };
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
