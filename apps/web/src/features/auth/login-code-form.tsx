'use client';

import { Button } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';

import { type AuthFormState, resendLoginCode, verifyLogin } from './actions';
import { CodeField } from './code-field';
import { FormAlert } from './form-alert';
import { ResendControl } from './resend-control';
import { useAuthCopy } from './use-auth-copy';

export function LoginCodeForm({ resendAfter }: { resendAfter: number }) {
  const t = useTranslations('auth.loginCode');
  const [state, action, pending] = useActionState(verifyLogin, {} satisfies AuthFormState);
  const [resendState, resendAction, resending] = useActionState(
    resendLoginCode,
    {} satisfies AuthFormState,
  );
  const { errorText } = useAuthCopy();
  const alertRef = useRef<HTMLParagraphElement>(null);

  // code_expired here means the whole attempt is gone, not just this code: only the password
  // step can start a new one.
  const expired = state.error === 'code_expired' || resendState.error === 'code_expired';
  const error = expired ? t('expired') : (errorText(state) ?? errorText(resendState));
  const success = resendState.notice === 'resent' ? t('resent') : undefined;

  useEffect(() => {
    if (state.error) alertRef.current?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <FormAlert tone="error" ref={alertRef}>
          {error}
        </FormAlert>
      ) : null}
      {success ? <FormAlert tone="success">{success}</FormAlert> : null}

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
