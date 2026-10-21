import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import '@playnex/design-tokens/css/fonts.css';
import '../src/styles/app.css';

const preview: Preview = {
  decorators: [
    withThemeByDataAttribute({
      themes: { dark: 'dark', light: 'light' },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
    }),
  ],
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
    a11y: { test: 'error' },
  },
};

export default preview;
