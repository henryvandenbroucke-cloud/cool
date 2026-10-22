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
};

async function resolvePath(candidate) {
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

  const file = await resolvePath(candidate);
  if (file) return file;

  // PRISM lives in prism/ now and its document still uses absolute /css, /js
  // and /assets paths — anything not found at the root is looked up in there.
  if (!pathname.startsWith('/prism')) {
    const prismCandidate = normalize(join(ROOT, 'prism', pathname));
    if (prismCandidate.startsWith(ROOT + sep)) {
      return resolvePath(prismCandidate);
    }
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
      res.end('<!doctype html><meta charset="utf-8"><title>404</title><body style="background:#fff7ea;color:#3a4a58;font:16px/1.6 system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:clamp(3rem,12vw,8rem);margin:0">404</h1><p>Nothing but scales around here.</p><a href="/" style="color:#4e9a3c">Play the snake</a> · <a href="/prism" style="color:#5b6b7a">Visit PRISM</a></div>');
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
  console.log(`cool → http://${HOST}:${PORT}  (snake at /, PRISM at /prism)`);
});
