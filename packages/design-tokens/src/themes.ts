import { brand, coral, cyan, ink, mint, pink, yellow } from './color';

export interface AccentTokens {
  solid: string;
  soft: string;
  text: string;
}

export interface SemanticTheme {
  surface: {
    canvas: string;
    raised: string;
    overlay: string;
    sunken: string;
    inverse: string;
  };
  // Foreground colors. Named "fg" so utilities read `text-fg-primary`, not `text-text-primary`.
  fg: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    onBrand: string;
    brand: string;
  };
  border: {
    subtle: string;
    strong: string;
    focus: string;
  };
  brand: {
    solid: string;
    solidHover: string;
    solidActive: string;
    soft: string;
    softText: string;
  };
  cyan: AccentTokens;
  yellow: AccentTokens;
  pink: AccentTokens;
  mint: AccentTokens;
  coral: AccentTokens;
  shadow: {
    ink: string;
  };
}

export const dark: SemanticTheme = {
  surface: {
    canvas: ink[950],
    raised: ink[900],
    overlay: ink[800],
    sunken: 'oklch(0.145 0.028 282)',
    inverse: ink[50],
  },
  fg: {
    primary: ink[50],
    secondary: ink[300],
    muted: ink[400],
    inverse: ink[950],
    onBrand: ink[50],
    brand: brand[300],
  },
  border: {
    subtle: 'oklch(0.9 0.01 282 / 12%)',
    strong: ink[600],
    // Focus ring is cyan on purpose: it stays visible on brand-colored controls.
    focus: cyan[300],
  },
  brand: {
    solid: brand[500],
    solidHover: brand[600],
    solidActive: brand[700],
    soft: brand[950],
    softText: brand[200],
  },
  cyan: { solid: cyan[400], soft: cyan[950], text: cyan[300] },
  yellow: { solid: yellow[400], soft: yellow[950], text: yellow[300] },
  pink: { solid: pink[400], soft: pink[950], text: pink[300] },
  mint: { solid: mint[400], soft: mint[950], text: mint[300] },
  coral: { solid: coral[400], soft: coral[950], text: coral[300] },
  shadow: {
    ink: 'oklch(0.10 0.025 282)',
  },
};

export const light: SemanticTheme = {
  surface: {
    canvas: ink[50],
    raised: 'oklch(1 0 0)',
    overlay: 'oklch(1 0 0)',
    sunken: ink[100],
    inverse: ink[950],
  },
  fg: {
    primary: ink[950],
    secondary: ink[700],
    muted: ink[500],
    inverse: ink[50],
    onBrand: ink[50],
    brand: brand[600],
  },
  border: {
    subtle: 'oklch(0.2 0.03 282 / 10%)',
    strong: ink[300],
    focus: cyan[600],
  },
  brand: {
    solid: brand[600],
    solidHover: brand[500],
    solidActive: brand[700],
    soft: brand[50],
    softText: brand[700],
  },
  cyan: { solid: cyan[600], soft: cyan[50], text: cyan[800] },
  yellow: { solid: yellow[500], soft: yellow[50], text: yellow[800] },
  pink: { solid: pink[600], soft: pink[50], text: pink[800] },
  mint: { solid: mint[600], soft: mint[50], text: mint[800] },
  coral: { solid: coral[600], soft: coral[50], text: coral[800] },
  shadow: {
    ink: ink[950],
  },
};

export const themes = { dark, light } as const;

export type ThemeName = keyof typeof themes;
