// Hard offset shadows are the signature detail: a flat "sticker" lift instead of blurred depth.
export const shadow = {
  sticker: '0.25rem 0.25rem 0 0 var(--pn-shadow-ink)',
  'sticker-lg': '0.5rem 0.5rem 0 0 var(--pn-shadow-ink)',
  raised: '0 1px 0 0 oklch(1 0 0 / 4%) inset, 0 12px 32px -16px oklch(0 0 0 / 55%)',
  overlay: '0 24px 56px -16px oklch(0 0 0 / 65%)',
} as const;

export type ShadowToken = keyof typeof shadow;
