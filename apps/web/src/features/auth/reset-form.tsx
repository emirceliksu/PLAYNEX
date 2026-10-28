'use client';

import { Button } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type AuthFormState, resendResetCode, resetPassword } from './actions';
import { CodeField } from './code-field';
import { FormAlert } from './form-alert';
import { PasswordField } from './password-field';
import { ResendControl } from './resend-control';
import { useAuthCopy } from './use-auth-copy';

export function ResetForm({ resendAfter }: { resendAfter: number }) {
  const t = useTranslations('auth.reset');
  const [state, action, pending] = useActionState(resetPassword, {} satisfies AuthFormState);
  const [resendState, resendAction, resending] = useActionState(
    resendResetCode,
    {} satisfies AuthFormState,
  );
  const { errorText, fieldText } = useAuthCopy();

  const error = errorText(state) ?? errorText(resendState);
  const success = resendState.notice === 'resent' ? t('resent') : undefined;

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {success ? <FormAlert tone="success">{success}</FormAlert> : null}

      <form action={action} className="flex flex-col gap-5">
        <CodeField
          label={t('codeLabel')}
          hint={t('codeHint')}
          invalid={state.error === 'invalid_code'}
        />
        <PasswordField
          name="password"
          label={t('password')}
          hint={t('passwordHint')}
          error={fieldText(state, 'password')}
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
        <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('submitting')}>
          {t('submit')}
        </Button>
      </form>

      <ResendControl
        key={resendState.sentAt ?? 0}
        seconds={resendState.retryAfter ?? resendAfter}
        pending={resending}
        action={resendAction}
        label={t('resend')}
        countdown={(seconds) => t('resendIn', { seconds })}
      />
    </div>
  );
}
