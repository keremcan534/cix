// Shared test setup: each test file gets an empty database and its own API process on it, talks to it over
// HTTP, then drops the database.
//   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test
import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const PG = { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432), user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? '' };

/**
 * Registers before/after hooks that start the API with `extraEnv` on a fresh database. Returns helpers;
 * `sql` (a pool on the test database) and `logs` (the API's stdout lines) fill in once it is up.
 */
export function startApi(extraEnv = {}) {
  const DB = `similar_test_${process.pid}`;
  const PORT = 17000 + (process.pid % 2000);
  const base = `http://127.0.0.1:${PORT}`;
  const h = { base, sql: null, logs: [], api: null };

  before(async () => {
    const root = new pg.Client({ ...PG, database: 'postgres' });
    await root.connect();
    await root.query(`CREATE DATABASE ${DB}`);
    await root.end();
    h.sql = new pg.Pool({ ...PG, database: DB });
    h.api = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'index.mjs')], {
      env: {
        ...process.env,
        PGHOST: PG.host,
        PGPORT: String(PG.port),
        POSTGRES_USER: PG.user,
        POSTGRES_PASSWORD: PG.password,
        POSTGRES_DB: DB,
        LIVEKIT_KEYS: 'testkey: testsecret',
        API_PORT: String(PORT),
        ALLOW_TEST_TOPUP: '1',
        RATE_AUTH: '100000',
        RATE_ALL: '100000',
        LOG_REQUESTS: '0',
        PUSH_ENABLED: '0',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    h.api.stdout.on('data', (d) => {
      buf += String(d);
      const lines = buf.split('\n');
      buf = lines.pop();
      h.logs.push(...lines);
    });
    await new Promise((resolve, reject) => {
      const t = setInterval(() => h.logs.some((l) => l.includes('api on')) && (clearInterval(t), resolve()), 20);
      h.api.on('exit', (code) => (clearInterval(t), reject(new Error(`api exited ${code}`))));
    });
  });

  after(async () => {
    h.api?.kill();
    await h.sql?.end();
    const root = new pg.Client({ ...PG, database: 'postgres' });
    await root.connect();
    await root.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await root.end();
  });

  /** [status, json] of one request. */
  h.call = async (method, p, body, session, headers = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}), ...headers },
      body: body === undefined || body === null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return [r.status, await r.json()];
  };

  /** A new development account. */
  h.signUp = async (name = `Test ${rnd(2)}`, deviceKey = rnd(24)) => {
    const [st, j] = await h.call('POST', '/api/auth/dev', { deviceKey, name });
    assert.equal(st, 200, j.error);
    return { ...j, deviceKey };
  };

  /** Waits for a line of the API's output that matches `re`, from line `from` on. */
  h.waitLog = async (re, from = 0, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const line = h.logs.slice(from).find((l) => re.test(l));
      if (line) return line;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no log line matching ${re}`);
  };

  return h;
}

export const rnd = (n = 12) => crypto.randomBytes(n).toString('hex');
export const tokenOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));
