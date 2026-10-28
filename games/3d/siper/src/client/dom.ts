import { format } from '@playnex/game-sdk';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Writes only when the text changed; the HUD updates every frame.
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function show(node: HTMLElement, visible: boolean): void {
  if (node.hidden === visible) node.hidden = !visible;
}

export type Translate = (key: string, values?: Record<string, string | number>) => string;

// Message files cannot nest with dots inside a game's flat table, so "weapon.rifle" is stored as "weapon_rifle".
export function translator(messages: Record<string, string>): Translate {
  return (key, values) => {
    const flat = key.replaceAll('.', '_');
    return format(messages[flat] ?? flat, values ?? {});
  };
}

export const panel =
  'rounded-xl border-2 border-(--pn-shadow-ink) bg-surface-overlay shadow-sticker';

export function teamText(team: number, teams: boolean): string {
  if (!teams) return 'text-fg-primary';
  return team === 0 ? 'text-coral-text' : 'text-cyan-text';
}
