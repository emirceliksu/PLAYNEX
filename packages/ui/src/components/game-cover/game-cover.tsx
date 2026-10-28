import type { AccentName } from '@playnex/shared-types';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '../../lib/cn';

// Every cover is drawn from the game's mechanic with flat shapes, ink outlines and a
// hard offset shadow, so the catalog reads as one hand-made set.

const INK = 'var(--cover-ink)';
const ACCENT = 'var(--cover-accent)';
const DEEP = 'var(--cover-deep)';
const PAPER = 'var(--cover-paper)';

const outline = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const };

function Shadow({ children }: { children: ReactNode }) {
  return (
    <g transform="translate(3 3)" fill={INK} stroke="none">
      {children}
    </g>
  );
}

function SnakeRush() {
  const segments: [number, number][] = [
    [28, 52],
    [40, 52],
    [52, 52],
    [52, 40],
    [52, 28],
    [64, 28],
    [76, 28],
    [88, 28],
  ];
  return (
    <>
      <Shadow>
        <g className="attract attract-lunge">
          {segments.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" rx="3" />
          ))}
        </g>
        <circle className="attract attract-bob" cx="118" cy="34" r="7" />
      </Shadow>
      <g className="attract attract-lunge">
        {segments.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="12"
            height="12"
            rx="3"
            fill={index === segments.length - 1 ? DEEP : ACCENT}
            {...outline}
          />
        ))}
        <circle cx="92" cy="32" r="1.6" fill={PAPER} />
        <circle cx="96" cy="32" r="1.6" fill={PAPER} />
      </g>
      <g className="attract attract-bob">
        <circle cx="118" cy="34" r="7" fill="var(--pn-coral-400)" {...outline} />
        <path d="M118 27v-4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M118 24c3-3 6-2 7 0"
          stroke="var(--pn-mint-400)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <path
        className="attract attract-dash"
        d="M22 76h116"
        stroke={INK}
        strokeWidth="2"
        strokeDasharray="4 6"
        strokeLinecap="round"
        opacity="0.5"
      />
    </>
  );
}

function MemoryFlip() {
  return (
    <>
      <Shadow>
        <rect x="24" y="22" width="34" height="46" rx="5" transform="rotate(-6 41 45)" />
        <rect className="attract attract-flip" x="63" y="24" width="34" height="46" rx="5" />
        <rect x="102" y="22" width="34" height="46" rx="5" transform="rotate(6 119 45)" />
      </Shadow>
      <g transform="rotate(-6 41 45)">
        <rect x="24" y="22" width="34" height="46" rx="5" fill={DEEP} {...outline} />
        <circle cx="41" cy="45" r="5" fill={ACCENT} {...outline} />
      </g>
      <g className="attract attract-flip">
        <rect x="63" y="24" width="34" height="46" rx="5" fill={PAPER} {...outline} />
        <path
          d="M80 32l4 8 9 1-6.5 6 2 9-8.5-4.5-8.5 4.5 2-9-6.5-6 9-1z"
          fill={ACCENT}
          {...outline}
        />
      </g>
      <g transform="rotate(6 119 45)">
        <rect x="102" y="22" width="34" height="46" rx="5" fill={DEEP} {...outline} />
        <circle cx="119" cy="45" r="5" fill={ACCENT} {...outline} />
      </g>
    </>
  );
}

