'use client';

import type { DocumentError } from '@playnex/creator-runtime';
import { Button, Modal, ModalContent } from '@playnex/ui';
import { CircleAlert, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';

import { publishProject } from '../actions';

interface PublishDialogProps {
  projectId: string;
  open: boolean;
  // Unsaved edits are flushed first so the release is exactly what the editor shows.
  beforePublish: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onShowError: (error: DocumentError) => void;
}

export function PublishDialog({
  projectId,
  open,
  beforePublish,
  onOpenChange,
  onShowError,
}: PublishDialogProps) {
  const t = useTranslations('creator.editor.publish');
  const tc = useTranslations('common');
  const te = useTranslations('creator.errors');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<DocumentError[]>([]);
  const [releaseId, setReleaseId] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    setProblems([]);
    try {
      if (!(await beforePublish())) {
        setError('save_failed');
        return;
      }
      const result = await publishProject(projectId, description);
      if (result.ok) {
        setReleaseId(result.releaseId);
      } else {
        setError(result.error);
        setProblems(result.errors ?? []);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setReleaseId(null);
      }}
    >
      <ModalContent
        closeLabel={tc('close')}
        title={releaseId ? t('doneTitle') : t('title')}
        description={releaseId ? t('doneDescription') : t('description')}
      >
        {releaseId ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/play/u/${releaseId}`}>{t('play')}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/community/${releaseId}`}>{t('page')}</Link>
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-label-md text-fg-secondary">{t('summary')}</span>
              <textarea
                value={description}
                maxLength={300}
                rows={3}
                className="rounded-md border-2 border-border-strong bg-surface-sunken p-3 text-body-md text-fg-primary focus-visible:outline-2 focus-visible:outline-border-focus"
                onChange={(event) => setDescription(event.target.value.replace(/[\r\n]+/g, ' '))}
              />
              <span className="text-body-sm text-fg-muted">{t('summaryHint')}</span>
            </label>
            <p className="text-body-sm text-fg-muted">{t('rules')}</p>

            {error ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border-2 border-coral-solid bg-coral-soft p-3"
              >
                <p className="flex items-center gap-2 text-body-sm text-coral-text">
                  <CircleAlert aria-hidden className="size-4 shrink-0" />
                  {t.has(`errors.${error}` as 'errors.generic')
                    ? t(`errors.${error}` as 'errors.generic')
                    : t('errors.generic')}
                </p>
                {problems.length > 0 ? (
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {problems.map((problem, index) => (
                      <li key={index}>
                        <button
                          type="button"
                          className="w-full rounded-sm px-1 text-left text-body-sm text-fg-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                          onClick={() => {
                            onOpenChange(false);
                            onShowError(problem);
                          }}
                        >
                          {te.has(problem.code as 'generic')
                            ? te(problem.code as 'generic')
                            : te('generic')}
                          <span className="ml-2 text-fg-muted">{problem.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" isLoading={pending} loadingLabel={t('publishing')}>
              <Rocket aria-hidden className="size-4" />
              {t('submit')}
            </Button>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
