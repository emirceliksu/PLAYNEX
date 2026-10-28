'use client';

import { Button } from '@playnex/ui';
import { Check, UserMinus, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, friendAction } from './actions';

export type FriendIntent = 'request' | 'accept' | 'remove';

const icons = { request: UserPlus, accept: Check, remove: UserMinus } as const;

export function FriendButton({
  username,
  intent,
  label,
  variant = 'secondary',
  decline = false,
}: {
  username: string;
  intent: FriendIntent;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  decline?: boolean;
}) {
  const t = useTranslations('siper.friends');
  const [state, action, pending] = useActionState(friendAction, {} satisfies ActionState);
  const Icon = decline ? X : icons[intent];
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" size="sm" variant={variant} isLoading={pending} loadingLabel={label}>
        <Icon aria-hidden className="size-4" />
        {label}
      </Button>
      {state.error ? (
        <span role="alert" className="text-label-sm text-coral-text">
          {t.has(`errors.${state.error}` as 'errors.generic')
            ? t(`errors.${state.error}` as 'errors.generic')
            : t('errors.generic')}
        </span>
      ) : null}
    </form>
  );
}
