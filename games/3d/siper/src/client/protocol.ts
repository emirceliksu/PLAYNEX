import type { ModeKey } from '../sim/data';

// Shapes of what `apps/realtime/src/matches/siper/view.rs` and the match events send.

export type Phase = 'freeze' | 'live' | 'roundEnd' | 'vote' | 'done';
export type Hand = 'primary' | 'secondary' | 'melee' | 'grenade' | 'smoke';

export interface PlayerView {
  x: number;
  y: number;
  z: number;
  yw: number;
  pt: number;
  c: boolean;
  a: boolean;
  hp: number;
  w: string;
  tm: number;
  k: number;
  d: number;
  as: number;
  sc: number;
  pg: number;
  bm: boolean;
  lv: number;
  zm: boolean;
  $: number | null;
}

export interface MeView {
  i: number;
  ack: number;
  hp: number;
  ar: number;
  hel: boolean;
  $: number;
  hand: Hand;
  ammo: number | null;
  res: number | null;
  rl: number | null;
  inv: { p: string | null; s: string | null; k: boolean; g: boolean; m: boolean };
  buy: boolean;
  use: [string, number] | null;
  rs: number | null;
  zm: boolean;
  vx: number;
  vy: number;
  vz: number;
  gd: boolean;
  lk: number;
}

export type BombView =
  | { s: 'carried'; by: number }
  | { s: 'dropped' | 'defused' | 'exploded'; at: [number, number, number] }
  | { s: 'planted'; at: [number, number, number]; site: string; tl: number };

export interface Snapshot {
  t: number;
  ph: Phase;
  tl: number;
  rd: number;
  sc: [number, number];
  p: PlayerView[];
  bomb: BombView | null;
  gr: [number, number, number, number][];
  sm: [number, number, number, number][];
  me: MeView;
}

export interface RosterEntry {
  n: string;
  tm: number;
  bot: boolean;
  sk: string | null;
  of: string | null;
}

export type MatchEvent =
  | { t: 'roster'; mode: ModeKey; map: string; teams: boolean; players: RosterEntry[] }
  | { t: 'kill'; k: number | null; v: number; w: string; h: boolean }
  | { t: 'announce'; key: string; who: number | null; global: boolean }
  | { t: 'shot'; i: number; w: string; o: [number, number, number]; e: [number, number, number] }
  | { t: 'slash'; i: number }
  | { t: 'hit'; v: number; head: boolean; kill: boolean; dmg: number }
  | { t: 'hurt'; from: [number, number]; dmg: number; by: number }
  | { t: 'throw'; i: number; k: 'grenade' | 'smoke' }
  | { t: 'boom'; at: [number, number, number] }
  | { t: 'smoke'; at: [number, number, number]; ms: number }
  | {
      t: 'bomb';
      s: 'planted' | 'defused' | 'exploded';
      site?: string;
      by?: number;
      at?: [number, number, number];
    }
  | { t: 'round'; s: 'start'; rd: number; sc: [number, number] }
  | { t: 'round'; s: 'end'; winner: number; reason: string; sc: [number, number] }
  | { t: 'halftime'; sc: [number, number] }
  | { t: 'level'; who: number; lv: number; w: string }
  | { t: 'matchEnd'; winner: number | null; maps: string[]; voteMs: number }
  | { t: 'votes'; counts: Record<string, number> };
