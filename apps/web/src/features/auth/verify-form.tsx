'use client';

import { Button } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type AuthFormState, resendCode, verify } from './actions';
import { CodeField } from './code-field';
import { FormAlert } from './form-alert';
import { ResendControl } from './resend-control';
import { useAuthCopy } from './use-auth-copy';

interface VerifyFormProps {
  mailFailed: boolean;
  resendAfter: number;
}

export function VerifyForm({ mailFailed, resendAfter }: VerifyFormProps) {
  const t = useTranslations('auth.verify');
  const [state, action, pending] = useActionState(verify, {} satisfies AuthFormState);
  const [resendState, resendAction, resending] = useActionState(
    resendCode,
    {} satisfies AuthFormState,
  );
  const { errorText } = useAuthCopy();

  const error = errorText(state) ?? errorText(resendState);
  const success = resendState.notice === 'resent' ? t('resent') : undefined;

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {success ? <FormAlert tone="success">{success}</FormAlert> : null}
      {!error && !success && mailFailed ? (
        <FormAlert tone="error">{t('mailFailed')}</FormAlert>
      ) : null}

      <form action={action} className="flex flex-col gap-5">
        <CodeField
          label={t('codeLabel')}
          hint={t('codeHint')}
          invalid={state.error === 'invalid_code'}
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
