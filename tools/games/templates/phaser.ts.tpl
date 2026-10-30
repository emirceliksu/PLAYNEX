import Phaser from 'phaser';
import { defineGame, toError, type GameHost, type GameInstance } from '@playnex/game-sdk';

const LOGICAL_SIZE = 720;

class BootScene extends Phaser.Scene {
  constructor(private readonly onReady: () => void) {
    super('boot');
  }

  create() {
    this.onReady();
  }
}

export default defineGame({
  manifest: {
    slug: '__SLUG__',
    version: '0.1.0',
    engine: 'phaser',
    orientation: '__ORIENTATION__',
    controls: __CONTROLS__,
    scoring: '__SCORING__',
    modes: __MODES__,
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    return new Promise((resolve, reject) => {
      let game: Phaser.Game;
      const scene = new BootScene(() => {
        host.onStateChange('ready');
        resolve({
          start: () => host.onStateChange('playing'),
          pause: () => host.onStateChange('paused'),
          resume: () => host.onStateChange('playing'),
          restart: () => host.onStateChange('playing'),
          destroy: () => game.destroy(true),
        });
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
