import type { Entity, GameDocument } from './document';
import type { FrameInfo } from './engine';

// Offsets into the flat entity buffer written by the wasm `entities()` call.
export const F = {
  id: 0,
  archetype: 1,
  color: 2,
  x: 3,
  y: 4,
  z: 5,
  rotation: 6,
  width: 7,
  height: 8,
  depth: 9,
  visible: 10,
} as const;

export interface WorldView {
  entities: Float32Array;
  stride: number;
  frame: FrameInfo;
}

export interface RenderSetup {
  document: GameDocument;
  archetypes: Entity[];
  swatches: string[];
  ink: string;
  fontFamily: string;
  reducedMotion: boolean;
}

export interface Renderer {
  sync(view: WorldView): void;
  destroy(): void;
}

export const UNITS_IN_FOLLOW_VIEW = 24;
