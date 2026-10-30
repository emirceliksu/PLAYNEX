import { AudioMixer } from '@playnex/game-sdk';

import { recipes, type SfxName } from './recipes';
import { Sequencer } from './sequencer';
import { playRecipe, type PlayOptions } from './synth';
import { composeTheme, menuTheme, type MusicTheme, type ThemeOptions } from './theme';

export { recipes, type SfxLayer, type SfxName, type SfxRecipe } from './recipes';
export type { PlayOptions } from './synth';
export {
  composeTheme,
  degreeToHz,
  menuTheme,
  scales,
  type Mood,
  type MusicTheme,
  type ScaleName,
  type ThemeOptions,
} from './theme';

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export class GameAudio {
  readonly mixer = new AudioMixer();
  // Follows the platform setting; games read it instead of asking the browser themselves.
  hapticsEnabled = true;

  private readonly sequencer = new Sequencer(this.mixer);
  private readonly game: MusicTheme;
  private readonly menu: MusicTheme;
  private unlockTarget: EventTarget | null = null;
  private readonly unlock = () => {
    this.mixer.resume();
    this.removeUnlock();
  };

  constructor(theme: ThemeOptions) {
    this.game = composeTheme(theme);
    this.menu = menuTheme(this.game);
  }

  // Browsers keep an AudioContext suspended until the first user gesture.
  unlockOn(target: EventTarget): void {
    this.removeUnlock();
    this.unlockTarget = target;
    for (const event of UNLOCK_EVENTS) target.addEventListener(event, this.unlock);
  }

  sfx(name: SfxName, options?: PlayOptions): void {
    playRecipe(this.mixer, recipes[name], options);
  }

  menuMusic(): void {
    this.sequencer.play(this.menu);
  }

  gameMusic(intensity = 1): void {
    this.sequencer.play(this.game, intensity);
  }

  setIntensity(intensity: number): void {
    this.sequencer.setIntensity(intensity);
  }

  stopMusic(): void {
    this.sequencer.stop();
  }

  vibrate(pattern: number | number[]): void {
    if (this.hapticsEnabled && 'vibrate' in navigator) navigator.vibrate(pattern);
  }

  destroy(): void {
    this.removeUnlock();
    this.sequencer.stop();
    this.mixer.close();
  }

  private removeUnlock(): void {
    for (const event of UNLOCK_EVENTS) {
      this.unlockTarget?.removeEventListener(event, this.unlock);
    }
    this.unlockTarget = null;
  }
}
