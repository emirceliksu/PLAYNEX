import Phaser from 'phaser';
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

export function mixColors(from: number, to: number, amount: number): number {
  const a = Phaser.Display.Color.IntegerToRGB(from);
  const b = Phaser.Display.Color.IntegerToRGB(to);
  const mixed = Phaser.Display.Color.Interpolate.RGBWithRGB(
    a.r,
    a.g,
    a.b,
    b.r,
    b.g,
    b.b,
    1,
    amount,
  );
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}

export function isBright(color: number): boolean {
  const { r, g, b } = Phaser.Display.Color.IntegerToRGB(color);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
