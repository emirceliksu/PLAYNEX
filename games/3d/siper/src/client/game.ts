import {
  AudioMixer,
  type GameHost,
  type MatchOutcome,
  type OnlineMessage,
  type OnlineSession,
  readVolumes,
} from '@playnex/game-sdk';

import { maps, type ModeKey, rules, TICK_SECONDS, weapon } from '../sim/data';
import { Grid, type Vec3 } from '../sim/grid';
import { type Body, direction, eyeHeight, type MoveInput, step } from '../sim/movement';
import { Announcer, type Call } from './announcer';
import { Controls } from './controls';
import { translator, type Translate } from './dom';
import { Hud, type Label } from './hud';
import { BuyMenu, Gate, Scoreboard, VotePanel } from './menus';
import type { Hand, MatchEvent, PlayerView, RosterEntry, Snapshot } from './protocol';
import { readSettings, type Settings } from './settings';
import { Sound } from './sound';
import { type AvatarPose, World } from './world';

const INTERPOLATION_MS = 100;
const SNAPSHOT_KEEP = 180;
const KILLCAM_DELAY_MS = 900;
const KILLCAM_LENGTH_MS = 2_800;
const KILLCAM_LOOKBACK_MS = 3_000;
const MAX_FRAME_SECONDS = 0.1;
const STEP_DISTANCE = 2.1;
const LABEL_RANGE = 45;
const STREAK_KEYS = new Set(['heating', 'unstoppable', 'legend', 'godlike']);

interface Pending {
  seq: number;
  input: MoveInput;
  scale: number;
  sentAt: number;
}

interface Killcam {
  killer: number;
  start: number;
  end: number;
  from: number;
}

