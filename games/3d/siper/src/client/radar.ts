import type { GamePalette } from '@playnex/game-sdk';

import { cellHeight } from '../sim/data';
import type { Grid } from '../sim/grid';

const SIZE = 172;
// Pixels per metre on the radar.
const ZOOM = 2.4;
const BLOCKING = 2;

export interface Blip {
  x: number;
  z: number;
  kind: 'mate' | 'enemy' | 'bomb';
}

// A rotating map in the corner, drawn on a 2D canvas: the layout once, the blips per frame.
// Enemies only appear while someone on the team can see them, the same rule as the world.
export class Radar {
  readonly element: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly layout: HTMLCanvasElement;
  private readonly sites: { name: string; x: number; z: number }[] = [];

  constructor(
    private readonly grid: Grid,
    private readonly palette: GamePalette,
    label: string,
  ) {
    this.element = document.createElement('canvas');
    this.element.width = SIZE;
    this.element.height = SIZE;
    this.element.className =
      'absolute left-2 top-20 size-[172px] rounded-full border-2 border-(--pn-shadow-ink) shadow-sticker';
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', label);
    const context = this.element.getContext('2d');
    if (!context) throw new Error('siper: 2d canvas unavailable');
    this.context = context;
    this.layout = this.drawLayout();
  }

  private drawLayout(): HTMLCanvasElement {
    const { grid, palette } = this;
    const canvas = document.createElement('canvas');
    const scale = ZOOM * grid.cell;
    canvas.width = Math.ceil(grid.width * scale);
    canvas.height = Math.ceil(grid.depth * scale);
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    context.fillStyle = palette.surface;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let z = 0; z < grid.depth; z += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const kind = grid.kind(x, z);
        const height = cellHeight(kind);
        if (height >= BLOCKING) context.fillStyle = palette.fgMuted;
        else if (kind === 'A' || kind === 'B') context.fillStyle = palette.reward;
        else if (height > 0) context.fillStyle = palette.accentSoft;
        else continue;
        context.globalAlpha = kind === 'A' || kind === 'B' ? 0.35 : 1;
        context.fillRect(x * scale, z * scale, scale + 0.5, scale + 0.5);
      }
    }
    context.globalAlpha = 1;
    for (const site of ['A', 'B']) {
      let sx = 0;
      let sz = 0;
      let count = 0;
      for (let z = 0; z < grid.depth; z += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          if (grid.kind(x, z) !== site) continue;
          sx += x;
          sz += z;
          count += 1;
        }
      }
      if (count > 0) {
        this.sites.push({
          name: site,
          x: (sx / count + 0.5) * grid.cell,
          z: (sz / count + 0.5) * grid.cell,
        });
      }
    }
    return canvas;
  }

  // The view turns with the player so "up" on the radar is always straight ahead. World +z is
  // forward at yaw 0 and +x is to the right, so the map is mirrored on y and turned by the yaw.
  draw(x: number, z: number, yaw: number, blips: Blip[]): void {
    const { context, palette } = this;
    const half = SIZE / 2;
    context.save();
    context.clearRect(0, 0, SIZE, SIZE);
    context.beginPath();
    context.arc(half, half, half, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = palette.canvas;
    context.fillRect(0, 0, SIZE, SIZE);
    context.translate(half, half);
    context.scale(1, -1);
    context.rotate(yaw);
    context.drawImage(this.layout, -x * ZOOM, -z * ZOOM);
    for (const blip of blips) {
      const bx = (blip.x - x) * ZOOM;
      const bz = (blip.z - z) * ZOOM;
      // The game accent can be the same coral as danger, so teammates use the light ink.
      context.fillStyle =
        blip.kind === 'mate' ? palette.fg : blip.kind === 'enemy' ? palette.danger : palette.reward;
      context.strokeStyle = palette.ink;
      context.lineWidth = 1.5;
      context.beginPath();
      if (blip.kind === 'bomb') context.rect(bx - 4, bz - 4, 8, 8);
      else context.arc(bx, bz, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
    context.fillStyle = palette.ink;
    context.font = 'bold 14px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const site of this.sites) {
      const dx = (site.x - x) * ZOOM;
      const dz = (site.z - z) * ZOOM;
      const sx = half + dx * cos - dz * sin;
      const sy = half - (dx * sin + dz * cos);
      if (Math.hypot(sx - half, sy - half) < half - 8) context.fillText(site.name, sx, sy);
    }
    // The player sits in the middle, pointing up.
    context.fillStyle = palette.fg;
    context.strokeStyle = palette.ink;
    context.beginPath();
    context.moveTo(half, half - 7);
    context.lineTo(half + 5, half + 5);
    context.lineTo(half - 5, half + 5);
    context.closePath();
    context.fill();
    context.stroke();
  }
}
