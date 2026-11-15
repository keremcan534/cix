// A file from a link an admin pastes (Yönetim › Hediyeler and the finance panel: "ya da bağlantı yapıştır"),
// downloaded once by this server into a temporary file. What it will fetch:
//   - only http:// and https:// on the usual ports (80, 443), with no user name or password in the link;
//   - only from public addresses: never this machine (the API, the panel at 127.0.0.1:4300, Postgres…), the
//     containers' network, a private or link-local range, carrier NAT, multicast or a reserved block. A name is
//     resolved here and the connection goes to the address that was checked, so it can't turn into an inner one in
//     between; every redirect (at most 5) is checked the same way;
//   - at most `max` bytes (the size limit of what the file is for), within a time limit.
// A web page instead of a file (a Google Drive or Dropbox share page, a host's file manager, a login page) is
// refused with a sentence saying which link works: one that downloads the file itself.
// LINK_FETCH_ALLOW (tests only): host:port pairs fetched even on a private address, e.g. 127.0.0.1:41234.
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { HttpError, env } from './core.mjs';

// Two lists: Node checks an IPv4 address against IPv6 rules too (as ::ffff:a.b.c.d), so one list with the IPv6
// rule for IPv4-mapped addresses would hold every IPv4 address.
const BLOCKED4 = new net.BlockList();
const BLOCKED6 = new net.BlockList();
// IPv4: "this" network, private, carrier NAT, loopback, link-local, protocol assignments, documentation, 6to4
// relays, benchmarking, multicast, reserved and broadcast.
for (const [a, p] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  BLOCKED4.addSubnet(a, p, 'ipv4');
// IPv6: unspecified, loopback and IPv4-compatible (::/96), IPv4-mapped (any IPv4 at all), NAT64 and 6to4 and Teredo
// (they lead to IPv4 addresses), discard, documentation, unique local, link-local, site-local and multicast.
for (const [a, p] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
])
  BLOCKED6.addSubnet(a, p, 'ipv6');

/** Whether `address` (an IP) is a public one this server may connect to for a link. */
export function isPublic(address) {
  const ip = String(address ?? '')
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  const family = net.isIP(ip);
  if (!family) return false;
  return family === 6 ? !BLOCKED6.check(ip, 'ipv6') : !BLOCKED4.check(ip, 'ipv4');
}

const ALLOW = new Set(
  String(env.LINK_FETCH_ALLOW ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const portOf = (u) => u.port || (u.protocol === 'https:' ? '443' : '80');
const allowed = (u) => ALLOW.has(`${u.hostname.replace(/^\[|\]$/g, '')}:${portOf(u)}`);

const bad = (message) => new HttpError(400, message);
const mb = (n) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
export const INNER = 'Bu adrese bağlanılamaz: bağlantı internette herkese açık bir siteye gitmeli (iç ağ ya da bu sunucu olmaz)';
export const PAGE =
  'Bu bağlantı dosyanın kendisini değil bir web sayfasını açıyor (Google Drive ya da Dropbox paylaşım sayfası, GoDaddy dosya yöneticisi, giriş sayfası gibi). ' +
  'Dosyayı doğrudan indiren bağlantıyı yapıştırın: tarayıcıda açınca dosya hemen inmeli ya da kendisi görünmeli, ör. https://alanadiniz.com/hediyeler/yuzuk.svga';

/** A pasted link, checked for its form (no network yet): a URL to download, or a 400 saying what is wrong. */
export function linkOf(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) throw bad('Bağlantıyı yapıştırın');
  if (s.length > 2000) throw bad('Bağlantı çok uzun');
  let u;
  try {
    u = new URL(s);
  } catch {
    throw bad('Bu bir bağlantı değil: https:// ile başlayan tam adresi yapıştırın');
  }
  checkUrl(u);
  return u.href;
}

/** The rules every address meets, the first one and each redirect's. */
function checkUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad('Yalnız http:// ya da https:// ile başlayan bağlantı olur');
  if (u.username || u.password) throw bad('Bağlantıda kullanıcı adı ya da parola olmamalı');
  if (allowed(u)) return;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host.split('%')[0])) {
    if (!isPublic(host)) throw bad(INNER);
  } else if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    // A name with no dot is one of this machine's or its containers' (localhost, postgres, finance…).
    throw bad(INNER);
  }
  if (u.port && !['80', '443'].includes(u.port)) throw bad('Bağlantı alışılmış web portundan olmalı (80 ya da 443)');
}