function Fusion2048() {
  return (
    <>
      <g opacity="0.35" stroke={INK} strokeWidth="1.5" fill="none">
        {[20, 50, 80, 110].map((x) => (
          <rect key={x} x={x} y="20" width="30" height="30" rx="4" />
        ))}
        {[20, 50, 80, 110].map((x) => (
          <rect key={x} x={x} y="50" width="30" height="30" rx="4" />
        ))}
      </g>
      <Shadow>
        <rect className="attract attract-merge" x="26" y="26" width="24" height="24" rx="4" />
        <rect x="56" y="26" width="24" height="24" rx="4" />
        <rect className="attract attract-pop" x="88" y="44" width="38" height="38" rx="6" />
      </Shadow>
      <g fill={INK} fontFamily="var(--pn-font-display)" fontWeight="700" textAnchor="middle">
        <rect x="56" y="26" width="24" height="24" rx="4" fill={ACCENT} {...outline} />
        <text x="68" y="43" fontSize="14">
          2
        </text>
        <g className="attract attract-merge">
          <rect x="26" y="26" width="24" height="24" rx="4" fill={ACCENT} {...outline} />
          <text x="38" y="43" fontSize="14">
            2
          </text>
        </g>
        <g className="attract attract-pop">
          <rect x="88" y="44" width="38" height="38" rx="6" fill={DEEP} {...outline} />
          <text x="107" y="70" fontSize="20" fill={PAPER}>
            4
          </text>
        </g>
      </g>
      <path d="M62 60l18 4" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      <path d="M58 68l14 8" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function TuglaTugla() {
  const cell = 11;
  const filled: [number, number][] = [
    [0, 5],
    [1, 5],
    [2, 5],
    [4, 5],
    [5, 5],
    [6, 5],
    [7, 5],
    [0, 4],
    [1, 4],
    [5, 4],
    [6, 4],
  ];
  const originX = 36;
  const originY = 16;
  return (
    <>
      <rect
        x={originX - 3}
        y={originY - 3}
        width={cell * 8 + 6}
        height={cell * 6 + 6}
        rx="5"
        fill={DEEP}
        opacity="0.35"
        {...outline}
      />
      {filled.map(([col, row]) => (
        <rect
          key={`${col}-${row}`}
          x={originX + col * cell}
          y={originY + row * cell}
          width={cell}
          height={cell}
          fill={row === 5 ? ACCENT : DEEP}
          stroke={INK}
          strokeWidth="1.5"
        />
      ))}
      <Shadow>
        <path
          className="attract attract-drop"
          d={`M${originX + 3 * cell} ${originY} h${cell} v${cell * 3} h${cell} v${cell} h${-cell * 2} z`}
        />
      </Shadow>
      <path
        className="attract attract-drop"
        d={`M${originX + 3 * cell} ${originY} h${cell} v${cell * 3} h${cell} v${cell} h${-cell * 2} z`}
        fill={PAPER}
        {...outline}
      />
      <path
        d={`M${originX - 8} ${originY + 5 * cell + 5} h${cell * 8 + 16}`}
        stroke={ACCENT}
        strokeWidth="2"
        strokeDasharray="3 3"
      />
    </>
  );
}

function ConnectFour() {
  const cols = 7;
  const rows = 5;
  const size = 13;
  const originX = 35;
  const originY = 18;
  const discs: Record<string, string> = {
    '0-4': ACCENT,
    '1-4': PAPER,
    '2-4': ACCENT,
    '3-4': PAPER,
    '1-3': ACCENT,
    '2-3': PAPER,
    '3-3': PAPER,
    '2-2': ACCENT,
    '3-2': PAPER,
    '3-1': ACCENT,
    '4-4': PAPER,
  };
  return (
    <>
      <Shadow>
        <rect
          x={originX - 6}
          y={originY - 6}
          width={cols * size + 12}
          height={rows * size + 12}
          rx="6"
        />
      </Shadow>
      <rect
        x={originX - 6}
        y={originY - 6}
        width={cols * size + 12}
        height={rows * size + 12}
        rx="6"
        fill={DEEP}
        {...outline}
      />
      {Array.from({ length: cols * rows }, (_, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const fill = discs[`${col}-${row}`] ?? 'var(--cover-bg)';
        return (
          <circle
            key={index}
            // The disc that completes the diagonal drops in on every loop.
            className={col === 3 && row === 1 ? 'attract attract-drop' : undefined}
            cx={originX + col * size + size / 2}
            cy={originY + row * size + size / 2}
            r="5"
            fill={fill}
            stroke={INK}
            strokeWidth="1.5"
          />
        );
      })}
      <path
        className="attract attract-dash"
        d={`M${originX + size / 2} ${originY + 4 * size + size / 2} L${originX + 3 * size + size / 2} ${originY + size + size / 2}`}
        stroke={PAPER}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="2 4"
      />
    </>
  );
}

function AirHockey() {
  return (
    <>
      <Shadow>
        <rect x="28" y="18" width="104" height="64" rx="10" />
      </Shadow>
      <rect x="28" y="18" width="104" height="64" rx="10" fill={DEEP} {...outline} />
      <path d="M80 18v64" stroke={PAPER} strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
      <circle cx="80" cy="50" r="12" fill="none" stroke={PAPER} strokeWidth="2" opacity="0.6" />
      <circle cx="50" cy="50" r="9" fill={ACCENT} {...outline} />
      <circle cx="50" cy="50" r="3" fill={INK} />
      <circle cx="112" cy="40" r="9" fill="var(--pn-pink-400)" {...outline} />
      <circle cx="112" cy="40" r="3" fill={INK} />
      <g className="attract attract-puck">
        <circle cx="86" cy="62" r="5" fill={INK} />
        <path d="M70 70l10-6" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </>
  );
}

function ChessArena() {
  const knight =
    'M64 78h34v-6l-6-4c6-10 8-22 0-32-4-5-10-7-16-6l-4-6-4 6c-8 4-10 12-8 16l10 4-6 8c-4 4-6 10-6 14z';
  return (
    <>
      <g opacity="0.25">
        {Array.from({ length: 16 }, (_, index) => {
          const col = index % 4;
          const row = Math.floor(index / 4);
          return (col + row) % 2 === 0 ? (
            <rect
              key={index}
              x={96 + col * 12}
              y={30 + row * 12}
              width="12"
              height="12"
              fill={PAPER}
            />
          ) : null;
        })}
      </g>
      <Shadow>
        <path className="attract attract-hop" d={knight} />
      </Shadow>
      <g className="attract attract-hop">
        <path d={knight} fill={ACCENT} {...outline} />
        <circle cx="80" cy="42" r="2" fill={INK} />
      </g>
    </>
  );
}

function DrawingParty() {
  return (
    <>
      <path
        d="M28 66c14-30 30-30 40-10s24 22 40-8"
        fill="none"
        stroke={ACCENT}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Shadow>
        <path className="attract attract-wobble" d="M100 26l16 16-30 30-20 4 4-20z" />
        <circle cx="38" cy="30" r="8" />
        <circle cx="126" cy="70" r="7" />
      </Shadow>
      <g className="attract attract-wobble">
        <path d="M100 26l16 16-30 30-20 4 4-20z" fill={PAPER} {...outline} />
        <path d="M70 72l-4 4" stroke={INK} strokeWidth="2" />
        <path d="M100 26l16 16-6 6-16-16z" fill={DEEP} {...outline} />
      </g>
      <circle cx="38" cy="30" r="8" fill="var(--pn-yellow-400)" {...outline} />
      <circle cx="126" cy="70" r="7" fill="var(--pn-cyan-400)" {...outline} />
    </>
  );
}

function TriviaBattle() {
  return (
    <>
      <Shadow>
        <rect className="attract attract-wobble" x="30" y="18" width="56" height="64" rx="6" />
      </Shadow>
      <g className="attract attract-wobble">
        <rect x="30" y="18" width="56" height="64" rx="6" fill={ACCENT} {...outline} />
        <text
          x="58"
          y="64"
          fontSize="40"
          fontWeight="700"
          fontFamily="var(--pn-font-display)"
          textAnchor="middle"
          fill={INK}
        >
          ?
        </text>
      </g>
      {[26, 44, 62].map((y, index) => (
        <g key={y}>
          <rect
            x="96"
            y={y}
            width="38"
            height="12"
            rx="3"
            fill={index === 1 ? DEEP : 'var(--cover-bg)'}
            {...outline}
          />
          <circle cx="104" cy={y + 6} r="2.5" fill={index === 1 ? PAPER : INK} />
        </g>
      ))}
    </>
  );
}

function NeonKartRacing() {
  return (
    <>
      <path
        d="M12 82c40-10 50-40 136-44"
        fill="none"
        stroke={DEEP}
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M12 82c40-10 50-40 136-44"
        fill="none"
        stroke={PAPER}
        strokeWidth="1.5"
        strokeDasharray="6 8"
        opacity="0.6"
      />
      <Shadow>
        <g className="attract attract-lunge">
          <path d="M60 56h36l8 8v6H52v-6z" />
          <circle cx="62" cy="72" r="6" />
          <circle cx="96" cy="72" r="6" />
        </g>
      </Shadow>
      <g className="attract attract-lunge">
        <path d="M60 56h36l8 8v6H52v-6z" fill={ACCENT} {...outline} />
        <path d="M70 56l4-10h14l4 10" fill={PAPER} {...outline} />
        <circle cx="62" cy="72" r="6" fill={INK} />
        <circle cx="96" cy="72" r="6" fill={INK} />
        <circle cx="62" cy="72" r="2" fill={PAPER} />
        <circle cx="96" cy="72" r="2" fill={PAPER} />
      </g>
      <path
        d="M28 58h16M24 64h12M30 70h10"
        stroke={ACCENT}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  );
}

function Siper() {
  const bags: [number, number][] = [
    [34, 70],
    [56, 70],
    [78, 70],
    [100, 70],
    [45, 60],
    [67, 60],
    [89, 60],
  ];
  return (
    <>
      <rect x="10" y="80" width="140" height="6" rx="2" fill={DEEP} />
      <Shadow>
        <g className="attract attract-bob">
          <rect x="62" y="34" width="20" height="18" rx="2" />
        </g>
        {bags.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="22" height="10" rx="5" />
        ))}
      </Shadow>
      <g className="attract attract-bob">
        <rect x="62" y="34" width="20" height="18" rx="2" fill={PAPER} {...outline} />
        <path d="M60 36h24v-4a12 6 0 0 0-24 0z" fill={DEEP} {...outline} />
        <rect x="68" y="42" width="8" height="3" fill={INK} />
        <path d="M80 50h34" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      </g>
      {bags.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="22"
          height="10"
          rx="5"
          fill={ACCENT}
          {...outline}
        />
      ))}
      <g className="attract attract-dash">
        <circle cx="132" cy="34" r="9" fill="none" stroke={PAPER} strokeWidth="2" />
        <path d="M132 21v7M132 40v7M119 34h7M138 34h7" stroke={PAPER} strokeWidth="2" />
      </g>
    </>
  );
}

