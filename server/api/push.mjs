// Push notifications through Expo's push service (works for both stores; the app registers its Expo push
// token after sign-in). Sending never blocks or fails the request that caused it.
//
//   POST /api/push/register   { token, platform }   → { registered }
//   POST /api/push/unregister { token }             → { registered: false }
//
// PUSH_URL overrides Expo's address (tests); EXPO_ACCESS_TOKEN is sent when push security is turned on in
// the Expo project. PUSH_ENABLED=0 turns sending off.
import { HttpError, auth, db, env, readJson } from './core.mjs';

const URL = env.PUSH_URL ?? 'https://exp.host/--/api/v2/push/send';
const ENABLED = env.PUSH_ENABLED !== '0';
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;
const PLATFORMS = ['ios', 'android', 'web'];

/**
 * Sends one notification to every phone of `userIds`. `data` reaches the app (e.g. { type: 'message', from })
 * so a tap can open the right screen. Tokens Expo reports as unregistered are deleted.
 */
export function notify(userIds, { title, body, data = {} }) {
  if (!ENABLED || !userIds.length) return;
  (async () => {
    const r = await db.query('SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])', [userIds]);
    const tokens = r.rows.map((x) => x.token);
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) },
        body: JSON.stringify(batch.map((to) => ({ to, title, body: body.length > 140 ? `${body.slice(0, 139)}…` : body, data, sound: 'default', priority: 'high' }))),
        signal: AbortSignal.timeout(10_000),
      });
      const j = await res.json().catch(() => ({}));
      const gone = (j.data ?? []).map((t, k) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? batch[k] : null)).filter(Boolean);
      if (gone.length) await db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [gone]);
    }
  })().catch((e) => console.error('push failed', String(e).slice(0, 200)));
}

export const pushRoutes = {
  async 'POST /api/push/register'(req) {
    const u = await auth(req);
    const { token, platform } = await readJson(req);
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new HttpError(400, 'Geçersiz bildirim anahtarı');
    if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Geçersiz platform');
    // A phone that signs in to another account moves its token there.
    await db.query(
      'INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()',
      [token, u.id, platform],
    );
    return { registered: true };
  },

  async 'POST /api/push/unregister'(req) {
    const u = await auth(req);
    const { token } = await readJson(req);
    if (typeof token !== 'string') throw new HttpError(400, 'Geçersiz bildirim anahtarı');
    await db.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, u.id]);
    return { registered: false };
  },
};
