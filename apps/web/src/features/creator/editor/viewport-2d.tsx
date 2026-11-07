'use client';

import { type Entity, type GameDocument, localPoints } from '@playnex/creator-runtime';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { Selection } from './state';

interface Viewport2dProps {
  document: GameDocument;
  selection: Selection;
  swatches: readonly string[];
  snap: boolean;
  label: string;
  onSelect: (selection: Selection) => void;
  onEdit: (change: (document: GameDocument) => void, key: string) => void;
}

type Drag =
  | { mode: 'move'; id: number; offset: { x: number; y: number } }
  | { mode: 'resize'; id: number }
  | { mode: 'rotate'; id: number };

const SNAP = 0.25;
const HANDLE = 0.35;
const MIN_SIZE = 0.1;

const snapTo = (value: number, on: boolean) =>
  on ? Math.round(value / SNAP) * SNAP : Math.round(value * 100) / 100;

function points(entity: Entity): string {
  const hw = entity.size.x / 2;
  const hh = entity.size.y / 2;
  return localPoints(entity.shape)
    .map(([u, v]) => `${u * hw},${-v * hh}`)
    .join(' ');
}

// The SVG works in world units with y pointing down, so every y crossing the
// boundary is negated: the engine's y axis points up.
export function Viewport2d({
  document,
  selection,
  swatches,
  snap,
  label,
  onSelect,
  onEdit,
}: Viewport2dProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { x: width, y: height } = document.world.size;
  const pad = 1;
  const background = swatches[document.world.background];

  const toWorld = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: -point.y };
  };

  const startMove = (event: ReactPointerEvent, entity: Entity) => {
    event.stopPropagation();
    onSelect({ list: 'entities', id: entity.id });
    const at = toWorld(event);
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({
      mode: 'move',
      id: entity.id,
      offset: { x: at.x - entity.position.x, y: at.y - entity.position.y },
    });
  };

  const startHandle = (event: ReactPointerEvent, mode: 'resize' | 'rotate', id: number) => {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ mode, id });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const at = toWorld(event);
    const free = event.altKey || !snap;
    onEdit((doc) => {
      const entity = doc.entities.find((e) => e.id === drag.id);
      if (!entity) return;
      if (drag.mode === 'move') {
        entity.position = {
          ...entity.position,
          x: snapTo(at.x - drag.offset.x, !free),
          y: snapTo(at.y - drag.offset.y, !free),
        };
        return;
      }
      const dx = at.x - entity.position.x;
      const dy = at.y - entity.position.y;
      if (drag.mode === 'rotate') {
        const degrees = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
        const rounded = free ? degrees : Math.round(degrees / 15) * 15;
        entity.rotation = ((rounded % 360) + 360) % 360;
        return;
      }
      const angle = ((entity.rotation ?? 0) * Math.PI) / 180;
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      entity.size = {
        ...entity.size,
        x: Math.max(MIN_SIZE, snapTo(Math.abs(localX) * 2, !free)),
        y: Math.max(MIN_SIZE, snapTo(Math.abs(localY) * 2, !free)),
      };
    }, `${drag.mode}-${drag.id}`);
  };

  const endDrag = () => setDrag(null);
  const selected =
    selection?.list === 'entities'
      ? document.entities.find((e) => e.id === selection.id)
      : undefined;

  return (
    <svg
      ref={svgRef}
      role="application"
      aria-label={label}
      viewBox={`${-width / 2 - pad} ${-height / 2 - pad} ${width + pad * 2} ${height + pad * 2}`}
      className="size-full touch-none bg-surface-sunken select-none"
      onPointerDown={() => onSelect(null)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <rect x={-width / 2} y={-height / 2} width={width} height={height} fill={background} />
      <g className="stroke-border-subtle" strokeWidth={0.02}>
        {Array.from({ length: Math.floor(width) + 1 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={-width / 2 + i}
            x2={-width / 2 + i}
            y1={-height / 2}
            y2={height / 2}
          />
        ))}
        {Array.from({ length: Math.floor(height) + 1 }, (_, i) => (
          <line
            key={`h${i}`}
            y1={-height / 2 + i}
            y2={-height / 2 + i}
            x1={-width / 2}
            x2={width / 2}
          />
        ))}
      </g>
      <line
        x1={0}
        x2={0}
        y1={-height / 2}
        y2={height / 2}
        className="stroke-border-strong"
        strokeWidth={0.04}
      />
      <line
        y1={0}
        y2={0}
        x1={-width / 2}
        x2={width / 2}
        className="stroke-border-strong"
        strokeWidth={0.04}
      />

      {document.entities.map((entity) => {
        const transform = `translate(${entity.position.x} ${-entity.position.y}) rotate(${-(entity.rotation ?? 0)})`;
        const fill = swatches[entity.color];
        const faded = entity.visible === false ? 0.35 : 1;
        if (entity.shape.kind === 'text') {
          return (
            <text
              key={entity.id}
              transform={transform}
              fill={fill}
              opacity={faded}
              fontSize={entity.size.y * 0.8}
              textAnchor="middle"
              dominantBaseline="central"
              className="cursor-move stroke-surface-canvas font-display"
              strokeWidth={0.06}
              paintOrder="stroke"
              onPointerDown={(event) => startMove(event, entity)}
            >
              {entity.text ?? entity.name}
            </text>
          );
        }
        return (
          <g
            key={entity.id}
            transform={transform}
            opacity={faded}
            className="cursor-move"
            onPointerDown={(event) => startMove(event, entity)}
          >
            <polygon
              points={points(entity)}
              transform="translate(0.08 0.08)"
              className="fill-surface-canvas"
            />
            <polygon
              points={points(entity)}
              fill={fill}
              className="stroke-surface-canvas"
              strokeWidth={0.05}
              strokeLinejoin="round"
            />
          </g>
        );
      })}

      {selected ? (
        <g
          transform={`translate(${selected.position.x} ${-selected.position.y}) rotate(${-(selected.rotation ?? 0)})`}
        >
          <rect
            x={-selected.size.x / 2}
            y={-selected.size.y / 2}
            width={selected.size.x}
            height={selected.size.y}
            fill="none"
            className="stroke-border-focus"
            strokeWidth={0.05}
            strokeDasharray="0.2 0.12"
          />
          <line
            y1={-selected.size.y / 2}
            y2={-selected.size.y / 2 - 0.8}
            className="stroke-border-focus"
            strokeWidth={0.05}
          />
          <circle
            cy={-selected.size.y / 2 - 0.8}
            r={HANDLE / 1.6}
            className="cursor-grab fill-cyan-solid stroke-surface-canvas"
            strokeWidth={0.05}
            onPointerDown={(event) => startHandle(event, 'rotate', selected.id)}
          />
          {[
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ].map(([sx, sy]) => (
            <rect
              key={`${sx}${sy}`}
              x={(sx! * selected.size.x) / 2 - HANDLE / 2}
              y={(sy! * selected.size.y) / 2 - HANDLE / 2}
              width={HANDLE}
              height={HANDLE}
              className="cursor-nwse-resize fill-cyan-solid stroke-surface-canvas"
              strokeWidth={0.05}
              onPointerDown={(event) => startHandle(event, 'resize', selected.id)}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
