export interface ActionBinding {
  keys: string[];
  gamepadButtons?: number[];
}

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export function detectSwipe(from: Point, to: Point, threshold = 24): SwipeDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function joystickVector(center: Point, touch: Point, radius: number): Point {
  const x = (touch.x - center.x) / radius;
  const y = (touch.y - center.y) / radius;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

export class ActionInput<Action extends string> {
  private readonly keysDown = new Set<string>();
  private readonly pressed = new Set<Action>();
  private enabled = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const action = this.actionFor(event.code);
    if (!this.enabled || !action) return;
    event.preventDefault();
    if (!event.repeat) this.pressed.add(action);
    this.keysDown.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keysDown.delete(event.code);
  };

  constructor(
    private readonly bindings: Record<Action, ActionBinding>,
    private readonly target: Window = window,
  ) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  // Keys are only captured during play, so menus and the page keep theirs.
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keysDown.clear();
      this.pressed.clear();
    }
  }

  isDown(action: Action): boolean {
    const binding = this.bindings[action];
    if (binding.keys.some((key) => this.keysDown.has(key))) return true;
    const buttons = binding.gamepadButtons;
    if (!buttons) return false;
    return navigator
      .getGamepads()
      .some((pad) => buttons.some((button) => pad?.buttons[button]?.pressed));
  }

  // Each press is reported once, however long the frame took.
  consume(action: Action): boolean {
    return this.pressed.delete(action);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }

  private actionFor(code: string): Action | undefined {
    const actions = Object.keys(this.bindings) as Action[];
    return actions.find((action) => this.bindings[action].keys.includes(code));
  }
}
