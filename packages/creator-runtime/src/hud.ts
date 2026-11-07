import type { HudAnchor, HudItem } from './document';

const anchorClasses: Record<HudAnchor, string> = {
  topLeft: 'left-3 top-3 items-start',
  topCenter: 'left-1/2 top-3 -translate-x-1/2 items-center',
  topRight: 'right-3 top-3 items-end',
  bottomLeft: 'bottom-3 left-3 items-start',
  bottomCenter: 'bottom-3 left-1/2 -translate-x-1/2 items-center',
  bottomRight: 'bottom-3 right-3 items-end',
};

export interface HudLabels {
  score: string;
  timer: string;
  lives: string;
}

// Values are written with textContent only: labels and variable values come
// from players, so nothing here is ever parsed as markup.
export class Hud {
  private readonly values: HTMLElement[] = [];
  private readonly root: HTMLElement;

  constructor(container: HTMLElement, items: HudItem[], labels: HudLabels) {
    this.root = document.createElement('div');
    this.root.className = 'pointer-events-none absolute inset-0 z-10';
    for (const item of items) {
      const box = document.createElement('div');
      box.className = `absolute flex flex-col rounded-md border-2 border-border-strong bg-surface-raised px-3 py-1.5 shadow-sticker ${anchorClasses[item.anchor]}`;
      const label = document.createElement('span');
      label.className = 'text-label-sm uppercase text-fg-muted';
      label.textContent = item.label ?? defaultLabel(item, labels);
      const value = document.createElement('span');
      value.className = 'text-score-md tabular-nums text-fg-primary';
      value.setAttribute('aria-live', item.kind.type === 'score' ? 'polite' : 'off');
      if (label.textContent) box.append(label);
      box.append(value);
      this.root.append(box);
      this.values.push(value);
    }
    container.append(this.root);
  }

  update(values: string[]): void {
    values.forEach((text, index) => {
      const element = this.values[index];
      if (element && element.textContent !== text) element.textContent = text;
    });
  }

  destroy(): void {
    this.root.remove();
  }
}

function defaultLabel(item: HudItem, labels: HudLabels): string {
  switch (item.kind.type) {
    case 'score':
      return labels.score;
    case 'timer':
      return labels.timer;
    case 'lives':
      return labels.lives;
    case 'variable':
      return item.kind.name;
    case 'text':
      return '';
  }
}
