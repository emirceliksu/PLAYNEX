'use client';

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GizmoManager,
  HemisphericLight,
  type Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import type { GameDocument } from '@playnex/creator-runtime';
import { buildPrimitive } from '@playnex/creator-runtime/primitives3d';
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { Selection } from './state';

export type GizmoMode = 'move' | 'rotate' | 'scale';

interface Viewport3dProps {
  document: GameDocument;
  selection: Selection;
  swatches: readonly string[];
  ink: string;
  gizmo: GizmoMode;
  snap: boolean;
  label: string;
  onSelect: (selection: Selection) => void;
  onEdit: (change: (document: GameDocument) => void) => void;
}

interface Stage {
  engine: Engine;
  scene: Scene;
  gizmos: GizmoManager;
  materials: StandardMaterial[];
  meshes: Map<number, Mesh>;
  grid: Mesh[];
}

const SNAP = 0.25;
const round = (value: number, snap: boolean) =>
  snap ? Math.round(value / SNAP) * SNAP : Math.round(value * 100) / 100;

export function Viewport3d(props: Viewport3dProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // Babylon observers are registered once; they read the latest props through this ref.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { stencil: true });
    const scene = new Scene(engine);
    const size = latest.current.document.world.size;
    const reach = Math.max(size.x, size.z ?? size.x);
    const camera = new ArcRotateCamera(
      'editor',
      -Math.PI / 2,
      1,
      reach * 1.1,
      Vector3.Zero(),
      scene,
    );
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = reach * 3;
    camera.wheelDeltaPercentage = 0.02;
    camera.attachControl(canvas, true);
    new HemisphericLight('sky', new Vector3(0.2, 1, -0.3), scene).intensity = 0.8;
    new DirectionalLight('sun', new Vector3(-0.4, -1, 0.6), scene).intensity = 0.5;

    const materials = latest.current.swatches.map((hex, index) => {
      const material = new StandardMaterial(`swatch-${index}`, scene);
      material.diffuseColor = Color3.FromHexString(hex);
      material.specularColor = Color3.Black();
      material.emissiveColor = Color3.FromHexString(hex).scale(0.18);
      material.backFaceCulling = false;
      material.twoSidedLighting = true;
      return material;
    });

    const gizmos = new GizmoManager(scene);
    gizmos.usePointerToAttachGizmos = false;
    gizmos.positionGizmoEnabled = true;
    gizmos.rotationGizmoEnabled = true;
    gizmos.scaleGizmoEnabled = true;
    const { positionGizmo, rotationGizmo, scaleGizmo } = gizmos.gizmos;
    if (rotationGizmo) {
      // The engine only knows yaw; tilting a box would look right here and wrong in play.
      rotationGizmo.xGizmo.isEnabled = false;
      rotationGizmo.zGizmo.isEnabled = false;
      rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    }
    const commit = () => {
      const mesh = gizmos.attachedMesh;
      const id = mesh?.metadata as number | undefined;
      if (!mesh || id === undefined) return;
      const { snap, onEdit } = latest.current;
      onEdit((doc) => {
        const entity = doc.entities.find((e) => e.id === id);
        if (!entity) return;
        entity.position = {
          x: round(mesh.position.x, snap),
          y: round(mesh.position.y, snap),
          z: round(mesh.position.z, snap),
        };
        entity.size = {
          x: Math.max(0.05, round(Math.abs(mesh.scaling.x), snap)),
          y: Math.max(0.05, round(Math.abs(mesh.scaling.y), snap)),
          z: Math.max(0.05, round(Math.abs(mesh.scaling.z), snap)),
        };
        const degrees = (-mesh.rotation.y * 180) / Math.PI;
        entity.rotation = ((Math.round(degrees) % 360) + 360) % 360;
      });
    };
    positionGizmo?.onDragEndObservable.add(commit);
    rotationGizmo?.onDragEndObservable.add(commit);
    scaleGizmo?.onDragEndObservable.add(commit);

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) return;
      const id = info.pickInfo?.pickedMesh?.metadata as number | undefined;
      latest.current.onSelect(id === undefined ? null : { list: 'entities', id });
    });

    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(canvas);
    engine.runRenderLoop(() => scene.render());
    stageRef.current = { engine, scene, gizmos, materials, meshes: new Map(), grid: [] };

    return () => {
      resize.disconnect();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      stageRef.current = null;
    };
  }, []);

  const { document, selection, gizmo, swatches, ink } = props;

  useEffect(() => {
    if (stageRef.current) rebuildScene(stageRef.current, document, swatches, ink);
  }, [document, swatches, ink]);

  useEffect(() => {
    if (stageRef.current) showSelection(stageRef.current, selection, gizmo, swatches, ink);
  }, [document, selection, gizmo, swatches, ink]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={props.label}
      className="block size-full touch-none outline-none focus-visible:outline-2 focus-visible:outline-border-focus"
      tabIndex={0}
    />
  );
}

