import { rules } from './data';
import type { Grid, Vec3 } from './grid';

// Mirrors `movement.rs` so the local player can be predicted between snapshots.

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  crouched: boolean;
}

export interface MoveInput {
  f: number;
  s: number;
  yaw: number;
  pitch: number;
  j: boolean;
  c: boolean;
  w: boolean;
  u: boolean;
}

export function direction(yaw: number, pitch: number): Vec3 {
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

export function eyeHeight(crouched: boolean): number {
  return crouched ? rules.player.crouchEye : rules.player.eye;
}

export function step(
  body: Body,
  input: MoveInput,
  speedScale: number,
  grid: Grid,
  dt: number,
): void {
  const tuning = rules.movement;
  const radius = rules.player.radius;
  const f = Math.max(-1, Math.min(1, input.f));
  const s = Math.max(-1, Math.min(1, input.s));
  let wx = Math.sin(input.yaw) * f + Math.cos(input.yaw) * s;
  let wz = Math.cos(input.yaw) * f - Math.sin(input.yaw) * s;
  const length = Math.hypot(wx, wz);
  if (length > 1) {
    wx /= length;
    wz /= length;
  }

  body.crouched = input.c;
  const speed =
    (input.c ? tuning.crouchSpeed : input.w ? tuning.walkSpeed : tuning.runSpeed) * speedScale;
  const accel = body.grounded ? tuning.groundAccel : tuning.airAccel;
  const blend = Math.min(1, accel * dt);
  body.vx += (wx * speed - body.vx) * blend;
  body.vz += (wz * speed - body.vz) * blend;

  if (input.j && body.grounded) {
    body.vy = tuning.jumpSpeed;
    body.grounded = false;
  }

  const nextX = body.x + body.vx * dt;
  let floor = grid.support(nextX, body.z, radius);
  if (floor <= body.y + tuning.stepHeight) {
    body.x = nextX;
    if (body.grounded) body.y = Math.max(body.y, floor);
  } else {
    body.vx = 0;
  }
  const nextZ = body.z + body.vz * dt;
  floor = grid.support(body.x, nextZ, radius);
  if (floor <= body.y + tuning.stepHeight) {
    body.z = nextZ;
    if (body.grounded) body.y = Math.max(body.y, floor);
  } else {
    body.vz = 0;
  }

  floor = grid.support(body.x, body.z, radius);
  if (body.grounded && body.y > floor && body.y - floor <= tuning.stepHeight) {
    body.y = floor;
  }
  if (body.y > floor || body.vy > 0) {
    body.vy -= tuning.gravity * dt;
    body.y += body.vy * dt;
    body.grounded = false;
  }
  if (body.y <= floor) {
    body.y = floor;
    body.vy = 0;
    body.grounded = true;
  }
}
