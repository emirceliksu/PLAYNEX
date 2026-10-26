import { type KartInput, type KartState, nearest, sample, track } from './model';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  topSpeed: number;
  lookahead: number;
}

// A top speed below the kart's limit keeps bots beatable; lookahead is how far
// down the racing line they aim, which also decides how tidily they take corners.
const profiles: Record<Difficulty, Profile> = {
  easy: { topSpeed: 20, lookahead: 5 },
  normal: { topSpeed: 24.5, lookahead: 7 },
  hard: { topSpeed: 28.5, lookahead: 9 },
};

export class Bot {
  private readonly profile: Profile;

  constructor(
    difficulty: Difficulty,
    // Each bot keeps its own line across the track so they do not stack up.
    private readonly lane: number,
  ) {
    this.profile = profiles[difficulty];
  }

  drive(state: KartState): KartInput {
    const here = nearest(state.x, state.z).index;
    const [tx, tz] = sample(here + this.profile.lookahead);
    const [nx, nz] = sample(here + this.profile.lookahead + 1);
    const length = Math.hypot(nx - tx, nz - tz) || 1;
    // Offset the aim point sideways along the track normal.
    const aimX = tx + ((nz - tz) / length) * this.lane * (track.width / 4);
    const aimZ = tz - ((nx - tx) / length) * this.lane * (track.width / 4);
    const wanted = Math.atan2(aimX - state.x, aimZ - state.z);
    const error = wrapAngle(wanted - state.heading);
    const sharp = Math.abs(error) > 0.55;
    const limit = sharp ? this.profile.topSpeed * 0.6 : this.profile.topSpeed;
    return {
      steer: Math.max(-1, Math.min(1, error * 2.2)),
      throttle: state.speed < limit ? 1 : 0,
      drift: sharp && state.speed > 14,
    };
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
