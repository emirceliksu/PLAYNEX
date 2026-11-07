import { brand, coral, cyan, ink, mint, oklchToHex, pink, yellow } from '@playnex/design-tokens';
import * as Blockly from 'blockly/core';

import { toolboxBlock } from './convert';
import {
  type Arg,
  type BlockSpec,
  CALL_ARGS,
  type Category,
  categories,
  optionValues,
  specs,
} from './spec';

export type BlockText = (key: string) => string;

// Dark steps keep Blockly's white block labels readable on every category.
const categoryColours: Record<Category, string> = {
  events: oklchToHex(yellow[800]),
  control: oklchToHex(coral[700]),
  motion: oklchToHex(cyan[800]),
  looks: oklchToHex(mint[800]),
  world: oklchToHex(brand[600]),
  values: oklchToHex(ink[600]),
  variables: oklchToHex(pink[700]),
  lists: oklchToHex(pink[800]),
  functions: oklchToHex(brand[800]),
};

function argJson(arg: Arg, text: BlockText): object[] {
  switch (arg.kind) {
    case 'text':
      return [{ type: 'field_input', name: arg.name, text: arg.initial ?? '' }];
    case 'number':
      return [{ type: 'field_number', name: arg.name, value: arg.initial }];
    case 'dropdown':
      return [
        {
          type: 'field_dropdown',
          name: arg.name,
          options: optionValues[arg.options].map((value) => [
            text(`options.${arg.options}.${value}`),
            value,
          ]),
        },
      ];
    case 'checkbox':
      return [{ type: 'field_checkbox', name: arg.name, checked: false }];
    case 'target':
      return [
        {
          type: 'field_dropdown',
          name: 'TARGET_KIND',
          options: optionValues.targets.map((value) => [text(`options.targets.${value}`), value]),
        },
        { type: 'field_input', name: 'TARGET_NAME', text: '' },
      ];
    case 'value':
      return [{ type: 'input_value', name: arg.name, ...(arg.check ? { check: arg.check } : {}) }];
    case 'args':
      return Array.from({ length: CALL_ARGS }, (_, i) => ({
        type: 'input_value',
        name: `ARG${i}`,
      }));
    case 'params':
      return [{ type: 'field_input', name: 'PARAMS', text: '' }];
    case 'statements':
      return [];
  }
}

function definition(spec: BlockSpec, text: BlockText): object {
  const json: Record<string, unknown> = {
    type: spec.type,
    style: `${spec.category}_blocks`,
    message0: text(spec.type),
    args0: spec.args.flatMap((arg) => argJson(arg, text)),
    inputsInline: true,
    ...(spec.args.some((arg) => arg.kind === 'target') ? { extensions: [TARGET_EXTENSION] } : {}),
  };
  const statements = spec.args.filter((arg) => arg.kind === 'statements');
  statements.forEach((arg, index) => {
    json[`message${index + 1}`] = arg.label ? `${text(arg.label)} %1` : '%1';
    json[`args${index + 1}`] = [{ type: 'input_statement', name: arg.name }];
  });
  if (spec.shape === 'statement') {
    json.previousStatement = null;
    json.nextStatement = null;
  }
  if (spec.shape === 'value') json.output = spec.output ?? null;
  return json;
}

let registeredLocale: string | null = null;

const TARGET_EXTENSION = 'pn_target_name';

// The name box only means something for "named" and "nearest"; for "myself" and
// "the touched object" it is hidden so the block reads as a sentence.
function registerTargetExtension(): void {
  if (Blockly.Extensions.isRegistered(TARGET_EXTENSION)) return;
  Blockly.Extensions.register(TARGET_EXTENSION, function (this: Blockly.Block) {
    const kind = this.getField('TARGET_KIND');
    const name = this.getField('TARGET_NAME');
    if (!kind || !name) return;
    const sync = (value: string) => name.setVisible(value === 'named' || value === 'nearest');
    sync(String(kind.getValue()));
    kind.setValidator((value: string) => {
      sync(value);
      if (this.rendered) void (this as Blockly.BlockSvg).queueRender();
      return value;
    });
  });
}

// Block labels are part of the definitions, so switching language redefines them.
export function registerBlocks(locale: string, text: BlockText): void {
  if (registeredLocale === locale) return;
  registerTargetExtension();
  Blockly.common.defineBlocksWithJsonArray(specs.map((spec) => definition(spec, text)));
  registeredLocale = locale;
}

export function playnexTheme(): Blockly.Theme {
  const blockStyles: Record<string, Partial<Blockly.Theme.BlockStyle>> = {};
  for (const category of categories) {
    blockStyles[`${category}_blocks`] = {
      colourPrimary: categoryColours[category],
      hat: category === 'events' || category === 'functions' ? 'cap' : '',
    };
  }
  const categoryStyles: Record<string, { colour: string }> = {};
  for (const category of categories)
    categoryStyles[category] = { colour: categoryColours[category] };

  return Blockly.Theme.defineTheme('playnex', {
    name: 'playnex',
    base: Blockly.Themes.Classic,
    blockStyles,
    categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: oklchToHex(ink[900]),
      toolboxBackgroundColour: oklchToHex(ink[950]),
      toolboxForegroundColour: oklchToHex(ink[50]),
      flyoutBackgroundColour: oklchToHex(ink[800]),
      flyoutForegroundColour: oklchToHex(ink[100]),
      flyoutOpacity: 1,
      scrollbarColour: oklchToHex(ink[600]),
      insertionMarkerColour: oklchToHex(cyan[300]),
      insertionMarkerOpacity: 0.5,
      cursorColour: oklchToHex(cyan[300]),
    },
    fontStyle: {
      family: 'var(--font-display-src, "Space Grotesk Variable"), sans-serif',
      weight: '600',
    },
    startHats: true,
  });
}

export function toolbox(
  text: BlockText,
  includeFunctions: boolean,
): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: categories.map((category) => ({
      kind: 'category',
      name: text(`categories.${category}`),
      categorystyle: category,
      contents: specs
        .filter((spec) => spec.category === category)
        .filter((spec) => includeFunctions || spec.type !== 'pn_function')
        .map((spec) => ({ kind: 'block', ...toolboxBlock(spec) })),
    })),
  };
}
