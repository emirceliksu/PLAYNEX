import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@/i18n/routing';

import type messages from '../../../messages/tr.json';

type GameSlug = keyof (typeof messages)['gameCopy'];

export interface GameCopy {
  tagline: string;
  description: string;
  controls: string[];
}

// Catalog slugs are plain strings while message keys are typed, hence the cast; a slug with no
// copy fails loudly in next-intl rather than rendering an empty card.
export async function getGameCopy(locale: string): Promise<(slug: string) => GameCopy> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: 'gameCopy' });
  return (slug) => {
    const key = slug as GameSlug;
    return {
      tagline: t(`${key}.tagline`),
      description: t(`${key}.description`),
      controls: t.raw(`${key}.controls`) as string[],
    };
  };
}
