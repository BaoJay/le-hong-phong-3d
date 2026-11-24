import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handleModelKeyRequest } from './api/_model-key';

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

/**
 * Chạy `api/model-key` ngay trong `vite dev` / `vite preview`, dùng MODEL_KEY
 * từ `.env.local`. Trên Vercel, route này do Vercel Function phục vụ.
 */
function modelKeyApiPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.split('?')[0].endsWith('/api/model-key')) return next();
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }
    const response = handleModelKeyRequest(
      new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers }),
      { MODEL_KEY: env.MODEL_KEY, MODEL_ALLOWED_HOSTS: env.MODEL_ALLOWED_HOSTS },
    );
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
  return {
    name: 'model-key-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [siteModePlugin(mode), modelKeyApiPlugin(mode)],
  server: {
    host: true
  },
  preview: {
    host: true
  }
}));
