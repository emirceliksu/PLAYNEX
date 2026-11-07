'use client';

import { Button, Modal, ModalClose, ModalContent, ModalTrigger } from '@playnex/ui';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, deleteProject } from './actions';

export function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations('creator.workshop');
  const tc = useTranslations('common');
  const [state, action, pending] = useActionState(deleteProject, {} satisfies ActionState);
  return (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('deleteNamed', { title })}>
          <Trash2 aria-hidden className="size-4" />
          {t('delete')}
        </Button>
      </ModalTrigger>
      <ModalContent
        closeLabel={tc('close')}
        title={t('deleteTitle')}
        description={t('deleteDescription', { title })}
      >
        <form action={action} className="flex flex-wrap justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          {state.error ? (
            <p role="alert" className="w-full text-body-sm text-coral-text">
              {t('errors.generic')}
            </p>
          ) : null}
          <ModalClose asChild>
            <Button variant="secondary">{t('cancel')}</Button>
          </ModalClose>
          <Button type="submit" variant="danger" isLoading={pending} loadingLabel={t('delete')}>
            {t('delete')}
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
}
