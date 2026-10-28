'use client';

import { Button } from '@playnex/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { type ActionState, resolveReport } from './actions';

export function ReportActions({ id }: { id: string }) {
  const t = useTranslations('admin.reports');
  const [state, action, pending] = useActionState(resolveReport, {} satisfies ActionState);
  return (
    <form action={action} className="flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" name="status" value="resolved" size="sm" disabled={pending}>
        {t('resolve')}
      </Button>
      <Button
        type="submit"
        name="status"
        value="dismissed"
        size="sm"
        variant="ghost"
        disabled={pending}
      >
        {t('dismiss')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-label-sm text-coral-text">
          {t('failed')}
        </span>
      ) : null}
    </form>
  );
}