/** dns.lookup for a link's connection: only public addresses come back (all of them for "happy eyeballs"). */
function lookupFor(allow) {
  return (host, opts, cb) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, list) => {
      if (err) return cb(err);
      let ok = allow ? list : list.filter((a) => isPublic(a.address));
      if (opts?.family === 4 || opts?.family === 6) ok = ok.filter((a) => a.family === opts.family);
      if (!ok.length) return cb(Object.assign(new Error(`blocked address for ${host}`), { code: 'EBLOCKED' }));
      if (opts?.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
}

/** One GET, its answer's head (redirects not followed). */
function request(u, signal) {
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(
      u,
      {
        agent: false,
        lookup: lookupFor(allowed(u)),
        headers: { 'user-agent': 'SimilarClub-HediyeBaglantisi/1.0', accept: '*/*', 'accept-encoding': 'identity' },
        signal,
        timeout: 20_000,
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}

/** Whether the first bytes are a web page's. */
export function looksLikePage(head) {
  const s = head.toString('latin1').replace(/^\xEF\xBB\xBF/, '').trimStart().slice(0, 32).toLowerCase();
  return s.startsWith('<!doctype html') || s.startsWith('<html') || s.startsWith('<head') || s.startsWith('<body') || s.startsWith('<?xml');
}

/** Why a download failed, in words, from a network error. */
function failure(e, timedOut) {
  if (e instanceof HttpError) return e;
  const code = e?.code ?? e?.cause?.code ?? '';
  if (timedOut || code === 'ETIMEDOUT' || e?.name === 'AbortError' || e?.name === 'TimeoutError') return bad('Bağlantı zamanında cevap vermedi: dosyanın sunucusu yavaş ya da kapalı, biraz sonra tekrar deneyin');
  if (code === 'EBLOCKED') return bad(INNER);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return bad('Bu adres bulunamadı: alan adını kontrol edin');
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return bad('Dosyanın sunucusuna bağlanılamadı');
  if (/CERT|SSL|TLS/i.test(code)) return bad('Sitenin güvenlik sertifikası geçersiz: sertifikası geçerli bir https:// bağlantısı verin');
  return bad('Bağlantıdan dosya alınamadı');
}

/**
 * Downloads `link` into `file`: at most `max` bytes, the whole of it within `ms`. Resolves with { bytes, type (what
 * the host called it), url (where it ended after redirects), head (its first 64 bytes) }; a 400 in words otherwise.
 * `tooBig({ type, length, url })`: the sentence for a file over `max` (length null when the host didn't say it), e.g.
 * that the link is a video pasted where a picture goes; the size alone when it gives none.
 */
export async function download(link, file, { max, ms = 120_000, tooBig }) {
  const signal = AbortSignal.timeout(ms);
  let u = new URL(link);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      checkUrl(u);
      const res = await request(u, signal);
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        res.resume();
        const to = res.headers.location;
        if (!to) throw bad('Bağlantı bir yere yönlendiriyor ama adresi yok');
        u = new URL(to, u);
        continue;
      }
      if (status !== 200) {
        res.resume();
        const why = status === 404 ? ': dosya bulunamadı' : status === 401 || status === 403 ? ': dosyaya izin yok (herkese açık olmalı)' : '';
        throw bad(`Bağlantı açılamadı (sunucu ${status} dedi${why})`);
      }
      const type = String(res.headers['content-type'] ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (type === 'text/html' || type === 'application/xhtml+xml') {
        res.resume();
        throw bad(PAGE);
      }
      const over = (length) => bad(tooBig?.({ type, length, url: u }) ?? `Dosya en fazla ${mb(max)} MB olabilir${length ? ` (bu ${mb(length)} MB)` : ''}`);
      const length = Number(res.headers['content-length']);
      if (Number.isFinite(length) && length > max) {
        res.resume();
        throw over(length);
      }
      let bytes = 0;
      let head = Buffer.alloc(0);
      const guard = new Transform({
        transform(chunk, _enc, done) {
          bytes += chunk.length;
          if (bytes > max) return done(over(null));
          if (head.length < 64) {
            head = Buffer.concat([head, chunk.subarray(0, 64 - head.length)]);
            if (head.length >= 64 && looksLikePage(head)) return done(bad(PAGE));
          }
          done(null, chunk);
        },
      });
      await pipeline(res, guard, fs.createWriteStream(file), { signal });
      if (!bytes) throw bad('Bağlantıdaki dosya boş');
      if (looksLikePage(head)) throw bad(PAGE);
      return { bytes, type, url: u.href, head };
    }
    throw bad('Bağlantı çok fazla yönlendiriyor');
  } catch (e) {
    throw failure(e, signal.aborted);
  }
}
