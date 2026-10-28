'use client';

import { Button, IconButton, Modal, ModalClose, ModalContent, ModalTrigger } from '@playnex/ui';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, reportPlayer } from './actions';

const REASONS = ['cheating', 'abuse', 'name', 'griefing', 'other'] as const;

export function ReportButton({ username }: { username: string }) {
  const t = useTranslations('siper.report');
  const [state, action, pending] = useActionState(reportPlayer, {} satisfies ActionState);
  return (
    <Modal>
      <ModalTrigger asChild>
        <IconButton label={t('open', { name: username })} size="sm">
          <Flag />
        </IconButton>
      </ModalTrigger>
      <ModalContent title={t('title', { name: username })} closeLabel={t('close')}>
        {state.ok ? (
          <div className="flex flex-col gap-3">
            <p role="status">{t('sent')}</p>
            <ModalClose asChild>
              <Button variant="secondary">{t('close')}</Button>
            </ModalClose>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="username" value={username} />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-label-sm text-fg-muted uppercase">{t('reason')}</legend>
              {REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-body-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    defaultChecked={reason === 'cheating'}
                  />
                  {t(`reasons.${reason}` as 'reasons.other')}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-label-sm text-fg-secondary">
              {t('note')}
              <textarea
                name="note"
                maxLength={500}
                rows={3}
                className="rounded-md border-2 border-border-subtle bg-surface-sunken px-2 py-1 text-body-sm text-fg-primary focus-visible:outline-2 focus-visible:outline-border-focus"
              />
            </label>
            {state.error ? (
              <p role="alert" className="text-body-sm text-coral-text">
                {t.has(`errors.${state.error}` as 'errors.generic')
                  ? t(`errors.${state.error}` as 'errors.generic')
                  : t('errors.generic')}
              </p>
            ) : null}
            <Button type="submit" isLoading={pending} loadingLabel={t('sending')}>
              {t('submit')}
            </Button>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