export class SiperGame {
  private readonly t: Translate;
  private readonly online: OnlineSession | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly world: World;
  private readonly grid: Grid;
  private readonly controls: Controls;
  private readonly hud: Hud;
  private readonly board: Scoreboard;
  private readonly buyMenu: BuyMenu;
  private readonly vote: VotePanel;
  private readonly gate: Gate;
  private readonly mixer: AudioMixer;
  private readonly sound: Sound;
  private readonly announcer: Announcer;
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: (() => void) | null;
  private settings: Settings;
  private mode: ModeKey;
  private teams = true;
  private roster: RosterEntry[] = [];
  private snapshots: { at: number; snap: Snapshot }[] = [];
  private body: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, crouched: false };
  private pending: Pending[] = [];
  private seq = 0;
  private accumulator = 0;
  private ping = 0;
  private nextFireAt = 0;
  private burst = 0;
  private lastShotAt = 0;
  private localAmmo: number | null = null;
  private alive = false;
  private killcam: Killcam | null = null;
  private spectating: number | null = null;
  private killer: { name: string; weapon: string } | null = null;
  private voteUntil = 0;
  private voteCounts: Record<string, number> = {};
  private myVote: string | null = null;
  private voteTitle = '';
  private stepDistance = 0;
  private otherSteps = new Map<number, { x: number; z: number; d: number }>();
  private lastBeep = 0;
  private wasGrounded = true;
  private started = 0;
  private finished = false;
  private lastPhase = '';

  constructor(
    container: HTMLElement,
    private readonly host: GameHost,
  ) {
    this.t = translator(host.messages);
    this.online = host.session.mode === 'online' ? host.session : null;
    const options = host.session.options;
    this.mode = (options.mode as ModeKey | undefined) ?? 'tdm';
    const map = maps[options.map ?? 'liman'] ?? maps.liman;
    if (!map) throw new Error('siper: no maps');
    this.grid = new Grid(map);
    this.settings = readSettings();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'absolute inset-0 block size-full touch-none outline-none';
    this.canvas.tabIndex = -1;
    container.append(this.canvas);
    this.world = new World(this.canvas, host.palette, this.grid, this.settings.quality);
    this.mixer = new AudioMixer(readVolumes());
    this.sound = new Sound(this.mixer);
    this.hud = new Hud(container, this.t);
    this.announcer = new Announcer(this.sound, (call) => this.showCall(call));
    this.board = new Scoreboard(this.hud.root, this.t);
    this.buyMenu = new BuyMenu(
      this.hud.root,
      this.t,
      (item) => this.buy(item),
      () => this.closeBuy(),
    );
    this.vote = new VotePanel(this.hud.root, this.t, rules.maps, (map) => this.castVote(map));
    const desktop = window.matchMedia('(pointer: fine)').matches;
    this.gate = new Gate(
      container,
      this.t,
      this.settings,
      readVolumes(),
      {
        play: () => {
          this.mixer.resume();
          this.controls.lock();
        },
        settings: (settings) => {
          this.settings = settings;
          this.controls.update(settings);
        },
        volume: (bus, value) => this.mixer.setVolume(bus, value),
      },
      desktop,
    );
    this.controls = new Controls(this.canvas, this.settings, () => this.mixer.resume());
    this.resizeObserver = new ResizeObserver(() => this.world.resize());
    this.resizeObserver.observe(container);
    this.unsubscribe = this.online?.subscribe((message) => this.onServer(message)) ?? null;
    this.world.engine.runRenderLoop(() => this.frame());
  }

  start(): void {
    this.started = performance.now();
    this.host.onStateChange('playing');
  }

  destroy(): void {
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    this.world.engine.stopRenderLoop();
    this.controls.destroy();
    this.gate.destroy();
    this.sound.destroy();
    this.mixer.close();
    this.world.dispose();
    this.hud.destroy();
    this.gate.root.remove();
    this.canvas.remove();
  }

  private get latest(): Snapshot | null {
    return this.snapshots.at(-1)?.snap ?? null;
  }

  private get myIndex(): number {
    return this.latest?.me.i ?? this.online?.seat ?? 0;
  }

  private name(index: number | null): string {
    if (index === null) return '';
    return this.roster[index]?.n ?? `#${index + 1}`;
  }

  private heldId(snap: Snapshot): string {
    const me = snap.me;
    switch (me.hand) {
      case 'primary':
        return me.inv.p ?? 'knife';
      case 'secondary':
        return me.inv.s ?? 'knife';
      case 'melee':
        return 'knife';
      default:
        return me.hand;
    }
  }

  private speedScale(snap: Snapshot): number {
    const spec = weapon(this.heldId(snap));
    return (spec?.speedScale ?? 1) * (snap.me.zm ? 0.6 : 1);
  }

  private menusOpen(): boolean {
    return this.buyMenu.open || this.hud.chatting || this.voteUntil > performance.now();
  }

  private send(action: Record<string, unknown>): void {
    this.online?.send(action);
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(this.world.engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    const snap = this.latest;
    if (snap) {
      this.handlePresses(snap, now);
      this.predict(snap, dt, now);
      this.handleFiring(snap, now);
      this.drawWorld(snap, now, dt);
      this.renderHud(snap, now);
      this.sounds(snap, now);
    }
    const free =
      !this.controls.locked && !this.buyMenu.open && !this.hud.chatting && this.voteUntil <= now;
    this.gate.render(free && !this.finished, this.gateTitle(snap));
    this.announcer.update(now);
    this.world.render();
  }

  private gateTitle(snap: Snapshot | null): string {
    if (!snap) return this.t('connecting');
    return this.t('modeOnMap', {
      mode: this.t(`mode.${this.mode}`),
      map: this.t(`map.${this.grid.id}`),
    });
  }

  private handlePresses(snap: Snapshot, now: number): void {
    const presses = this.controls.take();
    const me = snap.me;
    for (const action of presses.actions) {
      switch (action) {
        case 'chatAll':
        case 'chatTeam':
          this.openChat(action === 'chatTeam' && this.teams);
          return;
        case 'buy':
          if (this.buyMenu.open) this.closeBuy();
          else if (me.buy) this.openBuy();
          else this.sound.denied();
          break;
        case 'reload':
          this.send({ t: 'reload' });
          if (me.ammo !== null && me.res) this.sound.reload();
          break;
        case 'lastWeapon':
          this.switchHand(snap, me.hand === 'primary' ? 'secondary' : 'primary');
          break;
        case 'primary':
        case 'secondary':
        case 'melee':
        case 'grenade':
        case 'smoke':
          this.switchHand(snap, action);
          break;
        default:
          break;
      }
    }
    if (presses.scope && this.alive) this.send({ t: 'scope' });
    // Dead players cycle through the people they can watch with the fire button.
    if (presses.fire && !this.alive && !this.killcam) this.cycleSpectate(snap);
    if (!this.alive && this.killcam && now > this.killcam.end) this.killcam = null;
  }

  private switchHand(snap: Snapshot, hand: Hand): void {
    const inv = snap.me.inv;
    const has = {
      primary: !!inv.p,
      secondary: !!inv.s,
      melee: inv.k,
      grenade: inv.g,
      smoke: inv.m,
    }[hand];
    if (!has || snap.me.hand === hand) return;
    this.send({ t: 'slot', slot: hand });
    this.burst = 0;
  }

  private predict(snap: Snapshot, dt: number, now: number): void {
    if (!this.alive) return;
    const frozen = snap.ph === 'freeze' || snap.ph === 'vote' || snap.ph === 'done';
    const capture = this.controls.locked && !this.menusOpen();
    this.accumulator += dt;
    while (this.accumulator >= TICK_SECONDS) {
      this.accumulator -= TICK_SECONDS;
      const input: MoveInput = {
        f: capture && !frozen ? this.controls.axis('forward', 'back') : 0,
        s: capture && !frozen ? this.controls.axis('right', 'left') : 0,
        yaw: this.controls.yaw,
        pitch: this.controls.pitch,
        j: capture && !frozen && this.controls.pressed('jump'),
        c: capture && this.controls.pressed('crouch'),
        w: capture && this.controls.pressed('walk'),
        u: capture && this.controls.pressed('use'),
      };
      this.seq += 1;
      const scale = this.speedScale(snap);
      this.pending.push({ seq: this.seq, input, scale, sentAt: now });
      this.send({ t: 'move', seq: this.seq, pg: Math.round(this.ping), ...input });
      const wasAir = !this.body.grounded;
      step(this.body, input, scale, this.grid, TICK_SECONDS);
      if (wasAir && this.body.grounded && !this.wasGrounded) this.sound.land();
      this.wasGrounded = this.body.grounded;
      if (this.body.grounded && !input.w && !input.c) {
        this.stepDistance += Math.hypot(this.body.vx, this.body.vz) * TICK_SECONDS;
        if (this.stepDistance > STEP_DISTANCE) {
          this.stepDistance = 0;
          this.sound.footstep();
        }
      }
    }
  }

  private handleFiring(snap: Snapshot, now: number): void {
    if (!this.alive || snap.ph !== 'live' || !this.controls.locked || this.menusOpen()) return;
    const held = this.heldId(snap);
    const spec = weapon(held);
    const wantsAuto = spec?.auto ?? false;
    const pressed = this.controls.firing;
    if (!pressed || now < this.nextFireAt) return;
    if (!wantsAuto) this.controls.firing = false;
    if (snap.me.rl !== null) return;

    if (held === 'grenade' || held === 'smoke') {
      this.send({
        t: 'fire',
        yaw: this.controls.yaw,
        pitch: this.controls.pitch,
        view: this.viewTick(now),
      });
      this.sound.throw();
      this.nextFireAt = now + 600;
      return;
    }
    if (!spec) return;
    if (spec.magazine > 0 && (this.localAmmo ?? 0) <= 0) {
      this.sound.dryFire();
      this.send({ t: 'reload' });
      this.nextFireAt = now + 300;
      return;
    }
    if (now - this.lastShotAt > spec.recoveryMs) this.burst = 0;
    this.send({
      t: 'fire',
      yaw: this.controls.yaw,
      pitch: this.controls.pitch,
      view: this.viewTick(now),
    });
    this.nextFireAt = now + spec.fireMs;
    this.lastShotAt = now;
    if (this.localAmmo !== null) this.localAmmo -= 1;
    this.sound.shot(held);
    this.world.fireKick(held === 'knife' ? 0.3 : 0.6 + (spec.recoil[0]?.[0] ?? 0) * 0.3);
    if (held !== 'knife') {
      const [kickPitch, kickYaw] = this.recoilAt(spec.recoil, this.burst);
      const dir = direction(
        this.controls.yaw + (kickYaw * Math.PI) / 180,
        this.controls.pitch - (kickPitch * Math.PI) / 180,
      );
      const eye = this.eye();
      const reach = this.grid.raycast(eye, dir, spec.range) ?? spec.range;
      const muzzle: Vec3 = [
        eye[0] + dir[0] * 0.6,
        eye[1] - 0.12 + dir[1] * 0.6,
        eye[2] + dir[2] * 0.6,
      ];
      this.world.tracer(muzzle, [
        eye[0] + dir[0] * reach,
        eye[1] + dir[1] * reach,
        eye[2] + dir[2] * reach,
      ]);
    }
    this.burst += 1;
  }

  private recoilAt(pattern: number[][], shots: number): [number, number] {
    let pitch = 0;
    let yaw = 0;
    for (let i = 0; i < shots; i += 1) {
      const [p = 0, y = 0] = pattern[i % pattern.length] ?? [];
      pitch += p;
      yaw += y;
    }
    return [Math.min(12, pitch), Math.max(-5, Math.min(5, yaw))];
  }

  private eye(): Vec3 {
    return [this.body.x, this.body.y + eyeHeight(this.body.crouched), this.body.z];
  }

  // The server tick the other players are being drawn at, so hits land where they were seen.
  private viewTick(now: number): number {
    const pair = this.bracket(now - INTERPOLATION_MS);
    if (!pair) return this.latest?.t ?? 0;
    const [older, newer, f] = pair;
    return Math.round(older.snap.t + (newer.snap.t - older.snap.t) * f);
  }

  private bracket(
    at: number,
  ): [{ at: number; snap: Snapshot }, { at: number; snap: Snapshot }, number] | null {
    const list = this.snapshots;
    if (list.length === 0) return null;
    let older = list[0];
    let newer = list[0];
    for (const entry of list) {
      if (entry.at <= at) older = entry;
      else {
        newer = entry;
        break;
      }
      newer = entry;
    }
    if (!older || !newer) return null;
    const span = newer.at - older.at;
    const f = span > 0 ? Math.min(1, Math.max(0, (at - older.at) / span)) : 1;
    return [older, newer, f];
  }

  private poseAt(index: number, at: number): AvatarPose | null {
    const pair = this.bracket(at);
    if (!pair) return null;
    const [older, newer, f] = pair;
    const a = older.snap.p[index];
    const b = newer.snap.p[index];
    if (!a || !b) return null;
    const turn = Math.atan2(Math.sin(b.yw - a.yw), Math.cos(b.yw - a.yw));
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      yaw: a.yw + turn * f,
      pitch: a.pt + (b.pt - a.pt) * f,
      crouched: b.c,
      alive: b.a,
      weapon: b.w,
    };
  }

  private cycleSpectate(snap: Snapshot): void {
    const candidates = snap.p
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p, i }) =>
          p.a && i !== this.myIndex && (!this.teams || p.tm === snap.p[this.myIndex]?.tm),
      );
    const pool =
      candidates.length > 0
        ? candidates
        : snap.p.map((p, i) => ({ p, i })).filter(({ p, i }) => p.a && i !== this.myIndex);
    if (pool.length === 0) {
      this.spectating = null;
      return;
    }
    const current = pool.findIndex(({ i }) => i === this.spectating);
    this.spectating = pool[(current + 1) % pool.length]?.i ?? null;
  }

  private drawWorld(snap: Snapshot, now: number, dt: number): void {
    const me = this.myIndex;
    const renderAt = now - INTERPOLATION_MS;
    let viewer: number | null = this.alive ? me : null;
    let cameraAt = renderAt;
    if (!this.alive && this.killcam && now >= this.killcam.start && now <= this.killcam.end) {
      viewer = this.killcam.killer;
      cameraAt = this.killcam.from + (now - this.killcam.start);
    } else if (!this.alive) {
      if (this.spectating === null || !snap.p[this.spectating]?.a) this.cycleSpectate(snap);
      viewer = this.spectating;
    }

    snap.p.forEach((_, i) => {
      const pose = this.poseAt(i, cameraAt);
      const visible = pose !== null && i !== viewer && !(i === me && this.alive);
      if (pose) this.world.placeAvatar(i, pose, visible, now);
      else
        this.world.placeAvatar(
          i,
          { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouched: false, alive: false, weapon: '' },
          false,
          now,
        );
    });
    this.world.hideAvatarsFrom(snap.p.length);

    const fov = this.settings.fov;
    if (this.alive) {
      const zoom = snap.me.zm ? (weapon(this.heldId(snap))?.zoom ?? 1) : 1;
      this.world.setCamera(this.eye(), this.controls.yaw, this.controls.pitch, fov * zoom);
      this.world.viewWeapon(this.heldId(snap), this.roster[me]?.sk ?? null);
      this.world.animateViewmodel(
        dt,
        Math.hypot(this.body.vx, this.body.vz),
        snap.me.rl !== null,
        true,
        snap.me.zm,
      );
    } else {
      const pose = viewer !== null ? this.poseAt(viewer, cameraAt) : null;
      if (pose) {
        this.world.setCamera(
          [pose.x, pose.y + eyeHeight(pose.crouched), pose.z],
          pose.yaw,
          pose.pitch,
          fov,
        );
      } else {
        // Nobody to watch: an overview from high above the middle of the map.
        const cx = (this.grid.width * this.grid.cell) / 2;
        const cz = (this.grid.depth * this.grid.cell) / 2;
        this.world.setCamera([cx, 38, cz - 30], 0, 0.9, fov);
      }
      this.world.animateViewmodel(dt, 0, false, false, false);
    }

    this.world.setProjectiles(snap.gr);
    this.world.setSmokes(snap.sm);
    const bomb = snap.bomb;
    if (bomb && bomb.s !== 'carried') this.world.setBomb(bomb.at, bomb.s === 'planted', now);
    else this.world.setBomb(null, false, now);

    const labels: Label[] = [];
    const myTeam = snap.p[me]?.tm;
    if (this.teams) {
      snap.p.forEach((p, i) => {
        if (i === me || i === viewer || !p.a || p.tm !== myTeam) return;
        const pose = this.poseAt(i, cameraAt);
        if (!pose) return;
        const camera = this.world.camera.position;
        if (Math.hypot(pose.x - camera.x, pose.z - camera.z) > LABEL_RANGE) return;
        const spot = this.world.project([pose.x, pose.y + 2.05, pose.z]);
        if (spot) labels.push({ ...spot, text: this.name(i) });
      });
    }
    this.hud.setLabels(labels);
  }

  private renderHud(snap: Snapshot, now: number): void {
    const me = snap.me;
    const mine = snap.p[me.i];
    const held = this.heldId(snap);
    const spec = weapon(held);
    const age = now - (this.snapshots.at(-1)?.at ?? now);
    const left = Math.max(0, snap.tl - age);
    const minutes = Math.floor(left / 60_000);
    const seconds = Math.floor((left % 60_000) / 1000);
    const bomb = snap.bomb;
    const planted = bomb?.s === 'planted';

    const score = this.teams
      ? `${snap.sc[0]} : ${snap.sc[1]}`
      : this.t('ffaScore', {
          me: this.mode === 'gungame' ? (mine?.lv ?? 0) + 1 : (mine?.k ?? 0),
          best: Math.max(...snap.p.map((p) => (this.mode === 'gungame' ? p.lv + 1 : p.k))),
        });
    const roundText =
      this.mode === 'bomb' || this.mode === 'knife'
        ? this.t('roundShort', { n: snap.rd })
        : this.t(`mode.${this.mode}`);
    const bombText = planted
      ? this.t('bombPlantedAt', { site: bomb.site })
      : bomb?.s === 'carried' && bomb.by === me.i
        ? this.t('youCarry')
        : null;
    const moving = Math.hypot(this.body.vx, this.body.vz);
    const cone = spec
      ? spec.spread.base +
        spec.spread.moving * Math.min(1, moving / rules.movement.runSpeed) +
        (this.body.grounded ? 0 : spec.spread.air)
      : 0;
    const respawn = me.rs;
    const ammo =
      me.ammo === null
        ? '—'
        : `${Math.max(0, Math.min(this.localAmmo ?? me.ammo, me.ammo))} / ${me.res ?? 0}`;
    const nades = [me.inv.g ? this.t('weapon.grenade') : '', me.inv.m ? this.t('weapon.smoke') : '']
      .filter(Boolean)
      .join(' · ');
    const level =
      this.mode === 'gungame'
        ? this.t('levelLine', {
            n: (mine?.lv ?? 0) + 1,
            total: rules.modes.gungame.ladder.length,
            weapon: this.t(`weapon.${rules.modes.gungame.ladder[mine?.lv ?? 0] ?? 'knife'}`),
          })
        : null;

    this.hud.update(
      {
        hp: me.hp,
        armor: me.ar,
        helmet: me.hel,
        money: rules.modes[this.mode].buy ? me.$ : null,
        ammo,
        weapon: this.t(`weapon.${held}`),
        grenades: nades,
        timer: `${minutes}:${String(seconds).padStart(2, '0')}`,
        score,
        round: roundText,
        bomb: bombText,
        use: me.use
          ? { label: this.t(me.use[0] === 'plant' ? 'planting' : 'defusing'), progress: me.use[1] }
          : null,
        crosshairGap: cone * 5,
        crosshair: this.alive && held !== 'sniper',
        scoped: this.alive && snap.me.zm,
        dead: this.alive
          ? null
          : {
              title: this.killer
                ? this.t('killedBy', {
                    name: this.killer.name,
                    weapon: this.t(`weapon.${this.killer.weapon}`),
                  })
                : this.t('youDied'),
              detail:
                respawn !== null
                  ? this.t('respawnIn', { n: Math.ceil(respawn / 1000) })
                  : snap.ph === 'vote'
                    ? ''
                    : this.t('waitRound'),
            },
        spectating:
          !this.alive && this.killcam && now >= this.killcam.start && now <= this.killcam.end
            ? this.t('killcam', { name: this.name(this.killcam.killer) })
            : !this.alive && this.spectating !== null
              ? this.t('spectating', { name: this.name(this.spectating) })
              : null,
        ping: Math.round(this.ping),
        fps: Math.round(this.world.engine.getFps()),
        level,
        buyHint: me.buy && !this.buyMenu.open,
        urgent: planted || (snap.ph === 'live' && left < 10_000),
      },
      now,
    );

    const rows = snap.p.map((p: PlayerView, i) => ({
      name: this.name(i),
      team: p.tm,
      bot: this.roster[i]?.bot ?? false,
      alive: p.a,
      kills: p.k,
      deaths: p.d,
      assists: p.as,
      score: p.sc,
      ping: i === me.i ? Math.round(this.ping) : p.pg,
      level: p.lv,
      me: i === me.i,
    }));
    const showBoard =
      (this.controls.pressed('scoreboard') || snap.ph === 'roundEnd') && !this.buyMenu.open;
    this.board.render(
      showBoard,
      this.t('modeOnMap', {
        mode: this.t(`mode.${this.mode}`),
        map: this.t(`map.${this.grid.id}`),
      }),
      rows,
      this.teams,
      this.mode === 'gungame',
    );
    const owned = new Set(
      [me.inv.p, me.inv.s, me.inv.g ? 'grenade' : null, me.inv.m ? 'smoke' : null].filter(
        (x): x is string => x !== null,
      ),
    );
    this.buyMenu.render({
      money: me.$,
      canBuy: me.buy,
      owned,
      armor: me.ar,
      helmet: me.hel,
      team: mine?.tm ?? 0,
    });
    if (this.buyMenu.open && !me.buy) this.closeBuy();
    this.vote.render(
      this.voteUntil > now,
      this.voteTitle,
      Math.max(0, Math.ceil((this.voteUntil - now) / 1000)),
      this.voteCounts,
      this.myVote,
    );
  }

  private sounds(snap: Snapshot, now: number): void {
    const bomb = snap.bomb;
    if (bomb?.s === 'planted') {
      const age = now - (this.snapshots.at(-1)?.at ?? now);
      const left = Math.max(0, bomb.tl - age);
      const interval = Math.max(140, Math.min(1000, left / 40));
      if (now - this.lastBeep > interval) {
        this.lastBeep = now;
        this.sound.beep(left < 10_000);
      }
    }
    // Other players' footsteps: the main way to hear someone round a corner.
    const listener = this.world.camera.position;
    snap.p.forEach((p, i) => {
      if (i === this.myIndex || !p.a) return;
      const last = this.otherSteps.get(i) ?? { x: p.x, z: p.z, d: 0 };
      const moved = Math.hypot(p.x - last.x, p.z - last.z);
      const running = moved > 0 && moved < 1;
      last.d += running ? moved : 0;
      last.x = p.x;
      last.z = p.z;
      if (last.d > STEP_DISTANCE * 1.2) {
        last.d = 0;
        const distance = Math.hypot(p.x - listener.x, p.z - listener.z);
        if (distance < 30) this.sound.footstep(distance, this.pan(p.x, p.z));
      }
      this.otherSteps.set(i, last);
    });
  }

  private pan(x: number, z: number): number {
    const listener = this.world.camera.position;
    const angle = Math.atan2(x - listener.x, z - listener.z) - this.world.camera.rotation.y;
    return Math.sin(angle);
  }

  private distance(point: Vec3): number {
    const listener = this.world.camera.position;
    return Math.hypot(point[0] - listener.x, point[1] - listener.y, point[2] - listener.z);
  }

  private openBuy(): void {
    this.buyMenu.open = true;
    this.controls.setCaptured(false);
    this.controls.unlock();
    window.setTimeout(() => this.buyMenu.focusFirst(), 0);
  }

  private closeBuy(): void {
    if (!this.buyMenu.open) return;
    this.buyMenu.open = false;
    this.controls.setCaptured(true);
    this.controls.lock();
  }

  private buy(item: string): void {
    this.send({ t: 'buy', item });
    this.sound.buy();
  }

  private openChat(team: boolean): void {
    if (!this.online?.chat) return;
    this.controls.setCaptured(false);
    this.hud.openChat(
      team,
      (text, toTeam) => this.online?.chat?.(text, toTeam),
      () => this.controls.setCaptured(true),
    );
  }

  private castVote(map: string): void {
    this.myVote = map;
    this.send({ t: 'vote', map });
  }

  private showCall(call: Call): void {
    this.hud.announce(call.text, '', performance.now());
  }

  private onServer(message: OnlineMessage): void {
    const now = performance.now();
    switch (message.kind) {
      case 'snapshot':
        this.applySnapshot(message.payload as Snapshot, now);
        return;
      case 'event':
        this.applyEvent(message.payload as MatchEvent, now);
        return;
      case 'finish':
        this.finish(message.outcome);
        return;
      case 'chat':
        this.hud.chat(message.from, message.text, message.team, message.side, this.teams, now);
        this.sound.chat();
        return;
      case 'rejected':
        if (message.code === 'not_now') this.sound.denied();
        return;
    }
  }

  private applySnapshot(snap: Snapshot, now: number): void {
    this.snapshots.push({ at: now, snap });
    if (this.snapshots.length > SNAPSHOT_KEEP) this.snapshots.shift();
    const me = snap.me;
    const view = snap.p[me.i];
    if (!view) return;
    this.localAmmo = me.ammo;
    if (this.mode === 'ffa' || this.mode === 'gungame' || this.mode === 'tdm')
      this.host.onScore(view.k);

    if (view.a && !this.alive) {
      // Respawned: take the server's facing and drop whatever was being predicted.
      this.controls.yaw = view.yw;
      this.controls.pitch = 0;
      this.pending = [];
      this.killcam = null;
      this.spectating = null;
      this.killer = null;
    }
    this.alive = view.a;

    const acked = this.pending.find((entry) => entry.seq === me.ack);
    if (acked) this.ping = this.ping * 0.8 + (now - acked.sentAt) * 0.2;
    this.pending = this.pending.filter((entry) => entry.seq > me.ack);
    const corrected: Body = {
      x: view.x,
      y: view.y,
      z: view.z,
      vx: me.vx,
      vy: me.vy,
      vz: me.vz,
      grounded: me.gd,
      crouched: view.c,
    };
    if (view.a && (snap.ph === 'live' || snap.ph === 'freeze')) {
      for (const entry of this.pending)
        step(corrected, entry.input, entry.scale, this.grid, TICK_SECONDS);
    }
    this.body = corrected;

    if (snap.ph !== this.lastPhase) {
      if (snap.ph === 'freeze' || snap.ph === 'roundEnd') this.sound.startMusic();
      if (snap.ph === 'live') {
        this.sound.stopMusic();
        if (this.lastPhase === 'freeze')
          this.announcer.say([{ key: 'go', text: this.t('announce.go') }]);
      }
      if (snap.ph === 'vote') this.sound.startMusic();
      this.lastPhase = snap.ph;
    }
  }

  private applyEvent(event: MatchEvent, now: number): void {
    const me = this.myIndex;
    switch (event.t) {
      case 'roster':
        this.roster = event.players;
        this.mode = event.mode;
        this.teams = event.teams;
        event.players.forEach((entry, i) => {
          this.world.avatar(i, { team: entry.tm, teams: event.teams, outfit: entry.of });
        });
        return;
      case 'kill': {
        const victim = event.v;
        const killerTeam = event.k === null ? 0 : (this.latest?.p[event.k]?.tm ?? 0);
        this.hud.kill(
          {
            killer: event.k === null ? null : this.name(event.k),
            killerTeam,
            victim: this.name(victim),
            victimTeam: this.latest?.p[victim]?.tm ?? 0,
            weapon: event.w,
            headshot: event.h,
            mine: event.k === me || victim === me,
          },
          this.teams,
          now,
        );
        if (victim === me) {
          this.alive = false;
          this.controls.firing = false;
          if (event.k !== null && event.k !== me) {
            this.killer = { name: this.name(event.k), weapon: event.w };
            this.killcam = {
              killer: event.k,
              start: now + KILLCAM_DELAY_MS,
              end: now + KILLCAM_DELAY_MS + KILLCAM_LENGTH_MS,
              from: now - KILLCAM_LOOKBACK_MS,
            };
            this.spectating = event.k;
          }
        }
        return;
      }
      case 'announce': {
        const mine = event.who === me;
        if (event.global || mine) {
          const sub = event.global && event.who !== null && !mine ? this.name(event.who) : '';
          this.announcer.say([
            {
              key: event.key,
              text: sub
                ? `${this.t(`announce.${event.key}`)} · ${sub}`
                : this.t(`announce.${event.key}`),
            },
          ]);
        } else if (STREAK_KEYS.has(event.key)) {
          this.hud.centerMessage(
            `${this.name(event.who)}: ${this.t(`announce.${event.key}`)}`,
            now,
            1_600,
          );
        }
        return;
      }
      case 'shot': {
        this.world.tracer(event.o, event.e);
        this.sound.shot(event.w, this.distance(event.o), this.pan(event.o[0], event.o[2]));
        return;
      }
      case 'slash': {
        const p = this.latest?.p[event.i];
        if (p) this.sound.shot('knife', this.distance([p.x, p.y, p.z]), this.pan(p.x, p.z));
        return;
      }
      case 'hit':
        this.hud.hit(event.head, event.kill, now);
        this.sound.hit(event.head);
        return;
      case 'hurt': {
        const angle =
          Math.atan2(event.from[0] - this.body.x, event.from[1] - this.body.z) - this.controls.yaw;
        this.hud.hurtFrom(angle, now);
        this.sound.hurt();
        return;
      }
      case 'throw': {
        const p = this.latest?.p[event.i];
        if (p && event.i !== me) this.sound.throw();
        return;
      }
      case 'boom':
        this.world.blast(event.at);
        this.sound.explosion(this.distance(event.at), this.pan(event.at[0], event.at[2]));
        return;
      case 'smoke':
        this.sound.smoke(this.distance(event.at), this.pan(event.at[0], event.at[2]));
        return;
      case 'bomb':
        if (event.s === 'exploded' && event.at) {
          this.world.blast(event.at);
          this.sound.explosion(this.distance(event.at), this.pan(event.at[0], event.at[2]));
        }
        return;
      case 'round':
        if (event.s === 'start') {
          this.hud.centerMessage(this.t('roundN', { n: event.rd }), now);
          this.sound.roundStart();
        } else {
          this.hud.centerMessage(
            this.t(event.winner === 0 ? 'attackersRound' : 'defendersRound', {
              reason: this.t(`reason.${event.reason}`),
            }),
            now,
            4_000,
          );
        }
        return;
      case 'halftime':
        this.hud.centerMessage(this.t('halftime'), now, 4_000);
        return;
      case 'level':
        if (event.who === me)
          this.hud.centerMessage(
            this.t('levelUp', { weapon: this.t(`weapon.${event.w}`) }),
            now,
            1_800,
          );
        return;
      case 'matchEnd':
        this.voteUntil = now + event.voteMs;
        this.voteCounts = {};
        this.myVote = null;
        this.voteTitle =
          event.winner === null
            ? this.t('draw')
            : this.teams
              ? this.t(event.winner === 0 ? 'attackersWinMatch' : 'defendersWinMatch')
              : this.t('playerWins', {
                  name: this.name(this.latest?.p.findIndex((p) => p.tm === event.winner) ?? null),
                });
        this.controls.unlock();
        return;
      case 'votes':
        this.voteCounts = event.counts;
        return;
    }
  }

  private finish(outcome: MatchOutcome): void {
    this.finished = true;
    this.voteUntil = 0;
    this.sound.stopMusic();
    this.controls.unlock();
    const kills = this.latest?.p[this.myIndex]?.k ?? 0;
    this.host.onScore(kills);
    this.host.onFinish({
      score: kills,
      durationMs: Math.round(performance.now() - this.started),
      outcome,
      participants: this.roster.map((entry, seat) => ({ seat, nickname: entry.n })),
    });
    this.host.onStateChange('finished');
  }
}
