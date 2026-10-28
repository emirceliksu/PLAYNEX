import { defineGame, type GameHost, type GameInstance, toError } from '@playnex/game-sdk';

import { SiperGame } from './client/game';

// Every Siper match runs on the realtime server, bot matches included: the lobby opens a
// private room for those, so the game itself only ever sees an online session.
export default defineGame({
  manifest: {
    slug: 'siper',
    version: '0.1.0',
    engine: 'babylon',
    orientation: 'landscape',
    controls: ['keyboard', 'mouse'],
    scoring: 'high-score',
    modes: ['online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    try {
      const game = new SiperGame(container, host);
      host.onStateChange('ready');
      return Promise.resolve({
        start: () => game.start(),
        pause: () => undefined,
        resume: () => undefined,
        restart: () => undefined,
        destroy: () => game.destroy(),
      });
    } catch (error) {
      const bootError = toError(error);
      host.onError(bootError);
      return Promise.reject(bootError);
    }
  },
});
