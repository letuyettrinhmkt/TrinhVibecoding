'use strict';

const MAX_BODY_BYTES = 10 * 1024;
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sendJson(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(status === 204 ? undefined : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').toLowerCase();
    if (!type.startsWith('application/json')) {
      reject(new HttpError(415, 'Cần gửi dữ liệu dạng JSON'));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const data = text ? JSON.parse(text) : {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
        resolve(data);
      } catch {
        reject(new HttpError(400, 'Dữ liệu JSON không hợp lệ'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'Không đọc được dữ liệu')));
  });
}

/**
 * IP người gọi. Sau ngrok/Caddy (TRUST_PROXY=true) lấy từ X-Forwarded-For.
 * Lấy phần tử CUỐI: đó là IP do proxy ngay trước app ghi vào. Các phần tử đứng trước
 * do trình duyệt tự gửi được, nên dùng chúng thì kẻ tấn công né được giới hạn theo IP.
 * Chỉ đúng khi có đúng 1 tầng proxy (ngrok hoặc Caddy) — cấu hình hiện tại.
 */
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const last = String(xff).split(',').pop().trim();
      if (last) return last;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  if (req.socket.encrypted) return true;
  return TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function bearerToken(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+([A-Za-z0-9]+)$/.exec(h);
  return m ? m[1] : null;
}

/** Yêu cầu thay đổi dữ liệu phải đến từ cùng nguồn (chống CSRF, R-33). */
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) throw new HttpError(403, 'Yêu cầu không hợp lệ');
  let originHost;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, 'Yêu cầu không hợp lệ'); }
  const hosts = [req.headers.host];
  if (TRUST_PROXY && req.headers['x-forwarded-host']) hosts.push(String(req.headers['x-forwarded-host']).split(',')[0].trim());
  if (!hosts.includes(originHost)) throw new HttpError(403, 'Yêu cầu không hợp lệ');
}

/** Giới hạn số lần trong một khoảng thời gian, theo khoá (thường là IP). */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, windowMs).unref();
  return function allow(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
}

module.exports = {
  HttpError,
  sendJson,
  readJson,
  clientIp,
  isHttps,
  parseCookies,
  bearerToken,
  assertSameOrigin,
  createRateLimiter,
};
