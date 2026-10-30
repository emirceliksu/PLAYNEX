export interface Achievement {
  id: string;
  // Keys into the game's own text file.
  titleKey: string;
  descriptionKey: string;
}

export interface GameProgress {
  tutorialSeen: boolean;
  stars: Record<string, number>;
  achievements: string[];
  dailyPlayed: string | null;
}

const emptyProgress: GameProgress = {
  tutorialSeen: false,
  stars: {},
  achievements: [],
  dailyPlayed: null,
};

export function levelUnlocked(progress: GameProgress, levels: string[], level: string): boolean {
  const index = levels.indexOf(level);
  if (index <= 0) return index === 0;
  return (progress.stars[levels[index - 1] ?? ''] ?? 0) > 0;
}

// Local storage can be missing or refuse writes (private windows); play must go on without it.
export class ProgressStore {
  private readonly key: string;
  private current: GameProgress;

  constructor(slug: string) {
    this.key = `playnex.progress.${slug}`;
    this.current = this.load();
  }

  get progress(): GameProgress {
    return this.current;
  }

  update(change: Partial<GameProgress>): void {
    this.current = { ...this.current, ...change };
    try {
      localStorage.setItem(this.key, JSON.stringify(this.current));
    } catch {
      return;
    }
  }

  setStars(level: string, stars: number): void {
    const best = Math.max(stars, this.current.stars[level] ?? 0);
    this.update({ stars: { ...this.current.stars, [level]: best } });
  }

  // True only the first time, so the caller can celebrate exactly once.
  unlock(achievement: string): boolean {
    if (this.current.achievements.includes(achievement)) return false;
    this.update({ achievements: [...this.current.achievements, achievement] });
    return true;
  }

  private load(): GameProgress {
    try {
      const stored = localStorage.getItem(this.key);
      if (stored) return { ...emptyProgress, ...(JSON.parse(stored) as Partial<GameProgress>) };
    } catch {
      return emptyProgress;
    }
    return emptyProgress;
  }
}
