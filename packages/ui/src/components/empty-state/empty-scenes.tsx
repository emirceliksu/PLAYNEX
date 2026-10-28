import type { ReactNode } from 'react';

// Small line drawings in the covers' ink language, each lifted from a game's own motif so an
// empty screen still reads as part of the arcade rather than a generic placeholder.

export type EmptyScene = 'shelf' | 'no-match' | 'off-board' | 'podium' | 'locked';

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className="h-16 w-24">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

// An empty arcade shelf: the default when no scene fits.
function Shelf() {
  return (
    <Frame>
      <rect x="8" y="10" width="80" height="44" rx="6" />
      <path d="M8 32h80" />
      <path d="M24 10v22M72 10v22" strokeDasharray="3 4" />
      <circle cx="48" cy="21" r="4" />
      <path d="M30 46h12M54 46h12" />
    </Frame>
  );
}

// Memory Flip: two turned cards whose symbols do not pair up.
function NoMatch() {
  return (
    <Frame>
      <rect x="16" y="12" width="26" height="38" rx="4" transform="rotate(-6 29 31)" />
      <circle cx="29" cy="31" r="5" />
      <rect x="54" y="12" width="26" height="38" rx="4" transform="rotate(6 67 31)" />
      <path d="M67 23l2.6 5.3 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
    </Frame>
  );
}

// Snake Rush: the snake has slipped off the edge of an empty board.
function OffBoard() {
  return (
    <Frame>
      <rect x="10" y="8" width="56" height="48" rx="5" strokeDasharray="4 4" />
      <rect x="50" y="26" width="10" height="10" rx="2.5" />
      <rect x="62" y="26" width="10" height="10" rx="2.5" />
      <rect x="74" y="26" width="10" height="10" rx="2.5" />
      <circle cx="80" cy="30" r="1" fill="currentColor" />
      <path d="M24 42h4M34 42h4" />
    </Frame>
  );
}

// Leaderboards: a podium with nobody on it yet.
function Podium() {
  return (
    <Frame>
      <path d="M12 54V38h24v16M36 54V26h24v28M60 54V44h24v10" />
      <path d="M8 54h80" />
      <path
        d="M48 8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"
        strokeDasharray="3 3"
      />
    </Frame>
  );
}

// An arcade cabinet with a padlock on its coin slot.
function Locked() {
  return (
    <Frame>
      <path d="M26 58V14l6-6h32l6 6v44" />
      <rect x="34" y="16" width="28" height="18" rx="2" />
      <rect x="40" y="42" width="16" height="12" rx="2" />
      <path d="M43 42v-4a5 5 0 0 1 10 0v4" />
      <path d="M20 58h56" />
    </Frame>
  );
}

const scenes: Record<EmptyScene, () => ReactNode> = {
  shelf: Shelf,
  'no-match': NoMatch,
  'off-board': OffBoard,
  podium: Podium,
  locked: Locked,
};

export function EmptySceneIllustration({ scene }: { scene: EmptyScene }) {
  const Scene = scenes[scene];
  return <Scene />;
}
