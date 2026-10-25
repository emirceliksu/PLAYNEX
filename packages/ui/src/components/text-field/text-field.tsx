import { type ComponentPropsWithRef, useId } from 'react';

import { cn } from '../../lib/cn';

export interface TextFieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel = false,
  className,
  id,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5 text-left', className)}>
      <label
        htmlFor={inputId}
        className={cn('text-label-sm text-fg-muted uppercase', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-12 w-full rounded-lg border-2 border-border-subtle bg-surface-sunken px-4 text-body-md text-fg-primary',
          'placeholder:text-fg-muted',
          'transition-[border-color] duration-(--pn-duration-fast) ease-out',
          'hover:border-border-strong focus-visible:border-border-focus focus-visible:outline-none',
          'aria-invalid:border-coral-solid',
          'disabled:opacity-50',
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-body-sm text-coral-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
