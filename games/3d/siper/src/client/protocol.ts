import { grenades, type ModeKey, weapons } from '../sim/data';

// Shapes of what `apps/realtime/src/matches/siper/view.rs` and the match events send, and
// the decoder that turns the compact frames into the views the client works with.

export type Phase = 'freeze' | 'live' | 'roundEnd' | 'vote' | 'done';
export type Hand = 'primary' | 'secondary' | 'melee' | 'grenade' | 'smoke';

// [x, y, z, yaw, pitch, flags, health, weapon index]
type PlayerTuple = [number, number, number, number, number, number, number, number];
// [team, kills, deaths, assists, score, ping, level, alive]
type BoardTuple = [number, number, number, number, number, number, number, number];

const CROUCHED = 1;
const ALIVE = 2;
const CARRIES_BOMB = 4;
const SCOPED = 8;

const WEAPON_IDS = [...weapons.map((w) => w.id), ...grenades.map((g) => g.id)];

export interface PlayerView {
  // False when the server held this enemy back because nobody on our side can see them.
  seen: boolean;
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
}

export type BombView =
  | { s: 'carried'; by: number | null }
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

interface RawMe {
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
  inv: [string | null, string | null, boolean, boolean, boolean];
  buy: boolean;
  use: [string, number] | null;
  rs: number | null;
  v: [number, number, number];
  gd: boolean;
}

export interface RawSnapshot {
  t: number;
  ph: Phase;
  tl: number;
  rd: number;
  sc: [number, number];
  p: (PlayerTuple | null)[];
  b?: BoardTuple[];
  bomb: BombView | null;
  gr: [number, number, number, number][];
  sm: [number, number, number, number][];
  me: RawMe;
}

// The scoreboard arrives only every few frames; the last one is kept and merged in.
export class Decoder {
  private board: BoardTuple[] = [];
  private last: PlayerView[] = [];

  decode(raw: RawSnapshot): Snapshot {
    if (raw.b) this.board = raw.b;
    const players = raw.p.map((tuple, i): PlayerView => {
      const [tm, k, d, as, sc, pg, lv, alive] = this.board[i] ?? [0, 0, 0, 0, 0, 0, 0, 1];
      const stats = { tm, k, d, as, sc, pg, lv };
      if (!tuple) {
        const previous = this.last[i];
        return {
          ...(previous ?? {
            x: 0,
            y: 0,
            z: 0,
            yw: 0,
            pt: 0,
            c: false,
            hp: 0,
            w: 'knife',
            bm: false,
            zm: false,
          }),
          ...stats,
          a: alive === 1,
          seen: false,
        };
      }
      const [x, y, z, yw, pt, flags, hp, weapon] = tuple;
      return {
        ...stats,
        seen: true,
        x,
        y,
        z,
        yw,
        pt,
        c: (flags & CROUCHED) !== 0,
        a: (flags & ALIVE) !== 0,
        bm: (flags & CARRIES_BOMB) !== 0,
        zm: (flags & SCOPED) !== 0,
        hp,
        w: WEAPON_IDS[weapon] ?? 'knife',
      };
    });
    this.last = players;
    const me = raw.me;
    const [p, s, k, g, m] = me.inv;
    return {
      t: raw.t,
      ph: raw.ph,
      tl: raw.tl,
      rd: raw.rd,
      sc: raw.sc,
      p: players,
      bomb: raw.bomb,
      gr: raw.gr,
      sm: raw.sm,
      me: {
        i: me.i,
        ack: me.ack,
        hp: me.hp,
        ar: me.ar,
        hel: me.hel,
        $: me.$,
        hand: me.hand,
        ammo: me.ammo,
        res: me.res,
        rl: me.rl,
        inv: { p, s, k, g, m },
        buy: me.buy,
        use: me.use,
        rs: me.rs,
        zm: players[me.i]?.zm ?? false,
        vx: me.v[0],
        vy: me.v[1],
        vz: me.v[2],
        gd: me.gd,
      },
    };
  }
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
