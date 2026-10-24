import type { GameModule } from '@playnex/game-sdk';

// Game bundles (and Phaser) are only downloaded when a game is actually opened.
const loaders: Record<string, () => Promise<{ default: GameModule }>> = {
  'snake-rush': () => import('@playnex/game-snake-rush'),
  '2048-fusion': () => import('@playnex/game-2048-fusion'),
  'memory-flip': () => import('@playnex/game-memory-flip'),
  'tugla-tugla': () => import('@playnex/game-tugla-tugla'),
  'connect-four': () => import('@playnex/game-connect-four'),
};

export function hasGameModule(slug: string): boolean {
  return slug in loaders;
}

export async function loadGameModule(slug: string): Promise<GameModule> {
  const loader = loaders[slug];
  if (!loader) {
    throw new Error(`No game module registered for "${slug}"`);
  }
  const loaded = await loader();
  return loaded.default;
}
