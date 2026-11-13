// Test server only (ALLOW_TEST_TOPUP=1): admin accounts are at the top of everything, so the owner can try every
// feature. Their Cömertlik and Yankı points read as the last step of WEALTH_XP / CHARM_XP (wheel.mjs wealthPointsOf,
// wallet.mjs charmPointsOf: every gate and level shown); coins, SVIP, rank and room XP are filled on GET /api/me
// (index.mjs fillTestAdmin). Rankings read their own sums and stay as they are. TEST_ADMIN_MAX=0 turns it off (the
// tests' default, test/harness.mjs). Off in production, where ALLOW_TEST_TOPUP is 0.
import { env } from './core.mjs';

export const TEST_ADMIN = env.ALLOW_TEST_TOPUP === '1' && env.TEST_ADMIN_MAX !== '0';

/** Which of `ids` are admin accounts, on the test server only (otherwise none, without a query). */
export async function testAdminsOf(c, ids) {
  if (!TEST_ADMIN || !ids.length) return new Set();
  const r = await c.query("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'admin'", [ids]);
  return new Set(r.rows.map((x) => x.id));
}

/** `points` (id → points) with each test admin among `ids` raised to `top`. */
export async function withTopFor(c, ids, points, top) {
  for (const id of await testAdminsOf(c, ids)) points.set(id, Math.max(points.get(id) ?? 0, top));
  return points;
}
