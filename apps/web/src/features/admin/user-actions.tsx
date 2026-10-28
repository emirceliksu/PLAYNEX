'use client';

import type { AdminAction, ManagedUser } from '@playnex/shared-types';
import { Button, Modal, ModalClose, ModalContent, ModalTrigger } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { type AdminActionState, runAdminAction } from './actions';

interface UserActionsProps {
  user: Pick<ManagedUser, 'username' | 'role' | 'verified' | 'suspendedAt' | 'activeSessions'>;
  closeLabel: string;
}

const doneKeys = {
  suspend: 'suspend',
  unsuspend: 'unsuspend',
  'grant-admin': 'grantAdmin',
  'revoke-admin': 'revokeAdmin',
  'end-sessions': 'endSessions',
} as const satisfies Record<AdminAction, string>;

const errorKeys = ['cannot_target_self', 'not_verified'] as const;

export function UserActions({ user, closeLabel }: UserActionsProps) {
  const t = useTranslations('admin.actions');
  const [state, action, pending] = useActionState(runAdminAction, {} satisfies AdminActionState);

  function hidden(name: AdminAction) {
    return (
      <>
        <input type="hidden" name="username" value={user.username} />
        <input type="hidden" name="action" value={name} />
      </>
    );
  }

  function confirmed(name: AdminAction, label: string, title: string, body: string) {
    return (
      <ConfirmDialog
        label={label}
        title={title}
        body={body}
        cancelLabel={t('cancel')}
        closeLabel={closeLabel}
        danger={name === 'suspend'}
        disabled={pending}
        onConfirm={(form) => {
          form.set('username', user.username);
          form.set('action', name);
          action(form);
        }}
      />
    );
  }

  function direct(name: AdminAction, label: string) {
    return (
      <form action={action}>
        {hidden(name)}
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {label}
        </Button>
      </form>
    );
  }

  const errorKey = errorKeys.find((key) => key === state.error) ?? 'failed';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {user.suspendedAt
          ? direct('unsuspend', t('unsuspend'))
          : confirmed(
              'suspend',
              t('suspend'),
              t('confirmSuspendTitle', { username: user.username }),
              t('confirmSuspendBody'),
            )}
        {user.role === 'admin'
          ? direct('revoke-admin', t('revokeAdmin'))
          : user.verified && !user.suspendedAt
            ? confirmed(
                'grant-admin',
                t('grantAdmin'),
                t('confirmGrantTitle', { username: user.username }),
                t('confirmGrantBody'),
              )
            : null}
        {user.activeSessions > 0 ? direct('end-sessions', t('endSessions')) : null}
      </div>
      <p role="status" className="min-h-0 text-body-sm empty:hidden">
        {state.done ? (
          <span className="text-mint-text">
            {t(`done.${doneKeys[state.done]}`, { username: user.username })}
          </span>
        ) : state.error ? (
          <span className="text-coral-text">{t(`errors.${errorKey}`)}</span>
        ) : null}
      </p>
    </div>
  );
}

interface ConfirmDialogProps {
  label: string;
  title: string;
  body: string;
  cancelLabel: string;
  closeLabel: string;
  danger: boolean;
  disabled: boolean;
  onConfirm: (form: FormData) => void;
}

// The dialog is controlled so it closes from the form action itself, after the submit has
// been handed to React rather than before.
function ConfirmDialog({
  label,
  title,
  body,
  cancelLabel,
  closeLabel,
  danger,
  disabled,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled}>
          {label}
        </Button>
      </ModalTrigger>
      <ModalContent title={title} description={body} closeLabel={closeLabel} size="sm">
        <form
          action={(form) => {
            setOpen(false);
            onConfirm(form);
          }}
          className="flex flex-wrap justify-end gap-3"
        >
          <ModalClose asChild>
            <Button type="button" variant="ghost" size="sm">
              {cancelLabel}
            </Button>
          </ModalClose>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} size="sm">
            {label}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}
