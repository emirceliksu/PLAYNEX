import next from '@playnex/config/eslint/next';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['next-env.d.ts', 'playwright-report/**', 'test-results/**']),
  next,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
