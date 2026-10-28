export const scaleSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type ScaleStep = (typeof scaleSteps)[number];
export type ColorScale = Record<ScaleStep, string>;

// All scales are authored in OKLCH so lightness steps are perceptually even and the
// palette is not a copy of any framework default. Hue 286 sits between indigo and violet,
// deliberately off Tailwind's violet (293) and purple (302).
export const brand: ColorScale = {
  50: 'oklch(0.97 0.02 286)',
  100: 'oklch(0.93 0.05 286)',
  200: 'oklch(0.87 0.09 286)',
  300: 'oklch(0.79 0.14 286)',
  400: 'oklch(0.70 0.19 286)',
  500: 'oklch(0.57 0.23 286)',
  600: 'oklch(0.53 0.22 286)',
  700: 'oklch(0.45 0.19 286)',
  800: 'oklch(0.38 0.15 286)',
  900: 'oklch(0.31 0.11 286)',
  950: 'oklch(0.24 0.08 286)',
};

export const cyan: ColorScale = {
  50: 'oklch(0.97 0.02 205)',
  100: 'oklch(0.94 0.05 205)',
  200: 'oklch(0.90 0.09 205)',
  300: 'oklch(0.85 0.12 205)',
  400: 'oklch(0.81 0.14 205)',
  500: 'oklch(0.76 0.145 205)',
  600: 'oklch(0.66 0.13 205)',
  700: 'oklch(0.56 0.11 205)',
  800: 'oklch(0.46 0.09 205)',
  900: 'oklch(0.37 0.07 205)',
  950: 'oklch(0.29 0.05 205)',
};

export const yellow: ColorScale = {
  50: 'oklch(0.98 0.03 80)',
  100: 'oklch(0.96 0.07 80)',
  200: 'oklch(0.93 0.12 80)',
  300: 'oklch(0.90 0.15 80)',
  400: 'oklch(0.87 0.17 80)',
  500: 'oklch(0.83 0.175 80)',
  600: 'oklch(0.74 0.16 80)',
  700: 'oklch(0.63 0.13 80)',
  800: 'oklch(0.52 0.10 80)',
  900: 'oklch(0.42 0.08 80)',
  950: 'oklch(0.33 0.06 80)',
};

export const pink: ColorScale = {
  50: 'oklch(0.97 0.02 355)',
  100: 'oklch(0.93 0.05 355)',
  200: 'oklch(0.88 0.10 355)',
  300: 'oklch(0.81 0.15 355)',
  400: 'oklch(0.74 0.19 355)',
  500: 'oklch(0.67 0.22 355)',
  600: 'oklch(0.59 0.21 355)',
  700: 'oklch(0.50 0.18 355)',
  800: 'oklch(0.42 0.14 355)',
  900: 'oklch(0.34 0.10 355)',
  950: 'oklch(0.26 0.07 355)',
};

export const mint: ColorScale = {
  50: 'oklch(0.97 0.02 165)',
  100: 'oklch(0.94 0.05 165)',
  200: 'oklch(0.90 0.09 165)',
  300: 'oklch(0.86 0.12 165)',
  400: 'oklch(0.83 0.14 165)',
  500: 'oklch(0.78 0.15 165)',
  600: 'oklch(0.68 0.14 165)',
  700: 'oklch(0.57 0.12 165)',
  800: 'oklch(0.47 0.09 165)',
  900: 'oklch(0.38 0.07 165)',
  950: 'oklch(0.29 0.05 165)',
};

export const coral: ColorScale = {
  50: 'oklch(0.97 0.02 25)',
  100: 'oklch(0.94 0.04 25)',
  200: 'oklch(0.88 0.08 25)',
  300: 'oklch(0.81 0.13 25)',
  400: 'oklch(0.73 0.18 25)',
  500: 'oklch(0.66 0.21 25)',
  600: 'oklch(0.57 0.20 25)',
  700: 'oklch(0.48 0.17 25)',
  800: 'oklch(0.40 0.13 25)',
  900: 'oklch(0.33 0.09 25)',
  950: 'oklch(0.25 0.06 25)',
};

// Neutral navy. Carries a trace of the brand hue so dark surfaces read as "night", not grey.
export const ink: ColorScale = {
  50: 'oklch(0.98 0.005 282)',
  100: 'oklch(0.95 0.008 282)',
  200: 'oklch(0.90 0.012 282)',
  300: 'oklch(0.82 0.016 282)',
  400: 'oklch(0.70 0.02 282)',
  500: 'oklch(0.58 0.024 282)',
  600: 'oklch(0.47 0.028 282)',
  700: 'oklch(0.38 0.03 282)',
  800: 'oklch(0.30 0.032 282)',
  900: 'oklch(0.23 0.032 282)',
  950: 'oklch(0.18 0.03 282)',
};

export const palette = { brand, cyan, yellow, pink, mint, coral, ink } as const;

export type PaletteName = keyof typeof palette;
