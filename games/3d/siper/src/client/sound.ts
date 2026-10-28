import type { AudioMixer } from '@playnex/game-sdk';

// Every effect is synthesised from noise and oscillators at play time, so the game ships
// no recorded sound effects and no licensed music. Only the announcer lines are files.

interface ShotRecipe {
  // Body of the shot: filtered noise.
  cutoff: number;
  decay: number;
  // Low thump under it.
  thump: number;
  gain: number;
}

const SHOTS: Record<string, ShotRecipe> = {
  pistol: { cutoff: 2600, decay: 0.12, thump: 120, gain: 0.55 },
  revolver: { cutoff: 1800, decay: 0.28, thump: 80, gain: 0.8 },
  smg: { cutoff: 3200, decay: 0.08, thump: 140, gain: 0.45 },
  shotgun: { cutoff: 1400, decay: 0.34, thump: 60, gain: 0.95 },
  carbine: { cutoff: 2800, decay: 0.14, thump: 100, gain: 0.6 },
  rifle: { cutoff: 2300, decay: 0.16, thump: 90, gain: 0.65 },
  sniper: { cutoff: 1500, decay: 0.5, thump: 55, gain: 1 },
};

export const VOICE_KEYS = [
  'firstBlood',
  'double',
  'triple',
  'quad',
  'massacre',
  'heating',
  'unstoppable',
  'legend',
  'godlike',
  'headshot',
  'knifeKill',
  'streakEnded',
  'lastRound',
  'bombPlanted',
  'bombDefused',
  'attackersWin',
  'defendersWin',
  'go',
] as const;

export type VoiceKey = (typeof VOICE_KEYS)[number];

const VOICE_BASE = '/games/siper/voice';

// Notes of a two-bar minor loop (semitones above A1), one per eighth.
const BASS = [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 10, 12];
const LEAD = [12, -1, 15, -1, 19, 17, 15, -1, 12, -1, 10, -1, 7, -1, -1, -1];
const TEMPO = 104;

export class Sound {
  private readonly voices = new Map<VoiceKey, AudioBuffer>();
  private musicTimer: number | undefined;
  private musicGain: GainNode | null = null;
  private nextNote = 0;
  private beat = 0;

  constructor(private readonly mixer: AudioMixer) {
    for (const key of VOICE_KEYS) {
      mixer
        .load(`${VOICE_BASE}/${key}.ogg`)
        .then((buffer) => this.voices.set(key, buffer))
        .catch(() => undefined);
    }
  }

  private get ctx(): AudioContext {
    return this.mixer.context;
  }

  // Pan and level from where the sound is relative to the listener.
  private placed(distance: number, pan: number): AudioNode {
    const gain = this.ctx.createGain();
    gain.gain.value = 1 / (1 + Math.max(0, distance) * 0.06);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(panner).connect(this.mixer.bus('sfx'));
    return gain;
  }

