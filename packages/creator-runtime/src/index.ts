import { defineGame, toError, type GameModule } from '@playnex/game-sdk';

import type { GameDocument } from './document';
import { CreatorSession, type SessionOptions } from './session';

export * from './document';
export {
  InvalidDocumentError,
  loadEngine,
  validateDocument,
  type Diagnostic,
  type DiagnosticKind,
  type DocumentError,
  type FrameInfo,
  type Outcome,
} from './engine';
export { localPoints } from './shapes';
export type { CreatorRun, SessionOptions } from './session';

// Player games are not packages: one module plays any validated document.
export function createCreatorGame(document: GameDocument, options: SessionOptions): GameModule {
  return defineGame({
    manifest: {
      slug: 'creator',
      version: String(document.schemaVersion),
      engine: document.dimension === '2d' ? 'phaser' : 'babylon',
      orientation: 'any',
      controls: ['keyboard', 'touch', 'gamepad'],
      scoring: 'high-score',
      modes: ['solo'],
    },
    async mount(container, host) {
      try {
        const session = await CreatorSession.mount(container, host, document, options);
        host.onStateChange('ready');
        return {
          start: () => void session.start().catch((error: unknown) => host.onError(toError(error))),
          pause: () => session.pause(),
          resume: () => session.resume(),
          restart: () =>
            void session.start().catch((error: unknown) => host.onError(toError(error))),
          destroy: () => session.destroy(),
        };
      } catch (error) {
        const failure = toError(error);
        host.onError(failure);
        throw failure;
      }
    },
  });
}
export { buildPrimitive } from './primitives3d';
