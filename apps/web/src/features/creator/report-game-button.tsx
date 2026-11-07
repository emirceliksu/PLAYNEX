'use client';

import { Button, Modal, ModalContent, ModalTrigger } from '@playnex/ui';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, reportGame } from './actions';

const reasons = ['content', 'name', 'abuse', 'other'] as const;

export function ReportGameButton({ releaseId }: { releaseId: string }) {
  const t = useTranslations('creator.report');
  const tc = useTranslations('common');
  const [state, action, pending] = useActionState(reportGame, {} satisfies ActionState);

  return (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag aria-hidden className="size-4" />
          {t('open')}
        </Button>
      </ModalTrigger>
      <ModalContent closeLabel={tc('close')} title={t('title')} description={t('description')}>
        {state.ok ? (
          <p role="status" className="text-body-md text-mint-text">
            {t('sent')}
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={releaseId} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label-md text-fg-secondary">{t('reason')}</legend>
              {reasons.map((reason, index) => (
                <label key={reason} className="flex min-h-11 items-center gap-2 text-body-md">
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    defaultChecked={index === 0}
                    className="size-5 accent-brand-solid"
                  />
                  {t(`reasons.${reason}`)}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-label-md text-fg-secondary">{t('note')}</span>
              <textarea
                name="note"
                maxLength={500}
                rows={3}
                className="rounded-md border-2 border-border-strong bg-surface-sunken p-3 text-body-md focus-visible:outline-2 focus-visible:outline-border-focus"
              />
            </label>
            {state.error ? (
              <p role="alert" className="text-body-sm text-coral-text">
                {t.has(`errors.${state.error}` as 'errors.generic')
                  ? t(`errors.${state.error}` as 'errors.generic')
                  : t('errors.generic')}
              </p>
            ) : null}
            <Button type="submit" isLoading={pending} loadingLabel={t('submit')}>
              {t('submit')}
            </Button>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