const illustrations: Record<string, () => ReactNode> = {
  siper: Siper,
  'snake-rush': SnakeRush,
  'memory-flip': MemoryFlip,
  '2048-fusion': Fusion2048,
  'tugla-tugla': TuglaTugla,
  'connect-four': ConnectFour,
  'air-hockey': AirHockey,
  'chess-arena': ChessArena,
  'drawing-party': DrawingParty,
  'trivia-battle': TriviaBattle,
  'neon-kart-racing': NeonKartRacing,
};

function Fallback() {
  return (
    <>
      <Shadow>
        <rect x="56" y="26" width="48" height="48" rx="8" />
      </Shadow>
      <rect x="56" y="26" width="48" height="48" rx="8" fill={ACCENT} {...outline} />
      <path d="M72 38v24l20-12z" fill={INK} />
    </>
  );
}

export interface GameCoverProps {
  slug: string;
  accent: AccentName;
  // Accessible name; omit for decorative use next to a visible title.
  title?: string;
  muted?: boolean;
  className?: string;
}

const ATTRACT_LOOP_MS = 2400;

// A fixed phase per game, so covers side by side loop out of step and a cover keeps the same
// rhythm wherever it shows up. Negative, so the demo is already under way on first paint.
function attractDelay(slug: string): string {
  let hash = 0;
  for (const char of slug) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `-${hash % ATTRACT_LOOP_MS}ms`;
}

export function GameCover({ slug, accent, title, muted = false, className }: GameCoverProps) {
  const Illustration = illustrations[slug] ?? Fallback;
  const style = {
    '--cover-accent': `var(--pn-${accent}-400)`,
    '--cover-deep': `var(--pn-${accent}-700)`,
    '--cover-bg': `var(--pn-${accent}-950)`,
    '--cover-ink': 'var(--pn-shadow-ink)',
    '--cover-paper': 'var(--pn-ink-50)',
    '--attract-delay': attractDelay(slug),
  } as CSSProperties;

  return (
    <svg
      viewBox="0 0 160 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      style={style}
      data-attract={muted ? 'off' : undefined}
      className={cn('block h-auto w-full', muted && 'opacity-70 saturate-50', className)}
    >
      {title ? <title>{title}</title> : null}
      <rect width="160" height="100" fill="var(--cover-bg)" />
      <g opacity="0.18" fill={PAPER}>
        {Array.from({ length: 40 }, (_, index) => (
          <circle
            key={index}
            cx={8 + (index % 8) * 20}
            cy={10 + Math.floor(index / 8) * 20}
            r="1"
          />
        ))}
      </g>
      <Illustration />
    </svg>
  );
}
