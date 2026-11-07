import type { Entity, GameDocument, ShapeKind } from '@playnex/creator-runtime';

export type Selection = { list: 'entities' | 'prefabs'; id: number } | null;

interface Snapshot {
  document: GameDocument;
  title: string;
}

export interface EditorState extends Snapshot {
  selection: Selection;
  past: Snapshot[];
  future: Snapshot[];
  revision: number;
  // Bumped on every document change; autosave compares it with what it last sent.
  version: number;
  lastEdit: { key: string; at: number } | null;
}

export type EditorAction =
  | { type: 'edit'; change: (document: GameDocument) => void; key?: string }
  | { type: 'title'; title: string }
  | { type: 'select'; selection: Selection }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; revision: number };

const HISTORY_LIMIT = 100;
// Drags and typing send a stream of edits; within this window they are one undo step.
const COALESCE_MS = 700;

export function initialEditorState(
  document: GameDocument,
  title: string,
  revision: number,
): EditorState {
  return {
    document,
    title,
    selection: null,
    past: [],
    future: [],
    revision,
    version: 0,
    lastEdit: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'edit': {
      const document = structuredClone(state.document);
      action.change(document);
      const now = Date.now();
      const merge =
        action.key !== undefined &&
        state.lastEdit?.key === action.key &&
        now - state.lastEdit.at < COALESCE_MS;
      return {
        ...state,
        document,
        past: merge ? state.past : [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        version: state.version + 1,
        lastEdit: action.key ? { key: action.key, at: now } : null,
        selection: stillExists(document, state.selection) ? state.selection : null,
      };
    }
    case 'title':
      return {
        ...state,
        title: action.title,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        version: state.version + 1,
        lastEdit: null,
      };
    case 'select':
      return { ...state, selection: action.selection };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        version: state.version + 1,
        lastEdit: null,
        selection: stillExists(previous.document, state.selection) ? state.selection : null,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        ...next,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        version: state.version + 1,
        lastEdit: null,
        selection: stillExists(next.document, state.selection) ? state.selection : null,
      };
    }
    case 'saved':
      return { ...state, revision: action.revision };
  }
}

function snapshot(state: EditorState): Snapshot {
  return { document: state.document, title: state.title };
}

function stillExists(document: GameDocument, selection: Selection): boolean {
  if (!selection) return true;
  return (document[selection.list] ?? []).some((entity) => entity.id === selection.id);
}

export function selectedEntity(state: EditorState): Entity | undefined {
  const selection = state.selection;
  if (!selection) return undefined;
  return (state.document[selection.list] ?? []).find((entity) => entity.id === selection.id);
}

export function findEntity(document: GameDocument, selection: Selection): Entity | undefined {
  if (!selection) return undefined;
  return (document[selection.list] ?? []).find((entity) => entity.id === selection.id);
}

export function nextEntityId(document: GameDocument): number {
  const ids = [...document.entities, ...(document.prefabs ?? [])].map((entity) => entity.id);
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

const defaultSizes: Partial<Record<ShapeKind, { x: number; y: number; z: number }>> = {
  text: { x: 4, y: 1, z: 0.2 },
  ramp: { x: 3, y: 1, z: 2 },
};

export function newEntity(document: GameDocument, kind: ShapeKind, name: string): Entity {
  const flat = document.dimension === '2d';
  const size = defaultSizes[kind] ?? { x: 1, y: 1, z: 1 };
  const shape =
    kind === 'star'
      ? { kind, points: 5 }
      : kind === 'polygon'
        ? {
            kind,
            points: [
              [0, 1],
              [1, -0.2],
              [0.6, -1],
              [-0.6, -1],
              [-1, -0.2],
            ] as [number, number][],
          }
        : { kind };
  return {
    id: nextEntityId(document),
    name,
    shape: shape,
    position: flat ? { x: 0, y: 0 } : { x: 0, y: size.y / 2, z: 0 },
    size: flat ? { x: size.x, y: size.y } : size,
    color: 18,
    body: 'static',
    ...(kind === 'text' ? { text: name } : {}),
  };
}
