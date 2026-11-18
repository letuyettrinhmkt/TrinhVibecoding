'use strict';

// API trang admin: đăng nhập, danh sách + tìm kiếm, xoá, xuất CSV.
// Quy tắc: docs/04-quy-tac-du-lieu.html R-29 → R-33, chức năng F-18 → F-22.

const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');
const {
  HttpError, sendJson, readJson, clientIp, isHttps, parseCookies, assertSameOrigin,
} = require('./http-utils');

const SITE_ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const V = require(path.join(SITE_ROOT, 'app', 'validate.js'));

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS) || 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Giới hạn chung cho mọi IP: chặn dò mật khẩu bằng cách đổi IP liên tục
const GLOBAL_MAX_FAILS = 30;
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const PAGE_SIZE = 20;
const COOKIE = 'admin_session';

const configured = ADMIN_USERNAME.length > 0 && ADMIN_PASSWORD.length >= 12;
if (!configured) {
  console.warn('Trang admin bị tắt: thiếu ADMIN_USERNAME hoặc ADMIN_PASSWORD (tối thiểu 12 ký tự) trong .env');
}

const sessions = new Map(); // sessionId -> hết hạn (ms)
const fails = new Map();    // ip -> { count, lockedUntil }
let globalFails = [];       // thời điểm các lần đăng nhập sai gần đây, mọi IP

function recentGlobalFails() {
  const now = Date.now();
  globalFails = globalFails.filter((t) => now - t < GLOBAL_WINDOW_MS);
  return globalFails.length;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of sessions) if (exp <= now) sessions.delete(k);
  for (const [k, f] of fails) if (f.lockedUntil && f.lockedUntil <= now) fails.delete(k);
}, 60 * 1000).unref();

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function cookieHeader(req, value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

function currentSession(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id) return null;
  const exp = sessions.get(id);
  if (!exp || exp <= Date.now()) { sessions.delete(id); return null; }
  return id;
}

function requireAdmin(req) {
  if (!configured) throw new HttpError(503, 'Chưa cấu hình tài khoản admin');
  if (!currentSession(req)) throw new HttpError(401, 'Cần đăng nhập');
}

async function login(req, res) {
  if (!configured) throw new HttpError(503, 'Chưa cấu hình tài khoản admin');
  assertSameOrigin(req);
  const ip = clientIp(req);
  const f = fails.get(ip);
  if (f && f.lockedUntil && f.lockedUntil > Date.now()) {
    const minutes = Math.ceil((f.lockedUntil - Date.now()) / 60000);
    throw new HttpError(429, `Đăng nhập sai quá nhiều lần, thử lại sau ${minutes} phút`);
  }
  if (recentGlobalFails() >= GLOBAL_MAX_FAILS) {
    throw new HttpError(429, 'Đăng nhập admin đang tạm khoá do có nhiều lần thử sai, thử lại sau 15 phút');
  }
  const body = await readJson(req);
  const okUser = safeEqual(body.username || '', ADMIN_USERNAME);
  const okPass = safeEqual(body.password || '', ADMIN_PASSWORD);
  if (!(okUser && okPass)) {
    const next = { count: (f ? f.count : 0) + 1, lockedUntil: 0 };
    if (next.count >= MAX_FAILS) next.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
    fails.set(ip, next);
    globalFails.push(Date.now());
    console.warn(`Đăng nhập admin thất bại (lần ${next.count})`);
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng');
  }
  fails.delete(ip);
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + SESSION_HOURS * 3600 * 1000);
  console.log('Admin đăng nhập thành công');
  sendJson(res, 204, undefined, { 'Set-Cookie': cookieHeader(req, id, SESSION_HOURS * 3600) });
}

async function logout(req, res) {
  assertSameOrigin(req);
  const id = currentSession(req);
  if (id) sessions.delete(id);
  sendJson(res, 204, undefined, { 'Set-Cookie': cookieHeader(req, '', 0) });
}

async function status(req, res) {
  if (!configured) return sendJson(res, 200, { configured: false, loggedIn: false });
  sendJson(res, 200, { configured: true, loggedIn: !!currentSession(req) });
}

// ---------- Tìm kiếm (R-30) ----------
function buildWhere(q) {
  const raw = String(q || '').slice(0, 100).trim();
  if (!raw) return { sql: '', params: [] };
  const folded = V.foldText(raw).replace(/[\\%_]/g, (m) => '\\' + m);
  const digits = raw.replace(/\D/g, '');
  const params = [`%${folded}%`];
  let sql = `WHERE (p.search_text LIKE $1 ESCAPE '\\'`;
  if (digits.length >= 3) {
    params.push(`%${digits}%`);
    sql += ` OR p.phone LIKE $2`;
  }
  sql += ')';
  return { sql, params };
}

const SELECT_PLAYERS = (where) => `
  SELECT p.id, p.full_name, p.email, p.phone, p.created_at,
         COUNT(r.id)::int AS rounds, MAX(r.score) AS best_score, MAX(r.played_at) AS last_played_at
    FROM players p
    LEFT JOIN rounds r ON r.player_id = p.id
    ${where}
   GROUP BY p.id
   ORDER BY p.created_at DESC, p.id DESC`;

function toItem(r) {
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    createdAt: r.created_at,
    rounds: r.rounds,
    bestScore: r.best_score,
    lastPlayedAt: r.last_played_at,
  };
}

async function listPlayers(req, res, url) {
  requireAdmin(req);
  const where = buildWhere(url.searchParams.get('q'));
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const total = (await db.pool.query(`SELECT COUNT(*)::int AS n FROM players p ${where.sql}`, where.params)).rows[0].n;
  const n = where.params.length;
  const { rows } = await db.pool.query(
    `${SELECT_PLAYERS(where.sql)} LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...where.params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );
  sendJson(res, 200, { total, page, pageSize: PAGE_SIZE, items: rows.map(toItem) });
}

async function deletePlayer(req, res, id) {
  requireAdmin(req);
  assertSameOrigin(req);
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Không tìm thấy người chơi');
  // R-32: xoá cứng; rounds và player_tokens tự xoá theo (ON DELETE CASCADE) trong cùng giao dịch
  const { rowCount } = await db.pool.query('DELETE FROM players WHERE id = $1', [Number(id)]);
  if (!rowCount) throw new HttpError(404, 'Không tìm thấy người chơi');
  console.log('Admin đã xoá một người chơi');
  sendJson(res, 204);
}

// ---------- CSV (R-31) ----------
function vnTime(d) {
  if (!d) return '';
  const t = new Date(new Date(d).getTime() + 7 * 3600 * 1000); // UTC+7
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s; // chống chèn công thức Excel
  return '"' + s.replace(/"/g, '""') + '"';
}

async function exportCsv(req, res, url) {
  requireAdmin(req);
  const where = buildWhere(url.searchParams.get('q'));
  const { rows } = await db.pool.query(SELECT_PLAYERS(where.sql), where.params);
  const header = ['Mã người chơi', 'Họ tên', 'Email', 'Số điện thoại', 'Ngày đăng ký', 'Số lượt', 'Điểm cao nhất', 'Lượt gần nhất'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.full_name, r.email, r.phone, vnTime(r.created_at), r.rounds,
      r.best_score == null ? '' : r.best_score, vnTime(r.last_played_at),
    ].map(csvCell).join(','));
  }
  const now = vnTime(new Date()).replace(/[-:]/g, '').replace(' ', '-');
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="dap-chuot-nguoi-choi-${now}.csv"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
  console.log(`Admin xuất CSV (${rows.length} dòng)`);
}

module.exports = { login, logout, status, listPlayers, deletePlayer, exportCsv };
