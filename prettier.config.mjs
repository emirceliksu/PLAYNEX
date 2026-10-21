import base from '@playnex/config/prettier';

/** @type {import("prettier").Config} */
export default {
  ...base,
  tailwindStylesheet: './packages/ui/src/styles/app.css',
};
