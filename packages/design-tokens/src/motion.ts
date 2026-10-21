// Durations follow PLAN.md section 3 "Animasyon standartları".
export const duration = {
  fast: '150ms',
  base: '200ms',
  modal: '180ms',
  page: '250ms',
  xp: '550ms',
  achievement: '600ms',
  celebrate: '1500ms',
} as const;

export const easing = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  // Slight overshoot for sticker-style pops; never used on layout-affecting properties.
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
} as const;

export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;