function rebuildScene(
  stage: Stage,
  document: GameDocument,
  swatches: readonly string[],
  ink: string,
): void {
  const background = Color3.FromHexString(swatches[document.world.background] ?? ink);
  stage.scene.clearColor = new Color4(background.r, background.g, background.b, 1);

  for (const line of stage.grid) line.dispose();
  const { x: width, z: depth = width } = document.world.size;
  const lines: Vector3[][] = [];
  for (let x = -Math.floor(width / 2); x <= width / 2; x++) {
    lines.push([new Vector3(x, 0, -depth / 2), new Vector3(x, 0, depth / 2)]);
  }
  for (let z = -Math.floor(depth / 2); z <= depth / 2; z++) {
    lines.push([new Vector3(-width / 2, 0, z), new Vector3(width / 2, 0, z)]);
  }
  const grid = MeshBuilder.CreateLineSystem('grid', { lines }, stage.scene);
  grid.color = Color3.FromHexString(ink).scale(1.6);
  grid.isPickable = false;
  stage.grid = [grid];

  // Scenes are small enough that rebuilding beats diffing; the gizmo is re-attached below.
  // Swatch materials are shared, so only text planes take their own material with them.
  for (const mesh of stage.meshes.values()) mesh.dispose(false, mesh.name === 'text');
  stage.meshes.clear();
  for (const entity of document.entities) {
    const mesh =
      entity.shape.kind === 'text'
        ? textPlane(stage.scene, entity.text ?? entity.name, swatches[entity.color] ?? ink)
        : buildPrimitive(entity.shape.kind, stage.scene);
    if (entity.shape.kind !== 'text') mesh.material = stage.materials[entity.color] ?? null;
    mesh.metadata = entity.id;
    mesh.position.set(entity.position.x, entity.position.y, entity.position.z ?? 0);
    mesh.scaling.set(entity.size.x, entity.size.y, entity.size.z ?? 1);
    mesh.rotation.y = (-(entity.rotation ?? 0) * Math.PI) / 180;
    mesh.visibility = entity.visible === false ? 0.35 : 1;
    mesh.outlineColor = Color3.FromHexString(ink);
    mesh.outlineWidth = 0.03;
    mesh.renderOutline = true;
    stage.meshes.set(entity.id, mesh);
  }
}

function showSelection(
  stage: Stage,
  selection: Selection,
  gizmo: GizmoMode,
  swatches: readonly string[],
  ink: string,
): void {
  const mesh = selection?.list === 'entities' ? stage.meshes.get(selection.id) : undefined;
  stage.gizmos.positionGizmoEnabled = gizmo === 'move';
  stage.gizmos.rotationGizmoEnabled = gizmo === 'rotate';
  stage.gizmos.scaleGizmoEnabled = gizmo === 'scale';
  stage.gizmos.attachToMesh(mesh ?? null);
  for (const [id, candidate] of stage.meshes) {
    candidate.outlineColor =
      id === selection?.id ? Color3.FromHexString(swatches[15] ?? ink) : Color3.FromHexString(ink);
    candidate.outlineWidth = id === selection?.id ? 0.06 : 0.03;
  }
}

function textPlane(scene: Scene, content: string, color: string): Mesh {
  const plane = MeshBuilder.CreatePlane('text', { size: 1 }, scene);
  const texture = new DynamicTexture('text', { width: 512, height: 128 }, scene, true);
  texture.hasAlpha = true;
  texture.drawText(content, null, 92, '700 72px sans-serif', color, 'transparent', true);
  const material = new StandardMaterial('text', scene);
  material.diffuseTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;
  plane.material = material;
  return plane;
}
