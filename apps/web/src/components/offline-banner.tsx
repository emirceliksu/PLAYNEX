'use client';

import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

interface OfflineBannerProps {
  title: string;
  description: string;
}

export function OfflineBanner({ title, description }: OfflineBannerProps) {
  // Server snapshot assumes online so the banner never flashes during hydration.
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="flex animate-fade-in items-center gap-3 border-b-2 border-yellow-solid/40 bg-yellow-soft px-4 py-2.5 text-yellow-text md:px-6"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <p className="text-body-sm">
        <span className="font-display font-semibold">{title}</span> {description}
      </p>
    </div>
  );
}
