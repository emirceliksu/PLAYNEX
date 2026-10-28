import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import type { GamePalette } from '@playnex/game-sdk';

import { cellHeight, cosmetics, rules } from '../sim/data';
import type { Grid, Vec3 } from '../sim/grid';
import type { Quality } from './settings';

type Tone = keyof GamePalette;

const VIEW_GROUP = 1;
const EFFECT_GROUP = 0;
const TRACER_MS = 70;
const FLASH_MS = 55;
const IMPACT_MS = 900;
const BLAST_MS = 420;

export interface AvatarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouched: boolean;
  alive: boolean;
  weapon: string;
}

export interface AvatarLook {
  team: number;
  teams: boolean;
  outfit: string | null;
}

interface Avatar {
  root: TransformNode;
  legs: Mesh;
  torso: Mesh;
  head: Mesh;
  arm: TransformNode;
  gun: Mesh;
  look: string;
  deadSince: number | null;
}

interface Effect {
  mesh: Mesh;
  until: number;
  grow?: number;
}

// Gun silhouettes: length, height and whether a scope sits on top. All boxes, no files.
const GUN_SHAPES: Record<string, [number, number, boolean]> = {
  pistol: [0.24, 0.12, false],
  revolver: [0.3, 0.13, false],
  smg: [0.45, 0.14, false],
  shotgun: [0.72, 0.12, false],
  carbine: [0.62, 0.13, false],
  rifle: [0.74, 0.14, false],
  sniper: [0.95, 0.12, true],
  knife: [0.3, 0.04, false],
  grenade: [0.12, 0.12, false],
  smoke: [0.12, 0.16, false],
};

export class World {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  private readonly colors: Record<Tone, Color3>;
  private readonly avatars: Avatar[] = [];
  private readonly effects: Effect[] = [];
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly viewmodel: TransformNode;
  private viewGun: Mesh | null = null;
  private viewKey = '';
  private flash: Mesh;
  private shadows: ShadowGenerator | null = null;
  private projectiles: Mesh[] = [];
  private smokes: Mesh[] = [];
  private bomb: Mesh;
  private bobTime = 0;
  private kick = 0;

