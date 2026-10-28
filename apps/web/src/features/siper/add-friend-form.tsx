'use client';

import { Button, TextField } from '@playnex/ui';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, friendAction } from './actions';

export function AddFriendForm() {
  const t = useTranslations('siper.friends');
  const [state, action, pending] = useActionState(friendAction, {} satisfies ActionState);
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="intent" value="request" />
      <TextField
        className="flex-1"
        name="username"
        label={t('addLabel')}
        placeholder={t('addPlaceholder')}
        autoComplete="off"
        required
        minLength={3}
        maxLength={20}
      />
      <Button type="submit" isLoading={pending} loadingLabel={t('sending')}>
        <UserPlus aria-hidden className="size-4" />
        {t('add')}
      </Button>
      {state.ok ? (
        <p role="status" className="text-body-sm text-mint-text sm:self-center">
          {t('sent')}
        </p>
      ) : state.error ? (
        <p role="alert" className="text-body-sm text-coral-text sm:self-center">
          {t.has(`errors.${state.error}` as 'errors.generic')
            ? t(`errors.${state.error}` as 'errors.generic')
            : t('errors.generic')}
        </p>
      ) : null}
    </form>
  );
}
