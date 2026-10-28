'use client';

import { Button, TextField } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Link } from '@/i18n/navigation';

import { type AuthFormState, register } from './actions';
import { FormAlert } from './form-alert';
import { PasswordField } from './password-field';
import { useAuthCopy } from './use-auth-copy';

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const [state, action, pending] = useActionState(register, {} satisfies AuthFormState);
  const { errorText, fieldText } = useAuthCopy();
  const values = state.values ?? {};
  // Field-level problems already sit next to their inputs; the banner covers everything else.
  const banner = state.error && state.error !== 'invalid_input' ? errorText(state) : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      {banner ? <FormAlert tone="error">{banner}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="firstName"
          label={t('firstName')}
          autoComplete="given-name"
          required
          maxLength={50}
          defaultValue={values.firstName}
          error={fieldText(state, 'firstName')}
        />
        <TextField
          name="lastName"
          label={t('lastName')}
          autoComplete="family-name"
          required
          maxLength={50}
          defaultValue={values.lastName}
          error={fieldText(state, 'lastName')}
        />
      </div>
      <TextField
        name="username"
        label={t('username')}
        hint={t('usernameHint')}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9][A-Za-z0-9_.]{2,19}"
        defaultValue={values.username}
        error={fieldText(state, 'username')}
      />
      <TextField
        name="email"
        type="email"
        label={t('email')}
        hint={t('emailHint')}
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={values.email}
        error={fieldText(state, 'email')}
      />
      <PasswordField
        name="password"
        label={t('password')}
        hint={t('passwordHint')}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        error={fieldText(state, 'password')}
      />
      <p className="text-body-sm text-fg-muted">{t('privacy')}</p>
      <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('submitting')}>
        {t('submit')}
      </Button>
      <p className="text-center text-body-sm text-fg-secondary">
        {t('haveAccount')}{' '}
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
