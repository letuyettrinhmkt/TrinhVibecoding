'use strict';

// API phía người chơi: đăng ký, xác nhận token, lưu kết quả lượt.
// Quy tắc: docs/04-quy-tac-du-lieu.html R-19 → R-28.

const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');
const { HttpError, sendJson, readJson, clientIp, bearerToken, createRateLimiter } = require('./http-utils');

const SITE_ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const V = require(path.join(SITE_ROOT, 'app', 'validate.js'));

const ROUND_MIN_INTERVAL_S = 30;
const allowRegister = createRateLimiter(10, 60 * 1000); // 10 lần / phút / IP

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function playerFromToken(req) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Cần đăng ký để chơi');
  const { rows } = await db.pool.query(
    `SELECT p.id, p.full_name FROM player_tokens t JOIN players p ON p.id = t.player_id WHERE t.token_hash = $1`,
    [sha256(token)]
  );
  if (!rows.length) throw new HttpError(401, 'Mã người chơi không còn hợp lệ');
  return { id: rows[0].id, fullName: rows[0].full_name, tokenHash: sha256(token) };
}

async function health(req, res) {
  try {
    await db.ping();
    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 503, { ok: false, error: 'Database chưa sẵn sàng' });
  }
}

async function register(req, res) {
  if (!allowRegister(clientIp(req))) throw new HttpError(429, 'Bạn thao tác quá nhanh, thử lại sau 1 phút');
  const body = await readJson(req);
  const check = V.validateRegistration(body);
  if (!check.ok) throw new HttpError(400, 'Thông tin chưa hợp lệ', { fields: check.errors });

  const { fullName, email, phone } = check.value;
  const searchText = V.foldText(fullName + ' ' + email);
  const token = crypto.randomBytes(32).toString('hex');

  const created = await db.tx(async (c) => {
    // R-24: email là khoá duy nhất — email cũ thì cập nhật, không tạo bản ghi mới
    const { rows } = await c.query(
      `INSERT INTO players (full_name, email, phone, search_text, consent_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone,
             search_text = EXCLUDED.search_text,
             consent_at = EXCLUDED.consent_at,
             updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [fullName, email, phone, searchText]
    );
    await c.query(`INSERT INTO player_tokens (token_hash, player_id) VALUES ($1, $2)`, [sha256(token), rows[0].id]);
    return rows[0].inserted;
  });

  sendJson(res, created ? 201 : 200, { token, displayName: V.displayName(fullName), existing: !created });
}

async function me(req, res) {
  const p = await playerFromToken(req);
  sendJson(res, 200, { displayName: V.displayName(p.fullName) });
}

function intIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

async function saveRound(req, res) {
  const p = await playerFromToken(req);
  const b = await readJson(req);
  const { score, hits, misses, blackHits } = b;
  // R-27: kiểm tra hợp lệ
  if (!intIn(hits, 0, 200) || !intIn(misses, 0, 200) || !intIn(blackHits, 0, 200) ||
      !Number.isInteger(score) || score !== hits - blackHits) {
    throw new HttpError(400, 'Kết quả lượt chơi không hợp lệ');
  }

  // Mỗi mã thiết bị chỉ gửi 1 kết quả mỗi 30 giây (cập nhật nguyên tử)
  const upd = await db.pool.query(
    `UPDATE player_tokens SET last_used_at = now()
      WHERE token_hash = $1
        AND (last_used_at IS NULL OR last_used_at < now() - make_interval(secs => $2))
      RETURNING player_id`,
    [p.tokenHash, ROUND_MIN_INTERVAL_S]
  );
  if (!upd.rows.length) throw new HttpError(429, 'Kết quả gửi quá nhanh');

  await db.pool.query(
    `INSERT INTO rounds (player_id, score, hits, misses, black_hits) VALUES ($1, $2, $3, $4, $5)`,
    [p.id, score, hits, misses, blackHits]
  );
  sendJson(res, 201, { saved: true });
}

module.exports = { health, register, me, saveRound };
