import { typeScale } from '@playnex/design-tokens';
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge has to learn the custom type scale, otherwise `text-display-xl` and
// `text-fg-primary` are treated as competing color utilities.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: Object.keys(typeScale) }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
