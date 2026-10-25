'use client';

import type { PlayMode } from '@playnex/shared-types';
import { Globe, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

const icons = { solo: User, local: Users, online: Globe } as const;

export function ModePicker({
  modes,
  onPick,
}: {
  modes: PlayMode[];
  onPick: (mode: PlayMode) => void;
}) {
  const t = useTranslations('lobby');

  return (
    <div className="flex w-full flex-col gap-4">
      <p className="font-display text-title-lg">{t('title')}</p>
      <ul className="flex flex-col gap-2.5">
        {modes.map((mode, index) => {
          const Icon = icons[mode];
          return (
            <li key={mode}>
              <button
                type="button"
                onClick={() => onPick(mode)}
                autoFocus={index === 0}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-border-strong bg-surface-raised p-4 text-left transition-[transform,border-color,box-shadow] duration-(--pn-duration-fast) ease-out hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-fg-primary hover:shadow-sticker focus-visible:outline-border-focus active:translate-x-0 active:translate-y-0 active:shadow-none"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-border-strong bg-surface-sunken">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-title-sm">{t(`modes.${mode}.title`)}</span>
                  <span className="text-body-sm text-fg-secondary">{t(`modes.${mode}.hint`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
