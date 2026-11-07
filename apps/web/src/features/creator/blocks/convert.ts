import type { Expr, FunctionDef, GameEvent, Script, Stmt } from '@playnex/creator-runtime';

import { type Arg, type BlockSpec, CALL_ARGS, type Shadow, specFor, specs } from './spec';

// Blockly's JSON serialization, the shape `Blockly.serialization.workspaces` reads and writes.
export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, InputState>;
  next?: { block?: BlockState };
}

export interface InputState {
  block?: BlockState;
  shadow?: BlockState;
}

export interface WorkspaceState {
  blocks: { languageVersion: 0; blocks: BlockState[] };
}

type Node = Record<string, unknown>;

const shadowTypes: Record<Shadow, string> = {
  number: 'pn_number',
  text: 'pn_text',
  bool: 'pn_bool',
};

export function readWorkspace(state: WorkspaceState | undefined): {
  scripts: Script[];
  functions: FunctionDef[];
} {
  const scripts: Script[] = [];
  const functions: FunctionDef[] = [];
  for (const top of state?.blocks.blocks ?? []) {
    const spec = specFor(top.type);
    if (spec?.shape === 'event') {
      const node = readNode(top, spec);
      const { body, ...event } = node;
      scripts.push({ id: top.id, event: event as GameEvent, body: body as Stmt[] });
    } else if (spec?.shape === 'function') {
      const { name, params, body } = readNode(top, spec);
      functions.push({ name: name as string, params: params as string[], body: body as Stmt[] });
    }
    // Loose blocks that are not under an event are scratch work and do not run.
  }
  return { scripts, functions };
}

function readNode(state: BlockState, spec: BlockSpec): Node {
  const node: Node = structuredClone(spec.base);
  const fields = state.fields ?? {};
  for (const arg of spec.args) {
    switch (arg.kind) {
      case 'text': {
        const text = fieldText(fields[arg.name]).trim();
        node[arg.prop] = arg.optional && text === '' ? null : text;
        break;
      }
      case 'number':
        node[arg.prop] = Number(fields[arg.name] ?? arg.initial) || 0;
        break;
      case 'dropdown': {
        const value = fieldText(fields[arg.name]);
        node[arg.prop] = arg.options === 'booleans' ? value === 'true' : value;
        break;
      }
      case 'checkbox':
        node[arg.prop] = fields[arg.name] === true || fields[arg.name] === 'TRUE';
        break;
      case 'target': {
        const kind = fieldText(fields.TARGET_KIND) || 'self';
        const name = fieldText(fields.TARGET_NAME).trim();
        node[arg.prop] = kind === 'named' || kind === 'nearest' ? { kind, name } : { kind };
        break;
      }
      case 'value':
        node[arg.prop] = readExpr(state.inputs?.[arg.name], arg);
        break;
      case 'statements':
        node[arg.prop] = readStatements(state.inputs?.[arg.name]?.block);
        break;
      case 'args': {
        const args: Expr[] = [];
        for (let i = 0; i < CALL_ARGS; i++) {
          const input = state.inputs?.[`ARG${i}`];
          args.push(readExpr(input, { kind: 'value', name: '', prop: '', shadow: 'number' }));
        }
        // Inputs left at their default shadow past the last real argument are not arguments.
        while (args.length > 0 && !state.inputs?.[`ARG${args.length - 1}`]?.block) args.pop();
        node.args = args;
        break;
      }
      case 'params':
        node.params = fieldText(fields.PARAMS)
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        break;
    }
  }
  return node;
}

function readExpr(input: InputState | undefined, arg: Extract<Arg, { kind: 'value' }>): Expr {
  const state = input?.block ?? input?.shadow;
  const spec = state ? specFor(state.type) : undefined;
  if (!state || spec?.shape !== 'value') return defaultExpr(arg.shadow, arg.initial);
  return readNode(state, spec) as unknown as Expr;
}

function readStatements(first: BlockState | undefined): Stmt[] {
  const statements: Stmt[] = [];
  for (let state = first; state; state = state.next?.block) {
    const spec = specFor(state.type);
    if (spec?.shape !== 'statement') continue;
    statements.push({ id: state.id, ...readNode(state, spec) } as Stmt);
  }
  return statements;
}

function defaultExpr(shadow: Shadow, initial?: number | string): Expr {
  if (shadow === 'text') return { op: 'text', value: String(initial ?? '') };
  if (shadow === 'bool') return { op: 'bool', value: true };
  return { op: 'number', value: Number(initial ?? 0) };
}

export function writeWorkspace(scripts: Script[], functions: FunctionDef[]): WorkspaceState {
  const blocks: BlockState[] = [];
  for (const script of scripts) {
    const spec = specs.find((s) => s.shape === 'event' && s.base.kind === script.event.kind);
    if (!spec) continue;
    const state = writeNode({ ...script.event, body: script.body }, spec);
    if (script.id) state.id = script.id;
    blocks.push(state);
  }
  for (const fn of functions) {
    const spec = specFor('pn_function');
    if (spec) blocks.push(writeNode({ ...fn }, spec));
  }
  // Positions are not part of the game; the editor tidies the column after loading.
  blocks.forEach((block, index) => {
    block.x = 24;
    block.y = 24 + index * 160;
  });
  return { blocks: { languageVersion: 0, blocks } };
}

