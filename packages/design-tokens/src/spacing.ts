// 4 px base unit; Tailwind derives every spacing utility from it.
export const spacingUnit = '0.25rem';

export const layout = {
  sidebar: '15rem',
  sidebarCompact: '4.5rem',
  rightPanel: '17.5rem',
  topbar: '4rem',
  mobileNav: '4rem',
  page: '90rem',
} as const;

export type LayoutToken = keyof typeof layout;
