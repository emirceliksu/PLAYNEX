import react from '@playnex/config/eslint/react';
import { defineConfig } from 'eslint/config';

export default defineConfig(react, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
