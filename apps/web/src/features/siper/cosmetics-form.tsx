'use client';

import { Button, FilterChip, FilterGroup } from '@playnex/ui';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { type ActionState, equipCosmetics } from './actions';

interface Item {
  id: string;
  unlocked: boolean;
}

function Picker({
  name,
  label,
  items,
  value,
  onChange,
  render,
}: {
  name: string;
  label: string;
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  render: (id: string) => string;
}) {
  const t = useTranslations('siper.profile');
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label-sm text-fg-muted uppercase">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <FilterGroup
        type="single"
        value={value}
        aria-label={label}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        {items.map((item) => (
          <FilterChip key={item.id} value={item.id} disabled={!item.unlocked}>
            {item.unlocked ? null : <Lock aria-label={t('locked')} className="size-3.5" />}
            {render(item.id)}
          </FilterChip>
        ))}
      </FilterGroup>
    </fieldset>
  );
}

export function CosmeticsForm({
  skins,
  outfits,
  skin,
  outfit,
}: {
  skins: Item[];
  outfits: Item[];
  skin: string | null;
  outfit: string | null;
}) {
  const t = useTranslations('siper.profile');
  const [state, action, pending] = useActionState(equipCosmetics, {} satisfies ActionState);
  const [chosenSkin, setSkin] = useState(skin ?? 'standard');
  const [chosenOutfit, setOutfit] = useState(outfit ?? 'saha');
  return (
    <form action={action} className="flex flex-col gap-4">
      <Picker
        name="skin"
        label={t('skins')}
        items={skins}
        value={chosenSkin}
        onChange={setSkin}
        render={(id) => t(`skin.${id}` as 'skin.standard')}
      />
      <Picker
        name="outfit"
        label={t('outfits')}
        items={outfits}
        value={chosenOutfit}
        onChange={setOutfit}
        render={(id) => t(`outfit.${id}` as 'outfit.saha')}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" isLoading={pending} loadingLabel={t('saving')}>
          {t('equip')}
        </Button>
        {state.ok ? (
          <p role="status" className="text-body-sm text-mint-text">
            {t('equipped')}
          </p>
        ) : state.error ? (
          <p role="alert" className="text-body-sm text-coral-text">
            {t('equipFailed')}
          </p>
        ) : null}
      </div>
      <p className="text-body-sm text-fg-muted">{t('cosmeticsNote')}</p>
    </form>
  );
}
