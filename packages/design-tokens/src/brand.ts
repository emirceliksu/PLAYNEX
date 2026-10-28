// Geometry of the PLAYNEX mark on a 64-unit grid: a sticker tile with its hard offset shadow,
// a play-triangle P (drawn with fill-rule evenodd for its counter) and two score pixels. The UI component colors it with theme tokens;
// scripts/build-brand.ts renders the favicon, app icon and mail logo from the same shapes.
export const brandMark = {
  viewBox: '0 0 64 64',
  shadow: { x: 9, y: 9, size: 50, radius: 14 },
  tile: { x: 4, y: 4, size: 50, radius: 14, stroke: 3 },
  // A play triangle on a stem: reads as "play" and as the P of the wordmark.
  play: 'M18 16.6v27.9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.4l15.9-8.6a2.4 2.4 0 0 0 0-4.2l-20.9-10.6a2 2 0 0 0-3 1.8zM26 22.6l9.4 5.2-9.4 5.2z',
  pixels: [
    { x: 41, y: 11, size: 6 },
    { x: 47, y: 18, size: 3.5 },
  ],
} as const;
