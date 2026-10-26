import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import type { GamePalette } from '@playnex/game-sdk';
import { type KartState, sample, track } from './model';

const CHASE_DISTANCE = 8.5;
const CHASE_HEIGHT = 4.4;
const LOOK_AHEAD = 6;
const CAMERA_FOLLOW = 6;
const BARRIER_HEIGHT = 0.9;
const CURB_WIDTH = 0.8;
const PYLON_EVERY = 14;

export interface KartVisual {
  root: TransformNode;
}

// Everything is built from primitives at load: no model files, no textures.
// Flat colours and hard edges keep it in line with the 2D games.
export class World {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly karts: KartVisual[] = [];
  private readonly colors: Record<keyof GamePalette, Color3>;

  constructor(canvas: HTMLCanvasElement, palette: GamePalette, seats: number) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new Scene(this.engine);
    this.colors = Object.fromEntries(
      (Object.keys(palette) as (keyof GamePalette)[]).map((key) => [
        key,
        Color3.FromHexString(palette[key]),
      ]),
    ) as Record<keyof GamePalette, Color3>;
    const sky = this.colors.canvas;
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = sky;
    this.scene.fogStart = 90;
    this.scene.fogEnd = 220;

    const hemi = new HemisphericLight('sky', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.75;
    hemi.groundColor = this.colors.accentSoft;
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), this.scene);
    sun.intensity = 0.55;

    this.camera = new UniversalCamera(
      'chase',
      new Vector3(0, CHASE_HEIGHT, -CHASE_DISTANCE),
      this.scene,
    );
    this.camera.minZ = 0.3;
    this.camera.maxZ = 400;
    this.camera.fov = 1.0;
    this.camera.inputs.clear();

    this.buildGround();
    this.buildTrack();
    for (let seat = 0; seat < seats; seat += 1) this.karts.push(this.buildKart(seat));
  }

  placeKart(seat: number, state: KartState): void {
    const kart = this.karts[seat];
    if (!kart) return;
    kart.root.position.set(state.x, 0, state.z);
    kart.root.rotation.y = state.heading;
  }

  hideKart(seat: number): void {
    this.karts[seat]?.root.setEnabled(false);
  }

  // A soft chase camera; `snap` jumps straight there (start of race, respawn).
  follow(state: KartState, dt: number, snap = false): void {
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const wanted = new Vector3(
      state.x - fx * CHASE_DISTANCE,
      CHASE_HEIGHT,
      state.z - fz * CHASE_DISTANCE,
    );
    const blend = snap ? 1 : 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.camera.position = Vector3.Lerp(this.camera.position, wanted, blend);
    this.camera.setTarget(new Vector3(state.x + fx * LOOK_AHEAD, 0.8, state.z + fz * LOOK_AHEAD));
  }

  render(): void {
    this.scene.render();
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }

  private material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    return material;
  }

  private buildGround(): void {
    const ground = MeshBuilder.CreateGround('ground', { width: 600, height: 600 }, this.scene);
    ground.position.y = -0.05;
    ground.material = this.material('ground', this.colors.accentSoft);
  }

  private edge(offset: number, height = 0): Vector3[] {
    const points: Vector3[] = [];
    const n = track.samples.length;
    for (let i = 0; i < n; i += 1) {
      const [px, pz] = sample(i - 1);
      const [x, z] = sample(i);
      const [nx, nz] = sample(i + 1);
      const tx = nx - px;
      const tz = nz - pz;
      const length = Math.hypot(tx, tz) || 1;
      points.push(new Vector3(x + (tz / length) * offset, height, z - (tx / length) * offset));
    }
    return points;
  }

  private ribbon(name: string, inner: Vector3[], outer: Vector3[], color: Color3): void {
    const mesh = MeshBuilder.CreateRibbon(
      name,
      { pathArray: [inner, outer], closePath: true, sideOrientation: 2 },
      this.scene,
    );
    mesh.material = this.material(name, color);
  }

  private buildTrack(): void {
    const half = track.width / 2;
    const wall = half + track.wallMargin;
    this.ribbon('road', this.edge(-half, 0.01), this.edge(half, 0.01), this.colors.surface);
    this.ribbon(
      'curb-left',
      this.edge(-half - CURB_WIDTH, 0.02),
      this.edge(-half, 0.02),
      this.colors.accent,
    );
    this.ribbon(
      'curb-right',
      this.edge(half, 0.02),
      this.edge(half + CURB_WIDTH, 0.02),
      this.colors.accent,
    );
    this.ribbon(
      'wall-left',
      this.edge(-wall, 0),
      this.edge(-wall, BARRIER_HEIGHT),
      this.colors.ink,
    );
    this.ribbon('wall-right', this.edge(wall, 0), this.edge(wall, BARRIER_HEIGHT), this.colors.ink);

    const [sx, sz] = sample(0);
    const [nx, nz] = sample(1);
    const line = MeshBuilder.CreateBox(
      'start',
      { width: track.width, height: 0.03, depth: 1.2 },
      this.scene,
    );
    line.position.set(sx, 0.03, sz);
    line.rotation.y = Math.atan2(nx - sx, nz - sz);
    line.material = this.material('start', this.colors.fg);

    const pylonMaterial = this.material('pylon', this.colors.reward);
    const outer = this.edge(wall + 2.5);
    const inner = this.edge(-wall - 2.5);
    for (let i = 0; i < outer.length; i += PYLON_EVERY) {
      for (const spot of [outer[i], inner[i]]) {
        if (!spot) continue;
        const pylon = MeshBuilder.CreateCylinder(
          `pylon-${i}`,
          { diameterTop: 0, diameterBottom: 1.4, height: 2.2, tessellation: 4 },
          this.scene,
        );
        pylon.position.set(spot.x, 1.1, spot.z);
        pylon.material = pylonMaterial;
      }
    }
  }

  private buildKart(seat: number): KartVisual {
    const tones = [
      this.colors.accent,
      this.colors.reward,
      this.colors.danger,
      this.colors.fg,
      this.colors.fgMuted,
      this.colors.surface,
      this.colors.accentSoft,
      this.colors.canvas,
    ];
    const root = new TransformNode(`kart-${seat}`, this.scene);
    const body = MeshBuilder.CreateBox(
      `kart-body-${seat}`,
      { width: 1.5, height: 0.45, depth: 2.4 },
      this.scene,
    );
    body.position.y = 0.45;
    body.parent = root;
    body.material = this.material(
      `kart-paint-${seat}`,
      tones[seat % tones.length] ?? this.colors.accent,
    );
    const nose = MeshBuilder.CreateBox(
      `kart-nose-${seat}`,
      { width: 1.1, height: 0.3, depth: 0.7 },
      this.scene,
    );
    nose.position.set(0, 0.38, 1.45);
    nose.parent = root;
    nose.material = body.material;
    const driver = MeshBuilder.CreateSphere(
      `kart-driver-${seat}`,
      { diameter: 0.7, segments: 8 },
      this.scene,
    );
    driver.position.set(0, 0.95, -0.2);
    driver.parent = root;
    driver.material = this.material(`kart-helmet-${seat}`, this.colors.fg);
    const tyre = this.material(`kart-tyre-${seat}`, this.colors.ink);
    for (const [x, z] of [
      [-0.85, 0.8],
      [0.85, 0.8],
      [-0.85, -0.8],
      [0.85, -0.8],
    ] as const) {
      const wheel = MeshBuilder.CreateCylinder(
        `kart-wheel-${seat}`,
        { diameter: 0.6, height: 0.35, tessellation: 12 },
        this.scene,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.3, z);
      wheel.parent = root;
      wheel.material = tyre;
    }
    return { root };
  }
}
