import trackFile from '../data/track.json';

// Mirrors `apps/realtime/src/matches/kart.rs`. The server is authoritative
// online; this copy runs solo races and predicts the local kart. Change both together.

export const TICK_SECONDS = 1 / 30;
export const COUNTDOWN_MS = 3_000;
const CHECKPOINTS = 4;
const GRID_GAP = 6;
const GRID_LANE = 3.5;

export interface KartState {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface KartInput {
  throttle: number;
  steer: number;
  drift: boolean;
}

export interface Progress {
  lap: number;
  nextCheckpoint: number;
  index: number;
}

export interface Nearest {
  index: number;
  distance: number;
  point: [number, number];
}

const tuning = trackFile.kart;
export const track = {
  laps: trackFile.laps,
  width: trackFile.width,
  wallMargin: trackFile.wallMargin,
  samples: sampleLoop(trackFile.controlPoints as [number, number][], trackFile.samplesPerSegment),
  kart: tuning,
};

function sampleLoop(points: [number, number][], perSegment: number): [number, number][] {
  const n = points.length;
  const samples: [number, number][] = [];
  const at = (i: number) => points[((i % n) + n) % n] ?? [0, 0];
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const axis = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      samples.push([axis(0), axis(1)]);
    }
  }
  return samples;
}

export function sample(index: number): [number, number] {
  const n = track.samples.length;
  return track.samples[((index % n) + n) % n] ?? [0, 0];
}

export function nearest(x: number, z: number): Nearest {
  const n = track.samples.length;
  let best: Nearest = { index: 0, distance: Infinity, point: sample(0) };
  for (let i = 0; i < n; i += 1) {
    const [ax, az] = sample(i);
    const [bx, bz] = sample(i + 1);
    const sx = bx - ax;
    const sz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz)));
    const px = ax + sx * t;
    const pz = az + sz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      best = { index: t > 0.5 ? (i + 1) % n : i, distance, point: [px, pz] };
    }
  }
  return best;
}

export function gridSlot(slot: number): KartState {
  const [sx, sz] = sample(0);
  const [nx, nz] = sample(1);
  const length = Math.hypot(nx - sx, nz - sz);
  const dx = (nx - sx) / length;
  const dz = (nz - sz) / length;
  const back = GRID_GAP * (1 + Math.floor(slot / 2));
  const lane = slot % 2 === 0 ? GRID_LANE : -GRID_LANE;
  return {
    x: sx - dx * back + dz * lane,
    z: sz - dz * back - dx * lane,
    heading: Math.atan2(dx, dz),
    speed: 0,
  };
}

export function step(state: KartState, input: KartInput, dt: number): void {
  const half = track.width / 2;
  const onTrack = nearest(state.x, state.z).distance <= half;

  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  if (throttle > 0) {
    state.speed += tuning.acceleration * throttle * dt;
  } else if (throttle < 0) {
    state.speed =
      state.speed > 0
        ? Math.max(0, state.speed + tuning.braking * throttle * dt)
        : state.speed + tuning.acceleration * 0.5 * throttle * dt;
  }

  let drag = onTrack ? tuning.drag : tuning.offTrackDrag;
  if (input.drift) drag += tuning.driftDrag;
  state.speed -= state.speed * drag * dt;

  const cap = onTrack ? tuning.maxSpeed : tuning.offTrackMaxSpeed;
  if (state.speed > cap) state.speed -= (state.speed - cap) * Math.min(3 * dt, 1);
  state.speed = clamp(state.speed, -tuning.reverseMax, tuning.maxSpeed);

  const grip = Math.min(Math.abs(state.speed) / tuning.fullSteerSpeed, 1) * Math.sign(state.speed);
  const turn = input.drift ? tuning.driftTurn : 1;
  state.heading += steer * tuning.steerRate * turn * grip * dt;
  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;

  const wall = half + track.wallMargin;
  const near = nearest(state.x, state.z);
  if (near.distance > wall) {
    const [px, pz] = near.point;
    const scale = wall / near.distance;
    state.x = px + (state.x - px) * scale;
    state.z = pz + (state.z - pz) * scale;
    state.speed *= tuning.wallSlowdown;
  }
}

export function freshProgress(index: number): Progress {
  return { lap: 0, nextCheckpoint: 1, index };
}

// Checkpoints sit at each quarter of the loop; the fourth is the start line.
export function updateProgress(progress: Progress, index: number): void {
  const n = track.samples.length;
  progress.index = index;
  const target = Math.floor(((progress.nextCheckpoint % CHECKPOINTS) * n) / CHECKPOINTS);
  const window = Math.floor(n / 16);
  if ((index + n - target) % n < window) {
    if (progress.nextCheckpoint === CHECKPOINTS) {
      progress.lap += 1;
      progress.nextCheckpoint = 1;
    } else {
      progress.nextCheckpoint += 1;
    }
  }
}

// A single number that orders karts by how far round the race they are.
export function distance(progress: Progress): number {
  const n = track.samples.length;
  const quarter = Math.floor(n / CHECKPOINTS);
  const leg = (progress.nextCheckpoint - 1) * quarter;
  // Karts still behind the start of their leg (the grid sits behind the line)
  // have covered nothing of it yet.
  const raw = (progress.index + n - leg) % n;
  const intoLeg = raw > n / 2 ? 0 : raw;
  return progress.lap * n + leg + Math.min(intoLeg, quarter);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
