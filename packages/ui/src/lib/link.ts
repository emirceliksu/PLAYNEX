import type { ComponentType, ReactNode } from 'react';

// Navigation components stay router-agnostic: the app injects its localized Link.
export interface LinkComponentProps {
  href: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  'aria-current'?: 'page' | undefined;
  'aria-label'?: string;
}

export type LinkComponent = ComponentType<LinkComponentProps>;
