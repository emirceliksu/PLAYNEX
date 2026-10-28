import type { ReactNode } from 'react';

// Templates remount on every navigation, so each page settles into place once, as the design
// direction's page transition describes, while the shell around it stays still.
export default function PlatformTemplate({ children }: { children: ReactNode }) {
  return <div className="motion-safe:animate-rise-in">{children}</div>;
}
