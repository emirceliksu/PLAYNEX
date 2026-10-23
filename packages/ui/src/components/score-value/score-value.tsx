'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';

const COUNT_DURATION_MS = 550;

function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface ScoreValueProps {
  value: number;
  locale?: string;
  // Counts up from the previous value; the first render shows the value immediately.
  animate?: boolean;
  className?: string;
}

export function ScoreValue({
  value,
  locale = 'tr-TR',
  animate = true,
  className,
}: ScoreValueProps) {
  const [displayed, setDisplayed] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;

    if (!animate || from === value || prefersReducedMotion()) {
      setDisplayed(value);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_DURATION_MS, 1);
      setDisplayed(Math.round(from + (value - from) * easeOutQuint(progress)));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value, animate]);

  return (
    <span className={cn('font-display font-bold tabular-nums', className)}>
      {new Intl.NumberFormat(locale).format(displayed)}
    </span>
  );
}
