import type { GameModule } from '@playnex/game-sdk';

import { gameLoaders } from './generated/registry';

export function hasGameModule(slug: string): boolean {
  return slug in gameLoaders;
}

export async function loadGameModule(slug: string): Promise<GameModule> {
  const loader = gameLoaders[slug];
  if (!loader) {
    throw new Error(`No game module registered for "${slug}"`);
  }
  const loaded = await loader();
  return loaded.default;
}
