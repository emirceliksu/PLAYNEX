import { type AudioBus, type AudioVolumes, storeVolumes } from '@playnex/game-sdk';

import { grenades, rules, weapons } from '../sim/data';
import { el, panel, setText, show, teamText, type Translate } from './dom';
import {
  type Action,
  defaultSettings,
  keyLabel,
  type Quality,
  type Settings,
  storeSettings,
} from './settings';

const button =
  'pointer-events-auto rounded-lg border-2 border-(--pn-shadow-ink) bg-surface-raised px-3 py-2 text-left text-label-md shadow-sticker transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0';

export interface BoardRow {
  name: string;
  team: number;
  bot: boolean;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  ping: number;
  level: number;
  me: boolean;
}

export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLParagraphElement;
  private readonly columns: HTMLDivElement;
  private last = '';

  constructor(
    container: HTMLElement,
    private readonly t: Translate,
  ) {
    this.root = el(
      'div',
      `absolute left-1/2 top-[10%] w-[min(760px,94vw)] -translate-x-1/2 ${panel} p-4`,
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('scoreboard'));
    this.title = el('p', 'mb-3 font-display text-title-md');
    this.columns = el('div', 'grid gap-4 md:grid-cols-2');
    this.root.append(this.title, this.columns);
    this.root.hidden = true;
    container.append(this.root);
  }

  render(
    visible: boolean,
    title: string,
    rows: BoardRow[],
    teams: boolean,
    gunGame: boolean,
  ): void {
    show(this.root, visible);
    if (!visible) return;
    const key = JSON.stringify([title, rows, teams]);
    if (key === this.last) return;
    this.last = key;
    setText(this.title, title);
    this.columns.replaceChildren();
    this.columns.className = teams ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4';
    const groups = teams ? [0, 1] : [-1];
    for (const team of groups) {
      const table = el('table', 'w-full text-body-sm tabular-nums');
      const head = el('tr', 'text-label-sm text-fg-muted');
      const label =
        team === -1 ? this.t('players') : this.t(team === 0 ? 'teamAttackers' : 'teamDefenders');
      head.append(
        el('th', `py-1 text-left ${teamText(team, teams)}`, label),
        el('th', 'w-10 text-right', gunGame ? this.t('levelShort') : 'K'),
        el('th', 'w-10 text-right', 'D'),
        el('th', 'w-10 text-right', 'A'),
        el('th', 'w-12 text-right', this.t('pingShort')),
      );
      const caption = el('thead');
      caption.append(head);
      const body = el('tbody');
      rows
        .filter((row) => team === -1 || row.team === team)
        .sort((a, b) => (gunGame ? b.level - a.level : 0) || b.score - a.score || b.kills - a.kills)
        .forEach((row) => {
          const tr = el(
            'tr',
            `border-t border-border-subtle ${row.me ? 'bg-yellow-soft' : ''} ${row.alive ? '' : 'text-fg-muted'}`,
          );
          const name = el('td', 'max-w-40 truncate py-1 font-semibold', row.name);
          if (row.bot)
            name.append(
              el('span', 'ml-1 text-label-sm font-normal text-fg-muted', this.t('botTag')),
            );
          tr.append(
            name,
            el('td', 'text-right', String(gunGame ? row.level + 1 : row.kills)),
            el('td', 'text-right', String(row.deaths)),
            el('td', 'text-right', String(row.assists)),
            el('td', 'text-right', row.bot ? '—' : String(row.ping)),
          );
          body.append(tr);
        });
      table.append(caption, body);
      this.columns.append(table);
    }
  }
}

export interface BuyState {
  money: number;
  canBuy: boolean;
  owned: Set<string>;
  armor: number;
  helmet: boolean;
  team: number;
}

const BUY_GROUPS: [string, string[]][] = [
  ['buySecondary', weapons.filter((w) => w.slot === 'secondary').map((w) => w.id)],
  ['buyPrimary', weapons.filter((w) => w.slot === 'primary').map((w) => w.id)],
  ['buyGear', ['armor', 'armorHelmet', ...grenades.map((g) => g.id)]],
];

export function priceOf(item: string): number {
  if (item === 'armor') return rules.economy.armor;
  if (item === 'armorHelmet') return rules.economy.armorHelmet;
  return (
    weapons.find((w) => w.id === item)?.price ?? grenades.find((g) => g.id === item)?.price ?? 0
  );
}

export class BuyMenu {
  private readonly root: HTMLDivElement;
  private readonly money: HTMLParagraphElement;
  private readonly hint: HTMLParagraphElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  open = false;

