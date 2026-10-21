import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import base from './base.mjs';

// eslint-config-next already registers react, react-hooks and jsx-a11y, so this extends
// base directly instead of react.mjs to avoid redefining those plugins.
export default defineConfig(
  base,
  nextCoreWebVitals,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // eslint-config-next sets its own parser options for TS files; typed linting has to be
  // re-enabled after it.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
