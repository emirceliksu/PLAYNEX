import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

export const iconButtonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center rounded-md border-2 border-transparent',
    'transition-[transform,background-color,border-color,box-shadow,color] duration-(--pn-duration-fast) ease-out',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&>svg]:size-[1.25em]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-brand-solid text-fg-on-brand shadow-sticker',
          'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-brand-solid-hover hover:shadow-sticker-lg',
          'active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        ],
        secondary: [
          'border-border-strong bg-surface-raised text-fg-primary',
          'hover:border-fg-primary hover:bg-surface-overlay',
        ],
        ghost: 'bg-transparent text-fg-secondary hover:bg-surface-raised hover:text-fg-primary',
      },
      size: {
        sm: 'size-10 text-body-sm',
        md: 'size-12 text-body-md',
        lg: 'size-14 text-body-lg',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
);

export interface IconButtonProps
  extends ComponentPropsWithRef<'button'>, VariantProps<typeof iconButtonVariants> {
  // Accessible name; the icon itself is decorative.
  label: string;
  asChild?: boolean;
}

export function IconButton({
  className,
  variant,
  size,
  label,
  asChild = false,
  children,
  ...props
}: IconButtonProps) {
  const Component = asChild ? Slot.Root : 'button';

  return (
    <Component
      className={cn(iconButtonVariants({ variant, size }), className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Component>
  );
}
