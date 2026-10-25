import table from '../data/table.json';

export { table };

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TableState {
  puck: Body;
  paddles: [Body, Body];
  targets: [Point, Point];
  score: [number, number];
  serveMs: number;
}

export interface Point {
  x: number;
  y: number;
}

const PADDLE_HOME_INSET = 80;

// Mirrors `apps/realtime/src/matches/air_hockey.rs`; the server is authoritative
// online, this copy drives solo and same-device matches. Change both together.
export function createTable(firstReceiver: number): TableState {
  const paddles: [Body, Body] = [
    { x: table.width / 2, y: table.height - PADDLE_HOME_INSET, vx: 0, vy: 0 },
    { x: table.width / 2, y: PADDLE_HOME_INSET, vx: 0, vy: 0 },
  ];
  const state: TableState = {
    puck: { x: 0, y: 0, vx: 0, vy: 0 },
    paddles,
    targets: [
      { x: paddles[0].x, y: paddles[0].y },
      { x: paddles[1].x, y: paddles[1].y },
    ],
    score: [0, 0],
    serveMs: 0,
  };
  serve(state, firstReceiver);
  return state;
}

// Seat 0 defends the bottom goal, seat 1 the top one.
function serve(state: TableState, receiver: number) {
  const offset = receiver === 0 ? table.serveOffset : -table.serveOffset;
  state.puck = { x: table.width / 2, y: table.height / 2 + offset, vx: 0, vy: 0 };
  state.serveMs = table.serveDelayMs;
}

export function clampToHalf(seat: 0 | 1, x: number, y: number): Point {
  const r = table.paddleRadius;
  const [minY, maxY] =
    seat === 0 ? [table.height / 2 + r, table.height - r] : [r, table.height / 2 - r];
  return { x: clamp(x, r, table.width - r), y: clamp(y, minY, maxY) };
}

export function setTarget(state: TableState, seat: 0 | 1, x: number, y: number) {
  state.targets[seat] = clampToHalf(seat, x, y);
}

// Returns the seat that scored during this step, if any.
export function step(state: TableState, dt: number): 0 | 1 | null {
  for (const seat of [0, 1] as const) {
    const paddle = state.paddles[seat];
    const target = state.targets[seat];
    const dx = target.x - paddle.x;
    const dy = target.y - paddle.y;
    const distance = Math.hypot(dx, dy);
    const reach = table.maxPaddleSpeed * dt;
    const scale = distance > reach ? reach / distance : 1;
    paddle.vx = (dx * scale) / dt;
    paddle.vy = (dy * scale) / dt;
    paddle.x += dx * scale;
    paddle.y += dy * scale;
  }

  if (state.serveMs > 0) {
    state.serveMs = Math.max(0, state.serveMs - dt * 1000);
    return null;
  }

  const subDt = dt / table.substeps;
  const decay = Math.exp(-table.friction * subDt);
  for (let i = 0; i < table.substeps; i += 1) {
    state.puck.x += state.puck.vx * subDt;
    state.puck.y += state.puck.vy * subDt;
    state.puck.vx *= decay;
    state.puck.vy *= decay;

    collidePaddle(state, 0);
    collidePaddle(state, 1);
    const scorer = collideWalls(state);
    if (scorer !== null) {
      state.score[scorer] += 1;
      serve(state, 1 - scorer);
      return scorer;
    }
  }
  return null;
}

function collidePaddle(state: TableState, seat: 0 | 1) {
  const paddle = state.paddles[seat];
  const puck = state.puck;
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const distance = Math.hypot(dx, dy);
  const reach = table.puckRadius + table.paddleRadius;
  if (distance >= reach || distance === 0) return;

  const nx = dx / distance;
  const ny = dy / distance;
  puck.x = paddle.x + nx * reach;
  puck.y = paddle.y + ny * reach;
  const along = (puck.vx - paddle.vx) * nx + (puck.vy - paddle.vy) * ny;
  if (along < 0) {
    const impulse = (1 + table.paddleRestitution) * along;
    puck.vx -= impulse * nx;
    puck.vy -= impulse * ny;
  }
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > table.maxPuckSpeed) {
    const scale = table.maxPuckSpeed / speed;
    puck.vx *= scale;
    puck.vy *= scale;
  }
}

function collideWalls(state: TableState): 0 | 1 | null {
  const puck = state.puck;
  const r = table.puckRadius;
  if (puck.x < r) {
    puck.x = r;
    puck.vx = Math.abs(puck.vx) * table.wallRestitution;
  } else if (puck.x > table.width - r) {
    puck.x = table.width - r;
    puck.vx = -Math.abs(puck.vx) * table.wallRestitution;
  }

  const inMouth = Math.abs(puck.x - table.width / 2) < table.goalWidth / 2 - r;
  if (inMouth) {
    if (puck.y < -r) return 0;
    if (puck.y > table.height + r) return 1;
  } else if (puck.y < r) {
    puck.y = r;
    puck.vy = Math.abs(puck.vy) * table.wallRestitution;
  } else if (puck.y > table.height - r) {
    puck.y = table.height - r;
    puck.vy = -Math.abs(puck.vy) * table.wallRestitution;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
