'use server';

import type { Account } from '@playnex/shared-types';
import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { callApi } from '@/lib/auth/api';
import {
  endSession,
  type IssuedSession,
  forgetResetEmail,
  loginChallenge,
  pendingEmail,
  rememberLoginChallenge,
  rememberPendingEmail,
  rememberResetEmail,
  resetEmail,
  sessionToken,
  startSession,
} from '@/lib/auth/session';

export interface AuthFormState {
  error?: string;
  fields?: Record<string, string>;
  // Echoed back so the form keeps what the visitor typed; passwords never are.
  values?: Record<string, string>;
  retryAfter?: number;
  notice?: 'resent';
  // Distinguishes consecutive resend answers so the countdown restarts even when they look alike.
  sentAt?: number;
}

interface SignedIn {
  account: Account;
  session: IssuedSession;
}

interface CodeSent {
  challenge: string;
  email: string;
  retryAfter: number;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

// Only same-site paths are honoured, so a crafted link cannot bounce a fresh session elsewhere.
function safeNext(raw: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}

export async function register(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const locale = await getLocale();
  const values = {
    username: text(form, 'username'),
    email: text(form, 'email'),
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
  };
  const result = await callApi<{ email: string; mailSent: boolean }>('/v1/auth/register', {
    method: 'POST',
    body: { ...values, password: text(form, 'password'), locale },
  });

  if (!result.ok) {
    return {
      error: result.body.error,
      fields: result.body.fields,
      retryAfter: result.body.retryAfter,
      values,
    };
  }

  await rememberPendingEmail(result.data.email);
  redirect({ href: result.data.mailSent ? '/verify' : '/verify?mail=failed', locale });
  return {};
}

export async function verify(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const locale = await getLocale();
  const email = await pendingEmail();
  if (!email) {
    redirect({ href: '/register', locale });
    return {};
  }

  const result = await callApi<SignedIn>('/v1/auth/verify', {
    method: 'POST',
    body: { email, code: text(form, 'code') },
  });
  if (!result.ok) {
    return { error: result.body.error, retryAfter: result.body.retryAfter };
  }

  await startSession(result.data.session);
  redirect({ href: `/profile/${result.data.account.username}?welcome=1`, locale });
  return {};
}

export async function resendCode(_: AuthFormState): Promise<AuthFormState> {
  const locale = await getLocale();
  const email = await pendingEmail();
  if (!email) {
    redirect({ href: '/register', locale });
    return {};
  }

  const result = await callApi<{ retryAfter: number }>('/v1/auth/resend', {
    method: 'POST',
    body: { email },
  });
  if (!result.ok) {
    return { error: result.body.error, retryAfter: result.body.retryAfter, sentAt: Date.now() };
  }
  return { notice: 'resent', retryAfter: result.data.retryAfter, sentAt: Date.now() };
}

export async function login(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const locale = await getLocale();
  const values = { login: text(form, 'login') };
  const result = await callApi<CodeSent>('/v1/auth/login', {
    method: 'POST',
    body: { ...values, password: text(form, 'password') },
  });

  if (!result.ok) {
    if (result.body.error === 'email_not_verified' && result.body.email) {
      await rememberPendingEmail(result.body.email);
      redirect({ href: '/verify', locale });
    }
    return { error: result.body.error, retryAfter: result.body.retryAfter, values };
  }

  await rememberLoginChallenge({
    challenge: result.data.challenge,
    email: result.data.email,
    next: safeNext(text(form, 'next')),
  });
  redirect({ href: '/login/code', locale });
  return {};
}

export async function verifyLogin(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const locale = await getLocale();
  const pending = await loginChallenge();
  if (!pending) {
    redirect({ href: '/login', locale });
    return {};
  }

  const result = await callApi<SignedIn>('/v1/auth/login/code', {
    method: 'POST',
    body: { challenge: pending.challenge, code: text(form, 'code') },
  });
  if (!result.ok) {
    return { error: result.body.error, retryAfter: result.body.retryAfter };
  }

  await startSession(result.data.session);
  redirect({ href: pending.next, locale });
  return {};
}

export async function resendLoginCode(_: AuthFormState): Promise<AuthFormState> {
  const locale = await getLocale();
  const pending = await loginChallenge();
  if (!pending) {
    redirect({ href: '/login', locale });
    return {};
  }

  const result = await callApi<{ retryAfter: number }>('/v1/auth/login/resend', {
    method: 'POST',
    body: { challenge: pending.challenge },
  });
  if (!result.ok) {
    return { error: result.body.error, retryAfter: result.body.retryAfter, sentAt: Date.now() };
  }
  return { notice: 'resent', retryAfter: result.data.retryAfter, sentAt: Date.now() };
}

export async function requestPasswordReset(
  _: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const locale = await getLocale();
  const values = { email: text(form, 'email') };
  const result = await callApi<{ retryAfter: number }>('/v1/auth/password/forgot', {
    method: 'POST',
    body: values,
  });
  if (!result.ok) {
    return {
      error: result.body.error,
      fields: result.body.fields,
      retryAfter: result.body.retryAfter,
      values,
    };
  }

  await rememberResetEmail(values.email.trim());
  redirect({ href: '/reset-password', locale });
  return {};
}

export async function resendResetCode(_: AuthFormState): Promise<AuthFormState> {
  const locale = await getLocale();
  const email = await resetEmail();
  if (!email) {
    redirect({ href: '/forgot-password', locale });
    return {};
  }

  const result = await callApi<{ retryAfter: number }>('/v1/auth/password/forgot', {
    method: 'POST',
    body: { email },
  });
  if (!result.ok) {
    return { error: result.body.error, retryAfter: result.body.retryAfter, sentAt: Date.now() };
  }
  return { notice: 'resent', retryAfter: result.data.retryAfter, sentAt: Date.now() };
}

export async function resetPassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const locale = await getLocale();
  const email = await resetEmail();
  if (!email) {
    redirect({ href: '/forgot-password', locale });
    return {};
  }

  const result = await callApi('/v1/auth/password/reset', {
    method: 'POST',
    body: { email, code: text(form, 'code'), password: text(form, 'password') },
  });
  if (!result.ok) {
    return {
      error: result.body.error,
      fields: result.body.fields,
      retryAfter: result.body.retryAfter,
    };
  }

  await forgetResetEmail();
  // The reset ended every session, including one this browser may still hold.
  await endSession();
  redirect({ href: '/login?reset=1', locale });
  return {};
}

export async function logout(): Promise<void> {
  const locale = await getLocale();
  const token = await sessionToken();
  if (token) {
    await callApi('/v1/auth/logout', { method: 'POST', token });
  }
  await endSession();
  redirect({ href: '/', locale });
}
