import { creatorSwatches, oklchToHex } from '@playnex/design-tokens';

// Canvas engines and SVG fills need sRGB hex; converted once per page load.
export const swatchHex: readonly string[] = creatorSwatches.map(oklchToHex);
