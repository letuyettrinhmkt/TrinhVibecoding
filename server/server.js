'use strict';

// Server tĩnh nhỏ cho game "Đập Chuột" — chỉ dùng thư viện có sẵn của Node.js.
//   /           → app/      (index.html, style.css, game.js)
//   /design/... → design/   (tokens.css; game nạp qua ../design/tokens.css)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));

const MOUNTS = [
  { prefix: '/design/', dir: path.join(ROOT, 'design') },
  { prefix: '/', dir: path.join(ROOT, 'app') },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function log(req, status) {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${status}`);
}

function send(req, res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
  log(req, status);
}

function resolveFile(urlPath) {
  for (const { prefix, dir } of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel = urlPath.slice(prefix.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(dir, rel);
    // Chặn đi ra ngoài thư mục được phục vụ (../)
    if (file !== dir && !file.startsWith(dir + path.sep)) return null;
    return file;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(req, res, 400, 'Bad Request');
  }

  if (urlPath === '/healthz') return send(req, res, 200, 'ok');
  if (urlPath === '/design') return send(req, res, 301, '', { Location: '/design/' });

  const file = resolveFile(urlPath);
  if (!file || urlPath.includes('\0')) return send(req, res, 404, 'Not Found');

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(req, res, 404, 'Not Found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return log(req, 200); }
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
    log(req, 200);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Đập Chuột đang chạy tại http://localhost:${PORT} (phục vụ ${ROOT})`);
});

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang tắt server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
