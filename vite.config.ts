import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * `VITE_SITE_MODE=coming-soon` serves coming-soon.html in place of index.html
 * (dev server and build alike), so the 3D viewer and its assets are never
 * bundled. The `preview` branch turns it on via its committed `.env`; every
 * other branch builds the full experience.
 */
function siteModePlugin(mode: string): Plugin {
  const siteMode = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_MODE;
  return {
    name: 'site-mode',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (siteMode !== 'coming-soon' || !ctx.filename.endsWith('index.html')) return html;
        return readFileSync(resolve(process.cwd(), 'coming-soon.html'), 'utf-8');
      }
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [siteModePlugin(mode)],
  server: {
    host: true
  },
  preview: {
    host: true
  }
}));
