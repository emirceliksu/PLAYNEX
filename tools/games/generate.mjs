import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'apps/web/src/lib/games/generated');
const locales = ['tr', 'en'];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function loadGames() {
  const games = [];
  for (const dimension of ['2d', '3d']) {
    const parent = path.join(root, 'games', dimension);
    const slugs = await readdir(parent);
    for (const slug of slugs) {
      const dir = path.join(parent, slug);
      const manifest = await readJson(path.join(dir, 'game.json')).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!manifest) continue;
      if (manifest.slug !== slug) throw new Error(`${dir}: game.json slug is "${manifest.slug}"`);
      if (manifest.dimension !== dimension) throw new Error(`${dir}: game.json dimension mismatch`);

      const messages = {};
      for (const locale of locales) {
        messages[locale] = await readJson(path.join(dir, 'messages', `${locale}.json`));
      }
      assertSameKeys(slug, messages.tr.text ?? {}, messages.en.text ?? {});
      games.push({ manifest, messages });
    }
  }
  return games.sort(
    (a, b) =>
      a.manifest.releasedAt.localeCompare(b.manifest.releasedAt) ||
      a.manifest.slug.localeCompare(b.manifest.slug),
  );
}

function assertSameKeys(slug, tr, en) {
  const missing = [
    ...Object.keys(tr).filter((key) => !(key in en)),
    ...Object.keys(en).filter((key) => !(key in tr)),
  ];
  if (missing.length > 0) {
    throw new Error(`${slug}: text keys differ between locales: ${missing.join(', ')}`);
  }
}

function packageName(slug) {
  return `@playnex/game-${slug}`;
}

function registrySource(games) {
  const entries = games.map(
    ({ manifest }) => `  ${JSON.stringify(manifest.slug)}: () => import('${packageName(manifest.slug)}'),`,
  );
  return [
    "import type { GameModule } from '@playnex/game-sdk';",
    '',
    'export const gameLoaders: Record<string, () => Promise<{ default: GameModule }>> = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

async function writeOutput(games) {
  await rm(outDir, { recursive: true, force: true });
  for (const locale of locales) {
    await mkdir(path.join(outDir, 'text', locale), { recursive: true });
  }

  const listed = games.filter(({ manifest }) => manifest.status !== 'draft');
  const writes = [
    writeFile(path.join(outDir, 'registry.ts'), registrySource(games)),
    writeFile(
      path.join(outDir, 'catalog.json'),
      JSON.stringify(listed.map(({ manifest }) => manifest)),
    ),
    writeFile(
      path.join(outDir, 'packages.json'),
      JSON.stringify(games.map(({ manifest }) => packageName(manifest.slug))),
    ),
  ];
  for (const locale of locales) {
    const copy = Object.fromEntries(
      games.map(({ manifest, messages }) => [manifest.slug, messages[locale].copy]),
    );
    writes.push(writeFile(path.join(outDir, `copy.${locale}.json`), JSON.stringify(copy)));
    for (const { manifest, messages } of games) {
      writes.push(
        writeFile(
          path.join(outDir, 'text', locale, `${manifest.slug}.json`),
          JSON.stringify(messages[locale].text ?? {}),
        ),
      );
    }
  }
  await Promise.all(writes);
}

// apps/web/package.json is committed, so it changes only when the set of games does.
async function syncWebDependencies(games) {
  const file = path.join(root, 'apps/web/package.json');
  const web = await readJson(file);
  const dependencies = Object.fromEntries(
    Object.entries(web.dependencies).filter(
      ([name]) => !name.startsWith('@playnex/game-') || name === '@playnex/game-sdk',
    ),
  );
  for (const { manifest } of games) {
    dependencies[packageName(manifest.slug)] = 'workspace:*';
  }
  const sorted = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  if (JSON.stringify(sorted) === JSON.stringify(web.dependencies)) return;
  await writeFile(file, `${JSON.stringify({ ...web, dependencies: sorted }, null, 2)}\n`);
}

const games = await loadGames();
await writeOutput(games);
await syncWebDependencies(games);
console.log(`generated ${games.length} games`);
