// One table drives the block editor: Blockly definitions, the toolbox and
// both directions of the block <-> document conversion are generated from it,
// so a block cannot exist in the editor without a meaning in the engine.

export type Category =
  | 'events'
  | 'control'
  | 'variables'
  | 'lists'
  | 'motion'
  | 'looks'
  | 'world'
  | 'values'
  | 'functions';

export type OptionSet =
  | 'actions'
  | 'axes'
  | 'properties'
  | 'arithmetic'
  | 'comparison'
  | 'logic'
  | 'math'
  | 'booleans'
  | 'targets';

export type Shadow = 'number' | 'text' | 'bool';

export type Arg =
  | { kind: 'text'; name: string; prop: string; initial?: string; optional?: boolean }
  | { kind: 'number'; name: string; prop: string; initial: number }
  | { kind: 'dropdown'; name: string; prop: string; options: OptionSet }
  | { kind: 'checkbox'; name: string; prop: string }
  | { kind: 'target'; prop: string }
  | {
      kind: 'value';
      name: string;
      prop: string;
      shadow: Shadow;
      initial?: number | string;
      check?: Check;
    }
  | { kind: 'args' }
  | { kind: 'params' }
  | { kind: 'statements'; name: string; prop: string; label?: string };

export type Check = 'Number' | 'Boolean' | 'String';

export interface BlockSpec {
  type: string;
  category: Category;
  shape: 'event' | 'function' | 'statement' | 'value';
  base: Record<string, unknown>;
  args: Arg[];
  output?: Check | null;
  // Several blocks can share an op (binary covers arithmetic, comparison, logic, join).
  accepts?: (node: Record<string, unknown>) => boolean;
}

const n = (name: string, prop: string, initial = 0): Arg => ({
  kind: 'value',
  name,
  prop,
  shadow: 'number',
  initial,
  check: 'Number',
});
const target: Arg = { kind: 'target', prop: 'target' };
const xyz = (z = 0): Arg[] => [n('X', 'x'), n('Y', 'y'), n('Z', 'z', z)];
const body: Arg = { kind: 'statements', name: 'DO', prop: 'body' };
const operatorIn =
  (...operators: string[]) =>
  (node: Record<string, unknown>) =>
    operators.includes(node.operator as string);

export const ARITHMETIC = ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max'];
export const COMPARISON = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'];
export const LOGIC = ['and', 'or'];
export const MATH = ['neg', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'sin', 'cos', 'tan'];