  constructor(
    container: HTMLElement,
    private readonly t: Translate,
    onBuy: (item: string) => void,
    onClose: () => void,
  ) {
    this.root = el(
      'div',
      `pointer-events-auto absolute left-1/2 top-1/2 w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 ${panel} p-4`,
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('buyTitle'));
    const header = el('div', 'mb-3 flex items-center justify-between gap-3');
    header.append(el('p', 'font-display text-title-lg', t('buyTitle')));
    this.money = el('p', 'font-display text-title-md tabular-nums text-mint-text');
    header.append(this.money);
    const grid = el('div', 'grid gap-3 md:grid-cols-3');
    for (const [label, items] of BUY_GROUPS) {
      const column = el('div', 'flex flex-col gap-2');
      column.append(el('p', 'text-label-sm uppercase text-fg-muted', t(label)));
      for (const item of items) {
        const node = el('button', `${button} flex items-center justify-between gap-2`);
        node.type = 'button';
        node.append(
          el('span', '', t(`weapon.${item}`)),
          el('span', 'tabular-nums text-fg-muted', t('moneyValue', { n: priceOf(item) })),
        );
        node.addEventListener('click', () => onBuy(item));
        this.buttons.set(item, node);
        column.append(node);
      }
      grid.append(column);
    }
    this.hint = el('p', 'mt-3 text-body-sm text-fg-muted');
    const close = el('button', `${button} mt-3 w-full text-center`, t('close'));
    close.type = 'button';
    close.addEventListener('click', onClose);
    this.root.append(header, grid, this.hint, close);
    this.root.hidden = true;
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') onClose();
    });
    container.append(this.root);
  }

  render(state: BuyState): void {
    show(this.root, this.open);
    if (!this.open) return;
    setText(this.money, this.t('moneyValue', { n: state.money }));
    setText(this.hint, state.canBuy ? this.t('buyOpen') : this.t('buyClosed'));
    for (const [item, node] of this.buttons) {
      const owned =
        state.owned.has(item) ||
        (item === 'armor' && state.armor >= 100) ||
        (item === 'armorHelmet' && state.armor >= 100 && state.helmet);
      node.disabled = !state.canBuy || owned || priceOf(item) > state.money;
      node.setAttribute('aria-pressed', String(owned));
    }
  }

  focusFirst(): void {
    [...this.buttons.values()].find((node) => !node.disabled)?.focus();
  }
}

export class VotePanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLParagraphElement;
  private readonly timer: HTMLParagraphElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(
    container: HTMLElement,
    private readonly t: Translate,
    maps: string[],
    onVote: (map: string) => void,
  ) {
    this.root = el(
      'div',
      `pointer-events-auto absolute left-1/2 top-1/2 w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 ${panel} p-5 text-center`,
    );
    this.title = el('p', 'font-display text-display-sm');
    this.timer = el('p', 'mb-4 text-body-sm text-fg-secondary');
    const row = el('div', 'grid gap-2 sm:grid-cols-3');
    for (const map of maps) {
      const node = el('button', `${button} flex flex-col items-center`);
      node.type = 'button';
      node.addEventListener('click', () => onVote(map));
      this.buttons.set(map, node);
      row.append(node);
    }
    this.root.append(this.title, this.timer, row);
    this.root.hidden = true;
    container.append(this.root);
  }

  render(
    visible: boolean,
    title: string,
    secondsLeft: number,
    counts: Record<string, number>,
    mine: string | null,
  ): void {
    show(this.root, visible);
    if (!visible) return;
    setText(this.title, title);
    setText(this.timer, this.t('voteTimer', { n: secondsLeft }));
    for (const [map, node] of this.buttons) {
      node.replaceChildren(
        el('span', 'font-display text-title-md', this.t(`map.${map}`)),
        el('span', 'text-label-sm text-fg-muted', this.t('votes', { n: counts[map] ?? 0 })),
      );
      node.setAttribute('aria-pressed', String(mine === map));
      node.classList.toggle('border-yellow-solid', mine === map);
    }
  }
}

const BINDABLE: Action[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'crouch',
  'walk',
  'reload',
  'use',
  'primary',
  'secondary',
  'melee',
  'grenade',
  'smoke',
  'lastWeapon',
  'buy',
  'scoreboard',
  'chatAll',
  'chatTeam',
];

// The screen shown whenever the mouse is free: a play button, settings and controls.
export class Gate {
  readonly root: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly keys = new Map<Action, HTMLButtonElement>();
  private binding: Action | null = null;

