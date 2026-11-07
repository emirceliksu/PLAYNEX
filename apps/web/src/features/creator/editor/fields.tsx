'use client';

import { cn } from '@playnex/ui';
import { type ReactNode, useId, useState } from 'react';

const control =
  'h-9 w-full min-w-0 rounded-md border-2 border-border-strong bg-surface-sunken px-2 text-body-sm text-fg-primary tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus';
const caption = 'text-label-sm uppercase text-fg-muted';

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b-2 border-border-subtle px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-title-sm">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// Keeps a local draft while typing so "-" or "1." are not rejected mid-entry;
// the value is committed once it parses.
export function NumberField({
  label,
  value,
  onChange,
  step = 0.25,
  min,
  max,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  return (
    <label htmlFor={id} className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={caption}>{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={draft}
        className={control}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  maxLength = 120,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className={caption}>{label}</span>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        className={control}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className={caption}>{label}</span>
      <select
        id={id}
        value={value}
        className={control}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-body-sm text-fg-secondary">
      <input
        type="checkbox"
        checked={checked}
        className="size-5 accent-brand-solid focus-visible:outline-2 focus-visible:outline-border-focus"
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function SwatchPicker({
  label,
  value,
  swatches,
  swatchLabel,
  onChange,
}: {
  label: string;
  value: number;
  swatches: readonly string[];
  swatchLabel: (index: number) => string;
  onChange: (index: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cn(caption, 'mb-1.5')}>{label}</legend>
      <div className="grid grid-cols-6 gap-1.5">
        {swatches.map((hex, index) => (
          <button
            key={hex}
            type="button"
            aria-label={swatchLabel(index)}
            aria-pressed={index === value}
            style={{ backgroundColor: hex }}
            className={cn(
              'aspect-square rounded-sm border-2 border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
              index === value && 'shadow-sticker outline-2 outline-offset-1 outline-fg-primary',
            )}
            onClick={() => onChange(index)}
          />
        ))}
      </div>
    </fieldset>
  );
}
