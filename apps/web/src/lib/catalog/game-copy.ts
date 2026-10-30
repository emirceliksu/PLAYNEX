import { resolveLocale } from '@/i18n/routing';

export interface GameCopy {
  tagline: string;
  description: string;
  controls: string[];
}

// Read directly rather than through next-intl: the provider ships its messages to every page,
// and the copy of a few hundred games does not belong in that payload.
export async function getGameCopy(locale: string): Promise<(slug: string) => GameCopy> {
  const loaded = (await import(`../games/generated/copy.${resolveLocale(locale)}.json`)) as {
    default: Record<string, GameCopy>;
  };
  return (slug) => {
    const copy = loaded.default[slug];
    if (!copy) throw new Error(`No copy for game "${slug}"`);
    return copy;
  };
}

export async function getGameText(locale: string, slug: string): Promise<Record<string, string>> {
  const loaded = (await import(
    `../games/generated/text/${resolveLocale(locale)}/${slug}.json`
  )) as { default: Record<string, string> };
  return loaded.default;
}
