import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  breakpoints,
  duration,
  easing,
  fontFamily,
  layout,
  palette,
  radius,
  scaleSteps,
  shadow,
  spacingUnit,
  themes,
  typeScale,
} from '../src/index';
import type { SemanticTheme } from '../src/index';

const PREFIX = '--pn';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const kebab = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

function flattenTheme(theme: SemanticTheme): [string, string][] {
  const entries: [string, string][] = [];
  for (const [group, tokens] of Object.entries(theme)) {
    for (const [name, value] of Object.entries(tokens as Record<string, string>)) {
      entries.push([`${PREFIX}-${kebab(group)}-${kebab(name)}`, value]);
    }
  }
  return entries;
}

function block(selector: string, declarations: [string, string][]): string {
  const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}\n`;
}

function buildTokensCss(): string {
  const primitives: [string, string][] = [];

  for (const [name, scale] of Object.entries(palette)) {
    for (const step of scaleSteps) {
      primitives.push([`${PREFIX}-${name}-${step}`, scale[step]]);
    }
  }
  for (const [name, value] of Object.entries(fontFamily)) {
    primitives.push([`${PREFIX}-font-${name}`, value]);
  }
  for (const [name, value] of Object.entries(radius)) {
    primitives.push([`${PREFIX}-radius-${name}`, value]);
  }
  for (const [name, value] of Object.entries(shadow)) {
    primitives.push([`${PREFIX}-shadow-${name}`, value]);
  }
  for (const [name, value] of Object.entries(duration)) {
    primitives.push([`${PREFIX}-duration-${name}`, value]);
  }
  for (const [name, value] of Object.entries(easing)) {
    primitives.push([`${PREFIX}-ease-${name}`, value]);
  }
  for (const [name, value] of Object.entries(layout)) {
    primitives.push([`${PREFIX}-layout-${kebab(name)}`, value]);
  }

  return [
    '/* Generated from packages/design-tokens/src. Edit the TypeScript sources, not this file. */',
    block(':root', primitives),
    // Dark is the product default, so it is also applied when no data-theme is set.
    block(':root, [data-theme="dark"]', flattenTheme(themes.dark)),
    block('[data-theme="light"]', flattenTheme(themes.light)),
  ].join('\n');
}

function buildThemeCss(): string {
  const resets: [string, string][] = [
    '--color-*',
    '--font-*',
    '--text-*',
    '--shadow-*',
    '--inset-shadow-*',
    '--radius-*',
    '--breakpoint-*',
    '--ease-*',
  ].map((namespace) => [namespace, 'initial']);

  const mapped: [string, string][] = [];

  for (const name of Object.keys(palette)) {
    for (const step of scaleSteps) {
      mapped.push([`--color-${name}-${step}`, `var(${PREFIX}-${name}-${step})`]);
    }
  }
  for (const [name] of flattenTheme(themes.dark)) {
    if (name.startsWith(`${PREFIX}-shadow-`)) continue;
    mapped.push([`--color-${name.slice(PREFIX.length + 1)}`, `var(${name})`]);
  }

  mapped.push(['--font-display', `var(${PREFIX}-font-display)`]);
  mapped.push(['--font-body', `var(${PREFIX}-font-body)`]);
  mapped.push(['--font-sans', `var(${PREFIX}-font-body)`]);
  mapped.push(['--default-font-family', 'var(--font-body)']);

  for (const [name, style] of Object.entries(typeScale)) {
    mapped.push([`--text-${name}`, style.size]);
    mapped.push([`--text-${name}--line-height`, style.lineHeight]);
    mapped.push([`--text-${name}--letter-spacing`, style.letterSpacing]);
    mapped.push([`--text-${name}--font-weight`, String(style.weight)]);
  }

  mapped.push(['--spacing', spacingUnit]);
  for (const name of Object.keys(layout)) {
    mapped.push([`--spacing-${kebab(name)}`, `var(${PREFIX}-layout-${kebab(name)})`]);
  }
  mapped.push(['--container-page', `var(${PREFIX}-layout-page)`]);

  for (const name of Object.keys(radius)) {
    mapped.push([`--radius-${name}`, `var(${PREFIX}-radius-${name})`]);
  }
  for (const name of Object.keys(shadow)) {
    mapped.push([`--shadow-${name}`, `var(${PREFIX}-shadow-${name})`]);
  }
  for (const [name, value] of Object.entries(breakpoints)) {
    mapped.push([`--breakpoint-${name}`, value]);
  }
  for (const name of Object.keys(easing)) {
    mapped.push([`--ease-${name}`, `var(${PREFIX}-ease-${name})`]);
  }

  return [
    '/* Generated from packages/design-tokens/src. Edit the TypeScript sources, not this file. */',
    block('@theme', resets),
    block('@theme inline', mapped),
  ].join('\n');
}

await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outDir, 'tokens.css'), buildTokensCss()),
  writeFile(path.join(outDir, 'theme.css'), buildThemeCss()),
]);
console.log(
  `design-tokens: wrote tokens.css and theme.css to ${path.relative(process.cwd(), outDir)}`,
);
