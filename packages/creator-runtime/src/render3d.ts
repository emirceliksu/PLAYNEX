import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3,
  VertexData,
} from '@babylonjs/core';

import type { ShapeKind } from './document';
import { F, type RenderSetup, type Renderer, type WorldView } from './view';

const OUTLINE_WIDTH = 0.035;
const CAMERA_FOLLOW = 5;
const SHAKE_DECAY = 6;

interface Visual {
  kind: ShapeKind;
  mesh: Mesh;
  color: number;
  text?: { texture: DynamicTexture; content: string };
}

export function createRenderer3d(container: HTMLElement, setup: RenderSetup): Renderer {
  return new Renderer3d(container, setup);
}

class Renderer3d implements Renderer {
  private readonly canvas = document.createElement('canvas');
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly materials: StandardMaterial[];
  // The wedge is built without caring about winding, so it is drawn and lit from both sides.
  private readonly rampMaterials: StandardMaterial[];
  private readonly ink: Color3;
  private readonly templates = new Map<ShapeKind, Mesh>();
  private readonly visuals = new Map<number, Visual>();
  private readonly resize = new ResizeObserver(() => this.engine.resize());
  private shake = 0;
  private lastSync = performance.now();

  constructor(
    container: HTMLElement,
    private readonly setup: RenderSetup,
  ) {
    this.canvas.className = 'block size-full touch-none outline-none';
    container.append(this.canvas);
    this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true });
    this.scene = new Scene(this.engine);
    const background = Color3.FromHexString(
      setup.swatches[setup.document.world.background] ?? setup.ink,
    );
    this.scene.clearColor = new Color4(background.r, background.g, background.b, 1);
    this.ink = Color3.FromHexString(setup.ink);

    const sky = new HemisphericLight('sky', new Vector3(0.2, 1, -0.3), this.scene);
    sky.intensity = 0.75;
    sky.groundColor = background.scale(0.6);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.6), this.scene);
    sun.intensity = 0.55;

    this.materials = setup.swatches.map((hex, index) => {
      const material = new StandardMaterial(`swatch-${index}`, this.scene);
      material.diffuseColor = Color3.FromHexString(hex);
      material.specularColor = Color3.Black();
      material.emissiveColor = Color3.FromHexString(hex).scale(0.18);
      return material;
    });

    this.rampMaterials = this.materials.map((material) => {
      const twoSided = material.clone(`${material.name}-ramp`);
      twoSided.backFaceCulling = false;
      twoSided.twoSidedLighting = true;
      return twoSided;
    });

    const size = setup.document.world.size;
    this.camera = new UniversalCamera(
      'camera',
      new Vector3(0, size.y * 0.8, -Math.max(size.x, size.z ?? 0) * 0.85),
      this.scene,
    );
    this.camera.setTarget(Vector3.Zero());
    this.camera.minZ = 0.1;
    this.camera.inputs.clear();

    this.resize.observe(container);
    this.engine.runRenderLoop(() => this.scene.render());
  }

  sync(view: WorldView): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastSync) / 1000);
    this.lastSync = now;
    const { entities, stride, frame } = view;
    const seen = new Set<number>();
    const textOf = new Map(frame.texts);
    let target: Vector3 | null = null;

    for (let i = 0; i < entities.length; i += stride) {
      const id = entities[i + F.id]!;
      const archetype = this.setup.archetypes[entities[i + F.archetype]!];
      if (!archetype) continue;
      seen.add(id);
      const kind = archetype.shape.kind;
      let visual = this.visuals.get(id);
      if (!visual) {
        visual = this.createVisual(kind);
        this.visuals.set(id, visual);
      }
      const color = entities[i + F.color]!;
      if (visual.color !== color && !visual.text) {
        visual.mesh.material =
          (visual.kind === 'ramp' ? this.rampMaterials : this.materials)[color] ?? null;
        visual.color = color;
      }
      if (visual.text) this.paintText(visual, textOf.get(id) ?? '', color);

      const mesh = visual.mesh;
      mesh.isVisible = entities[i + F.visible] !== 0;
      mesh.position.set(entities[i + F.x]!, entities[i + F.y]!, entities[i + F.z]!);
      mesh.scaling.set(entities[i + F.width]!, entities[i + F.height]!, entities[i + F.depth]!);
      mesh.rotation.y = (-entities[i + F.rotation]! * Math.PI) / 180;
      if (id === frame.cameraTarget) target = mesh.position;
    }

    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        visual.text?.texture.dispose();
        visual.mesh.dispose();
        this.visuals.delete(id);
      }
    }

    for (const event of frame.events) {
      if (event.kind === 'shake' && !this.setup.reducedMotion)
        this.shake = Math.max(this.shake, event.strength * 0.15);
    }
    this.placeCamera(target, dt);
  }

  destroy(): void {
    this.resize.disconnect();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
    this.canvas.remove();
  }

  private placeCamera(target: Vector3 | null, dt: number): void {
    const mode = this.setup.document.world.camera ?? 'fixed';
    if (target && mode !== 'fixed') {
      const offset =
        mode === 'topDown'
          ? new Vector3(0, 18, -0.01)
          : mode === 'thirdPerson'
            ? new Vector3(0, 4, -8)
            : new Vector3(0, 7, -11);
      const desired = target.add(offset);
      const blend = this.setup.reducedMotion ? 1 : 1 - Math.exp(-CAMERA_FOLLOW * dt);
      this.camera.position = Vector3.Lerp(this.camera.position, desired, blend);
      this.camera.setTarget(target);
    }
    if (this.shake > 0.001) {
      const jitter = new Vector3(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
        0,
      );
      this.camera.position.addInPlace(jitter);
      this.shake *= Math.exp(-SHAKE_DECAY * dt);
    }
  }

  private createVisual(kind: ShapeKind): Visual {
    if (kind === 'text') {
      const mesh = MeshBuilder.CreatePlane('text', { size: 1 }, this.scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const texture = new DynamicTexture('text', { width: 512, height: 128 }, this.scene, true);
      texture.hasAlpha = true;
      const material = new StandardMaterial('text', this.scene);
      material.diffuseTexture = texture;
      material.emissiveColor = Color3.White();
      material.disableLighting = true;
      material.useAlphaFromDiffuseTexture = true;
      mesh.material = material;
      return { kind, mesh, color: -1, text: { texture, content: '\u0000' } };
    }
    let template = this.templates.get(kind);
    if (!template) {
      template = this.buildTemplate(kind);
      template.setEnabled(false);
      this.templates.set(kind, template);
    }
    const mesh = template.clone(kind, null, true);
    mesh.setEnabled(true);
    mesh.renderOutline = true;
    mesh.outlineColor = this.ink;
    mesh.outlineWidth = OUTLINE_WIDTH;
    return { kind, mesh, color: -1 };
  }

  private buildTemplate(kind: ShapeKind): Mesh {
    switch (kind) {
      case 'sphere':
        return MeshBuilder.CreateSphere(kind, { diameter: 1, segments: 16 }, this.scene);
      case 'cylinder':
        return MeshBuilder.CreateCylinder(
          kind,
          { diameter: 1, height: 1, tessellation: 24 },
          this.scene,
        );
      case 'cone':
        return MeshBuilder.CreateCylinder(
          kind,
          { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 24 },
          this.scene,
        );
      case 'ramp':
        return buildRamp(this.scene);
      default:
        return MeshBuilder.CreateBox(kind, { size: 1 }, this.scene);
    }
  }

  private paintText(visual: Visual, content: string, color: number): void {
    const text = visual.text;
    if (!text || (text.content === content && visual.color === color)) return;
    text.content = content;
    visual.color = color;
    const ctx = text.texture.getContext();
    ctx.clearRect(0, 0, 512, 128);
    text.texture.drawText(
      content,
      null,
      92,
      `700 72px ${this.setup.fontFamily}`,
      this.setup.swatches[color] ?? this.setup.ink,
      'transparent',
      true,
    );
  }
}

// A wedge rising along +x, matching the engine's ramp collider.
function buildRamp(scene: Scene): Mesh {
  const a = [-0.5, -0.5, -0.5];
  const b = [0.5, -0.5, -0.5];
  const c = [0.5, 0.5, -0.5];
  const d = [-0.5, -0.5, 0.5];
  const e = [0.5, -0.5, 0.5];
  const f = [0.5, 0.5, 0.5];
  const faces = [
    [a, c, b],
    [d, e, f],
    [a, b, e, d],
    [b, c, f, e],
    [a, d, f, c],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const vertex of face) positions.push(...vertex);
    for (let i = 1; i < face.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh('ramp', scene);
  data.applyToMesh(mesh);

  return mesh;
}
