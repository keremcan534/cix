// A local stand-in for Google Play, the App Store and LiveKit's RoomService, for the tests that buy coins
// through a store (purchases.mjs, refunds.mjs) or close and kick in voice rooms (live.mjs). Call it with top
// level await before startApi and pass `env` to it.
//   Google: a token starting "test-" is a license tester's (purchaseType 0), "promo-" a promo code's (1); any
//   other token is a paid purchase with orderId "GPA.<token>". `voided` is what the voided purchases list returns.
//   `purchaseTimes` maps a token to its purchaseTimeMillis (ms); a token not in it was bought at the lookup.
//   Google subscriptions (vip.mjs): `subs` maps a token to { productId, expiry (ms), state (default ACTIVE), autoRenew
//   (default true), test, account (obfuscated id), orderId, acked }; an unknown token is 404 (`gone` tokens 410).
//   `subReads` counts the reads of each token; an acknowledge marks it acked and goes to `acknowledged`.
//   Apple: `apple.prod` / `apple.sandbox` map a transaction id to its product, environment and purchaseDate
//   (ms; the lookup time when not set); any other field (expiresDate, originalTransactionId, revocationDate,
//   appAccountToken) is passed on as it is.
import crypto from 'node:crypto';
import http from 'node:http';

const PKG = 'com.similarclub.app';

export async function fakeStores() {
  const s = {
    consumed: [],
    voided: [],
    voidedCalls: 0,
    livekit: [],
    purchaseTimes: new Map(),
    subs: new Map(),
    gone: new Set(),
    subReads: new Map(),
    acknowledged: [],
    apple: { prod: new Map(), sandbox: new Map() },
  };
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
      const sv2 = /^subscriptionsv2\/tokens\/([^/:]+)$/.exec(g[1]);
      if (sv2 && req.method === 'GET') {
        const token = decodeURIComponent(sv2[1]);
        s.subReads.set(token, (s.subReads.get(token) ?? 0) + 1);
        if (s.gone.has(token)) return send(410, {});
        const x = s.subs.get(token);
        if (!x) return send(404, {});
        return send(200, {
          kind: 'androidpublisher#subscriptionPurchaseV2',
          subscriptionState: x.state ?? 'SUBSCRIPTION_STATE_ACTIVE',
          latestOrderId: x.orderId ?? `GPA.${token.slice(0, 20)}`,
          acknowledgementState: x.acked ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : 'ACKNOWLEDGEMENT_STATE_PENDING',
          lineItems: [{ productId: x.productId, expiryTime: new Date(x.expiry).toISOString(), autoRenewingPlan: { autoRenewEnabled: x.autoRenew ?? true } }],
          ...(x.test && { testPurchase: {} }),
          ...(x.account && { externalAccountIdentifiers: { obfuscatedExternalAccountId: x.account } }),
        });
      }
      const ack = /^subscriptions\/([^/]+)\/tokens\/([^/:]+):acknowledge$/.exec(g[1]);
      if (ack && req.method === 'POST') {
        const token = decodeURIComponent(ack[2]);
        const x = s.subs.get(token);
        if (!x || x.productId !== decodeURIComponent(ack[1])) return send(404, {});
        x.acked = true;
        s.acknowledged.push(token);
        return send(200, {});
      }
      const m = /^products\/([^/]+)\/tokens\/([^/:]+)(:consume)?$/.exec(g[1]);
      if (!m) return send(404, {});
      const token = decodeURIComponent(m[2]);
      if (m[3]) return (s.consumed.push(token), send(200, {}));
      const type = token.startsWith('test-') ? 0 : token.startsWith('promo-') ? 1 : undefined;
      const purchaseTimeMillis = String(s.purchaseTimes.get(token) ?? Date.now());
      return send(200, { purchaseState: 0, orderId: `GPA.${token.slice(0, 30)}`, purchaseTimeMillis, consumptionState: 0, ...(type !== undefined && { purchaseType: type }) });
    }
    const a = /^\/apple-(prod|sandbox)\/inApps\/v1\/transactions\/(\d+)$/.exec(url.pathname);
    if (a) {
      const t = s.apple[a[1]].get(a[2]);
      if (!t) return send(404, {});
      const info = { ...t, bundleId: PKG, productId: t.productId, transactionId: a[2], purchaseDate: t.purchaseDate ?? Date.now(), environment: t.environment ?? (a[1] === 'prod' ? 'Production' : 'Sandbox') };
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
