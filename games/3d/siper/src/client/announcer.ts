import type { Sound, VoiceKey } from './sound';
import { VOICE_KEYS } from './sound';

// Louder calls win when several land at once: a multi-kill beats a streak, which beats
// the small specials. Only the best two of a burst are spoken; the rest would pile up.
const PRIORITY: Record<string, number> = {
  massacre: 9,
  quad: 8,
  triple: 7,
  double: 6,
  godlike: 5,
  legend: 5,
  unstoppable: 4,
  heating: 3,
  firstBlood: 3,
  lastRound: 3,
  bombPlanted: 3,
  bombDefused: 3,
  attackersWin: 2,
  defendersWin: 2,
  streakEnded: 2,
  knifeKill: 1,
  headshot: 1,
  go: 1,
};

const MAX_QUEUE = 2;
const GAP_MS = 120;

export interface Call {
  key: string;
  text: string;
}

export class Announcer {
  private queue: Call[] = [];
  private busyUntil = 0;

  constructor(
    private readonly sound: Sound,
    private readonly show: (call: Call) => void,
  ) {}

  // Calls that arrived in the same server frame.
  say(calls: Call[]): void {
    const ordered = [...calls].sort((a, b) => (PRIORITY[b.key] ?? 0) - (PRIORITY[a.key] ?? 0));
    this.queue = [...this.queue, ...ordered]
      .sort((a, b) => (PRIORITY[b.key] ?? 0) - (PRIORITY[a.key] ?? 0))
      .slice(0, MAX_QUEUE);
  }

  update(now: number): void {
    if (now < this.busyUntil) return;
    const next = this.queue.shift();
    if (!next) return;
    this.show(next);
    const spoken = (VOICE_KEYS as readonly string[]).includes(next.key)
      ? this.sound.voice(next.key as VoiceKey)
      : 0.5;
    this.busyUntil = now + spoken * 1000 + GAP_MS;
  }
}
