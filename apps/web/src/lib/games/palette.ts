import { coral, dark, ink, oklchToHex, palette, yellow } from '@playnex/design-tokens';
import type { GamePalette } from '@playnex/game-sdk';
import type { AccentName } from '@playnex/shared-types';

// Canvas engines need sRGB hex, so the design tokens are converted once per game mount.
export function buildGamePalette(accent: AccentName): GamePalette {
  return {
    canvas: oklchToHex(ink[950]),
    surface: oklchToHex(ink[800]),
    ink: oklchToHex(dark.shadow.ink),
    fg: oklchToHex(ink[50]),
    fgMuted: oklchToHex(ink[400]),
    accent: oklchToHex(palette[accent][400]),
    accentSoft: oklchToHex(palette[accent][900]),
    reward: oklchToHex(yellow[400]),
    danger: oklchToHex(coral[400]),
  };
}