function matching(shape: BlockSpec['shape'], node: Node): BlockSpec | undefined {
  return specs.find(
    (spec) =>
      spec.shape === shape &&
      spec.base.op === node.op &&
      Object.entries(spec.base).every(([key, value]) => node[key] === value) &&
      (spec.accepts?.(node) ?? true),
  );
}

function writeNode(node: Node, spec: BlockSpec): BlockState {
  const state: BlockState = { type: spec.type, fields: {}, inputs: {} };
  const fields = state.fields!;
  const inputs = state.inputs!;
  for (const arg of spec.args) {
    switch (arg.kind) {
      case 'text':
        fields[arg.name] = node[arg.prop] ?? '';
        break;
      case 'number':
        fields[arg.name] = node[arg.prop] ?? arg.initial;
        break;
      case 'dropdown':
        fields[arg.name] = String(node[arg.prop]);
        break;
      case 'checkbox':
        fields[arg.name] = node[arg.prop] === true ? 'TRUE' : 'FALSE';
        break;
      case 'target': {
        const target = node[arg.prop] as { kind: string; name?: string } | undefined;
        fields.TARGET_KIND = target?.kind ?? 'self';
        fields.TARGET_NAME = target?.name ?? '';
        break;
      }
      case 'value':
        inputs[arg.name] = writeInput(node[arg.prop] as Expr | undefined, arg.shadow, arg.initial);
        break;
      case 'statements': {
        const first = writeStatements((node[arg.prop] as Stmt[] | undefined) ?? []);
        if (first) inputs[arg.name] = { block: first };
        break;
      }
      case 'args': {
        const args = (node.args as Expr[] | undefined) ?? [];
        // Given arguments are real blocks even when they are plain numbers: only a
        // block in the slot marks it as passed (see the reader above).
        for (let i = 0; i < CALL_ARGS; i++) {
          const given = args[i];
          inputs[`ARG${i}`] = given
            ? { shadow: shadowState('number'), block: writeExpr(given) }
            : { shadow: shadowState('number') };
        }
        break;
      }
      case 'params':
        fields.PARAMS = ((node.params as string[] | undefined) ?? []).join(', ');
        break;
    }
  }
  return state;
}

function writeStatements(statements: Stmt[]): BlockState | undefined {
  let first: BlockState | undefined;
  let last: BlockState | undefined;
  for (const stmt of statements) {
    const spec = matching('statement', stmt as unknown as Node);
    if (!spec) continue;
    const state = writeNode(stmt as unknown as Node, spec);
    if (stmt.id) state.id = stmt.id;
    if (last) last.next = { block: state };
    else first = state;
    last = state;
  }
  return first;
}

function writeExpr(expr: Expr): BlockState | undefined {
  const spec = matching('value', expr);
  return spec ? writeNode(expr, spec) : undefined;
}

function shadowState(shadow: Shadow, value?: number | string | boolean): BlockState {
  const initial = value ?? (shadow === 'bool' ? 'true' : shadow === 'text' ? '' : 0);
  return {
    type: shadowTypes[shadow],
    fields: { VALUE: shadow === 'bool' ? String(initial) : initial },
  };
}

function writeInput(expr: Expr | undefined, shadow: Shadow, initial?: number | string): InputState {
  if (!expr) return { shadow: shadowState(shadow, initial) };
  if (expr.op === 'number' && shadow === 'number')
    return { shadow: shadowState('number', expr.value) };
  if (expr.op === 'text' && shadow === 'text') return { shadow: shadowState('text', expr.value) };
  if (expr.op === 'bool' && shadow === 'bool') return { shadow: shadowState('bool', expr.value) };
  const block = writeExpr(expr);
  return block
    ? { shadow: shadowState(shadow, initial), block }
    : { shadow: shadowState(shadow, initial) };
}

// Toolbox entries carry default shadows so dragged blocks arrive ready to edit.
export function toolboxBlock(spec: BlockSpec): BlockState {
  const node: Node = structuredClone(spec.base);
  for (const arg of spec.args) {
    if (arg.kind === 'text') node[arg.prop] = arg.initial ?? '';
    if (arg.kind === 'number') node[arg.prop] = arg.initial;
    if (arg.kind === 'dropdown') node[arg.prop] = defaultOption(arg.options);
  }
  const state = writeNode(node, spec);
  delete state.id;
  return state;
}

function defaultOption(options: string): string {
  if (options === 'actions') return 'jump';
  if (options === 'axes') return 'x';
  if (options === 'properties') return 'x';
  if (options === 'arithmetic') return 'add';
  if (options === 'comparison') return 'gt';
  if (options === 'logic') return 'and';
  if (options === 'math') return 'abs';
  if (options === 'booleans') return 'true';
  return 'self';
}

function fieldText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
