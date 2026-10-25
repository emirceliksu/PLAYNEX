import { defineGame, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { TriviaGame } from './game';

export default defineGame({
  manifest: {
    slug: 'trivia-battle',
    version: '0.1.0',
    engine: 'dom',
    orientation: 'any',
    controls: ['mouse', 'touch', 'keyboard'],
    scoring: 'high-score',
    modes: ['solo', 'local', 'online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    const game = new TriviaGame(container, host);
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
