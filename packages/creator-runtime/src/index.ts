// The entry stays free of Phaser and Babylon so pages can import types and
// validation on the server; the playable module lives at `./game`.
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
