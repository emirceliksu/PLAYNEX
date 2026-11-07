import init, {
  CreatorGame,
  type CreatorWorld,
  entityStride,
  validate,
} from '@playnex/creator-engine-wasm';

import type { GameDocument } from './document';

export type { CreatorGame, CreatorWorld };

export type Outcome = 'running' | 'won' | 'lost' | 'timeUp';

export type DiagnosticKind =
  'budgetExceeded' | 'recursionTooDeep' | 'stackOverflow' | 'tooManyEntities' | 'listFull';

export interface Diagnostic {
  kind: DiagnosticKind;
  block?: string;
}

export interface DocumentError {
  code: string;
  path: string;
  block?: string;
  detail?: string;
}

export type FrameEvent = { kind: 'sound'; index: number } | { kind: 'shake'; strength: number };

export interface FrameInfo {
  tick: number;
  score: number;
  lives: number | null;
  outcome: Outcome;
  cameraTarget: number | null;
  events: FrameEvent[];
  hud: string[];
  texts: [number, string][];
  diagnostics: Diagnostic[];
}

let ready: Promise<void> | null = null;

// One wasm instance serves every game on the page; init is idempotent.
export function loadEngine(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

export async function validateDocument(document: GameDocument): Promise<DocumentError[]> {
  await loadEngine();
  return JSON.parse(validate(JSON.stringify(document))) as DocumentError[];
}

export async function compileGame(document: GameDocument): Promise<CreatorGame> {
  await loadEngine();
  try {
    return new CreatorGame(JSON.stringify(document));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidDocumentError(JSON.parse(message) as DocumentError[]);
  }
}

export class InvalidDocumentError extends Error {
  constructor(readonly errors: DocumentError[]) {
    super(`game document has ${errors.length} error(s)`);
  }
}

export function readFrame(world: CreatorWorld): FrameInfo {
  return JSON.parse(world.frame()) as FrameInfo;
}

export function stride(): number {
  return entityStride();
}
