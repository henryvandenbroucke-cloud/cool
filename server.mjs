/**
 * Zero-dependency static server for PRISM.
 * Binds 0.0.0.0 so the preview proxy can reach it.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
};

async function resolveFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }

  // Never escape the document root.
  const candidate = normalize(join(ROOT, pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return index;
      return null;
    }
    if (info.isFile()) return candidate;
  } catch {
    return null;
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const file = await resolveFile(req.url || '/');
  if (!file) {
    const fallback = await resolveFile('/index.html');
    if (fallback) {
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end('<!doctype html><meta charset="utf-8"><title>404</title><body style="background:#16222e;color:#fdf3e0;font:16px/1.6 system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:clamp(3rem,12vw,8rem);margin:0">404</h1><p>Nothing on this shelf.</p><a href="/" style="color:#ffd89a">Back to the shop</a></div>');
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = extname(file).toLowerCase();
  const info = await stat(file);

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`PRISM → http://${HOST}:${PORT}`);
});
