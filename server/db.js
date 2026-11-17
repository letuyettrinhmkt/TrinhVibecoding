'use strict';

// Kết nối PostgreSQL. Thông số lấy từ biến môi trường chuẩn của pg:
// PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (đặt trong docker-compose.yml từ file .env).
const { Pool } = require('pg');

const pool = new Pool({
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Lỗi kết nối database (pool):', err.message);
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id          SERIAL PRIMARY KEY,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  phone       TEXT        NOT NULL,
  search_text TEXT        NOT NULL,
  consent_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_tokens (
  token_hash   TEXT        PRIMARY KEY,
  player_id    INTEGER     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS player_tokens_player_idx ON player_tokens(player_id);

CREATE TABLE IF NOT EXISTS rounds (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score      INTEGER     NOT NULL,
  hits       INTEGER     NOT NULL CHECK (hits >= 0),
  misses     INTEGER     NOT NULL CHECK (misses >= 0),
  black_hits INTEGER     NOT NULL CHECK (black_hits >= 0),
  played_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rounds_player_idx ON rounds(player_id);
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chờ database sẵn sàng rồi tạo bảng (chạy lại nhiều lần không sao). */
async function init({ retries = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(SCHEMA);
      console.log('Database sẵn sàng.');
      return;
    } catch (err) {
      console.warn(`Chưa kết nối được database (lần ${i}/${retries}): ${err.message}`);
      if (i === retries) throw err;
      await sleep(delayMs);
    }
  }
}

async function ping() {
  await pool.query('SELECT 1');
}

/** Chạy fn(client) trong một giao dịch. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, init, ping, tx };
