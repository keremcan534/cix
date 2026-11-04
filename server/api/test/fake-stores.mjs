// A local stand-in for Google Play, the App Store and LiveKit's RoomService, for the tests that buy coins
// through a store (purchases.mjs, refunds.mjs) or close and kick in voice rooms (live.mjs). Call it with top
// level await before startApi and pass `env` to it.
//   Google: a token starting "test-" is a license tester's (purchaseType 0), "promo-" a promo code's (1); any
//   other token is a paid purchase with orderId "GPA.<token>". `voided` is what the voided purchases list returns.
//   Apple: `apple.prod` / `apple.sandbox` map a transaction id to its product and environment.
import crypto from 'node:crypto';
import http from 'node:http';

const PKG = 'com.similarclub.app';

export async function fakeStores() {
  const s = { consumed: [], voided: [], voidedCalls: 0, livekit: [], apple: { prod: new Map(), sandbox: new Map() } };
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const ch of req) body += ch;
    const url = new URL(req.url, 'http://x');
    const send = (status, j) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(j));
    };
    if (req.method === 'POST' && url.pathname === '/token') return send(200, { access_token: 'gtok', expires_in: 3600 });
    const g = new RegExp(`^/androidpublisher/v3/applications/${PKG.replace(/\./g, '\\.')}/purchases/(.+)$`).exec(url.pathname);
    if (g) {
      if (req.headers.authorization !== 'Bearer gtok') return send(401, {});
      if (g[1] === 'voidedpurchases') return (s.voidedCalls++, send(200, { voidedPurchases: s.voided }));
      const m = /^products\/([^/]+)\/tokens\/([^/:]+)(:consume)?$/.exec(g[1]);
      if (!m) return send(404, {});
      const token = decodeURIComponent(m[2]);
      if (m[3]) return (s.consumed.push(token), send(200, {}));
      const type = token.startsWith('test-') ? 0 : token.startsWith('promo-') ? 1 : undefined;
      return send(200, { purchaseState: 0, orderId: `GPA.${token.slice(0, 30)}`, consumptionState: 0, ...(type !== undefined && { purchaseType: type }) });
    }
    const a = /^\/apple-(prod|sandbox)\/inApps\/v1\/transactions\/(\d+)$/.exec(url.pathname);
    if (a) {
      const t = s.apple[a[1]].get(a[2]);
      if (!t) return send(404, {});
      const info = { bundleId: PKG, productId: t.productId, transactionId: a[2], environment: t.environment ?? (a[1] === 'prod' ? 'Production' : 'Sandbox') };
      return send(200, { signedTransactionInfo: `x.${Buffer.from(JSON.stringify(info)).toString('base64url')}.y` });
    }
    const lk = /^\/lk\/twirp\/livekit\.RoomService\/(\w+)$/.exec(url.pathname);
    if (lk && req.method === 'POST') {
      const jwt = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      const [h, p, sig] = jwt.split('.');
      const good = sig === crypto.createHmac('sha256', 'testsecret').update(`${h}.${p}`).digest('base64url');
      s.livekit.push({ method: lk[1], body: JSON.parse(body || '{}'), grant: JSON.parse(Buffer.from(p ?? '', 'base64url').toString() || '{}').video, signed: good });
      return send(200, lk[1] === 'ListRooms' ? { rooms: [] } : {});
    }
    send(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const base = `http://127.0.0.1:${server.address().port}`;

  const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const apple = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  s.env = {
    GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'play@test.iam.gserviceaccount.com', private_key: google.privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    GOOGLE_API_URL: base,
    GOOGLE_TOKEN_URL: `${base}/token`,
    APPLE_IAP_KEY_ID: 'KEY123',
    APPLE_IAP_ISSUER_ID: 'issuer',
    APPLE_IAP_PRIVATE_KEY: apple.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    APPLE_API_URL: `${base}/apple-prod`,
    APPLE_SANDBOX_API_URL: `${base}/apple-sandbox`,
    LIVEKIT_API_URL: `${base}/lk`,
  };
  return s;
}
