import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

const accents = {
  arcade: 'mint',
  puzzle: 'yellow',
  strategy: 'brand',
  party: 'pink',
  racing: 'coral',
  action: 'coral',
  board: 'cyan',
  card: 'brand',
  shooter: 'coral',
  fighting: 'pink',
  sports: 'mint',
  platform: 'cyan',
  word: 'yellow',
  simulation: 'cyan',
};
const minutesByTier = { B: 5, A: 10, S: 15 };
const matureCategories = ['shooter', 'fighting', 'action'];

function ageRating(category) {
  if (matureCategories.includes(category)) return '12+';
  return category === 'strategy' ? '7+' : '3+';
}

function manifestFor(entry) {
  const desktopOnly =
    entry.dimension === '3d' && entry.tier === 'S' && matureCategories.includes(entry.category);
  const manifest = {
    id: `g_${entry.slug.replaceAll('-', '_')}`,
    slug: entry.slug,
    title: entry.title,
    engine: entry.engine,
    dimension: entry.dimension,
    mode: entry.mode,
    category: entry.category,
    status: 'draft',
    accent: accents[entry.category],
    players: entry.players,
    version: '0.1.0',
    releasedAt: `${new Date().toISOString().slice(0, 10)}T09:00:00+03:00`,
    controls: desktopOnly ? ['keyboard', 'mouse'] : ['keyboard', 'touch'],
    ageRating: ageRating(entry.category),
    orientation: entry.dimension === '3d' ? 'landscape' : 'any',
    scoring: entry.netcode === 'none' ? 'high-score' : 'wins',
    estimatedMinutes: minutesByTier[entry.tier],
    setup: { modes: entry.playModes, options: [] },
  };
  return desktopOnly ? { ...manifest, desktopOnly } : manifest;
}

function tsArray(values) {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

const slug = process.argv[2];
if (!slug) {
  console.error('usage: pnpm new-game <slug>');
  process.exit(1);
}

const catalog = JSON.parse(await readFile(path.join(root, 'docs/games/catalog-200.json'), 'utf8'));
const entry = catalog.games.find((game) => game.slug === slug);
if (!entry) {
  console.error(`"${slug}" is not in docs/games/catalog-200.json`);
  process.exit(1);
}

const dir = path.join(root, 'games', entry.dimension, slug);
if (existsSync(path.join(dir, 'game.json'))) {
  console.error(`${dir} already exists`);
  process.exit(1);
}

const manifest = manifestFor(entry);
await mkdir(path.join(dir, 'src'), { recursive: true });
await mkdir(path.join(dir, 'messages'), { recursive: true });

await writeFile(
  path.join(dir, 'package.json'),
  `${JSON.stringify(
    {
      name: `@playnex/game-${slug}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      exports: { '.': './src/index.ts' },
    },
    null,
    2,
  )}\n`,
);
await writeFile(path.join(dir, 'game.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// The English file starts from the Turkish concept; generate.mjs only checks that keys match,
// so the translation is part of taking a game out of draft.
const copy = {
  tagline: entry.concept,
  description: `${entry.concept} ${entry.highlights.join(', ')}.`,
  controls: [],
};
for (const locale of ['tr', 'en']) {
  await writeFile(
    path.join(dir, 'messages', `${locale}.json`),
    `${JSON.stringify({ copy, text: {} }, null, 2)}\n`,
  );
}

const template = await readFile(
  path.join(import.meta.dirname, 'templates', `${entry.engine}.ts.tpl`),
  'utf8',
);
await writeFile(
  path.join(dir, 'src/index.ts'),
  template
    .replaceAll('__SLUG__', slug)
    .replaceAll('__ORIENTATION__', manifest.orientation)
    .replaceAll('__CONTROLS__', tsArray(manifest.controls))
    .replaceAll('__SCORING__', manifest.scoring)
    .replaceAll('__MODES__', tsArray(manifest.setup.modes)),
);

execFileSync('node', [path.join(import.meta.dirname, 'generate.mjs')], { stdio: 'inherit' });
execFileSync('pnpm', ['install'], { cwd: root, stdio: 'inherit' });
console.log(`created ${path.relative(root, dir)} as a draft`);
