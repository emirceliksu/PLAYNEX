import { cn } from '../../lib/cn';

export interface LogoProps {
  // Mark only; the wordmark stays available to screen readers.
  compact?: boolean;
  // Mark only below the lg breakpoint, full wordmark above (sidebar use).
  compactBelowLg?: boolean;
  className?: string;
}

export function Logo({ compact = false, compactBelowLg = false, className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 font-display font-bold tracking-tight text-fg-primary',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 -rotate-3 place-items-center rounded-sm border-2 border-(--pn-shadow-ink) bg-brand-solid shadow-sticker"
      >
        <svg viewBox="0 0 16 16" className="size-4 text-fg-on-brand">
          <path d="M4.5 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
      </span>
      <span
        className={cn(
          'text-title-md leading-none',
          compact && 'sr-only',
          compactBelowLg && 'max-lg:sr-only',
        )}
      >
        PLAY
        <span className="text-brand-soft-text">NEX</span>
      </span>
    </span>
  );
}
