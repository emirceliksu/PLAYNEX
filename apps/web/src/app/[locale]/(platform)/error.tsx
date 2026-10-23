'use client';

import { Button, EmptyState } from '@playnex/ui';
import { useTranslations } from 'next-intl';

interface PlatformErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PlatformError({ reset }: PlatformErrorProps) {
  const t = useTranslations('errors.generic');

  return (
    <EmptyState
      tone="error"
      title={t('title')}
      description={t('description')}
      className="mx-auto mt-10 max-w-lg"
      action={<Button onClick={reset}>{t('retry')}</Button>}
    />
  );
}
