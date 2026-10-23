import { hexToColorNumber, type GamePalette } from '@playnex/game-sdk';

export type PaletteColors = Record<keyof GamePalette, number>;

export function toColorNumbers(palette: GamePalette): PaletteColors {
  return {
    canvas: hexToColorNumber(palette.canvas),
    surface: hexToColorNumber(palette.surface),
    ink: hexToColorNumber(palette.ink),
    fg: hexToColorNumber(palette.fg),
    fgMuted: hexToColorNumber(palette.fgMuted),
    accent: hexToColorNumber(palette.accent),
    accentSoft: hexToColorNumber(palette.accentSoft),
    reward: hexToColorNumber(palette.reward),
    danger: hexToColorNumber(palette.danger),
  };
}
