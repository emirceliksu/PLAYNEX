import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-display font-semibold tracking-tight',
    'rounded-md border-2 border-transparent',
    'transition-[transform,background-color,border-color,box-shadow,color] duration-(--pn-duration-fast) ease-out',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-busy:cursor-progress',
  ],
  {
    variants: {
      variant: {
        // Sticker lift: the button moves up-left while its hard shadow grows, then presses flat.
        primary: [
          'bg-brand-solid text-fg-on-brand shadow-sticker',
          'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-brand-solid-hover hover:shadow-sticker-lg',
          'active:translate-x-0.5 active:translate-y-0.5 active:bg-brand-solid-active active:shadow-none',
        ],
        secondary: [
          'border-border-strong bg-surface-raised text-fg-primary',
          'hover:border-fg-primary hover:bg-surface-overlay',
          'active:bg-surface-sunken',
        ],
        ghost: [
          'bg-transparent text-fg-secondary',
          'hover:bg-surface-raised hover:text-fg-primary',
          'active:bg-surface-sunken',
        ],
        danger: [
          'bg-coral-solid text-fg-inverse shadow-sticker',
          'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-sticker-lg',
          'active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        ],
      },
      size: {
        sm: 'h-10 px-4 text-label-md',
        md: 'h-12 px-5 text-body-md',
        lg: 'h-14 px-7 text-title-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ComponentPropsWithRef<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  // Screen-reader announcement while loading; comes from the app's i18n layer.
  loadingLabel?: string;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';

  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 aria-hidden className="size-[1.15em] animate-spin" />
          {loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
        </>
      ) : null}
      <Slot.Slottable>{children}</Slot.Slottable>
    </Component>
  );
}
