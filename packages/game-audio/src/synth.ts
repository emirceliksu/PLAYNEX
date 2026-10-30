import type { AudioMixer } from '@playnex/game-sdk';

import type { NoiseLayer, SfxRecipe, ToneLayer } from './recipes';

export interface PlayOptions {
  // Frequency multiplier: 2 is an octave up. Rising combos pass a growing value.
  pitch?: number;
  gain?: number;
  pan?: number;
}

// exponentialRamp cannot reach zero, so envelopes stop at this level.
const SILENCE = 0.001;

export function playTone(mixer: AudioMixer, out: AudioNode, layer: ToneLayer, start: number): void {
  const context = mixer.context;
  const at = start + (layer.at ?? 0);
  const oscillator = context.createOscillator();
  oscillator.type = layer.wave;
  oscillator.frequency.setValueAtTime(layer.frequency, at);
  if (layer.slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(layer.slideTo, at + layer.length);
  }
  const level = context.createGain();
  level.gain.setValueAtTime(layer.gain, at);
  level.gain.exponentialRampToValueAtTime(SILENCE, at + layer.length);
  oscillator.connect(level).connect(out);
  oscillator.start(at);
  oscillator.stop(at + layer.length + 0.02);
}

export function playNoise(
  mixer: AudioMixer,
  out: AudioNode,
  layer: NoiseLayer,
  start: number,
): void {
  const context = mixer.context;
  const at = start + (layer.at ?? 0);
  const source = context.createBufferSource();
  source.buffer = mixer.noiseBuffer();
  const filter = context.createBiquadFilter();
  filter.type = layer.filter;
  filter.frequency.value = layer.cutoff;
  const level = context.createGain();
  level.gain.setValueAtTime(layer.gain, at);
  level.gain.exponentialRampToValueAtTime(SILENCE, at + layer.length);
  source.connect(filter).connect(level).connect(out);
  // A random offset into the shared buffer keeps repeated hits from sounding identical.
  source.start(at, Math.random() * 1.5, layer.length + 0.05);
}

export function playRecipe(mixer: AudioMixer, recipe: SfxRecipe, options: PlayOptions = {}): void {
  const context = mixer.context;
  const { pitch = 1, gain = 1, pan = 0 } = options;
  const level = context.createGain();
  level.gain.value = gain;
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  level.connect(panner).connect(mixer.bus('sfx'));

  const now = context.currentTime;
  for (const layer of recipe) {
    if (layer.kind === 'noise') {
      playNoise(mixer, level, layer, now);
    } else {
      const slideTo = layer.slideTo === undefined ? undefined : layer.slideTo * pitch;
      playTone(mixer, level, { ...layer, frequency: layer.frequency * pitch, slideTo }, now);
    }
  }
}
