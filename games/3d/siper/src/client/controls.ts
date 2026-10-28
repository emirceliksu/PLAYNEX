import type { Action, Settings } from './settings';

const MOUSE_SCALE = 0.0022;
const PITCH_LIMIT = 1.5;

export interface Presses {
  actions: Action[];
  fire: boolean;
  scope: boolean;
}

// Keyboard state plus pointer-locked mouse look. Typing in chat or a menu
// suspends both; the HUD decides when that is.
export class Controls {
  yaw = 0;
  pitch = 0;
  firing = false;
  private readonly held = new Set<string>();
  private queued: Presses = { actions: [], fire: false, scope: false };
  private captured = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private settings: Settings,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('pointerlockchange', this.lockChanged);
    document.addEventListener('mousemove', this.mouseMove);
    canvas.addEventListener('mousedown', this.mouseDown);
    window.addEventListener('mouseup', this.mouseUp);
    canvas.addEventListener('contextmenu', this.preventMenu);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    if (this.locked) return;
    // Some browsers reject the promise when called too soon after an unlock.
    const request = this.canvas.requestPointerLock() as Promise<void> | undefined;
    void request?.catch(() => undefined);
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  setCaptured(captured: boolean): void {
    this.captured = captured;
    if (!captured) this.releaseAll();
  }

  update(settings: Settings): void {
    this.settings = settings;
  }

  pressed(action: Action): boolean {
    return this.captured && this.held.has(this.settings.keys[action]);
  }

  axis(positive: Action, negative: Action): number {
    return Number(this.pressed(positive)) - Number(this.pressed(negative));
  }

  // Actions pressed since the last call, in order.
  take(): Presses {
    const presses = this.queued;
    this.queued = { actions: [], fire: false, scope: false };
    return presses;
  }

  destroy(): void {
    this.unlock();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('pointerlockchange', this.lockChanged);
    document.removeEventListener('mousemove', this.mouseMove);
    this.canvas.removeEventListener('mousedown', this.mouseDown);
    window.removeEventListener('mouseup', this.mouseUp);
    this.canvas.removeEventListener('contextmenu', this.preventMenu);
  }

  private actionFor(code: string): Action | undefined {
    return (Object.keys(this.settings.keys) as Action[]).find(
      (action) => this.settings.keys[action] === code,
    );
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    if (!this.captured) return;
    const action = this.actionFor(event.code);
    if (!action) return;
    // Tab and Ctrl combinations would otherwise move focus or open browser shortcuts.
    event.preventDefault();
    if (!event.repeat) this.queued.actions.push(action);
    this.held.add(event.code);
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly releaseAll = () => {
    this.held.clear();
    this.firing = false;
  };

  private readonly lockChanged = () => {
    if (!this.locked) this.firing = false;
    this.onLockChange(this.locked);
  };

  private readonly mouseMove = (event: MouseEvent) => {
    if (!this.locked || !this.captured) return;
    const scale = MOUSE_SCALE * this.settings.sensitivity;
    this.yaw += event.movementX * scale;
    this.pitch += event.movementY * scale * (this.settings.invertY ? -1 : 1);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  };

  private readonly mouseDown = (event: MouseEvent) => {
    if (!this.locked) {
      this.lock();
      return;
    }
    if (!this.captured) return;
    if (event.button === 0) {
      this.firing = true;
      this.queued.fire = true;
    } else if (event.button === 2) {
      this.queued.scope = true;
    }
  };

  private readonly mouseUp = (event: MouseEvent) => {
    if (event.button === 0) this.firing = false;
  };

  private readonly preventMenu = (event: Event) => event.preventDefault();
}
