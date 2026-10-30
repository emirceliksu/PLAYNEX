import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { defineGame, toError, type GameHost, type GameInstance } from '@playnex/game-sdk';

export default defineGame({
  manifest: {
    slug: '__SLUG__',
    version: '0.1.0',
    engine: 'babylon',
    orientation: '__ORIENTATION__',
    controls: __CONTROLS__,
    scoring: '__SCORING__',
    modes: __MODES__,
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    try {
      const canvas = document.createElement('canvas');
      container.append(canvas);
      const engine = new Engine(canvas, true);
      const scene = new Scene(engine);
      host.onStateChange('ready');
      return Promise.resolve({
        start: () => host.onStateChange('playing'),
        pause: () => host.onStateChange('paused'),
        resume: () => host.onStateChange('playing'),
        restart: () => host.onStateChange('playing'),
        destroy: () => {
          scene.dispose();
          engine.dispose();
          canvas.remove();
        },
      });
    } catch (error) {
      const bootError = toError(error);
      host.onError(bootError);
      return Promise.reject(bootError);
    }
  },
});
