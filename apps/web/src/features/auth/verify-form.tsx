'use client';

import { Button } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useState } from 'react';

import { type AuthFormState, resendCode, verify } from './actions';
import { FormAlert } from './form-alert';
import { useAuthCopy } from './use-auth-copy';

interface VerifyFormProps {
  mailFailed: boolean;
  resendAfter: number;
}

interface ResendControlProps {
  seconds: number;
  pending: boolean;
  action: () => void;
}

// Remounted (via key) after every resend, so the countdown restarts from the new cooldown.
function ResendControl({ seconds, pending, action }: ResendControlProps) {
  const t = useTranslations('auth.verify');
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) window.clearInterval(timer);
        return Math.max(0, current - 1);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={left > 0}
        isLoading={pending}
        loadingLabel={t('resend')}
      >
        {t('resend')}
      </Button>
      {left > 0 ? (
        <span className="text-body-sm text-fg-muted tabular-nums">
          {t('resendIn', { seconds: left })}
        </span>
      ) : null}
    </form>
  );
}

export function VerifyForm({ mailFailed, resendAfter }: VerifyFormProps) {
  const t = useTranslations('auth.verify');
  const codeId = useId();
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor={codeId} className="text-label-sm text-fg-muted uppercase">
            {t('codeLabel')}
          </label>
          <input
            id={codeId}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            aria-invalid={state.error === 'invalid_code' ? true : undefined}
            aria-describedby={`${codeId}-hint`}
            placeholder="000000"
            className="h-18 w-full rounded-xl border-2 border-border-strong bg-surface-sunken px-5 text-center font-display text-score-lg tracking-[0.35em] text-fg-primary tabular-nums shadow-sticker transition-[border-color] duration-(--pn-duration-fast) ease-out placeholder:text-fg-muted/40 hover:border-fg-secondary focus-visible:border-border-focus focus-visible:outline-none aria-invalid:border-coral-solid"
          />
          <p id={`${codeId}-hint`} className="text-body-sm text-fg-muted">
            {t('codeHint')}
          </p>
        </div>
        <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('submitting')}>
          {t('submit')}
        </Button>
      </form>

      <ResendControl
        key={resendState.sentAt ?? 0}
        seconds={resendState.retryAfter ?? resendAfter}
        pending={resending}
        action={resendAction}
      />
    </div>
  );
}
