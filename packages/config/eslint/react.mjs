import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import base from './base.mjs';

export default defineConfig(base, reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.strict, {
  languageOptions: {
    globals: {
      ...globals.browser,
    },
  },
});
