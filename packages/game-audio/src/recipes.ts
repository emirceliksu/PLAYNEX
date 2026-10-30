export interface ToneLayer {
  kind: 'tone';
  wave: OscillatorType;
  frequency: number;
  slideTo?: number;
  length: number;
  gain: number;
  at?: number;
}

export interface NoiseLayer {
  kind: 'noise';
  filter: BiquadFilterType;
  cutoff: number;
  length: number;
  gain: number;
  at?: number;
}

export type SfxLayer = ToneLayer | NoiseLayer;
export type SfxRecipe = SfxLayer[];

function tone(
  wave: OscillatorType,
  frequency: number,
  length: number,
  gain: number,
  options: { slideTo?: number; at?: number } = {},
): ToneLayer {
  return { kind: 'tone', wave, frequency, length, gain, ...options };
}

function noise(
  filter: BiquadFilterType,
  cutoff: number,
  length: number,
  gain: number,
  at?: number,
): NoiseLayer {
  return { kind: 'noise', filter, cutoff, length, gain, at };
}

function arpeggio(wave: OscillatorType, notes: number[], step: number, gain: number): SfxRecipe {
  return notes.map((frequency, i) => tone(wave, frequency, step * 1.8, gain, { at: i * step }));
}

export const recipes = {
  coin: [tone('square', 988, 0.07, 0.14), tone('square', 1319, 0.2, 0.14, { at: 0.07 })],
  pickup: arpeggio('triangle', [660, 880, 1175], 0.05, 0.2),
  jump: [tone('square', 280, 0.16, 0.14, { slideTo: 620 })],
  land: [noise('lowpass', 320, 0.11, 0.32)],
  bounce: [tone('sine', 220, 0.12, 0.28, { slideTo: 440 })],
  hit: [noise('lowpass', 1800, 0.08, 0.34), tone('square', 180, 0.09, 0.2, { slideTo: 90 })],
  hurt: [noise('lowpass', 280, 0.18, 0.42), tone('sawtooth', 220, 0.2, 0.14, { slideTo: 90 })],
  explosion: [noise('lowpass', 900, 0.9, 0.8), tone('sine', 90, 0.7, 0.8, { slideTo: 30 })],
  shoot: [noise('bandpass', 2400, 0.09, 0.28), tone('square', 720, 0.1, 0.12, { slideTo: 180 })],
  laser: [tone('sawtooth', 1600, 0.16, 0.16, { slideTo: 240 })],
  powerup: arpeggio('square', [392, 523, 659, 784, 1047], 0.06, 0.13),
  powerdown: arpeggio('square', [784, 622, 494, 392], 0.08, 0.13),
  pop: [tone('sine', 520, 0.07, 0.3, { slideTo: 1040 })],
  merge: [tone('triangle', 440, 0.14, 0.24, { slideTo: 880 }), noise('highpass', 5000, 0.05, 0.06)],
  whoosh: [noise('bandpass', 1100, 0.24, 0.2)],
  splash: [noise('lowpass', 1400, 0.4, 0.32), noise('highpass', 4200, 0.2, 0.08, 0.05)],
  ding: [tone('sine', 1760, 0.5, 0.2), tone('sine', 2640, 0.3, 0.08)],
  buzz: [tone('sawtooth', 110, 0.22, 0.2)],
  combo: arpeggio('triangle', [523, 784, 1047], 0.05, 0.22),
  'level-up': arpeggio('triangle', [523, 659, 784, 1047, 1319], 0.08, 0.2),
  'ui-click': [tone('square', 1200, 0.03, 0.08)],
  'ui-hover': [tone('sine', 900, 0.02, 0.04)],
  'ui-back': [tone('square', 700, 0.05, 0.08, { slideTo: 420 })],
  'ui-error': [tone('sawtooth', 220, 0.16, 0.18, { slideTo: 160 })],
  'countdown-tick': [tone('square', 990, 0.08, 0.16)],
  'countdown-go': [tone('square', 1320, 0.32, 0.2)],
  win: arpeggio('triangle', [523, 659, 784, 1047, 1319, 1568], 0.1, 0.22),
  lose: arpeggio('sawtooth', [392, 330, 262, 196], 0.17, 0.14),
  'card-flip': [noise('bandpass', 3200, 0.05, 0.22), noise('highpass', 5200, 0.03, 0.08, 0.03)],
  'card-deal': [noise('bandpass', 2400, 0.08, 0.2)],
  'card-shuffle': [0, 0.06, 0.12, 0.18, 0.24].map((at) => noise('bandpass', 2800, 0.05, 0.14, at)),
  dice: [0, 0.07, 0.15, 0.26].map((at) => noise('bandpass', 2000, 0.04, 0.32, at)),
  'tile-place': [noise('lowpass', 1500, 0.05, 0.34), tone('sine', 340, 0.05, 0.14)],
  'tile-slide': [noise('lowpass', 1100, 0.14, 0.16)],
  'piece-move': [tone('sine', 300, 0.06, 0.2), noise('lowpass', 900, 0.04, 0.14)],
  'piece-capture': [
    noise('lowpass', 1400, 0.1, 0.4),
    tone('sine', 200, 0.12, 0.26, { slideTo: 110 }),
  ],
  check: [tone('square', 880, 0.1, 0.14), tone('square', 880, 0.14, 0.14, { at: 0.14 })],
} satisfies Record<string, SfxRecipe>;

export type SfxName = keyof typeof recipes;
