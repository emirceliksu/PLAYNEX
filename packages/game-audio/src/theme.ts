// Semitones above the root. Uşşak's second is a quarter tone, which the oscillators can play
// even though a keyboard cannot.
export const scales = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  hicaz: [0, 1, 4, 5, 7, 8, 10],
  ussak: [0, 1.5, 3, 5, 7, 8, 10],
  nihavent: [0, 2, 3, 5, 7, 8, 11],
} satisfies Record<string, number[]>;

export type ScaleName = keyof typeof scales;
export type Mood = 'calm' | 'bright' | 'tense';

export const REST = -1;
const STEPS = 16;

export interface MusicTheme {
  tempo: number;
  scale: ScaleName;
  rootHz: number;
  // One entry per eighth: a scale degree, or REST.
  bass: number[];
  lead: number[];
  kick: boolean[];
  hat: boolean[];
}

export interface ThemeOptions {
  seed: number;
  mood: Mood;
  scale?: ScaleName;
}

const moods: Record<Mood, { tempo: [number, number]; scales: ScaleName[] }> = {
  calm: { tempo: [76, 96], scales: ['pentatonic', 'dorian', 'ussak'] },
  bright: { tempo: [112, 136], scales: ['major', 'pentatonic'] },
  tense: { tempo: [120, 150], scales: ['minor', 'hicaz', 'nihavent'] },
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function degreeToHz(theme: Pick<MusicTheme, 'scale' | 'rootHz'>, degree: number): number {
  const scale = scales[theme.scale];
  const octave = Math.floor(degree / scale.length);
  const step = degree - octave * scale.length;
  const semitones = (scale[step] ?? 0) + octave * 12;
  return theme.rootHz * 2 ** (semitones / 12);
}

export function composeTheme({ seed, mood, scale }: ThemeOptions): MusicTheme {
  const random = seededRandom(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
  const { tempo, scales: moodScales } = moods[mood];
  const chosenScale = scale ?? pick(moodScales);
  const size = scales[chosenScale].length;

  const chord = [0, pick([3, 4, size - 2]), pick([2, 4, 5]), pick([1, 4])];
  const bass = Array.from({ length: STEPS }, (_, i) => {
    const root = chord[Math.floor(i / 4)] ?? 0;
    if (i % 4 === 0) return root;
    return random() < 0.5 ? root : REST;
  });

  let contour = size;
  const lead = Array.from({ length: STEPS }, () => {
    if (random() < 0.4) return REST;
    contour = Math.max(size - 2, Math.min(size * 2, contour + pick([-2, -1, 1, 2])));
    return contour;
  });

  return {
    tempo: Math.round(tempo[0] + random() * (tempo[1] - tempo[0])),
    scale: chosenScale,
    rootHz: pick([49, 55, 58.27, 65.41]),
    bass,
    lead,
    kick: Array.from({ length: STEPS }, (_, i) => i % 4 === 0 || (i % 8 === 6 && random() < 0.5)),
    hat: Array.from({ length: STEPS }, (_, i) => i % 2 === 1),
  };
}

// Menus keep the game's key and melody but drop the pulse, so the two read as one soundtrack.
export function menuTheme(theme: MusicTheme): MusicTheme {
  return {
    ...theme,
    tempo: Math.round(theme.tempo * 0.7),
    kick: theme.kick.map(() => false),
    hat: theme.hat.map(() => false),
  };
}
