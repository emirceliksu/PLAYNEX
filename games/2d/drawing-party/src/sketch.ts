// Coordinates are normalised to 0..CANVAS_UNITS on both axes so every screen
// size draws and replays the same picture; the server checks the same bounds.
export const CANVAS_UNITS = 1000;
export const BRUSH_SIZES = [5, 12, 28];
const MIN_STEP = 3;
const CHUNK_MS = 60;
const MAX_CHUNK = 48;

export interface Stroke {
  id: number;
  color: number;
  size: number;
  points: [number, number][];
}

export class Sketch {
  readonly element: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private pending: [number, number][] = [];
  private flushTimer: number | undefined;
  private nextId = 1;
  private enabled = false;
  color = 0;
  size = 1;

  constructor(
    private readonly paper: string,
    private readonly colors: string[],
    // Called with the points added since the last call, for relaying online.
    private readonly onChunk: (chunk: Stroke) => void = () => undefined,
  ) {
    this.element = document.createElement('canvas');
    this.element.width = CANVAS_UNITS;
    this.element.height = CANVAS_UNITS;
    this.element.className =
      'block aspect-square w-full touch-none rounded-xl border-2 border-border-strong shadow-sticker';
    const context = this.element.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    this.context = context;
    this.element.addEventListener('pointerdown', (event) => this.down(event));
    this.element.addEventListener('pointermove', (event) => this.move(event));
    this.element.addEventListener('pointerup', () => this.up());
    this.element.addEventListener('pointercancel', () => this.up());
    this.redraw();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.element.style.cursor = enabled ? 'crosshair' : 'default';
    if (!enabled) this.up();
  }

  // A chunk from the network: continues the last stroke when the id matches.
  add(chunk: Stroke): void {
    const last = this.strokes.at(-1);
    if (last?.id === chunk.id) {
      const from = last.points.length - 1;
      last.points.push(...chunk.points);
      this.paint(last, Math.max(0, from));
      return;
    }
    const stroke = { ...chunk, points: [...chunk.points] };
    this.strokes.push(stroke);
    this.paint(stroke, 0);
  }

  load(strokes: Stroke[]): void {
    this.strokes = strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] }));
    this.redraw();
  }

  undo(): void {
    this.strokes.pop();
    this.redraw();
  }

  clear(): void {
    this.strokes = [];
    this.current = null;
    this.redraw();
  }

  destroy(): void {
    window.clearTimeout(this.flushTimer);
    this.element.remove();
  }

  private point(event: PointerEvent): [number, number] {
    const rect = this.element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_UNITS;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_UNITS;
    return [clampUnit(x), clampUnit(y)];
  }

  private down(event: PointerEvent): void {
    if (!this.enabled || event.button > 0) return;
    this.element.setPointerCapture(event.pointerId);
    const point = this.point(event);
    this.current = { id: this.nextId, color: this.color, size: this.size, points: [point] };
    this.nextId += 1;
    this.strokes.push(this.current);
    this.pending = [point];
    this.paint(this.current, 0);
    this.scheduleFlush();
  }

  private move(event: PointerEvent): void {
    const stroke = this.current;
    if (!stroke) return;
    const point = this.point(event);
    const last = stroke.points.at(-1);
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_STEP) return;
    stroke.points.push(point);
    this.pending.push(point);
    this.paint(stroke, stroke.points.length - 2);
    if (this.pending.length >= MAX_CHUNK) this.flush();
  }

  private up(): void {
    if (!this.current) return;
    this.flush();
    this.current = null;
  }

  private scheduleFlush(): void {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => {
      this.flush();
      if (this.current) this.scheduleFlush();
    }, CHUNK_MS);
  }

  private flush(): void {
    const stroke = this.current;
    if (!stroke || this.pending.length === 0) return;
    this.onChunk({ id: stroke.id, color: stroke.color, size: stroke.size, points: this.pending });
    this.pending = [];
  }

  private redraw(): void {
    this.context.fillStyle = this.paper;
    this.context.fillRect(0, 0, CANVAS_UNITS, CANVAS_UNITS);
    for (const stroke of this.strokes) this.paint(stroke, 0);
  }

  // Draws a stroke from point `from` onwards; a single point becomes a dot.
  private paint(stroke: Stroke, from: number): void {
    const context = this.context;
    const color = this.colors[stroke.color] ?? this.paper;
    const width = BRUSH_SIZES[stroke.size] ?? BRUSH_SIZES[1] ?? 12;
    const [first] = stroke.points;
    if (!first) return;
    if (stroke.points.length === 1) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(first[0], first[1], width / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    const start = stroke.points[Math.max(0, from)] ?? first;
    context.moveTo(start[0], start[1]);
    for (let i = Math.max(0, from) + 1; i < stroke.points.length; i += 1) {
      const point = stroke.points[i];
      if (point) context.lineTo(point[0], point[1]);
    }
    context.stroke();
  }
}

function clampUnit(value: number): number {
  return Math.round(Math.min(CANVAS_UNITS, Math.max(0, value)));
}
