'use client';

import { Button } from '@playnex/ui';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Link } from '@/i18n/navigation';

import { setLike } from './actions';
import type { LikeState } from './types';

export function LikeButton({
  projectId,
  initial,
  signedIn,
  next,
}: {
  projectId: string;
  initial: LikeState;
  signedIn: boolean;
  next: string;
}) {
  const t = useTranslations('creator.game');
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Button asChild variant="secondary">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>
          <Heart aria-hidden className="size-4" />
          {t('likes', { n: state.likes })}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      aria-pressed={state.liked}
      isLoading={pending}
      loadingLabel={t('like')}
      onClick={() =>
        startTransition(async () => {
          const result = await setLike(projectId, !state.liked);
          if (result) setState(result);
        })
      }
    >
      <Heart
        aria-hidden
        className={state.liked ? 'size-4 fill-current text-pink-text' : 'size-4'}
      />
      {state.liked ? t('liked', { n: state.likes }) : t('likes', { n: state.likes })}
    </Button>
  );
}
