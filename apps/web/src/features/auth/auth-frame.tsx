import { Badge, GameCover, Logo } from '@playnex/ui';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import { findGame } from '@/lib/catalog/games';

// Three real covers pinned to the panel like stickers on an arcade cabinet.
const pinned = [
  { slug: 'snake-rush', className: '-rotate-6 left-0 top-6 z-10' },
  { slug: 'chess-arena', className: 'rotate-3 left-36 top-0 z-20' },
  { slug: 'neon-kart-racing', className: '-rotate-2 left-16 top-36 z-30' },
];

interface AuthFrameProps {
  step?: string;
  title: string;
  lead: ReactNode;
  children: ReactNode;
}

export async function AuthFrame({ step, title, lead, children }: AuthFrameProps) {
  const t = await getTranslations('auth');

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="grain relative hidden flex-col justify-between gap-12 overflow-hidden border-r-2 border-border-subtle bg-brand-soft p-10 lg:flex xl:p-14">
        <Link href="/" aria-label="PLAYNEX" className="self-start rounded-sm">
          <Logo />
        </Link>
        <div className="relative h-72 w-96" aria-hidden>
          {pinned.map(({ slug, className }) => {
            const game = findGame(slug);
            return game ? (
              <div
                key={slug}
                className={`absolute w-52 overflow-hidden rounded-lg border-2 border-fg-primary shadow-sticker-lg ${className}`}
              >
                <GameCover slug={game.slug} accent={game.accent} />
              </div>
            ) : null;
          })}
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <Badge sticker tone="yellow" className="self-start">
            {t('brand.eyebrow')}
          </Badge>
          <p className="font-display text-display-lg text-fg-primary">{t('brand.title')}</p>
          <p className="text-body-lg text-fg-secondary">{t('brand.body')}</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col px-4 py-5 md:px-10 md:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="PLAYNEX" className="rounded-sm lg:invisible">
            <Logo compact />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-label-md text-fg-secondary hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t('backHome')}
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10 md:py-16">
          <header className="flex flex-col gap-3">
            {step ? (
              <p className="text-label-sm text-brand-soft-text uppercase tabular-nums">{step}</p>
            ) : null}
            <h1 className="font-display text-display-md">{title}</h1>
            <p className="text-body-md text-fg-secondary">{lead}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
