// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  env: {
    schema: {
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      GITHUB_USERNAME: envField.string({ context: 'server', access: 'public' }),
      CONTACT_EMAIL: envField.string({ context: 'server', access: 'secret'}),
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Commit Mono',
      cssVariable: '--font-commit-mono',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          { src: ['./src/assets/fonts/commit-mono/CommitMono-700-Regular.woff2'], weight: 700, style: 'normal' },
        ],
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
