import type { Game } from '@playnex/shared-types';

import catalog from '../games/generated/catalog.json';

export const games = catalog as Game[];

export const liveGames = games.filter((game) => game.status === 'live');

export const comingSoonGames = games.filter((game) => game.status !== 'live');

export function findGame(slug: string): Game | undefined {
  return games.find((game) => game.slug === slug);
}
