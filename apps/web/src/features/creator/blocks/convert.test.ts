import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CreatorGame, initSync } from '@playnex/creator-engine-wasm';
import type { GameDocument, Script } from '@playnex/creator-runtime';
import { templates } from '@playnex/creator-templates';
import { beforeAll, describe, expect, it } from 'vitest';

import { readWorkspace, toolboxBlock, writeWorkspace } from './convert';
import { specs } from './spec';

beforeAll(() => {
  const wasm = new URL(
    '../../../../../../packages/creator-engine-wasm/pkg/engine_bg.wasm',
    import.meta.url,
  );
  initSync({ module: readFileSync(fileURLToPath(wasm)) });
});

// Runs a game for ten seconds of mashed input and returns the engine's state digest.
function digest(document: GameDocument): string {
  const game = new CreatorGame(JSON.stringify(document));
  const world = game.start(5);
  for (let tick = 1; tick <= 600 && !world.finished(); tick++) {
    world.step(((tick / 20) | 0) % 2 === 0 ? 0b10010 : 0b00001, 0, 0);
  }
  const hash = world.stateHash();
  world.free();
  game.free();
  return hash;
}

function roundTrip(scripts: Script[] | undefined) {
  return readWorkspace(writeWorkspace(scripts ?? [], []));
}

describe('block conversion', () => {
  it('plays every template the same after a trip through the block editor', () => {
    for (const template of templates) {
      const original = template.document;
      const copy = structuredClone(original);
      const stage = readWorkspace(writeWorkspace(copy.scripts ?? [], copy.functions ?? []));
      copy.scripts = stage.scripts;
      copy.functions = stage.functions;
      for (const owner of [...copy.entities, ...(copy.prefabs ?? [])]) {
        owner.scripts = roundTrip(owner.scripts).scripts;
      }
      expect(digest(copy), template.id).toBe(digest(original));
    }
  });

  it('keeps block ids so engine diagnostics can point at them', () => {
    const scripts: Script[] = [
      {
        id: 'hat',
        event: { kind: 'tick' },
        body: [{ id: 'inner', op: 'addScore', amount: { op: 'number', value: 2 } }],
      },
    ];
    const [script] = roundTrip(scripts).scripts;
    expect(script?.id).toBe('hat');
    expect(script?.body[0]?.id).toBe('inner');
  });

  it('builds a toolbox entry for every block', () => {
    for (const spec of specs) {
      expect(toolboxBlock(spec).type).toBe(spec.type);
    }
  });
});
