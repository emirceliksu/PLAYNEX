import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CreatorGame, initSync, validate } from '@playnex/creator-engine-wasm';
import { beforeAll, describe, expect, it } from 'vitest';

import { actionBit } from './document';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)));

interface Fixture {
  seed: number;
  holdRightTicks: number;
  document: unknown;
}

beforeAll(() => {
  initSync({ module: read('packages/creator-engine-wasm/pkg/engine_bg.wasm') });
});

describe('creator engine in wasm', () => {
  // Same fixture and expected digest as crates/creator-engine/tests/engine.rs:
  // if this drifts, browser runs no longer replay on the server.
  it('matches the native build bit for bit', () => {
    const fixture = JSON.parse(
      read('crates/creator-engine/tests/fixtures/cross-target.json').toString(),
    ) as Fixture;
    const game = new CreatorGame(JSON.stringify(fixture.document));
    const world = game.start(fixture.seed);
    while (!world.finished()) {
      const held = world.tick() + 1 < fixture.holdRightTicks;
      world.step(held ? actionBit('right') : 0, 0, 0);
    }
    expect(world.tick()).toBe(480);
    expect(world.stateHash()).toBe('780c4795d1d3dc2f');
    world.free();
    game.free();
  });

  it('reports errors with codes the editor can translate', () => {
    const errors = JSON.parse(validate('{"schemaVersion":1}')) as { code: string }[];
    expect(errors[0]?.code).toBe('malformed');
  });
});
