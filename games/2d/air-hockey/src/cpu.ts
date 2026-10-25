import { table, type Point, type TableState } from './physics';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  // Fraction of the physical paddle speed the computer allows itself.
  speed: number;
  // How far ahead along the puck's path it reads, in seconds.
  anticipation: number;
  // Random aim error in table units, re-rolled on every serve and strike.
  error: number;
}

const profiles: Record<Difficulty, Profile> = {
  easy: { speed: 0.35, anticipation: 0.05, error: 34 },
  normal: { speed: 0.6, anticipation: 0.12, error: 16 },
  hard: { speed: 0.9, anticipation: 0.2, error: 5 },
};

const HOME_Y = 70;
const STRIKE_OFFSET = 18;

// Drives the top paddle (seat 1). Returns the new target after moving the old
// one no faster than the profile allows, so easier levels visibly lag.
export class Cpu {
  private readonly profile: Profile;
  private aim = 0;
  private target: Point = { x: table.width / 2, y: HOME_Y };

  constructor(
    difficulty: Difficulty,
    private readonly random: () => number = Math.random,
  ) {
    this.profile = profiles[difficulty];
    this.reroll();
  }

  reroll() {
    this.aim = (this.random() * 2 - 1) * this.profile.error;
  }

  next(state: TableState, dt: number): Point {
    const puck = state.puck;
    const ahead = {
      x: puck.x + puck.vx * this.profile.anticipation,
      y: puck.y + puck.vy * this.profile.anticipation,
    };
    const inOwnHalf = ahead.y < table.height / 2;

    const desired = inOwnHalf
      ? // Come from above so the strike sends the puck down towards the opponent's goal.
        { x: ahead.x + this.aim, y: ahead.y - STRIKE_OFFSET }
      : { x: table.width / 2 + (ahead.x - table.width / 2) * 0.5 + this.aim, y: HOME_Y };

    const dx = desired.x - this.target.x;
    const dy = desired.y - this.target.y;
    const distance = Math.hypot(dx, dy);
    const reach = table.maxPaddleSpeed * this.profile.speed * dt;
    const scale = distance > reach ? reach / distance : 1;
    this.target = { x: this.target.x + dx * scale, y: this.target.y + dy * scale };
    return this.target;
  }
}
