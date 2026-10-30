import type { AudioMixer } from '@playnex/game-sdk';

import type { NoiseLayer } from './recipes';
import { playNoise, playTone } from './synth';
import { degreeToHz, REST, type MusicTheme } from './theme';

const SCHEDULE_AHEAD_S = 0.3;
const TIMER_MS = 100;
const FADE_S = 0.3;
const MAX_INTENSITY = 3;
const KICK: NoiseLayer = { kind: 'noise', filter: 'lowpass', cutoff: 120, length: 0.08, gain: 0.4 };
const HAT: NoiseLayer = {
  kind: 'noise',
  filter: 'highpass',
  cutoff: 6000,
  length: 0.04,
  gain: 0.07,
};

// Intensity adds parts in order: 0 bass, 1 drums, 2 lead, 3 lead doubled an octave up.
export class Sequencer {
  private timer: number | undefined;
  private output: GainNode | null = null;
  private nextStep = 0;
  private step = 0;
  private theme: MusicTheme | null = null;
  private intensity = 0;

  constructor(private readonly mixer: AudioMixer) {}

  play(theme: MusicTheme, intensity = 0): void {
    this.theme = theme;
    this.setIntensity(intensity);
    if (this.timer !== undefined) return;

    const context = this.mixer.context;
    const output = context.createGain();
    output.gain.value = 0;
    output.gain.setTargetAtTime(0.5, context.currentTime, FADE_S);
    output.connect(this.mixer.bus('music'));
    this.output = output;
    this.nextStep = context.currentTime + 0.05;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), TIMER_MS);
  }

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(MAX_INTENSITY, intensity));
  }

  stop(): void {
    if (this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
    const output = this.output;
    this.output = null;
    output?.gain.setTargetAtTime(0, this.mixer.context.currentTime, FADE_S);
    window.setTimeout(() => output?.disconnect(), FADE_S * 5000);
  }

  // Timers drift, so notes are queued slightly ahead on the audio clock instead of played on tick.
  private schedule(): void {
    const { output, theme } = this;
    if (!output || !theme) return;
    const eighth = 60 / theme.tempo / 2;
    while (this.nextStep < this.mixer.context.currentTime + SCHEDULE_AHEAD_S) {
      this.playStep(output, theme, eighth);
      this.nextStep += eighth;
      this.step += 1;
    }
  }

  private playStep(output: GainNode, theme: MusicTheme, eighth: number): void {
    const at = this.nextStep;
    const i = this.step % theme.bass.length;

    const bass = theme.bass[i] ?? REST;
    if (bass !== REST) {
      const frequency = degreeToHz(theme, bass);
      playTone(
        this.mixer,
        output,
        { kind: 'tone', wave: 'square', frequency, length: eighth * 0.9, gain: 0.2 },
        at,
      );
    }

    if (this.intensity >= 1) {
      if (theme.kick[i]) {
        playNoise(this.mixer, output, KICK, at);
      }
      if (theme.hat[i]) {
        playNoise(this.mixer, output, HAT, at);
      }
    }

    const lead = theme.lead[i] ?? REST;
    if (this.intensity >= 2 && lead !== REST) {
      const frequency = degreeToHz(theme, lead) * 2;
      const note = { kind: 'tone', wave: 'triangle', length: eighth * 1.6, gain: 0.08 } as const;
      playTone(this.mixer, output, { ...note, frequency }, at);
      if (this.intensity >= 3) {
        playTone(this.mixer, output, { ...note, frequency: frequency * 2, gain: 0.04 }, at);
      }
    }
  }
}
