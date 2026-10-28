'use client';

import { useId } from 'react';

interface CodeFieldProps {
  label: string;
  hint: string;
  invalid: boolean;
}

export function CodeField({ label, hint, invalid }: CodeFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label-sm text-fg-muted uppercase">
        {label}
      </label>
      <input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        aria-invalid={invalid ? true : undefined}
        aria-describedby={`${id}-hint`}
        placeholder="000000"
        className="h-18 w-full rounded-xl border-2 border-border-strong bg-surface-sunken px-5 text-center font-display text-score-lg tracking-[0.35em] text-fg-primary tabular-nums shadow-sticker transition-[border-color] duration-(--pn-duration-fast) ease-out placeholder:text-fg-muted/40 hover:border-fg-secondary focus-visible:border-border-focus focus-visible:outline-none aria-invalid:border-coral-solid"
      />
      <p id={`${id}-hint`} className="text-body-sm text-fg-muted">
        {hint}
      </p>
    </div>
  );
}
