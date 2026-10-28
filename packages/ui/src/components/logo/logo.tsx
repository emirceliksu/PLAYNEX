import { brandMark } from '@playnex/design-tokens';

import { cn } from '../../lib/cn';

export interface LogoProps {
  // Mark only; the wordmark stays available to screen readers.
  compact?: boolean;
  // Mark only below the lg breakpoint, full wordmark above (sidebar use).
  compactBelowLg?: boolean;
  className?: string;
}

export function LogoMark({ className }: { className?: string }) {
  const { viewBox, shadow, tile, play, pixels } = brandMark;
  return (
    <svg aria-hidden viewBox={viewBox} className={cn('size-9 shrink-0 -rotate-3', className)}>
      <rect
        x={shadow.x}
        y={shadow.y}
        width={shadow.size}
        height={shadow.size}
        rx={shadow.radius}
        className="fill-(--pn-shadow-ink)"
      />
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.size}
        height={tile.size}
        rx={tile.radius}
        strokeWidth={tile.stroke}
        className="fill-brand-solid stroke-(--pn-shadow-ink)"
      />
      <path d={play} fillRule="evenodd" className="fill-fg-on-brand" />
      {pixels.map((pixel) => (
        <rect
          key={pixel.x}
          x={pixel.x}
          y={pixel.y}
          width={pixel.size}
          height={pixel.size}
          className="fill-yellow-solid"
        />
      ))}
    </svg>
  );
}

export function Logo({ compact = false, compactBelowLg = false, className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 font-display font-bold tracking-tight text-fg-primary',
        className,
      )}
    >
      <LogoMark />
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
