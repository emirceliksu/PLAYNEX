'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { IconButton } from '../icon-button/icon-button';

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export interface ModalContentProps extends ComponentPropsWithRef<typeof Dialog.Content> {
  title: string;
  description?: string;
  // Accessible name for the close control; comes from the app's i18n layer.
  closeLabel: string;
  // Hides the visual title while keeping it for assistive tech (e.g. result modals with a big score).
  hideTitle?: boolean;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
} as const;

export function ModalContent({
  title,
  description,
  closeLabel,
  hideTitle = false,
  footer,
  size = 'md',
  className,
  children,
  ...props
}: ModalContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/70 data-[state=open]:animate-fade-in" />
      <Dialog.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4',
          'rounded-xl border-2 border-border-strong bg-surface-overlay p-6 shadow-sticker-lg outline-none',
          'data-[state=open]:animate-pop-in',
          sizes[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Dialog.Title
              className={cn('font-display text-title-lg text-fg-primary', hideTitle && 'sr-only')}
            >
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="text-body-sm text-fg-secondary">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close asChild>
            <IconButton label={closeLabel} size="sm" className="-mt-1 -mr-2">
              <X />
            </IconButton>
          </Dialog.Close>
        </div>
        {children}
        {footer ? <div className="mt-2 flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
