'use client';

import type { GameOptionSpec, GameOptionValue } from '@playnex/shared-types';
import { FilterChip, FilterGroup } from '@playnex/ui';
import { useTranslations } from 'next-intl';

export function defaultOptions(specs: GameOptionSpec[]): Record<string, GameOptionValue> {
  return Object.fromEntries(specs.map((spec) => [spec.key, spec.defaultValue]));
}

export function OptionChips({
  specs,
  values,
  onChange,
}: {
  specs: GameOptionSpec[];
  values: Record<string, GameOptionValue>;
  onChange: (key: string, value: GameOptionValue) => void;
}) {
  const t = useTranslations('lobby');

  return specs.map((spec) => (
    <fieldset key={spec.key} className="flex flex-col gap-2 text-left">
      <legend className="mb-2 text-label-sm text-fg-muted uppercase">
        {t(`options.${spec.key}`)}
      </legend>
      <FilterGroup
        type="single"
        value={values[spec.key]}
        aria-label={t(`options.${spec.key}`)}
        onValueChange={(next) => {
          if (next) onChange(spec.key, next as GameOptionValue);
        }}
      >
        {spec.values.map((value) => (
          <FilterChip key={value} value={value}>
            {t(`optionValues.${value}`)}
          </FilterChip>
        ))}
      </FilterGroup>
    </fieldset>
  ));
}
