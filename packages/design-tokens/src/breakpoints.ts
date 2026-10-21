// lg: sidebar expands; xl: right panel appears (PLAN.md 4.1, 1366 px); 2xl: page max width.
export const breakpoints = {
  sm: '40rem',
  md: '48rem',
  lg: '64rem',
  xl: '85.375rem',
  '2xl': '90rem',
} as const;

export type BreakpointToken = keyof typeof breakpoints;
