import Phaser from 'phaser';
import { defineGame, type GameHost, type GameInstance } from '@playnex/game-sdk';
import { bestMove, type Difficulty, type EngineMove } from './engine';
import { ChessScene, LOGICAL_HEIGHT, LOGICAL_WIDTH, type EngineClient } from './scene';
import { Toolbar } from './toolbar';

// The search runs in a worker so the clocks and board stay responsive; where
// workers are unavailable it falls back to the main thread after a frame.
function createEngine(): { client: EngineClient; dispose(): void } {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  let nextId = 0;
  const pending = new Map<number, (move: EngineMove | null) => void>();
  worker?.addEventListener(
    'message',
    (event: MessageEvent<{ id: number; move: EngineMove | null }>) => {
      pending.get(event.data.id)?.(event.data.move);
      pending.delete(event.data.id);
    },
  );

  return {
    client: {
      think(fen: string, difficulty: Difficulty) {
        if (!worker) {
          return new Promise((resolve) =>
            window.setTimeout(() => resolve(bestMove(fen, difficulty)), 16),
          );
        }
        const id = (nextId += 1);
        return new Promise((resolve) => {
          pending.set(id, resolve);
          worker.postMessage({ id, fen, difficulty });
        });
      },
    },
    dispose() {
      worker?.terminate();
      pending.clear();
    },
  };
}

export default defineGame({
  manifest: {
    slug: 'chess-arena',
    version: '0.1.0',
    engine: 'phaser',
    orientation: 'any',
    controls: ['mouse', 'touch'],
    scoring: 'wins',
    modes: ['solo', 'local', 'online'],
  },
  mount(container: HTMLElement, host: GameHost): Promise<GameInstance> {
    return new Promise((resolve, reject) => {
      let game: Phaser.Game;
      const layout = document.createElement('div');
      layout.className = 'absolute inset-0 flex flex-col';
      const stage = document.createElement('div');
      stage.className = 'relative min-h-0 flex-1';
      layout.append(stage);
      container.append(layout);

      const engine = createEngine();
      let scene: ChessScene | null = null;
      const toolbar = new Toolbar(host.messages, {
        resign: () => scene?.resign(),
        offerDraw: () => scene?.offerDraw(),
        acceptDraw: () => scene?.answerDraw(true),
        declineDraw: () => scene?.answerDraw(false),
      });
      layout.append(toolbar.element);

      const cleanup = () => {
        engine.dispose();
        toolbar.destroy();
        layout.remove();
      };

      scene = new ChessScene(host, engine.client, toolbar, {
        ready: () => {
          host.onStateChange('ready');
          resolve({
            start: () => scene?.startRun(),
            pause: () => scene?.pauseRun(),
            resume: () => scene?.resumeRun(),
            restart: () => scene?.restartRun(),
            destroy: () => {
              scene?.teardown();
              game.destroy(true);
              cleanup();
            },
          });
        },
        failed: (error) => {
          host.onError(error);
          game.destroy(true);
          cleanup();
          reject(error);
        },
      });

      try {
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: stage,
          backgroundColor: host.palette.canvas,
          banner: false,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: LOGICAL_WIDTH,
            height: LOGICAL_HEIGHT,
          },
          input: { keyboard: false, touch: true },
          scene,
        });
      } catch (error) {
        const bootError = error instanceof Error ? error : new Error(String(error));
        host.onError(bootError);
        cleanup();
        reject(bootError);
      }
    });
  },
});