export const specs: BlockSpec[] = [
  {
    type: 'pn_ev_start',
    category: 'events',
    shape: 'event',
    base: { kind: 'start' },
    args: [body],
  },
  { type: 'pn_ev_tick', category: 'events', shape: 'event', base: { kind: 'tick' }, args: [body] },
  {
    type: 'pn_ev_pressed',
    category: 'events',
    shape: 'event',
    base: { kind: 'pressed' },
    args: [{ kind: 'dropdown', name: 'ACTION', prop: 'action', options: 'actions' }, body],
  },
  {
    type: 'pn_ev_released',
    category: 'events',
    shape: 'event',
    base: { kind: 'released' },
    args: [{ kind: 'dropdown', name: 'ACTION', prop: 'action', options: 'actions' }, body],
  },
  {
    type: 'pn_ev_collide',
    category: 'events',
    shape: 'event',
    base: { kind: 'collide' },
    args: [{ kind: 'text', name: 'TAG', prop: 'tag', initial: 'player', optional: true }, body],
  },
  {
    type: 'pn_ev_timer',
    category: 'events',
    shape: 'event',
    base: { kind: 'timer' },
    args: [{ kind: 'number', name: 'SECONDS', prop: 'seconds', initial: 1 }, body],
  },
  {
    type: 'pn_ev_message',
    category: 'events',
    shape: 'event',
    base: { kind: 'message' },
    args: [{ kind: 'text', name: 'NAME', prop: 'name', initial: 'mesaj' }, body],
  },
  {
    type: 'pn_ev_cloned',
    category: 'events',
    shape: 'event',
    base: { kind: 'cloned' },
    args: [body],
  },
  {
    type: 'pn_ev_variable',
    category: 'events',
    shape: 'event',
    base: { kind: 'variableChanged' },
    args: [{ kind: 'text', name: 'NAME', prop: 'name', initial: 'puan' }, body],
  },

  {
    type: 'pn_if',
    category: 'control',
    shape: 'statement',
    base: { op: 'if' },
    args: [
      { kind: 'value', name: 'CONDITION', prop: 'condition', shadow: 'bool', check: 'Boolean' },
      { kind: 'statements', name: 'THEN', prop: 'then' },
    ],
    accepts: (node) => !Array.isArray(node.otherwise) || node.otherwise.length === 0,
  },
  {
    type: 'pn_if_else',
    category: 'control',
    shape: 'statement',
    base: { op: 'if' },
    args: [
      { kind: 'value', name: 'CONDITION', prop: 'condition', shadow: 'bool', check: 'Boolean' },
      { kind: 'statements', name: 'THEN', prop: 'then' },
      { kind: 'statements', name: 'OTHERWISE', prop: 'otherwise', label: 'else' },
    ],
    accepts: (node) => Array.isArray(node.otherwise) && node.otherwise.length > 0,
  },
  {
    type: 'pn_repeat',
    category: 'control',
    shape: 'statement',
    base: { op: 'repeat' },
    args: [n('COUNT', 'count', 10), body],
  },
  {
    type: 'pn_while',
    category: 'control',
    shape: 'statement',
    base: { op: 'while' },
    args: [
      { kind: 'value', name: 'CONDITION', prop: 'condition', shadow: 'bool', check: 'Boolean' },
      body,
    ],
  },
  {
    type: 'pn_forever',
    category: 'control',
    shape: 'statement',
    base: { op: 'forever' },
    args: [body],
  },
  {
    type: 'pn_for_each',
    category: 'control',
    shape: 'statement',
    base: { op: 'forEach' },
    args: [
      { kind: 'text', name: 'VARIABLE', prop: 'variable', initial: 'öge' },
      { kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' },
      body,
    ],
  },
  {
    type: 'pn_wait',
    category: 'control',
    shape: 'statement',
    base: { op: 'wait' },
    args: [n('SECONDS', 'seconds', 1)],
  },
  { type: 'pn_stop', category: 'control', shape: 'statement', base: { op: 'stop' }, args: [] },

  {
    type: 'pn_set',
    category: 'variables',
    shape: 'statement',
    base: { op: 'set' },
    args: [
      { kind: 'text', name: 'VARIABLE', prop: 'variable', initial: 'puan' },
      { kind: 'value', name: 'VALUE', prop: 'value', shadow: 'number' },
    ],
  },
  {
    type: 'pn_change',
    category: 'variables',
    shape: 'statement',
    base: { op: 'change' },
    args: [{ kind: 'text', name: 'VARIABLE', prop: 'variable', initial: 'puan' }, n('BY', 'by', 1)],
  },
  {
    type: 'pn_var',
    category: 'variables',
    shape: 'value',
    output: null,
    base: { op: 'var' },
    args: [{ kind: 'text', name: 'NAME', prop: 'name', initial: 'puan' }],
  },

  {
    type: 'pn_list_add',
    category: 'lists',
    shape: 'statement',
    base: { op: 'listAdd' },
    args: [
      { kind: 'value', name: 'VALUE', prop: 'value', shadow: 'number' },
      { kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' },
    ],
  },
  {
    type: 'pn_list_remove',
    category: 'lists',
    shape: 'statement',
    base: { op: 'listRemove' },
    args: [{ kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' }, n('INDEX', 'index', 1)],
  },
  {
    type: 'pn_list_set',
    category: 'lists',
    shape: 'statement',
    base: { op: 'listSet' },
    args: [
      { kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' },
      n('INDEX', 'index', 1),
      { kind: 'value', name: 'VALUE', prop: 'value', shadow: 'number' },
    ],
  },
  {
    type: 'pn_list_clear',
    category: 'lists',
    shape: 'statement',
    base: { op: 'listClear' },
    args: [{ kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' }],
  },
  {
    type: 'pn_list_item',
    category: 'lists',
    shape: 'value',
    output: null,
    base: { op: 'listItem' },
    args: [{ kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' }, n('INDEX', 'index', 1)],
  },
  {
    type: 'pn_list_length',
    category: 'lists',
    shape: 'value',
    output: 'Number',
    base: { op: 'listLength' },
    args: [{ kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' }],
  },
  {
    type: 'pn_list_contains',
    category: 'lists',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'listContains' },
    args: [
      { kind: 'text', name: 'LIST', prop: 'list', initial: 'liste' },
      { kind: 'value', name: 'VALUE', prop: 'value', shadow: 'number' },
    ],
  },

  {
    type: 'pn_move',
    category: 'motion',
    shape: 'statement',
    base: { op: 'move' },
    args: [target, ...xyz()],
  },
  {
    type: 'pn_set_position',
    category: 'motion',
    shape: 'statement',
    base: { op: 'setPosition' },
    args: [target, ...xyz()],
  },
  {
    type: 'pn_set_velocity',
    category: 'motion',
    shape: 'statement',
    base: { op: 'setVelocity' },
    args: [target, ...xyz()],
  },
  {
    type: 'pn_set_velocity_axis',
    category: 'motion',
    shape: 'statement',
    base: { op: 'setVelocityAxis' },
    args: [
      target,
      { kind: 'dropdown', name: 'AXIS', prop: 'axis', options: 'axes' },
      n('VALUE', 'value', 5),
    ],
  },
  {
    type: 'pn_push',
    category: 'motion',
    shape: 'statement',
    base: { op: 'push' },
    args: [target, ...xyz()],
  },
  {
    type: 'pn_turn',
    category: 'motion',
    shape: 'statement',
    base: { op: 'turn' },
    args: [target, n('DEGREES', 'degrees', 15)],
  },
  {
    type: 'pn_set_rotation',
    category: 'motion',
    shape: 'statement',
    base: { op: 'setRotation' },
    args: [target, n('DEGREES', 'degrees', 0)],
  },
  {
    type: 'pn_glide_to',
    category: 'motion',
    shape: 'statement',
    base: { op: 'glideTo' },
    args: [target, ...xyz(), n('SECONDS', 'seconds', 1)],
  },
  {
    type: 'pn_set_size',
    category: 'looks',
    shape: 'statement',
    base: { op: 'setSize' },
    args: [target, n('X', 'x', 1), n('Y', 'y', 1), n('Z', 'z', 1)],
  },
  { type: 'pn_show', category: 'looks', shape: 'statement', base: { op: 'show' }, args: [target] },
  { type: 'pn_hide', category: 'looks', shape: 'statement', base: { op: 'hide' }, args: [target] },
  {
    type: 'pn_set_color',
    category: 'looks',
    shape: 'statement',
    base: { op: 'setColor' },
    args: [target, n('COLOR', 'color', 0)],
  },
  {
    type: 'pn_set_text',
    category: 'looks',
    shape: 'statement',
    base: { op: 'setText' },
    args: [target, { kind: 'value', name: 'TEXT', prop: 'text', shadow: 'text', initial: '' }],
  },
  {
    type: 'pn_camera_follow',
    category: 'looks',
    shape: 'statement',
    base: { op: 'cameraFollow' },
    args: [target],
  },
  {
    type: 'pn_camera_shake',
    category: 'looks',
    shape: 'statement',
    base: { op: 'cameraShake' },
    args: [n('STRENGTH', 'strength', 2)],
  },

  {
    type: 'pn_spawn',
    category: 'world',
    shape: 'statement',
    base: { op: 'spawn' },
    args: [{ kind: 'text', name: 'PREFAB', prop: 'prefab', initial: 'Kopya' }, ...xyz()],
  },
  {
    type: 'pn_destroy',
    category: 'world',
    shape: 'statement',
    base: { op: 'destroy' },
    args: [target],
  },
  {
    type: 'pn_broadcast',
    category: 'world',
    shape: 'statement',
    base: { op: 'broadcast' },
    args: [{ kind: 'text', name: 'MESSAGE', prop: 'message', initial: 'mesaj' }],
  },
  {
    type: 'pn_play_sound',
    category: 'world',
    shape: 'statement',
    base: { op: 'playSound' },
    args: [{ kind: 'text', name: 'SOUND', prop: 'sound', initial: 'ses' }],
  },
  {
    type: 'pn_add_score',
    category: 'world',
    shape: 'statement',
    base: { op: 'addScore' },
    args: [n('AMOUNT', 'amount', 1)],
  },
  {
    type: 'pn_set_score',
    category: 'world',
    shape: 'statement',
    base: { op: 'setScore' },
    args: [n('VALUE', 'value', 0)],
  },
  {
    type: 'pn_lose_life',
    category: 'world',
    shape: 'statement',
    base: { op: 'loseLife' },
    args: [n('AMOUNT', 'amount', 1)],
  },
  { type: 'pn_win', category: 'world', shape: 'statement', base: { op: 'win' }, args: [] },
  { type: 'pn_lose', category: 'world', shape: 'statement', base: { op: 'lose' }, args: [] },

  {
    type: 'pn_number',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'number' },
    args: [{ kind: 'number', name: 'VALUE', prop: 'value', initial: 0 }],
  },
  {
    type: 'pn_text',
    category: 'values',
    shape: 'value',
    output: 'String',
    base: { op: 'text' },
    args: [{ kind: 'text', name: 'VALUE', prop: 'value', initial: '' }],
  },
  {
    type: 'pn_bool',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'bool' },
    args: [{ kind: 'dropdown', name: 'VALUE', prop: 'value', options: 'booleans' }],
  },
  {
    type: 'pn_arithmetic',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'binary' },
    accepts: operatorIn(...ARITHMETIC),
    args: [
      n('LEFT', 'left', 0),
      { kind: 'dropdown', name: 'OPERATOR', prop: 'operator', options: 'arithmetic' },
      n('RIGHT', 'right', 0),
    ],
  },
  {
    type: 'pn_compare',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'binary' },
    accepts: operatorIn(...COMPARISON),
    args: [
      { kind: 'value', name: 'LEFT', prop: 'left', shadow: 'number' },
      { kind: 'dropdown', name: 'OPERATOR', prop: 'operator', options: 'comparison' },
      { kind: 'value', name: 'RIGHT', prop: 'right', shadow: 'number' },
    ],
  },
  {
    type: 'pn_logic',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'binary' },
    accepts: operatorIn(...LOGIC),
    args: [
      { kind: 'value', name: 'LEFT', prop: 'left', shadow: 'bool', check: 'Boolean' },
      { kind: 'dropdown', name: 'OPERATOR', prop: 'operator', options: 'logic' },
      { kind: 'value', name: 'RIGHT', prop: 'right', shadow: 'bool', check: 'Boolean' },
    ],
  },
  {
    type: 'pn_join',
    category: 'values',
    shape: 'value',
    output: 'String',
    base: { op: 'binary', operator: 'join' },
    accepts: operatorIn('join'),
    args: [
      { kind: 'value', name: 'LEFT', prop: 'left', shadow: 'text', initial: '' },
      { kind: 'value', name: 'RIGHT', prop: 'right', shadow: 'text', initial: '' },
    ],
  },
  {
    type: 'pn_not',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'unary', operator: 'not' },
    accepts: operatorIn('not'),
    args: [{ kind: 'value', name: 'VALUE', prop: 'value', shadow: 'bool', check: 'Boolean' }],
  },
  {
    type: 'pn_math',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'unary' },
    accepts: operatorIn(...MATH),
    args: [
      { kind: 'dropdown', name: 'OPERATOR', prop: 'operator', options: 'math' },
      n('VALUE', 'value', 0),
    ],
  },
  {
    type: 'pn_length',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'unary', operator: 'length' },
    accepts: operatorIn('length'),
    args: [{ kind: 'value', name: 'VALUE', prop: 'value', shadow: 'text', initial: '' }],
  },
  {
    type: 'pn_random',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'random' },
    args: [
      n('MIN', 'min', 1),
      n('MAX', 'max', 10),
      { kind: 'checkbox', name: 'INTEGER', prop: 'integer' },
    ],
  },
  {
    type: 'pn_property',
    category: 'values',
    shape: 'value',
    output: null,
    base: { op: 'property' },
    args: [target, { kind: 'dropdown', name: 'PROPERTY', prop: 'property', options: 'properties' }],
  },
  {
    type: 'pn_held',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'held' },
    args: [{ kind: 'dropdown', name: 'ACTION', prop: 'action', options: 'actions' }],
  },
  {
    type: 'pn_input_axis',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'inputAxis' },
    args: [{ kind: 'dropdown', name: 'AXIS', prop: 'axis', options: 'axes' }],
  },
  {
    type: 'pn_score',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'score' },
    args: [],
  },
  {
    type: 'pn_lives',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'lives' },
    args: [],
  },
  {
    type: 'pn_time',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'time' },
    args: [],
  },
  {
    type: 'pn_distance',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'distance' },
    args: [target],
  },
  {
    type: 'pn_direction_to',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'directionTo' },
    args: [target, { kind: 'dropdown', name: 'AXIS', prop: 'axis', options: 'axes' }],
  },
  {
    type: 'pn_touching',
    category: 'values',
    shape: 'value',
    output: 'Boolean',
    base: { op: 'touching' },
    args: [{ kind: 'text', name: 'TAG', prop: 'tag', initial: 'player' }],
  },
  {
    type: 'pn_count',
    category: 'values',
    shape: 'value',
    output: 'Number',
    base: { op: 'count' },
    args: [{ kind: 'text', name: 'TAG', prop: 'tag', initial: 'düşman' }],
  },

  {
    type: 'pn_function',
    category: 'functions',
    shape: 'function',
    base: {},
    args: [
      { kind: 'text', name: 'NAME', prop: 'name', initial: 'fonksiyon' },
      { kind: 'params' },
      body,
    ],
  },
  {
    type: 'pn_call',
    category: 'functions',
    shape: 'statement',
    base: { op: 'call' },
    args: [
      { kind: 'text', name: 'FUNCTION', prop: 'function', initial: 'fonksiyon' },
      { kind: 'args' },
    ],
  },
  {
    type: 'pn_call_value',
    category: 'functions',
    shape: 'value',
    output: null,
    base: { op: 'call' },
    args: [
      { kind: 'text', name: 'FUNCTION', prop: 'function', initial: 'fonksiyon' },
      { kind: 'args' },
    ],
  },
  {
    type: 'pn_return',
    category: 'functions',
    shape: 'statement',
    base: { op: 'return' },
    args: [{ kind: 'value', name: 'VALUE', prop: 'value', shadow: 'number' }],
  },
];

export const CALL_ARGS = 3;

export const optionValues: Record<OptionSet, string[]> = {
  actions: ['left', 'right', 'up', 'down', 'jump', 'primary', 'secondary'],
  axes: ['x', 'y', 'z'],
  properties: [
    'x',
    'y',
    'z',
    'velocityX',
    'velocityY',
    'velocityZ',
    'rotation',
    'width',
    'height',
    'depth',
    'visible',
    'onGround',
    'color',
    'exists',
  ],
  arithmetic: ARITHMETIC,
  comparison: COMPARISON,
  logic: LOGIC,
  math: MATH,
  booleans: ['true', 'false'],
  targets: ['self', 'other', 'named', 'nearest'],
};

export const categories: Category[] = [
  'events',
  'control',
  'motion',
  'looks',
  'world',
  'values',
  'variables',
  'lists',
  'functions',
];

export function specFor(type: string): BlockSpec | undefined {
  return specs.find((spec) => spec.type === type);
}
