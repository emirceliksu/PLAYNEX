import Phaser from 'phaser';

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
