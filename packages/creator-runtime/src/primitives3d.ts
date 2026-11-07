import { Mesh, MeshBuilder, type Scene, VertexData } from '@babylonjs/core';

import type { ShapeKind } from './document';

// Unit-sized primitives (1 x 1 x 1) shared by the player and the editor; both
// scale them by the entity size.
export function buildPrimitive(kind: ShapeKind, scene: Scene): Mesh {
  switch (kind) {
    case 'sphere':
      return MeshBuilder.CreateSphere(kind, { diameter: 1, segments: 16 }, scene);
    case 'cylinder':
      return MeshBuilder.CreateCylinder(kind, { diameter: 1, height: 1, tessellation: 24 }, scene);
    case 'cone':
      return MeshBuilder.CreateCylinder(
        kind,
        { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 24 },
        scene,
      );
    case 'ramp':
      return buildRamp(scene);
    default:
      return MeshBuilder.CreateBox(kind, { size: 1 }, scene);
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
