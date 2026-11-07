'use client';

import {
  type Diagnostic,
  type DocumentError,
  type Entity,
  type FunctionDef,
  type GameDocument,
  type Script,
  SHAPES_2D,
  SHAPES_3D,
  type ShapeKind,
  validateDocument,
} from '@playnex/creator-runtime';
import {
  Badge,
  Button,
  cn,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@playnex/ui';
import {
  ArrowLeft,
  Box,
  Circle,
  Cone,
  Cylinder,
  Globe,
  Hexagon,
  Magnet,
  Move3d,
  Play,
  Redo2,
  Rocket,
  Rotate3d,
  Scaling,
  Square,
  Star,
  Triangle,
  TriangleRight,
  Type,
  Undo2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { Link } from '@/i18n/navigation';
import { swatchHex } from '@/lib/creator/swatches';
import { buildGamePalette } from '@/lib/games/palette';

import { saveProject } from '../actions';
import type { Project } from '../types';
import { Inspector } from './inspector';
import { PublishDialog } from './publish-dialog';
import { Settings } from './settings';
import {
  editorReducer,
  findEntity,
  initialEditorState,
  newEntity,
  nextEntityId,
  type Selection,
} from './state';
import { TestPlay } from './test-play';
import { Viewport2d } from './viewport-2d';
import type { GizmoMode } from './viewport-3d';

// Babylon and Blockly touch `window` at import time, so they load in the browser only.
const Viewport3d = dynamic(() => import('./viewport-3d').then((m) => m.Viewport3d), { ssr: false });
const BlockWorkspace = dynamic(
  () => import('../blocks/block-workspace').then((m) => m.BlockWorkspace),
  {
    ssr: false,
  },
);

const shapeIcons: Record<ShapeKind, ReactNode> = {
  rect: <Square aria-hidden />,
  circle: <Circle aria-hidden />,
  triangle: <Triangle aria-hidden />,
  star: <Star aria-hidden />,
  polygon: <Hexagon aria-hidden />,
  text: <Type aria-hidden />,
  box: <Box aria-hidden />,
  sphere: <Globe aria-hidden />,
  cylinder: <Cylinder aria-hidden />,
  cone: <Cone aria-hidden />,
  ramp: <TriangleRight aria-hidden />,
};

const AUTOSAVE_MS = 2000;
const VALIDATE_MS = 600;

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
type Owner = 'stage' | `entities:${number}` | `prefabs:${number}`;
type Tab = 'scene' | 'blocks' | 'settings';

function ownerOf(document: GameDocument, path: string): Owner {
  const match = /^(entities|prefabs)\[(\d+)\]/.exec(path);
  if (!match) return 'stage';
  const list = match[1] as 'entities' | 'prefabs';
  const entity = document[list]?.[Number(match[2])];
  return entity ? `${list}:${entity.id}` : 'stage';
}

function ownerEntity(document: GameDocument, owner: Owner): Entity | undefined {
  if (owner === 'stage') return undefined;
  const [list, id] = owner.split(':') as ['entities' | 'prefabs', string];
  return document[list]?.find((entity) => entity.id === Number(id));
}

interface CreatorEditorProps {
  project: Project;
  locale: 'tr' | 'en';
}

export function CreatorEditor({ project, locale }: CreatorEditorProps) {
  const t = useTranslations('creator.editor');
  const tb = useTranslations('creator.blocks');
  const te = useTranslations('creator.errors');
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initialEditorState(project.document, project.title, project.revision),
  );
  const { document, selection } = state;
  const flat = document.dimension === '2d';
  const [tab, setTab] = useState<Tab>('scene');
  const [owner, setOwner] = useState<Owner>('stage');
  const [blockEpoch, setBlockEpoch] = useState(0);
  const [focusBlock, setFocusBlock] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [gizmo, setGizmo] = useState<GizmoMode>('move');
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [problems, setProblems] = useState<DocumentError[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const savedVersion = useRef(0);
  const revisionRef = useRef(project.revision);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });
  const ink = useMemo(() => buildGamePalette('brand').ink, []);
  // Stable so the block workspace does not rebuild on every render.
  const blockText = useCallback((key: string) => tb(key as Parameters<typeof tb>[0]), [tb]);

  const edit = useCallback(
    (change: (document: GameDocument) => void, key?: string) =>
      dispatch({ type: 'edit', change, key }),
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.version === savedVersion.current) return true;
    setStatus('saving');
    const result = await saveProject(project.id, {
      title: current.title.trim() || project.title,
      document: current.document,
      revision: revisionRef.current,
    });
    if (!result.ok) {
      setStatus(result.error === 'revision_conflict' ? 'conflict' : 'error');
      return false;
    }
    revisionRef.current = result.revision;
    savedVersion.current = current.version;
    dispatch({ type: 'saved', revision: result.revision });
    setStatus(latest.current.version === current.version ? 'saved' : 'dirty');
    return true;
  }, [project.id, project.title]);

  useEffect(() => {
    if (state.version === savedVersion.current || status === 'conflict') return;
    setStatus((previous) => (previous === 'saving' ? previous : 'dirty'));
    const timer = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [state.version, save, status]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.version !== savedVersion.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void validateDocument(document).then((errors) => {
        if (!cancelled) setProblems(errors);
      });
    }, VALIDATE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [document]);

  const historyStep = useCallback((type: 'undo' | 'redo') => {
    dispatch({ type });
    setBlockEpoch((epoch) => epoch + 1);
  }, []);

  const addShape = (kind: ShapeKind) => {
    const count = document.entities.filter((e) => e.shape.kind === kind).length + 1;
    const entity = newEntity(document, kind, `${t(`shapes.${kind}`)} ${count}`);
    edit((d) => d.entities.push(entity));
    dispatch({ type: 'select', selection: { list: 'entities', id: entity.id } });
  };

  const selected = findEntity(document, selection);

  const removeSelected = useCallback(() => {
    const current = latest.current.selection;
    if (!current) return;
    edit((d) => {
      d[current.list] = (d[current.list] ?? []).filter((e) => e.id !== current.id);
    });
  }, [edit]);

  const duplicateSelected = useCallback(() => {
    const current = latest.current.selection;
    const source = findEntity(latest.current.document, current);
    if (!current || !source) return;
    const copy = structuredClone(source);
    copy.id = nextEntityId(latest.current.document);
    copy.position = { ...copy.position, x: copy.position.x + 1 };
    edit((d) => (d[current.list] = [...(d[current.list] ?? []), copy]));
    dispatch({ type: 'select', selection: { list: current.list, id: copy.id } });
  }, [edit]);

  const moveSelected = () => {
    if (!selection || !selected) return;
    const target = selection.list === 'entities' ? 'prefabs' : 'entities';
    edit((d) => {
      d[selection.list] = (d[selection.list] ?? []).filter((e) => e.id !== selected.id);
      d[target] = [...(d[target] ?? []), selected];
    });
    dispatch({ type: 'select', selection: { list: target, id: selected.id } });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest(
        'input, textarea, select, [contenteditable], .blocklyWidgetDiv',
      );
      if (typing || tab === 'blocks' || testing) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        historyStep(event.shiftKey ? 'redo' : 'undo');
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        historyStep('redo');
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && tab === 'scene') {
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, testing, historyStep, duplicateSelected, removeSelected]);

  const showProblem = (problem: DocumentError) => {
    if (problem.block) {
      setOwner(ownerOf(document, problem.path));
      setTab('blocks');
      setFocusBlock(problem.block);
      return;
    }
    const match = /^(entities|prefabs)\[(\d+)\]/.exec(problem.path);
    if (match) {
      const list = match[1] as 'entities' | 'prefabs';
      const entity = document[list]?.[Number(match[2])];
      if (entity) dispatch({ type: 'select', selection: { list, id: entity.id } });
      setTab('scene');
    } else {
      setTab('settings');
    }
  };

  const showDiagnostic = (diagnostic: Diagnostic) => {
    if (!diagnostic.block) return;
    const holder = [
      ...document.entities.map((e) => [`entities:${e.id}`, e] as const),
      ...(document.prefabs ?? []).map((e) => [`prefabs:${e.id}`, e] as const),
    ].find(([, e]) => JSON.stringify(e.scripts ?? []).includes(`"${diagnostic.block}"`));
    setOwner(holder ? holder[0] : 'stage');
    setTab('blocks');
    setFocusBlock(diagnostic.block);
  };

  const ownerScripts: Script[] =
    owner === 'stage' ? (document.scripts ?? []) : (ownerEntity(document, owner)?.scripts ?? []);

  const onBlocksChange = (scripts: Script[], functions: FunctionDef[]) => {
    edit((d) => {
      if (owner === 'stage') {
        d.scripts = scripts;
        d.functions = functions;
        return;
      }
      const entity = ownerEntity(d, owner);
      if (entity) entity.scripts = scripts;
    }, `blocks-${owner}`);
  };

  const statusText = {
    saved: t('status.saved'),
    dirty: t('status.dirty'),
    saving: t('status.saving'),
    error: t('status.error'),
    conflict: t('status.conflict'),
  }[status];

  const issues = problems.length + diagnostics.length;

  return (
    <div className="flex h-dvh flex-col bg-surface-canvas text-fg-primary">
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-border-subtle bg-surface-raised px-3 py-2">
        <IconButton asChild label={t('back')} size="sm" variant="ghost">
          <Link href="/create">
            <ArrowLeft aria-hidden />
          </Link>
        </IconButton>
        <label className="sr-only" htmlFor="project-title">
          {t('title')}
        </label>
        <input
          id="project-title"
          value={state.title}
          maxLength={60}
          className="h-9 max-w-xs min-w-0 flex-1 rounded-md border-2 border-transparent bg-transparent px-2 font-display text-title-sm hover:border-border-strong focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-border-focus"
          onChange={(event) => dispatch({ type: 'title', title: event.target.value })}
        />
        <Badge tone={flat ? 'cyan' : 'pink'}>{flat ? '2D' : '3D'}</Badge>
        <span
          role="status"
          className={cn(
            'text-body-sm',
            status === 'error' || status === 'conflict' ? 'text-coral-text' : 'text-fg-muted',
          )}
        >
          {statusText}
        </span>
        {status === 'conflict' ? (
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            {t('status.reload')}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={t('undo')}
            size="sm"
            variant="ghost"
            disabled={state.past.length === 0}
            onClick={() => historyStep('undo')}
          >
            <Undo2 aria-hidden />
          </IconButton>
          <IconButton
            label={t('redo')}
            size="sm"
            variant="ghost"
            disabled={state.future.length === 0}
            onClick={() => historyStep('redo')}
          >
            <Redo2 aria-hidden />
          </IconButton>
          <Button size="sm" variant="secondary" onClick={() => setTesting(true)}>
            <Play aria-hidden className="size-4" />
            {t('test')}
          </Button>
          <Button size="sm" onClick={() => setPublishing(true)}>
            <Rocket aria-hidden className="size-4" />
            {t('publishButton')}
          </Button>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="scene">{t('tabs.scene')}</TabsTrigger>
          <TabsTrigger value="blocks">
            {t('tabs.blocks')}
            {issues > 0 ? (
              <span className="ml-2 rounded-full bg-coral-soft px-1.5 text-label-sm text-coral-text tabular-nums">
                {issues}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="scene"
          className="mt-2 grid min-h-0 flex-1 grid-cols-[15rem_1fr_20rem] border-t-2 border-border-subtle"
        >
          <aside className="flex min-h-0 flex-col overflow-y-auto border-r-2 border-border-subtle bg-surface-raised">
            <div className="flex flex-col gap-2 p-3">
              <h2 className="text-label-sm text-fg-muted uppercase">{t('library')}</h2>
              <div className="grid grid-cols-3 gap-2">
                {(flat ? SHAPES_2D : SHAPES_3D).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-2 border-border-strong bg-surface-sunken text-label-sm text-fg-secondary transition-transform duration-(--pn-duration-fast) hover:-translate-y-0.5 hover:shadow-sticker focus-visible:outline-2 focus-visible:outline-border-focus motion-reduce:transition-none motion-reduce:hover:translate-y-0 [&_svg]:size-5"
                    onClick={() => addShape(kind)}
                  >
                    {shapeIcons[kind]}
                    {t(`shapes.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
            <ObjectList
              title={t('objects')}
              empty={t('noObjects')}
              entities={document.entities}
              list="entities"
              selection={selection}
              onSelect={(next) => dispatch({ type: 'select', selection: next })}
            />
            <ObjectList
              title={t('prefabs')}
              empty={t('noPrefabs')}
              entities={document.prefabs ?? []}
              list="prefabs"
              selection={selection}
              onSelect={(next) => dispatch({ type: 'select', selection: next })}
            />
          </aside>

          <div className="relative min-h-0">
            <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-lg border-2 border-border-strong bg-surface-raised p-1 shadow-sticker">
              <IconButton
                label={t('snap')}
                size="sm"
                variant={snap ? 'primary' : 'ghost'}
                aria-pressed={snap}
                onClick={() => setSnap(!snap)}
              >
                <Magnet aria-hidden />
              </IconButton>
              {flat
                ? null
                : (
                    [
                      ['move', <Move3d key="move" aria-hidden />],
                      ['rotate', <Rotate3d key="rotate" aria-hidden />],
                      ['scale', <Scaling key="scale" aria-hidden />],
                    ] as const
                  ).map(([mode, icon]) => (
                    <IconButton
                      key={mode}
                      label={t(`gizmo.${mode}`)}
                      size="sm"
                      variant={gizmo === mode ? 'primary' : 'ghost'}
                      aria-pressed={gizmo === mode}
                      onClick={() => setGizmo(mode)}
                    >
                      {icon}
                    </IconButton>
                  ))}
            </div>
            {flat ? (
              <Viewport2d
                document={document}
                selection={selection}
                swatches={swatchHex}
                snap={snap}
                label={t('viewport')}
                onSelect={(next) => dispatch({ type: 'select', selection: next })}
                onEdit={edit}
              />
            ) : (
              <Viewport3d
                document={document}
                selection={selection}
                swatches={swatchHex}
                ink={ink}
                gizmo={gizmo}
                snap={snap}
                label={t('viewport')}
                onSelect={(next) => dispatch({ type: 'select', selection: next })}
                onEdit={(change) => edit(change)}
              />
            )}
            <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-surface-raised px-2 py-1 text-body-sm text-fg-muted">
              {flat ? t('hint2d') : t('hint3d')}
            </p>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l-2 border-border-subtle bg-surface-raised">
            {selected && selection ? (
              <Inspector
                key={`${selection.list}-${selected.id}`}
                entity={selected}
                isPrefab={selection.list === 'prefabs'}
                dimension={document.dimension}
                swatches={swatchHex}
                onChange={(change, key) =>
                  edit((d) => {
                    const entity = findEntity(d, selection);
                    if (entity) change(entity);
                  }, key)
                }
                onDelete={removeSelected}
                onDuplicate={duplicateSelected}
                onMove={moveSelected}
              />
            ) : (
              <p className="p-4 text-body-sm text-fg-muted">{t('nothingSelected')}</p>
            )}
          </aside>
        </TabsContent>

        <TabsContent
          value="blocks"
          className="mt-2 grid min-h-0 flex-1 grid-cols-[15rem_1fr_18rem] border-t-2 border-border-subtle"
        >
          <aside className="min-h-0 overflow-y-auto border-r-2 border-border-subtle bg-surface-raised p-3">
            <h2 className="mb-2 text-label-sm text-fg-muted uppercase">{t('blocksFor')}</h2>
            <ul className="flex flex-col gap-1">
              {(
                [
                  ['stage', t('stageScripts')],
                  ...document.entities.map((e) => [`entities:${e.id}`, e.name] as const),
                  ...(document.prefabs ?? []).map(
                    (e) => [`prefabs:${e.id}`, `${e.name} (${t('prefab')})`] as const,
                  ),
                ] as [Owner, string][]
              ).map(([key, name]) => {
                const count =
                  key === 'stage'
                    ? (document.scripts?.length ?? 0) + (document.functions?.length ?? 0)
                    : (ownerEntity(document, key)?.scripts?.length ?? 0);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-current={owner === key}
                      className={cn(
                        'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-body-sm focus-visible:outline-2 focus-visible:outline-border-focus',
                        owner === key
                          ? 'bg-brand-soft text-brand-soft-text'
                          : 'text-fg-secondary hover:bg-surface-overlay',
                      )}
                      onClick={() => {
                        setOwner(key);
                        setFocusBlock(null);
                      }}
                    >
                      <span className="truncate">{name}</span>
                      {count > 0 ? (
                        <span className="text-fg-muted tabular-nums">{count}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-h-0">
            {tab === 'blocks' ? (
              <BlockWorkspace
                key={`${owner}:${blockEpoch}`}
                locale={locale}
                text={blockText}
                scripts={ownerScripts}
                functions={owner === 'stage' ? (document.functions ?? []) : null}
                focusBlock={focusBlock}
                label={t('blocksArea')}
                onChange={onBlocksChange}
              />
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l-2 border-border-subtle bg-surface-raised p-3">
            <h2 className="mb-2 font-display text-title-sm">{t('problems')}</h2>
            {issues === 0 ? <p className="text-body-sm text-fg-muted">{t('noProblems')}</p> : null}
            <ul className="flex flex-col gap-2">
              {diagnostics.map((diagnostic, index) => (
                <li key={`d${index}`}>
                  <button
                    type="button"
                    className="w-full rounded-md border-2 border-yellow-solid bg-yellow-soft p-2 text-left text-body-sm text-yellow-text focus-visible:outline-2 focus-visible:outline-border-focus"
                    onClick={() => showDiagnostic(diagnostic)}
                  >
                    {t(`diagnostics.${diagnostic.kind}`)}
                  </button>
                </li>
              ))}
              {problems.map((problem, index) => (
                <li key={`p${index}`}>
                  <button
                    type="button"
                    className="w-full rounded-md border-2 border-coral-solid bg-coral-soft p-2 text-left text-body-sm text-coral-text focus-visible:outline-2 focus-visible:outline-border-focus"
                    onClick={() => showProblem(problem)}
                  >
                    {te.has(problem.code as 'generic')
                      ? te(problem.code as 'generic')
                      : te('generic')}
                    <span className="block text-label-sm text-fg-muted">{problem.path}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-body-sm text-fg-muted">{t('blocksHint')}</p>
          </aside>
        </TabsContent>

        <TabsContent
          value="settings"
          className="mt-2 min-h-0 flex-1 overflow-y-auto border-t-2 border-border-subtle"
        >
          <Settings document={document} swatches={swatchHex} onEdit={edit} />
        </TabsContent>
      </Tabs>

      {testing ? (
        <TestPlay
          document={document}
          swatches={swatchHex}
          locale={locale}
          onClose={() => setTesting(false)}
          onDiagnostics={setDiagnostics}
        />
      ) : null}
      <PublishDialog
        projectId={project.id}
        open={publishing}
        beforePublish={save}
        onOpenChange={setPublishing}
        onShowError={showProblem}
      />
    </div>
  );
}

function ObjectList({
  title,
  empty,
  entities,
  list,
  selection,
  onSelect,
}: {
  title: string;
  empty: string;
  entities: Entity[];
  list: 'entities' | 'prefabs';
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-t-2 border-border-subtle p-3">
      <h2 className="text-label-sm text-fg-muted uppercase">{title}</h2>
      {entities.length === 0 ? <p className="text-body-sm text-fg-muted">{empty}</p> : null}
      <ul className="flex flex-col">
        {entities.map((entity) => {
          const active = selection?.list === list && selection.id === entity.id;
          return (
            <li key={entity.id}>
              <button
                type="button"
                aria-pressed={active}
                className={cn(
                  'flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm focus-visible:outline-2 focus-visible:outline-border-focus',
                  active
                    ? 'bg-brand-soft text-brand-soft-text'
                    : 'text-fg-secondary hover:bg-surface-overlay',
                  entity.visible === false && 'opacity-60',
                )}
                onClick={() => onSelect({ list, id: entity.id })}
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-xs border border-border-strong"
                  style={{ backgroundColor: swatchHex[entity.color] }}
                />
                <span className="truncate">{entity.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
