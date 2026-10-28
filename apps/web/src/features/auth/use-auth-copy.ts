'use client';

import { useTranslations } from 'next-intl';

import type { AuthFormState } from './actions';

export type AuthField = 'username' | 'email' | 'firstName' | 'lastName' | 'password';

// Turns API error codes into the visitor's language; unknown codes fall back to a generic line.
export function useAuthCopy() {
  const t = useTranslations('auth');

  function errorText(state: AuthFormState): string | undefined {
    if (!state.error) return undefined;
    const seconds = state.retryAfter ?? 60;
    const messages: Record<string, string> = {
      invalid_input: t('errors.invalid_input'),
      invalid_credentials: t('errors.invalid_credentials'),
      account_suspended: t('errors.account_suspended'),
      invalid_code: t('errors.invalid_code'),
      code_expired: t('errors.code_expired'),
      too_many_attempts: t('errors.too_many_attempts'),
      rate_limited: t('errors.rate_limited', { seconds }),
      unavailable: t('errors.unavailable'),
    };
    return messages[state.error] ?? t('errors.internal');
  }

  function fieldText(state: AuthFormState, field: AuthField): string | undefined {
    const reason = state.fields?.[field];
    if (!reason) return undefined;
    const messages: Record<AuthField, Record<string, string>> = {
      username: {
        length: t('fields.username.length'),
        format: t('fields.username.format'),
        taken: t('fields.username.taken'),
      },
      email: { format: t('fields.email.format'), taken: t('fields.email.taken') },
      firstName: { length: t('fields.firstName.length'), format: t('fields.firstName.format') },
      lastName: { length: t('fields.lastName.length'), format: t('fields.lastName.format') },
      password: { length: t('fields.password.length') },
    };
    return messages[field][reason] ?? t('errors.invalid_input');
  }

  return { errorText, fieldText };
}
