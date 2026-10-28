'use client';

import { Button, TextField } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Link } from '@/i18n/navigation';

import { type AuthFormState, requestPasswordReset } from './actions';
import { FormAlert } from './form-alert';
import { useAuthCopy } from './use-auth-copy';

export function ForgotForm() {
  const t = useTranslations('auth.forgot');
  const [state, action, pending] = useActionState(requestPasswordReset, {} satisfies AuthFormState);
  const { errorText, fieldText } = useAuthCopy();
  const banner = state.error && state.error !== 'invalid_input' ? errorText(state) : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      {banner ? <FormAlert tone="error">{banner}</FormAlert> : null}
      <TextField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={state.values?.email}
        error={fieldText(state, 'email')}
      />
      <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('submitting')}>
        {t('submit')}
      </Button>
      <p className="text-center text-body-sm text-fg-secondary">
        {t('remembered')}{' '}
        <Link
          href="/login"
          className="font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('loginLink')}
        </Link>
      </p>
    </form>
  );
}
