'use client';

import { Button } from '@playnex/ui';
import { useEffect, useState } from 'react';

interface ResendControlProps {
  seconds: number;
  pending: boolean;
  action: () => void;
  label: string;
  countdown: (seconds: number) => string;
}

// Remounted (via key) after every resend, so the countdown restarts from the new cooldown.
export function ResendControl({ seconds, pending, action, label, countdown }: ResendControlProps) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) window.clearInterval(timer);
        return Math.max(0, current - 1);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={left > 0}
        isLoading={pending}
        loadingLabel={label}
      >
        {label}
      </Button>
      {left > 0 ? (
        <span className="text-body-sm text-fg-muted tabular-nums">{countdown(left)}</span>
      ) : null}
    </form>
  );
}
