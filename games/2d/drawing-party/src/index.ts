import { defineGame, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { DrawingGame } from './game';

export default defineGame({
  manifest: {
    slug: 'drawing-party',
    version: '0.1.0',
    engine: 'dom',
    orientation: 'any',
    controls: ['mouse', 'touch'],
    scoring: 'high-score',
    modes: ['local', 'online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    const game = new DrawingGame(container, host);
    host.onStateChange('ready');
    return Promise.resolve({
      start: () => game.start(),
      pause: () => game.pause(),
      resume: () => game.resume(),
      restart: () => game.restart(),
      destroy: () => game.destroy(),
    });
  },
});
