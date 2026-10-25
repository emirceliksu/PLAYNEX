'use client';

import type { LocalSession } from '@playnex/game-sdk';
import type { GameOptionValue, GameSetup } from '@playnex/shared-types';
import { Button, IconButton, TextField } from '@playnex/ui';
import { ArrowLeft, Play, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { defaultOptions, OptionChips } from './option-chips';

export function LocalSetup({
  mode,
  setup,
  canGoBack,
  onBack,
  onStart,
}: {
  mode: 'solo' | 'local';
  setup: GameSetup;
  canGoBack: boolean;
  onBack: () => void;
  onStart: (session: LocalSession) => void;
}) {
  const t = useTranslations('lobby');
  const specs = setup.options.filter((spec) => spec.modes.includes(mode));
  const seats = setup.localPlayers ?? { min: 1, max: 1 };
  const [values, setValues] = useState<Record<string, GameOptionValue>>(() =>
    defaultOptions(specs),
  );
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: mode === 'local' ? seats.min : 1 }, () => ''),
  );

  const start = () =>
    onStart({
      mode,
      options: values,
      players: names.map((name, seat) => ({
        seat,
        nickname: name.trim() || t('local.playerName', { n: seat + 1 }),
      })),
    });

  return (
    <form
      className="flex w-full flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <div className="flex items-center gap-2">
        {canGoBack ? (
          <IconButton label={t('back')} size="sm" type="button" onClick={onBack}>
            <ArrowLeft />
          </IconButton>
        ) : null}
        <p className="font-display text-title-lg">{t(`modes.${mode}.title`)}</p>
      </div>

      <OptionChips
        specs={specs}
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      />

      {mode === 'local' ? (
        <fieldset className="flex flex-col gap-2 text-left">
          <legend className="mb-2 text-label-sm text-fg-muted uppercase">
            {t('local.players')}
          </legend>
          {names.map((name, seat) => (
            <div key={seat} className="flex items-end gap-2">
              <TextField
                className="flex-1"
                label={t('local.playerName', { n: seat + 1 })}
                hideLabel
                placeholder={t('local.playerName', { n: seat + 1 })}
                value={name}
                maxLength={16}
                onChange={(event) =>
                  setNames((current) =>
                    current.map((value, index) => (index === seat ? event.target.value : value)),
                  )
                }
              />
              {names.length > seats.min ? (
                <IconButton
                  type="button"
                  size="sm"
                  label={t('local.remove', { n: seat + 1 })}
                  onClick={() =>
                    setNames((current) => current.filter((_, index) => index !== seat))
                  }
                  className="mb-1"
                >
                  <X />
                </IconButton>
              ) : null}
            </div>
          ))}
          {names.length < seats.max ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setNames((current) => [...current, ''])}
            >
              <Plus aria-hidden className="size-4" />
              {t('local.add')}
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      <Button type="submit" size="lg" className="w-full" autoFocus={specs.length === 0}>
        <Play aria-hidden className="size-5" />
        {t('local.continue')}
      </Button>
    </form>
  );
}
