import type { Account } from '@playnex/shared-types';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { callApi } from './api';

const SESSION_COOKIE = 'playnex_session';
// Carries the address between the sign-up form and the code screen without putting it in the URL.
const PENDING_EMAIL_COOKIE = 'playnex_pending_email';
// The password reset screen gets its address the same way, in a cookie of its own.
const RESET_EMAIL_COOKIE = 'playnex_reset_email';
// Holds the sign-in challenge between the password step and the code screen. It is as good
// as half a login, so it stays HttpOnly and lives no longer than the code itself.
const LOGIN_CHALLENGE_COOKIE = 'playnex_login_challenge';
const LOGIN_CHALLENGE_MINUTES = 15;
const PENDING_EMAIL_MINUTES = 30;

const secure = process.env.NODE_ENV === 'production';

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const token = await sessionToken();
  if (!token) return null;
  const result = await callApi<Account>('/v1/me', { token });
  return result.ok ? result.data : null;
});

export async function startSession(session: IssuedSession): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  jar.delete(PENDING_EMAIL_COOKIE);
  jar.delete(LOGIN_CHALLENGE_COOKIE);
}

export interface LoginChallenge {
  challenge: string;
  email: string;
  next: string;
}

export async function rememberLoginChallenge(login: LoginChallenge): Promise<void> {
  (await cookies()).set(LOGIN_CHALLENGE_COOKIE, JSON.stringify(login), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: LOGIN_CHALLENGE_MINUTES * 60,
  });
}

export async function loginChallenge(): Promise<LoginChallenge | undefined> {
  const raw = (await cookies()).get(LOGIN_CHALLENGE_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as LoginChallenge;
  } catch {
    return undefined;
  }
}

export async function forgetLoginChallenge(): Promise<void> {
  (await cookies()).delete(LOGIN_CHALLENGE_COOKIE);
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function rememberPendingEmail(email: string): Promise<void> {
  (await cookies()).set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_EMAIL_MINUTES * 60,
  });
}

export async function pendingEmail(): Promise<string | undefined> {
  return (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
}

export async function rememberResetEmail(email: string): Promise<void> {
  (await cookies()).set(RESET_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_EMAIL_MINUTES * 60,
  });
}

export async function resetEmail(): Promise<string | undefined> {
  return (await cookies()).get(RESET_EMAIL_COOKIE)?.value;
}

export async function forgetResetEmail(): Promise<void> {
  (await cookies()).delete(RESET_EMAIL_COOKIE);
}