  constructor(
    container: HTMLElement,
    private readonly t: Translate,
    private settings: Settings,
    private volumes: AudioVolumes,
    private readonly handlers: {
      play: () => void;
      settings: (settings: Settings) => void;
      volume: (bus: AudioBus, value: number) => void;
    },
    desktop: boolean,
  ) {
    this.root = el(
      'div',
      'pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-ink-950/70 p-4',
    );
    this.root.dataset.testid = 'siper-gate';
    const card = el('div', `w-[min(640px,96vw)] ${panel} flex flex-col gap-4 p-5`);
    this.root.append(card);
    this.status = el('p', 'font-display text-title-lg');
    card.append(this.status);
    if (!desktop) {
      card.append(el('p', 'text-body-md text-fg-secondary', t('desktopOnly')));
      container.append(this.root);
      return;
    }
    const play = el(
      'button',
      `${button} bg-brand-solid py-3 text-center font-display text-title-sm text-fg-on-brand`,
      t('clickToPlay'),
    );
    play.type = 'button';
    play.addEventListener('click', () => handlers.play());
    card.append(play);

    const form = el('div', 'grid gap-3 sm:grid-cols-2');
    form.append(
      this.slider('sensitivity', 0.2, 4, 0.05, settings.sensitivity, (v) =>
        this.change({ sensitivity: v }),
      ),
      this.slider('fov', 65, 100, 1, settings.fov, (v) => this.change({ fov: v })),
      this.slider('volumeMaster', 0, 1, 0.05, volumes.master, (v) => this.volume('master', v)),
      this.slider('volumeSfx', 0, 1, 0.05, volumes.sfx, (v) => this.volume('sfx', v)),
      this.slider('volumeMusic', 0, 1, 0.05, volumes.music, (v) => this.volume('music', v)),
      this.slider('volumeVoice', 0, 1, 0.05, volumes.voice, (v) => this.volume('voice', v)),
    );
    const quality = el('label', 'flex flex-col gap-1 text-label-sm text-fg-secondary');
    quality.append(el('span', '', t('quality')));
    const select = el(
      'select',
      'rounded-md border-2 border-border-subtle bg-surface-sunken px-2 py-1 text-body-sm text-fg-primary',
    );
    for (const level of ['low', 'medium', 'high'] as Quality[]) {
      const option = el('option', '', t(`quality.${level}`));
      option.value = level;
      option.selected = settings.quality === level;
      select.append(option);
    }
    select.addEventListener('change', () => this.change({ quality: select.value as Quality }));
    quality.append(select, el('span', 'text-label-sm text-fg-muted', t('qualityHint')));
    const invert = el('label', 'flex items-center gap-2 text-label-md');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = settings.invertY;
    box.addEventListener('change', () => this.change({ invertY: box.checked }));
    invert.append(box, el('span', '', t('invertY')));
    form.append(quality, invert);
    card.append(form);

    const details = el('details', 'rounded-lg border-2 border-border-subtle p-3');
    details.append(el('summary', 'cursor-pointer text-label-md', t('controlsTitle')));
    const list = el('div', 'mt-2 grid gap-1.5 sm:grid-cols-2');
    for (const action of BINDABLE) {
      const row = el('div', 'flex items-center justify-between gap-2 text-body-sm');
      row.append(el('span', 'text-fg-secondary', t(`action.${action}`)));
      const key = el('button', `${button} min-w-20 py-1 text-center`);
      key.type = 'button';
      key.addEventListener('click', () => this.startBinding(action));
      this.keys.set(action, key);
      row.append(key);
      list.append(row);
    }
    const reset = el('button', `${button} mt-2 text-center`, t('resetControls'));
    reset.type = 'button';
    reset.addEventListener('click', () => this.change({ keys: { ...defaultSettings.keys } }));
    details.append(list, reset, el('p', 'mt-2 text-label-sm text-fg-muted', t('mouseHint')));
    card.append(details);
    window.addEventListener('keydown', this.captureKey, true);
    this.renderKeys();
    container.append(this.root);
  }

  private slider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (value: number) => void,
  ): HTMLLabelElement {
    const wrap = el('label', 'flex flex-col gap-1 text-label-sm text-fg-secondary');
    const head = el('span', 'flex justify-between');
    const shown = el('span', 'tabular-nums text-fg-primary', this.format(label, value));
    head.append(el('span', '', this.t(label)), shown);
    const input = el('input', 'accent-(--color-brand-solid)');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      setText(shown, this.format(label, next));
      onChange(next);
    });
    wrap.append(head, input);
    return wrap;
  }

  private format(label: string, value: number): string {
    if (label === 'fov') return `${value}°`;
    if (label === 'sensitivity') return value.toFixed(2);
    return `${Math.round(value * 100)}%`;
  }

  private change(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    storeSettings(this.settings);
    this.handlers.settings(this.settings);
    this.renderKeys();
  }

  private volume(bus: AudioBus, value: number): void {
    this.volumes = { ...this.volumes, [bus]: value };
    storeVolumes(this.volumes);
    this.handlers.volume(bus, value);
  }

  private startBinding(action: Action): void {
    this.binding = action;
    this.renderKeys();
  }

  private readonly captureKey = (event: KeyboardEvent) => {
    if (!this.binding || this.root.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    const action = this.binding;
    this.binding = null;
    if (event.code === 'Escape') {
      this.renderKeys();
      return;
    }
    this.change({ keys: { ...this.settings.keys, [action]: event.code } });
  };

  private renderKeys(): void {
    for (const [action, node] of this.keys) {
      setText(
        node,
        this.binding === action ? this.t('pressKey') : keyLabel(this.settings.keys[action]),
      );
    }
  }

  render(visible: boolean, title: string): void {
    show(this.root, visible);
    setText(this.status, title);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.captureKey, true);
  }
}
