export type AudioBus = 'master' | 'sfx' | 'music' | 'voice';

export type AudioVolumes = Record<AudioBus, number>;

export const defaultVolumes: AudioVolumes = { master: 0.8, sfx: 0.9, music: 0.35, voice: 1 };

const VOLUME_KEY = 'playnex:audio';

export function readVolumes(): AudioVolumes {
  try {
    const stored = window.localStorage.getItem(VOLUME_KEY);
    if (!stored) return { ...defaultVolumes };
    const parsed = JSON.parse(stored) as Partial<AudioVolumes>;
    return { ...defaultVolumes, ...parsed };
  } catch {
    return { ...defaultVolumes };
  }
}

export function storeVolumes(volumes: AudioVolumes): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // Volumes fall back to the defaults next time.
  }
}

// One AudioContext per game with a gain node per bus. Browsers keep the context
// suspended until a user gesture, so games call resume() from their first input.
export class AudioMixer {
  readonly context: AudioContext;
  private readonly buses: Record<AudioBus, GainNode>;
  private noise: AudioBuffer | null = null;

  constructor(volumes: AudioVolumes = readVolumes()) {
    this.context = new AudioContext();
    const master = this.context.createGain();
    master.connect(this.context.destination);
    const bus = (name: AudioBus) => {
      const node = this.context.createGain();
      node.gain.value = volumes[name];
      node.connect(master);
      return node;
    };
    master.gain.value = volumes.master;
    this.buses = { master, sfx: bus('sfx'), music: bus('music'), voice: bus('voice') };
  }

  bus(name: AudioBus): GainNode {
    return this.buses[name];
  }

  setVolume(name: AudioBus, value: number): void {
    this.buses[name].gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }

  resume(): void {
    if (this.context.state === 'suspended') void this.context.resume();
  }

  // Two seconds of white noise, shared by every percussive sound a game synthesises.
  noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  async load(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`audio ${url}: ${response.status}`);
    return this.context.decodeAudioData(await response.arrayBuffer());
  }

  play(buffer: AudioBuffer, bus: AudioBus, gain = 1): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const level = this.context.createGain();
    level.gain.value = gain;
    source.connect(level).connect(this.buses[bus]);
    source.start();
    return source;
  }

  close(): void {
    void this.context.close();
  }
}
