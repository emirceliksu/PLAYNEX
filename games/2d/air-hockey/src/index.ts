import Phaser from 'phaser';
import { defineGame, toError, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { AirHockeyScene, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './scene';

export default defineGame({
  manifest: {
    slug: 'air-hockey',
    version: '0.1.0',
    engine: 'phaser',
    orientation: 'portrait',
    controls: ['mouse', 'touch', 'keyboard'],
    scoring: 'wins',
    modes: ['solo', 'local', 'online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    return new Promise((resolve, reject) => {
      let game: Phaser.Game;
      const scene = new AirHockeyScene(host, {
        ready: () => {
          host.onStateChange('ready');
          resolve({
            start: () => scene.startRun(),
            pause: () => scene.pauseRun(),
            resume: () => scene.resumeRun(),
            restart: () => scene.restartRun(),
            destroy: () => {
              scene.teardown();
              game.destroy(true);
            },
          });
        },
        failed: (error) => {
          host.onError(error);
          game.destroy(true);
          reject(error);
        },
      });

      try {
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: container,
          backgroundColor: host.palette.canvas,
          banner: false,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: LOGICAL_WIDTH,
            height: LOGICAL_HEIGHT,
          },
          input: { keyboard: true, touch: true },
          scene,
        });
      } catch (error) {
        const bootError = toError(error);
        host.onError(bootError);
        reject(bootError);
      }
    });
  },
});
