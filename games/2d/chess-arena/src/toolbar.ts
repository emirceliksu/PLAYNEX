const BUTTON =
  'inline-flex h-10 items-center justify-center rounded-md border-2 px-4 font-display text-label-md whitespace-nowrap transition-[background-color,border-color] duration-(--pn-duration-fast) ease-out focus-visible:outline-border-focus disabled:pointer-events-none disabled:opacity-50';
const SECONDARY = `${BUTTON} border-border-strong bg-surface-raised text-fg-primary hover:border-fg-primary`;
const PRIMARY = `${BUTTON} border-transparent bg-brand-solid text-fg-on-brand hover:bg-brand-solid-hover`;

const CONFIRM_MS = 3_000;

export interface ToolbarView {
  visible: boolean;
  status: string;
  canResign: boolean;
  canOfferDraw: boolean;
  answeringDraw: boolean;
}

export interface ToolbarActions {
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
}

// Plain DOM under the board: the actions need real, focusable buttons with
// translated labels, which a canvas cannot offer.
export class Toolbar {
  readonly element: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly resign: HTMLButtonElement;
  private readonly offer: HTMLButtonElement;
  private readonly accept: HTMLButtonElement;
  private readonly decline: HTMLButtonElement;
  private confirmTimer: number | undefined;
  private confirming = false;

  constructor(
    private readonly messages: Record<string, string>,
    actions: ToolbarActions,
  ) {
    this.element = document.createElement('div');
    this.element.className =
      'flex min-h-16 shrink-0 flex-wrap items-center justify-center gap-2 border-t-2 border-border-subtle px-3 py-2';
    this.status = document.createElement('p');
    this.status.className = 'text-body-sm text-fg-secondary';
    this.status.setAttribute('role', 'status');

    this.resign = this.button(SECONDARY, messages.resign ?? '', () => {
      if (this.confirming) {
        this.resetConfirm();
        actions.resign();
        return;
      }
      this.confirming = true;
      this.resign.textContent = messages.confirmResign ?? '';
      this.confirmTimer = window.setTimeout(() => this.resetConfirm(), CONFIRM_MS);
    });
    this.offer = this.button(SECONDARY, messages.offerDraw ?? '', actions.offerDraw);
    this.accept = this.button(PRIMARY, messages.accept ?? '', actions.acceptDraw);
    this.decline = this.button(SECONDARY, messages.decline ?? '', actions.declineDraw);
    this.element.append(this.status, this.offer, this.resign, this.accept, this.decline);
  }

  render(view: ToolbarView): void {
    this.element.hidden = !view.visible;
    this.status.textContent = view.status;
    this.status.hidden = view.status === '';
    this.resign.hidden = !view.canResign || view.answeringDraw;
    this.offer.hidden = !view.canOfferDraw || view.answeringDraw;
    this.accept.hidden = !view.answeringDraw;
    this.decline.hidden = !view.answeringDraw;
  }

  destroy(): void {
    window.clearTimeout(this.confirmTimer);
    this.element.remove();
  }

  private resetConfirm(): void {
    window.clearTimeout(this.confirmTimer);
    this.confirming = false;
    this.resign.textContent = this.messages.resign ?? '';
  }

  private button(className: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}
