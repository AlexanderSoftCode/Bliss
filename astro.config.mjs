// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  env: {
    schema: {
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_USERNAME: envField.string({ context: 'server', access: 'public' }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
