export interface TutorialStep {
  text: string;
}

function layer(container: HTMLElement, className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `pointer-events-none absolute inset-0 z-10 flex ${className}`;
  container.append(element);
  return element;
}

// Steps advance when the player does the thing, not on a click: games call `next()` from play.
export class TutorialOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel = document.createElement('p');
  private index = 0;

  constructor(
    container: HTMLElement,
    private readonly steps: TutorialStep[],
    private readonly onDone: () => void,
  ) {
    this.element = layer(container, 'items-end justify-center p-4');
    this.panel.className = 'rounded-md border-2 border-ink bg-surface px-4 py-3 text-sm text-fg';
    this.panel.setAttribute('role', 'status');
    this.element.append(this.panel);
    this.render();
  }

  next(): void {
    this.index += 1;
    if (this.index < this.steps.length) {
      this.render();
      return;
    }
    this.destroy();
    this.onDone();
  }

  destroy(): void {
    this.element.remove();
  }

  private render(): void {
    this.panel.textContent = this.steps[this.index]?.text ?? '';
  }
}

export function countdown(
  container: HTMLElement,
  seconds: number,
  onTick: (remaining: number) => void,
  onDone: () => void,
): () => void {
  const element = layer(container, 'items-center justify-center text-6xl text-fg');
  let remaining = seconds;
  const show = () => {
    element.textContent = String(remaining);
    onTick(remaining);
  };
  show();
  const timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      show();
      return;
    }
    window.clearInterval(timer);
    element.remove();
    onDone();
  }, 1000);
  return () => {
    window.clearInterval(timer);
    element.remove();
  };
}