  private noise(
    out: AudioNode,
    at: number,
    length: number,
    cutoff: number,
    gain: number,
    type: BiquadFilterType = 'lowpass',
  ): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.mixer.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + length);
    source.connect(filter).connect(level).connect(out);
    source.start(at, Math.random() * 1.5, length + 0.05);
  }

  private tone(
    out: AudioNode,
    at: number,
    frequency: number,
    length: number,
    gain: number,
    type: OscillatorType = 'sine',
    slideTo?: number,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(level).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  shot(weapon: string, distance = 0, pan = 0): void {
    const now = this.ctx.currentTime;
    const out = this.placed(distance, pan);
    if (weapon === 'knife') {
      this.noise(out, now, 0.12, 4000, 0.25, 'bandpass');
      return;
    }
    const recipe = SHOTS[weapon] ?? SHOTS.pistol;
    if (!recipe) return;
    this.noise(out, now, recipe.decay, recipe.cutoff, recipe.gain);
    this.tone(
      out,
      now,
      recipe.thump * 2,
      recipe.decay * 0.8,
      recipe.gain * 0.8,
      'sine',
      recipe.thump,
    );
    // A far-off echo tail makes outdoor shots read as distance, not just volume.
    if (distance > 15) this.noise(out, now + 0.09, recipe.decay * 1.6, 700, recipe.gain * 0.25);
  }

  dryFire(): void {
    const now = this.ctx.currentTime;
    this.tone(this.mixer.bus('sfx'), now, 1800, 0.03, 0.15, 'square');
  }

  reload(): void {
    const now = this.ctx.currentTime;
    const out = this.mixer.bus('sfx');
    this.noise(out, now, 0.05, 3500, 0.2, 'bandpass');
    this.noise(out, now + 0.45, 0.06, 2500, 0.25, 'bandpass');
    this.tone(out, now + 0.5, 600, 0.05, 0.12, 'square');
  }

  footstep(distance = 0, pan = 0): void {
    const now = this.ctx.currentTime;
    this.noise(this.placed(distance, pan), now, 0.07, 500 + Math.random() * 300, 0.22);
  }

  land(): void {
    this.noise(this.mixer.bus('sfx'), this.ctx.currentTime, 0.12, 300, 0.35);
  }

  hit(head: boolean): void {
    const now = this.ctx.currentTime;
    const out = this.mixer.bus('sfx');
    if (head) {
      this.tone(out, now, 1900, 0.18, 0.28, 'triangle');
      this.tone(out, now + 0.02, 2850, 0.14, 0.12, 'sine');
    } else {
      this.tone(out, now, 1300, 0.06, 0.18, 'square');
    }
  }

  hurt(): void {
    const now = this.ctx.currentTime;
    this.noise(this.mixer.bus('sfx'), now, 0.18, 260, 0.45);
  }

  explosion(distance = 0, pan = 0): void {
    const now = this.ctx.currentTime;
    const out = this.placed(distance * 0.6, pan);
    this.noise(out, now, 1.1, 900, 1);
    this.tone(out, now, 90, 0.8, 0.9, 'sine', 30);
  }

  smoke(distance = 0, pan = 0): void {
    this.noise(this.placed(distance, pan), this.ctx.currentTime, 1.4, 1800, 0.35, 'highpass');
  }

  throw(): void {
    this.noise(this.mixer.bus('sfx'), this.ctx.currentTime, 0.18, 1200, 0.2, 'bandpass');
  }

  beep(urgent: boolean): void {
    const now = this.ctx.currentTime;
    this.tone(this.mixer.bus('sfx'), now, urgent ? 1320 : 990, 0.09, 0.22, 'square');
  }

  tick(): void {
    this.tone(this.mixer.bus('sfx'), this.ctx.currentTime, 1500, 0.025, 0.1, 'square');
  }

  buy(): void {
    const now = this.ctx.currentTime;
    const out = this.mixer.bus('sfx');
    this.tone(out, now, 660, 0.06, 0.15, 'triangle');
    this.tone(out, now + 0.06, 990, 0.08, 0.15, 'triangle');
  }

  denied(): void {
    this.tone(this.mixer.bus('sfx'), this.ctx.currentTime, 220, 0.15, 0.2, 'sawtooth', 160);
  }

  roundStart(): void {
    const now = this.ctx.currentTime;
    const out = this.mixer.bus('sfx');
    this.tone(out, now, 440, 0.25, 0.25, 'sawtooth');
    this.tone(out, now + 0.22, 660, 0.45, 0.25, 'sawtooth');
  }

  chat(): void {
    this.tone(this.mixer.bus('sfx'), this.ctx.currentTime, 1200, 0.05, 0.08, 'sine');
  }

  // Plays the recorded line, or a short stinger while the file is missing or loading.
  voice(key: VoiceKey): number {
    const buffer = this.voices.get(key);
    if (buffer) {
      this.mixer.play(buffer, 'voice');
      return buffer.duration;
    }
    const now = this.ctx.currentTime;
    const out = this.mixer.bus('voice');
    for (const [i, note] of [0, 4, 7].entries()) {
      this.tone(out, now + i * 0.06, 440 * 2 ** (note / 12), 0.5, 0.18, 'triangle');
    }
    return 0.6;
  }

  startMusic(): void {
    if (this.musicTimer !== undefined) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    gain.connect(this.mixer.bus('music'));
    this.musicGain = gain;
    this.nextNote = this.ctx.currentTime + 0.05;
    this.musicTimer = window.setInterval(() => this.schedule(), 100);
  }

  stopMusic(): void {
    if (this.musicTimer === undefined) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    const gain = this.musicGain;
    gain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    window.setTimeout(() => gain?.disconnect(), 1500);
    this.musicGain = null;
  }

  // Look-ahead scheduling: notes are queued a little ahead on the audio clock.
  private schedule(): void {
    const out = this.musicGain;
    if (!out) return;
    const eighth = 60 / TEMPO / 2;
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      const i = this.beat % BASS.length;
      const bass = BASS[i] ?? 0;
      this.tone(out, this.nextNote, 55 * 2 ** (bass / 12), eighth * 0.9, 0.22, 'square');
      const lead = LEAD[i] ?? -1;
      if (lead >= 0 && this.beat % 32 >= 16) {
        this.tone(out, this.nextNote, 220 * 2 ** (lead / 12), eighth * 1.6, 0.08, 'triangle');
      }
      if (i % 4 === 0) this.noise(out, this.nextNote, 0.08, 120, 0.4);
      if (i % 4 === 2) this.noise(out, this.nextNote, 0.05, 6000, 0.08, 'highpass');
      this.nextNote += eighth;
      this.beat += 1;
    }
  }

  destroy(): void {
    this.stopMusic();
  }
}
