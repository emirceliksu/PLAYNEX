export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'walk'
  | 'reload'
  | 'use'
  | 'primary'
  | 'secondary'
  | 'melee'
  | 'grenade'
  | 'smoke'
  | 'lastWeapon'
  | 'buy'
  | 'scoreboard'
  | 'chatAll'
  | 'chatTeam';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  sensitivity: number;
  fov: number;
  quality: Quality;
  invertY: boolean;
  keys: Record<Action, string>;
}

export const defaultKeys: Record<Action, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  crouch: 'ControlLeft',
  walk: 'ShiftLeft',
  reload: 'KeyR',
  use: 'KeyE',
  primary: 'Digit1',
  secondary: 'Digit2',
  melee: 'Digit3',
  grenade: 'Digit4',
  smoke: 'Digit5',
  lastWeapon: 'KeyQ',
  buy: 'KeyB',
  scoreboard: 'Tab',
  chatAll: 'KeyY',
  chatTeam: 'KeyU',
};

export const defaultSettings: Settings = {
  sensitivity: 1,
  fov: 78,
  quality: 'medium',
  invertY: false,
  keys: defaultKeys,
};

const SETTINGS_KEY = 'playnex:siper:settings';

export function readSettings(): Settings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (!stored) return structuredClone(defaultSettings);
    const parsed = JSON.parse(stored) as Partial<Settings>;
    return {
      ...defaultSettings,
      ...parsed,
      keys: { ...defaultKeys, ...parsed.keys },
    };
  } catch {
    return structuredClone(defaultSettings);
  }
}

export function storeSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings simply reset next time.
  }
}

// "KeyW" reads better as "W" in the controls list.
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace('Left', ' L').replace('Right', ' R');
}
