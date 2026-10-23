import Phaser from 'phaser';
import { defineGame, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { LOGICAL_SIZE, SnakeScene } from './scene';

export default defineGame({
  manifest: {
    slug: 'snake-rush',
    version: '0.1.0',
    engine: 'phaser',
    orientation: 'any',
    controls: ['keyboard', 'touch'],
    scoring: 'high-score',
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    return new Promise((resolve, reject) => {
      let game: Phaser.Game;
      const scene = new SnakeScene(host, {
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
            width: LOGICAL_SIZE,
            height: LOGICAL_SIZE,
          },
          input: { keyboard: true, touch: true },
          scene,
        });
      } catch (error) {
        const bootError = error instanceof Error ? error : new Error(String(error));
        host.onError(bootError);
        reject(bootError);
      }
    });
  },
});
