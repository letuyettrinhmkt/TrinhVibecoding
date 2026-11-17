'use strict';

// Server game "Đập Chuột"
//   /           → app/      (game)
//   /design/... → design/   (tokens.css)
//   /admin/     → admin/    (trang quản trị, cần đăng nhập)
//   /api/...    → API người chơi và admin (PostgreSQL)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const players = require('./players');
const admin = require('./admin');
const { HttpError, sendJson } = require('./http-utils');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));

const MOUNTS = [
  { prefix: '/design/', dir: path.join(ROOT, 'design') },
  { prefix: '/admin/', dir: path.join(ROOT, 'admin'), noindex: true },
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

// Log chỉ ghi phương thức, đường dẫn (không có query) và mã trạng thái — không ghi dữ liệu cá nhân.
function log(req, pathname, status) {
  console.log(`${new Date().toISOString()} ${req.method} ${pathname} ${status}`);
}

function sendText(req, res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function resolveFile(urlPath) {
  for (const m of MOUNTS) {
    if (!urlPath.startsWith(m.prefix)) continue;
    let rel = urlPath.slice(m.prefix.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(m.dir, rel);
    if (file !== m.dir && !file.startsWith(m.dir + path.sep)) return null; // chặn ../
    return { file, mount: m };
  }
  return null;
}

function serveStatic(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return 405;
  }
  if (urlPath === '/design' || urlPath === '/admin') {
    sendText(req, res, 301, '', { Location: urlPath + '/' });
    return 301;
  }
  const hit = resolveFile(urlPath);
  if (!hit || urlPath.includes('\0')) { sendText(req, res, 404, 'Not Found'); return 404; }

  let stat;
  try { stat = fs.statSync(hit.file); } catch { stat = null; }
  if (!stat || !stat.isFile()) { sendText(req, res, 404, 'Not Found'); return 404; }

  const headers = {
    'Content-Type': MIME[path.extname(hit.file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (hit.mount.noindex) {
    headers['X-Robots-Tag'] = 'noindex, nofollow';
    headers['X-Frame-Options'] = 'DENY';
    headers['Referrer-Policy'] = 'no-referrer';
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return 200; }
  fs.createReadStream(hit.file).on('error', () => res.destroy()).pipe(res);
  return 200;
}

// ---------- Định tuyến API ----------
async function routeApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/health' && m === 'GET') return players.health(req, res);
  if (p === '/api/players' && m === 'POST') return players.register(req, res);
  if (p === '/api/players/me' && m === 'GET') return players.me(req, res);
  if (p === '/api/rounds' && m === 'POST') return players.saveRound(req, res);

  if (p === '/api/admin/status' && m === 'GET') return admin.status(req, res);
  if (p === '/api/admin/login' && m === 'POST') return admin.login(req, res);
  if (p === '/api/admin/logout' && m === 'POST') return admin.logout(req, res);
  if (p === '/api/admin/players' && m === 'GET') return admin.listPlayers(req, res, url);
  if (p === '/api/admin/players.csv' && m === 'GET') return admin.exportCsv(req, res, url);
  const del = /^\/api\/admin\/players\/([^/]+)$/.exec(p);
  if (del && m === 'DELETE') return admin.deletePlayer(req, res, del[1]);

  throw new HttpError(404, 'Không tìm thấy API');
}

const server = http.createServer(async (req, res) => {
  let url, pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(req, res, 400, 'Bad Request');
    return log(req, '(url lỗi)', 400);
  }

  if (pathname === '/healthz') { sendText(req, res, 200, 'ok'); return log(req, pathname, 200); }

  if (pathname.startsWith('/api/')) {
    try {
      await routeApi(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, ...(err.extra || {}) });
      } else {
        console.error('Lỗi API:', err && err.message);
        if (!res.headersSent) sendJson(res, 500, { error: 'Lỗi máy chủ, thử lại sau' });
      }
    }
    return log(req, pathname, res.statusCode);
  }

  const status = serveStatic(req, res, pathname);
  log(req, pathname, status);
});

async function start() {
  await db.init();
  server.listen(PORT, HOST, () => {
    console.log(`Đập Chuột đang chạy tại http://localhost:${PORT} (phục vụ ${ROOT})`);
  });
}

start().catch((err) => {
  console.error('Không khởi động được server:', err.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang tắt server...`);
  server.close(() => db.pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
