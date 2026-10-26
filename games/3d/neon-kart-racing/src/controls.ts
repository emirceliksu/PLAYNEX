import type { KartInput } from './model';

const CAPTURED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
]);
const STICK_DEADZONE = 0.15;

type TouchAction = 'left' | 'right' | 'gas' | 'brake' | 'drift';

const TOUCH_BUTTON =
  'pointer-events-auto grid size-16 touch-none place-items-center rounded-full border-2 border-border-strong bg-surface-overlay/90 font-display text-label-md text-fg-primary select-none data-[held=true]:border-brand-solid data-[held=true]:bg-brand-soft';

// Keyboard, the first gamepad and on-screen buttons all feed the same input.
export class Controls {
  readonly touchLayer: HTMLDivElement;
  private readonly keys = new Set<string>();
  private readonly held = new Set<TouchAction>();
  private active = false;
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.active || !CAPTURED.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  constructor(labels: Record<TouchAction, string>) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.touchLayer = document.createElement('div');
    this.touchLayer.className =
      'pointer-events-none absolute inset-x-0 bottom-0 hidden justify-between gap-4 p-4 [@media(pointer:coarse)]:flex';
    const left = document.createElement('div');
    left.className = 'flex gap-3';
    const right = document.createElement('div');
    right.className = 'flex gap-3';
    left.append(this.button('left', '◀', labels.left), this.button('right', '▶', labels.right));
    right.append(
      this.button('drift', labels.drift, labels.drift),
      this.button('brake', '▼', labels.brake),
      this.button('gas', '▲', labels.gas),
    );
    this.touchLayer.append(left, right);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.keys.clear();
      this.held.clear();
    }
  }

  read(): KartInput {
    const pad = navigator.getGamepads?.()[0] ?? null;
    const key = (...codes: string[]) => codes.some((code) => this.keys.has(code));

    let steer =
      (key('ArrowRight', 'KeyD') || this.held.has('right') ? 1 : 0) -
      (key('ArrowLeft', 'KeyA') || this.held.has('left') ? 1 : 0);
    let throttle =
      (key('ArrowUp', 'KeyW') || this.held.has('gas') ? 1 : 0) -
      (key('ArrowDown', 'KeyS') || this.held.has('brake') ? 1 : 0);
    let drift = key('Space', 'ShiftLeft') || this.held.has('drift');

    if (pad && this.active) {
      const stick = pad.axes[0] ?? 0;
      if (Math.abs(stick) > STICK_DEADZONE) steer = stick;
      const gas = pad.buttons[7]?.value ?? 0;
      const brake = pad.buttons[6]?.value ?? 0;
      if (gas > 0 || brake > 0) throttle = gas - brake;
      drift = drift || pad.buttons[0]?.pressed === true || pad.buttons[5]?.pressed === true;
    }
    if (!this.active) return { steer: 0, throttle: 0, drift: false };
    return { steer, throttle, drift };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.touchLayer.remove();
  }

  private button(action: TouchAction, glyph: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = TOUCH_BUTTON;
    button.textContent = glyph;
    button.setAttribute('aria-label', label);
    const press = (on: boolean) => {
      if (on) this.held.add(action);
      else this.held.delete(action);
      button.dataset.held = String(on);
    };
    button.addEventListener('pointerdown', (event) => {
      button.setPointerCapture(event.pointerId);
      press(true);
    });
    button.addEventListener('pointerup', () => press(false));
    button.addEventListener('pointercancel', () => press(false));
    return button;
  }
}
