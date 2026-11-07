import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const keys = ['score', 'timer', 'lives', 'jump', 'primary', 'secondary', 'joystick'] as const;

// The runtime draws its HUD and touch controls itself and reads labels from host.messages.
export function useRuntimeMessages(): Record<string, string> {
  const t = useTranslations('creator.runtime');
  return useMemo(() => Object.fromEntries(keys.map((key) => [key, t(key)])), [t]);
}
