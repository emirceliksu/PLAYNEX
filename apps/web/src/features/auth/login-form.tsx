'use client';

import { Button, TextField } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef } from 'react';

import { Link } from '@/i18n/navigation';

import { type AuthFormState, login } from './actions';
import { FormAlert } from './form-alert';
import { PasswordField } from './password-field';
import { useAuthCopy } from './use-auth-copy';

export function LoginForm({ next, resetDone }: { next?: string; resetDone: boolean }) {
  const t = useTranslations('auth.login');
  const [state, action, pending] = useActionState(login, {} satisfies AuthFormState);
  const { errorText } = useAuthCopy();
  const banner = errorText(state);
  const credentialsRejected = state.error === 'invalid_credentials';
  const alertId = useId();
  const alertRef = useRef<HTMLParagraphElement>(null);

  // The action re-renders the form without moving focus, which leaves it on <body>.
  useEffect(() => {
    if (state.error) alertRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5">
      {banner ? (
        <FormAlert tone="error" id={alertId} ref={alertRef}>
          {banner}
        </FormAlert>
      ) : null}
      {!banner && resetDone ? <FormAlert tone="success">{t('resetDone')}</FormAlert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField
        name="login"
        label={t('login')}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.login}
        aria-invalid={credentialsRejected || undefined}
        aria-describedby={credentialsRejected ? alertId : undefined}
      />
      <div className="flex flex-col">
        <PasswordField
          name="password"
          label={t('password')}
          autoComplete="current-password"
          required
          aria-invalid={credentialsRejected || undefined}
          aria-describedby={credentialsRejected ? alertId : undefined}
        />
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center self-end text-body-sm font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('forgot')}
        </Link>
      </div>
      <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('submitting')}>
        {t('submit')}
      </Button>
      <p className="text-center text-body-sm text-fg-secondary">
        {t('noAccount')}{' '}
        <Link
          href="/register"
          className="py-3 font-semibold text-brand-soft-text underline-offset-4 hover:underline"
        >
          {t('registerLink')}
        </Link>
      </p>
    </form>
  );
}
