import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { proxyRpc } from './api/_proxy.js';

// Serves /api/rpc locally too, so `npm run dev` behaves like the Vercel deploy.
function rpcMiddleware() {
  const handle = async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end();
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const out = await proxyRpc(body);
    res.statusCode = out.status;
    res.setHeader('content-type', 'application/json');
    res.end(out.body);
  };
  return {
    name: 'lattice-rpc',
    configureServer(server) {
      server.middlewares.use('/api/rpc', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/rpc', handle);
    },
  };
}

export default defineConfig(({ mode }) =>
  mode === 'file'
    ? {
        // `npm run build:file` → one self-contained HTML you can open by double-clicking
        plugins: [viteSingleFile()],
        worker: { format: 'iife' },
        build: { target: 'es2022', outDir: 'preview', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
      }
    : {
        plugins: [rpcMiddleware()],
        worker: { format: 'iife' },
        build: { target: 'es2022', chunkSizeWarningLimit: 900 },
      },
);
