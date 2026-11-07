import { ActionInput, joystickVector, type ActionBinding } from '@playnex/game-kit';

import { ACTIONS, actionBit, type ActionName } from './document';

const bindings: Record<ActionName, ActionBinding> = {
  left: { keys: ['ArrowLeft', 'KeyA'], gamepadButtons: [14] },
  right: { keys: ['ArrowRight', 'KeyD'], gamepadButtons: [15] },
  up: { keys: ['ArrowUp', 'KeyW'], gamepadButtons: [12] },
  down: { keys: ['ArrowDown', 'KeyS'], gamepadButtons: [13] },
  jump: { keys: ['Space'], gamepadButtons: [0] },
  primary: { keys: ['KeyJ', 'KeyZ', 'Enter'], gamepadButtons: [2] },
  secondary: { keys: ['KeyK', 'KeyX'], gamepadButtons: [1] },
};

export interface TouchLabels {
  joystick: string;
  jump: string;
  primary: string;
  secondary: string;
}

export interface SampledInput {
  buttons: number;
  axisX: number;
  axisY: number;
}

const JOYSTICK_RADIUS = 48;

// Keyboard, gamepad and on-screen controls all fold into the engine's
// per-tick input: a button mask plus two signed axes.
export class CreatorInput {
  private readonly keys = new ActionInput<ActionName>(bindings);
  private readonly touchButtons = new Set<ActionName>();
  private stick = { x: 0, y: 0 };
  private readonly overlay: HTMLElement | null;
  private enabled = false;

  constructor(container: HTMLElement, labels: TouchLabels, touch: boolean) {
    this.overlay = touch ? this.buildOverlay(container, labels) : null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.keys.setEnabled(enabled);
    if (!enabled) {
      this.touchButtons.clear();
      this.stick = { x: 0, y: 0 };
    }
    if (this.overlay) this.overlay.hidden = !enabled;
  }

  sample(): SampledInput {
    if (!this.enabled) return { buttons: 0, axisX: 0, axisY: 0 };
    let buttons = 0;
    for (const action of ACTIONS) {
      if (this.keys.isDown(action) || this.touchButtons.has(action)) buttons |= actionBit(action);
    }
    const pad = navigator.getGamepads?.().find((p) => p !== null);
    let x = this.stick.x;
    let y = this.stick.y;
    if (pad && x === 0 && y === 0) {
      const [ax = 0, ay = 0] = pad.axes;
      if (Math.hypot(ax, ay) > 0.2) {
        x = ax;
        y = -ay;
      }
    }
    return { buttons, axisX: toAxis(x), axisY: toAxis(y) };
  }

  destroy(): void {
    this.keys.destroy();
    this.overlay?.remove();
  }

  private buildOverlay(container: HTMLElement, labels: TouchLabels): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className =
      'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-4';
    overlay.hidden = true;

    const stick = document.createElement('div');
    stick.className =
      'pointer-events-auto relative flex size-32 touch-none items-center justify-center rounded-full border-2 border-border-strong bg-surface-overlay';
    stick.setAttribute('role', 'application');
    stick.setAttribute('aria-label', labels.joystick);
    const knob = document.createElement('div');
    knob.className =
      'size-12 rounded-full border-2 border-border-strong bg-brand-solid shadow-sticker';
    stick.append(knob);

    const move = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const vector = joystickVector(
        center,
        { x: event.clientX, y: event.clientY },
        JOYSTICK_RADIUS,
      );
      this.stick = { x: vector.x, y: -vector.y };
      knob.style.transform = `translate(${vector.x * JOYSTICK_RADIUS}px, ${vector.y * JOYSTICK_RADIUS}px)`;
    };
    const release = () => {
      this.stick = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (event) => {
      stick.setPointerCapture(event.pointerId);
      move(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (stick.hasPointerCapture(event.pointerId)) move(event);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    const buttons = document.createElement('div');
    buttons.className = 'pointer-events-auto flex items-end gap-3';
    for (const action of ['secondary', 'primary', 'jump'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        action === 'jump'
          ? 'size-20 touch-none rounded-full border-2 border-border-strong bg-brand-solid text-label-md text-fg-on-brand shadow-sticker'
          : 'size-14 touch-none rounded-full border-2 border-border-strong bg-surface-raised text-label-sm text-fg-primary shadow-sticker';
      button.textContent = labels[action];
      const press = (down: boolean) => (event: PointerEvent) => {
        event.preventDefault();
        if (down) this.touchButtons.add(action);
        else this.touchButtons.delete(action);
      };
      button.addEventListener('pointerdown', press(true));
      button.addEventListener('pointerup', press(false));
      button.addEventListener('pointercancel', press(false));
      button.addEventListener('pointerleave', press(false));
      buttons.append(button);
    }

    overlay.append(stick, buttons);
    container.append(overlay);
    return overlay;
  }
}

function toAxis(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 127);
}
