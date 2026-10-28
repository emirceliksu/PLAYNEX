import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';

import { cn } from '../../lib/cn';

export interface TextFieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  // Control placed inside the right edge of the input, such as a show-password toggle.
  trailing?: ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel = false,
  trailing,
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
      <div className="relative">
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
            trailing && 'pr-14',
          )}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        ) : null}
      </div>
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
