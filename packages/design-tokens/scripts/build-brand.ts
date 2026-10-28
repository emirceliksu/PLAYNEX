import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { brandMark, dark, oklchToHex, yellow } from '../src/index';

// Generated files are committed: browsers, iOS and mail clients cannot read the token CSS,
// and production images do not carry the rasterizer. Rerun with `make brand` after a change.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const colors = {
  canvas: oklchToHex(dark.surface.canvas),
  tile: oklchToHex(dark.brand.solid),
  ink: oklchToHex(dark.shadow.ink),
  play: oklchToHex(dark.fg.onBrand),
  pixel: oklchToHex(yellow[400]),
};

function markShapes(): string {
  const { shadow, tile, play, pixels } = brandMark;
  return [
    `<rect x="${shadow.x}" y="${shadow.y}" width="${shadow.size}" height="${shadow.size}" rx="${shadow.radius}" fill="${colors.ink}"/>`,
    `<rect x="${tile.x}" y="${tile.y}" width="${tile.size}" height="${tile.size}" rx="${tile.radius}" fill="${colors.tile}" stroke="${colors.ink}" stroke-width="${tile.stroke}"/>`,
    `<path d="${play}" fill="${colors.play}" fill-rule="evenodd"/>`,
    ...pixels.map(
      (pixel) =>
        `<rect x="${pixel.x}" y="${pixel.y}" width="${pixel.size}" height="${pixel.size}" fill="${colors.pixel}"/>`,
    ),
  ].join('');
}

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brandMark.viewBox}">${markShapes()}</svg>\n`;

// Home-screen icons are cropped to a rounded square by the OS, so the mark sits on a full
// canvas-colored field with room around it instead of a transparent background.
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 92 92"><rect x="-14" y="-14" width="92" height="92" fill="${colors.canvas}"/>${markShapes()}</svg>`;

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

const outputs: [string, string | Buffer][] = [
  ['apps/web/src/app/icon.svg', markSvg],
  ['apps/web/src/app/apple-icon.png', png(appIconSvg, 180)],
  // Shown at 48 px in mails; three times that keeps it sharp on high-density screens.
  ['apps/mailer/assets/mark.png', png(markSvg, 144)],
];

for (const [relativePath, contents] of outputs) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  console.log(`wrote ${relativePath}`);
}
