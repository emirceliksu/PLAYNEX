'use client';

import type { FunctionDef, Script } from '@playnex/creator-runtime';
import { ink, oklchToHex } from '@playnex/design-tokens';
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import * as Tr from 'blockly/msg/tr';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { readWorkspace, type WorkspaceState, writeWorkspace } from './convert';
import { type BlockText, playnexTheme, registerBlocks, toolbox } from './register';

interface BlockWorkspaceProps {
  locale: 'tr' | 'en';
  text: BlockText;
  scripts: Script[];
  functions: FunctionDef[] | null;
  focusBlock: string | null;
  label: string;
  onChange: (scripts: Script[], functions: FunctionDef[]) => void;
}

const CHANGE_DEBOUNCE_MS = 250;

// Mounted once per owner (stage or one object): the parent changes the React key
// when the owner switches or an undo replaces the scripts underneath.
export function BlockWorkspace({
  locale,
  text,
  scripts,
  functions,
  focusBlock,
  label,
  onChange,
}: BlockWorkspaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });
  const initial = useRef({ scripts, functions });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    Blockly.setLocale((locale === 'tr' ? Tr : En) as unknown as Record<string, string>);
    registerBlocks(locale, text);
    const workspace = Blockly.inject(host, {
      renderer: 'zelos',
      theme: playnexTheme(),
      toolbox: toolbox(text, initial.current.functions !== null),
      trashcan: true,
      sounds: false,
      grid: { spacing: 24, length: 2, colour: oklchToHex(ink[800]), snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 1.6, minScale: 0.35 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    workspaceRef.current = workspace;

    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(
        writeWorkspace(initial.current.scripts, initial.current.functions ?? []),
        workspace,
      );
      workspace.cleanUp();
    } finally {
      Blockly.Events.enable();
    }

    let timer = 0;
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const state = Blockly.serialization.workspaces.save(workspace) as WorkspaceState;
        const read = readWorkspace(state);
        onChangeRef.current(read.scripts, read.functions);
      }, CHANGE_DEBOUNCE_MS);
    };
    workspace.addChangeListener(listener);
    const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
    resize.observe(host);

    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [locale, text]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !focusBlock) return;
    const block = workspace.getBlockById(focusBlock);
    if (!block) return;
    workspace.centerOnBlock(focusBlock);
    Blockly.common.setSelected(block);
  }, [focusBlock]);

  return <div ref={hostRef} role="region" aria-label={label} className="size-full" />;
}