  constructor(
    canvas: HTMLCanvasElement,
    palette: GamePalette,
    private readonly grid: Grid,
    quality: Quality,
  ) {
    this.engine = new Engine(canvas, quality !== 'low', {
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.engine.setHardwareScalingLevel(quality === 'low' ? 1.5 : 1);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.colors = Object.fromEntries(
      (Object.keys(palette) as Tone[]).map((key) => [key, Color3.FromHexString(palette[key])]),
    ) as Record<Tone, Color3>;
    const sky = this.colors.canvas;
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = sky;
    this.scene.fogStart = 45;
    this.scene.fogEnd = 140;
    // The weapon in hand draws last on a clean depth buffer so it never sinks into walls.
    this.scene.setRenderingAutoClearDepthStencil(VIEW_GROUP, true);

    const hemi = new HemisphericLight('sky', new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 1.05;
    hemi.groundColor = Color3.Lerp(this.colors.canvas, this.colors.ink, 0.3);
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.35), this.scene);
    sun.position = new Vector3(grid.width * grid.cell, 40, 0);
    sun.intensity = 0.75;
    if (quality === 'high') {
      this.shadows = new ShadowGenerator(1024, sun);
      this.shadows.usePercentageCloserFiltering = true;
    }

    this.camera = new UniversalCamera('eye', new Vector3(0, 2, 0), this.scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 300;
    this.camera.inputs.clear();

    this.buildMap(quality !== 'low');
    this.viewmodel = new TransformNode('viewmodel', this.scene);
    this.viewmodel.parent = this.camera;
    this.viewmodel.scaling.setAll(0.8);
    this.flash = MeshBuilder.CreateSphere('flash', { diameter: 0.12, segments: 4 }, this.scene);
    this.flash.material = this.emissive('flash', this.colors.reward);
    this.flash.parent = this.viewmodel;
    this.flash.renderingGroupId = VIEW_GROUP;
    this.flash.setEnabled(false);
    this.bomb = MeshBuilder.CreateBox(
      'bomb',
      { width: 0.42, height: 0.22, depth: 0.3 },
      this.scene,
    );
    this.bomb.material = this.flat('bomb', this.colors.danger);
    this.bomb.setEnabled(false);
  }

  private flat(name: string, color: Color3, alpha = 1): StandardMaterial {
    const key = `${name}:${color.toHexString()}:${alpha}`;
    const known = this.materials.get(key);
    if (known) return known;
    const material = new StandardMaterial(key, this.scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    material.alpha = alpha;
    this.materials.set(key, material);
    return material;
  }

  private emissive(name: string, color: Color3): StandardMaterial {
    const material = this.flat(`${name}-glow`, color);
    material.emissiveColor = color;
    material.disableLighting = true;
    return material;
  }

  private outline(mesh: Mesh): void {
    mesh.enableEdgesRendering(0.99);
    mesh.edgesWidth = 2.5;
    const ink = this.colors.ink;
    mesh.edgesColor = new Color4(ink.r, ink.g, ink.b, 1);
  }

  private kindColor(kind: string, run: number): Color3 {
    const c = this.colors;
    switch (kind) {
      case '#':
        return Color3.Lerp(c.surface, c.fg, 0.42);
      case 'H':
        return Color3.Lerp(c.surface, c.fg, 0.58);
      case 'C':
        return [c.accent, c.danger, c.reward, c.accentSoft][run % 4] ?? c.accent;
      case 'c':
        return Color3.Lerp(c.reward, c.surface, 0.15);
      case 'w':
        return Color3.Lerp(c.accentSoft, c.fg, 0.2);
      default:
        return Color3.Lerp(c.surface, c.fg, 0.3);
    }
  }

  private buildMap(edges: boolean): void {
    const { grid } = this;
    const size = grid.cell;
    const width = grid.width * size;
    const depth = grid.depth * size;
    const floor = MeshBuilder.CreateBox('floor', { width, depth, height: 0.2 }, this.scene);
    floor.position.set(width / 2, -0.1, depth / 2);
    floor.material = this.flat('floor', Color3.Lerp(this.colors.surface, this.colors.fg, 0.16));
    floor.receiveShadows = true;
    floor.freezeWorldMatrix();

    const pieces = new Map<string, Mesh[]>();
    let runIndex = 0;
    for (let z = 0; z < grid.depth; z += 1) {
      let x = 0;
      while (x < grid.width) {
        const kind = grid.kind(x, z);
        let end = x + 1;
        while (end < grid.width && grid.kind(end, z) === kind) end += 1;
        const height = cellHeight(kind);
        if (height > 0) {
          const box = MeshBuilder.CreateBox(
            `cell-${x}-${z}`,
            { width: (end - x) * size, depth: size, height },
            this.scene,
          );
          box.position.set(((x + end) / 2) * size, height / 2, (z + 0.5) * size);
          const key = kind === 'C' ? `C${runIndex % 4}` : kind;
          box.material = this.flat(`kind-${key}`, this.kindColor(kind, runIndex));
          pieces.set(key, [...(pieces.get(key) ?? []), box]);
          runIndex += 1;
        } else if (kind !== '.') {
          this.floorMark(kind, x, end, z);
        }
        x = end;
      }
    }
    for (const [key, meshes] of pieces) {
      const merged = Mesh.MergeMeshes(meshes, true, true);
      if (!merged) continue;
      merged.name = `map-${key}`;
      merged.receiveShadows = true;
      merged.freezeWorldMatrix();
      if (edges) this.outline(merged);
      this.shadows?.addShadowCaster(merged);
    }
    for (const site of ['A', 'B']) this.siteLabel(site);
  }

  private floorMark(kind: string, x: number, end: number, z: number): void {
    const size = this.grid.cell;
    const tone =
      kind === 'A' || kind === 'B'
        ? this.colors.reward
        : kind === 'a'
          ? this.colors.danger
          : this.colors.accent;
    const mark = MeshBuilder.CreateGround(
      `mark-${x}-${z}`,
      { width: (end - x) * size, height: size },
      this.scene,
    );
    mark.position.set(((x + end) / 2) * size, 0.012, (z + 0.5) * size);
    mark.material = this.flat(`mark-${kind}`, tone, 0.28);
    mark.freezeWorldMatrix();
  }

  private siteLabel(site: string): void {
    const cells: [number, number][] = [];
    for (let z = 0; z < this.grid.depth; z += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        if (this.grid.kind(x, z) === site) cells.push([x, z]);
      }
    }
    if (cells.length === 0) return;
    const cx = cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
    const cz = cells.reduce((sum, [, z]) => sum + z, 0) / cells.length;
    const texture = new DynamicTexture(`site-${site}`, { width: 256, height: 256 }, this.scene);
    texture.hasAlpha = true;
    texture.drawText(
      site,
      null,
      200,
      'bold 220px sans-serif',
      this.colors.ink.toHexString(),
      'transparent',
      true,
    );
    const material = new StandardMaterial(`site-${site}`, this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.specularColor = Color3.Black();
    const label = MeshBuilder.CreateGround(`site-${site}`, { width: 4, height: 4 }, this.scene);
    label.material = material;
    label.position.set((cx + 0.5) * this.grid.cell, 0.02, (cz + 0.5) * this.grid.cell);
  }

  private teamColor(look: AvatarLook, index: number): Color3 {
    if (look.teams) return look.team === 0 ? this.colors.danger : this.colors.accent;
    const spread = [
      this.colors.danger,
      this.colors.accent,
      this.colors.reward,
      this.colors.accentSoft,
    ];
    return spread[index % spread.length] ?? this.colors.accent;
  }

  private toneOf(tone: string | undefined): Color3 {
    return (tone && tone in this.colors ? this.colors[tone as Tone] : null) ?? this.colors.fg;
  }

  avatar(index: number, look: AvatarLook): void {
    const key = `${look.team}:${look.teams}:${look.outfit ?? ''}`;
    const existing = this.avatars[index];
    if (existing?.look === key) return;
    existing?.root.dispose();

    const root = new TransformNode(`avatar-${index}`, this.scene);
    const body = this.teamColor(look, index);
    const dark = Color3.Lerp(this.colors.ink, this.colors.fgMuted, 0.4);
    const legs = MeshBuilder.CreateBox(
      `legs-${index}`,
      { width: 0.5, height: 0.8, depth: 0.3 },
      this.scene,
    );
    legs.position.y = 0.4;
    legs.material = this.flat('legs', dark);
    const torso = MeshBuilder.CreateBox(
      `torso-${index}`,
      { width: 0.64, height: 0.62, depth: 0.36 },
      this.scene,
    );
    torso.position.y = 1.11;
    torso.material = this.flat('torso', body);
    const head = MeshBuilder.CreateBox(`head-${index}`, { size: 0.36 }, this.scene);
    head.position.y = 1.6;
    head.material = this.flat('head', Color3.Lerp(this.colors.surface, this.colors.reward, 0.25));
    const arm = new TransformNode(`arm-${index}`, this.scene);
    arm.parent = root;
    arm.position.set(0.18, 1.3, 0.1);
    const gun = MeshBuilder.CreateBox(
      `gun-${index}`,
      { width: 0.09, height: 0.12, depth: 0.6 },
      this.scene,
    );
    gun.parent = arm;
    gun.position.z = 0.3;
    gun.material = this.flat('gun', this.colors.ink);
    for (const part of [legs, torso, head]) {
      part.parent = root;
      this.outline(part);
      this.shadows?.addShadowCaster(part);
    }

    const outfit = cosmetics.outfits.find((item) => item.id === look.outfit);
    if (outfit && outfit.accessory !== 'none') {
      const tone = this.flat(`outfit-${outfit.id}`, this.toneOf(outfit.tone));
      const piece =
        outfit.accessory === 'cap'
          ? MeshBuilder.CreateBox('cap', { width: 0.4, height: 0.1, depth: 0.5 }, this.scene)
          : outfit.accessory === 'helmet'
            ? MeshBuilder.CreateBox('helmet', { width: 0.42, height: 0.2, depth: 0.42 }, this.scene)
            : outfit.accessory === 'visor'
              ? MeshBuilder.CreateBox(
                  'visor',
                  { width: 0.38, height: 0.1, depth: 0.06 },
                  this.scene,
                )
              : MeshBuilder.CreateBox(
                  'scarf',
                  { width: 0.5, height: 0.12, depth: 0.42 },
                  this.scene,
                );
      piece.material = tone;
      piece.parent = head;
      piece.position.set(
        0,
        outfit.accessory === 'scarf' ? -0.24 : outfit.accessory === 'visor' ? 0.02 : 0.2,
        outfit.accessory === 'visor' ? 0.2 : outfit.accessory === 'cap' ? 0.05 : 0,
      );
      this.outline(piece);
    }
    this.avatars[index] = { root, legs, torso, head, arm, gun, look: key, deadSince: null };
  }

  placeAvatar(index: number, pose: AvatarPose, visible: boolean, now: number): void {
    const avatar = this.avatars[index];
    if (!avatar) return;
    avatar.root.setEnabled(visible);
    if (!visible) return;
    avatar.root.position.set(pose.x, pose.y, pose.z);
    avatar.root.rotation.y = pose.yaw;
    if (!pose.alive) {
      // A short fall to the side, then the body stays down until the respawn.
      avatar.deadSince ??= now;
      const t = Math.min(1, (now - avatar.deadSince) / 300);
      avatar.root.rotation.z = (Math.PI / 2) * t;
      avatar.root.position.y = pose.y + 0.25 * t;
      return;
    }
    avatar.deadSince = null;
    avatar.root.rotation.z = 0;
    const crouch = pose.crouched ? 0.55 : 0;
    avatar.legs.scaling.y = pose.crouched ? 0.5 : 1;
    avatar.legs.position.y = pose.crouched ? 0.2 : 0.4;
    avatar.torso.position.y = 1.11 - crouch;
    avatar.head.position.y = 1.6 - crouch;
    avatar.arm.position.y = 1.3 - crouch;
    avatar.arm.rotation.x = pose.pitch;
    const shape = GUN_SHAPES[pose.weapon] ?? GUN_SHAPES.pistol ?? [0.3, 0.12, false];
    avatar.gun.scaling.z = shape[0] / 0.6;
    avatar.gun.position.z = shape[0] / 2;
  }

  hideAvatarsFrom(count: number): void {
    for (let i = count; i < this.avatars.length; i += 1) this.avatars[i]?.root.setEnabled(false);
  }

  setCamera(eye: Vec3, yaw: number, pitch: number, fovDegrees: number): void {
    this.camera.position.set(eye[0], eye[1], eye[2]);
    this.camera.rotation.set(pitch - this.kick * 0.02, yaw, 0);
    this.camera.fov = (fovDegrees * Math.PI) / 180;
  }

  viewWeapon(weaponId: string | null, skin: string | null): void {
    const key = `${weaponId ?? ''}:${skin ?? ''}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.viewGun?.dispose();
    this.viewGun = null;
    if (!weaponId) return;
    const [length, height, scoped] = GUN_SHAPES[weaponId] ?? [0.4, 0.12, false];
    const parts: Mesh[] = [];
    const body = MeshBuilder.CreateBox(
      'vm-body',
      { width: 0.07, height, depth: length },
      this.scene,
    );
    body.position.z = length / 2;
    parts.push(body);
    if (weaponId !== 'knife' && weaponId !== 'grenade' && weaponId !== 'smoke') {
      const grip = MeshBuilder.CreateBox(
        'vm-grip',
        { width: 0.06, height: 0.16, depth: 0.08 },
        this.scene,
      );
      grip.position.set(0, -0.12, 0.06);
      grip.rotation.x = -0.25;
      parts.push(grip);
    }
    if (scoped) {
      const scope = MeshBuilder.CreateBox(
        'vm-scope',
        { width: 0.06, height: 0.07, depth: 0.32 },
        this.scene,
      );
      scope.position.set(0, height / 2 + 0.05, length / 2);
      parts.push(scope);
    }
    const gun = Mesh.MergeMeshes(parts, true, true);
    if (!gun) return;
    gun.parent = this.viewmodel;
    gun.renderingGroupId = VIEW_GROUP;
    gun.material = this.skinMaterial(weaponId, skin);
    this.outline(gun);
    this.viewGun = gun;
    this.flash.position.set(0, 0.02, length + 0.05);
  }

  private skinMaterial(weaponId: string, skin: string | null): StandardMaterial {
    const spec = cosmetics.skins.find((item) => item.id === skin);
    const knifeLike = weaponId === 'knife' || weaponId === 'grenade' || weaponId === 'smoke';
    if (!spec || spec.pattern === 'plain' || knifeLike) {
      const base = knifeLike ? this.colors.fgMuted : this.toneOf(spec?.tone ?? 'fgMuted');
      return this.flat(`skin-${spec?.id ?? 'none'}-${weaponId}`, base);
    }
    const name = `skin-${spec.id}`;
    const known = this.materials.get(name);
    if (known) return known;
    const texture = new DynamicTexture(name, { width: 64, height: 64 }, this.scene);
    const context = texture.getContext();
    const tone = this.toneOf(spec.tone).toHexString();
    const ink = this.colors.ink.toHexString();
    context.fillStyle = tone;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = ink;
    if (spec.pattern === 'stripes') {
      for (let i = 0; i < 64; i += 16) context.fillRect(i, 0, 6, 64);
    } else if (spec.pattern === 'checker') {
      for (let y = 0; y < 64; y += 16) {
        for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < 64; x += 32) context.fillRect(x, y, 16, 16);
      }
    } else {
      for (const [x, y, w, h] of [
        [4, 6, 18, 10],
        [30, 20, 22, 12],
        [10, 38, 14, 16],
        [40, 46, 18, 10],
      ] as const) {
        context.fillRect(x, y, w, h);
      }
    }
    texture.update();
    const material = new StandardMaterial(name, this.scene);
    material.diffuseTexture = texture;
    material.specularColor = Color3.Black();
    this.materials.set(name, material);
    return material;
  }

  animateViewmodel(
    dt: number,
    speed: number,
    reloading: boolean,
    visible: boolean,
    scoped: boolean,
  ): void {
    this.viewmodel.setEnabled(visible && !scoped);
    this.bobTime += dt * (2 + speed * 1.6);
    const bob = Math.min(1, speed / rules.movement.runSpeed);
    this.kick = Math.max(0, this.kick - dt * 9);
    const drop = reloading ? 0.18 : 0;
    this.viewmodel.position.set(
      0.3 + Math.cos(this.bobTime) * 0.012 * bob,
      -0.3 - drop + Math.abs(Math.sin(this.bobTime)) * 0.018 * bob,
      0.62 - this.kick * 0.05,
    );
    this.viewmodel.rotation.x = -this.kick * 0.08 + (reloading ? 0.5 : 0);
  }

  fireKick(amount: number): void {
    this.kick = Math.min(2.5, this.kick + amount);
    this.flash.setEnabled(this.viewKey.split(':')[0] !== 'knife');
    this.effects.push({ mesh: this.flash, until: performance.now() + FLASH_MS });
  }

  tracer(from: Vec3, to: Vec3): void {
    const line = MeshBuilder.CreateLines(
      'tracer',
      {
        points: [new Vector3(...from), new Vector3(...to)],
        colors: [new Color4(1, 1, 1, 0), Color4.FromColor3(this.colors.reward, 1)],
      },
      this.scene,
    );
    line.renderingGroupId = EFFECT_GROUP;
    this.effects.push({ mesh: line, until: performance.now() + TRACER_MS });
    const spark = MeshBuilder.CreateBox('impact', { size: 0.08 }, this.scene);
    spark.position.set(...to);
    spark.material = this.flat('impact', this.colors.ink);
    this.effects.push({ mesh: spark, until: performance.now() + IMPACT_MS });
  }

  blast(at: Vec3): void {
    const sphere = MeshBuilder.CreateSphere('blast', { diameter: 1, segments: 8 }, this.scene);
    sphere.position.set(...at);
    sphere.material = this.emissive('blast', this.colors.reward);
    this.effects.push({ mesh: sphere, until: performance.now() + BLAST_MS, grow: 14 });
  }

  setProjectiles(list: [number, number, number, number][]): void {
    while (this.projectiles.length < list.length) {
      const nade = MeshBuilder.CreateSphere('nade', { diameter: 0.16, segments: 6 }, this.scene);
      nade.material = this.flat('nade', this.colors.ink);
      this.projectiles.push(nade);
    }
    this.projectiles.forEach((mesh, i) => {
      const item = list[i];
      mesh.setEnabled(Boolean(item));
      if (item) mesh.position.set(item[0], item[1], item[2]);
    });
  }

  setSmokes(list: [number, number, number, number][]): void {
    const radius = rules.combat.smokeRadius;
    while (this.smokes.length < list.length) {
      const cloud = MeshBuilder.CreateSphere(
        'smoke',
        { diameter: radius * 2, segments: 10 },
        this.scene,
      );
      const material = this.flat(
        'smoke',
        Color3.Lerp(this.colors.surface, this.colors.fgMuted, 0.35),
        0.94,
      );
      material.emissiveColor = Color3.Lerp(this.colors.surface, this.colors.fgMuted, 0.2);
      material.backFaceCulling = false;
      cloud.material = material;
      this.smokes.push(cloud);
    }
    this.smokes.forEach((mesh, i) => {
      const item = list[i];
      mesh.setEnabled(Boolean(item));
      if (!item) return;
      // Clouds puff up over the first second and thin out in the last two.
      const left = item[3];
      const scale =
        Math.min(1, (rules.combat.smokeMs - left) / 1000) * Math.min(1, left / 2000 + 0.3);
      mesh.position.set(item[0], Math.max(item[1], 1.2), item[2]);
      mesh.scaling.setAll(Math.max(0.05, scale));
    });
  }

  setBomb(at: Vec3 | null, blinking: boolean, now: number): void {
    this.bomb.setEnabled(at !== null);
    if (!at) return;
    this.bomb.position.set(at[0], at[1] + 0.11, at[2]);
    const on = blinking && Math.floor(now / 400) % 2 === 0;
    this.bomb.material = on
      ? this.emissive('bomb-on', this.colors.danger)
      : this.flat('bomb', this.colors.ink);
  }

  // CSS pixel position of a world point, or null when it is behind the camera.
  project(point: Vec3): { x: number; y: number } | null {
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const projected = Vector3.Project(
      new Vector3(...point),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(width, height),
    );
    if (projected.z < 0 || projected.z > 1) return null;
    const scale = this.engine.getHardwareScalingLevel();
    return { x: projected.x * scale, y: projected.y * scale };
  }

  render(): void {
    const now = performance.now();
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      if (!effect) continue;
      if (effect.grow) {
        const life = 1 - (effect.until - now) / BLAST_MS;
        effect.mesh.scaling.setAll(1 + effect.grow * life);
        effect.mesh.visibility = 1 - life;
      }
      if (now < effect.until) continue;
      if (effect.mesh === this.flash) this.flash.setEnabled(false);
      else effect.mesh.dispose();
      this.effects.splice(i, 1);
    }
    this.scene.render();
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
