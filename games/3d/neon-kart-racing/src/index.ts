import { defineGame, toError, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { Race } from './race';

export default defineGame({
  manifest: {
    slug: 'neon-kart-racing',
    version: '0.1.0',
    engine: 'babylon',
    orientation: 'landscape',
    controls: ['keyboard', 'gamepad', 'touch'],
    scoring: 'fastest-time',
    modes: ['solo', 'online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    try {
      const race = new Race(container, host);
      host.onStateChange('ready');
      return Promise.resolve({
        start: () => race.start(),
        pause: () => race.pause(),
        resume: () => race.resume(),
        restart: () => race.restart(),
        destroy: () => race.destroy(),
      });
    } catch (error) {
      const bootError = toError(error);
      host.onError(bootError);
      return Promise.reject(bootError);
    }
  },
});
