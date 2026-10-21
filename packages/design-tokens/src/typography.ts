// The web app injects the real font through next/font and sets these custom properties;
// Storybook falls back to the @font-face names declared in fonts/fonts.css.
export const fontFamily = {
  display:
    'var(--font-display-src, "Space Grotesk Variable"), ui-sans-serif, system-ui, sans-serif',
  body: 'var(--font-body-src, "Plus Jakarta Sans Variable"), ui-sans-serif, system-ui, sans-serif',
} as const;

export interface TypeStyle {
  size: string;
  lineHeight: string;
  letterSpacing: string;
  weight: number;
}

export const typeScale = {
  'display-2xl': { size: '4.5rem', lineHeight: '0.95', letterSpacing: '-0.04em', weight: 700 },
  'display-xl': { size: '3.5rem', lineHeight: '1', letterSpacing: '-0.035em', weight: 700 },
  'display-lg': { size: '2.75rem', lineHeight: '1.05', letterSpacing: '-0.03em', weight: 700 },
  'display-md': { size: '2.25rem', lineHeight: '1.1', letterSpacing: '-0.025em', weight: 700 },
  'display-sm': { size: '1.75rem', lineHeight: '1.15', letterSpacing: '-0.02em', weight: 600 },
  'title-lg': { size: '1.5rem', lineHeight: '1.2', letterSpacing: '-0.015em', weight: 600 },
  'title-md': { size: '1.25rem', lineHeight: '1.3', letterSpacing: '-0.01em', weight: 600 },
  'title-sm': { size: '1.0625rem', lineHeight: '1.35', letterSpacing: '-0.005em', weight: 600 },
  'body-lg': { size: '1.125rem', lineHeight: '1.55', letterSpacing: '0', weight: 400 },
  'body-md': { size: '1rem', lineHeight: '1.5', letterSpacing: '0', weight: 400 },
  'body-sm': { size: '0.875rem', lineHeight: '1.45', letterSpacing: '0', weight: 400 },
  'label-md': { size: '0.8125rem', lineHeight: '1.25', letterSpacing: '0.01em', weight: 600 },
  // Eyebrow labels: uppercase in use, so tracking is opened up.
  'label-sm': { size: '0.75rem', lineHeight: '1.2', letterSpacing: '0.06em', weight: 700 },
  'score-lg': { size: '2.5rem', lineHeight: '1', letterSpacing: '-0.02em', weight: 700 },
  'score-md': { size: '1.5rem', lineHeight: '1', letterSpacing: '-0.01em', weight: 700 },
} as const satisfies Record<string, TypeStyle>;

export type TypeStyleName = keyof typeof typeScale;
