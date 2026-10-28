// YouTube links: the only external video source of the rooms (Video and Sinema Salonu). Pure functions, no
// network: a link is accepted only on an exact YouTube host and a known path, and only an 11-character video id
// leaves this file. The id is all the player ever receives, so a pasted link can't inject anything else.
//
// Hand-written parser on purpose: React Native's URL implementation doesn't support hostname/searchParams on
// every platform, and the rules here must be the same on web, Android and iOS (and in the tests).

export type YouTubeParse = { ok: true; videoId: string; startSeconds?: number } | { ok: false; reason: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Exact hosts (lower-case). Look-alikes (youtube.com.evil.net, evil-youtube.com, youtu.be.example) fail this. */
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const SHORT_HOSTS = new Set(['youtu.be']);
const EMBED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const MAX_LEN = 2048;

export const YT_REASONS = {
  empty: 'Bir YouTube bağlantısı yapıştır.',
  long: 'Bağlantı çok uzun.',
  scheme: 'Yalnızca https:// (veya http://) ile başlayan YouTube bağlantıları kabul edilir.',
  host: 'Yalnızca YouTube bağlantıları açılabilir (youtube.com, youtu.be).',
  form: 'Bu YouTube bağlantısında video bulunamadı. Video sayfasının bağlantısını kullan (ör. youtube.com/watch?v=…).',
  id: 'Video kimliği geçersiz.',
} as const;
const fail = (reason: string): YouTubeParse => ({ ok: false, reason });

/** "t" / "start" values: 90, 90s, 1m30s, 1h2m3s. */
function parseStart(v: string | undefined): number | undefined {
  if (!v) return undefined;
  if (/^\d{1,6}s?$/.test(v)) return Number.parseInt(v, 10);
  const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(v);
  if (!m || !(m[1] || m[2] || m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
function query(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    if (!k || k in out) continue;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent((eq < 0 ? '' : part.slice(eq + 1)).replace(/\+/g, ' '));
    } catch {
      // Malformed escape: ignore that pair.
    }
  }
  return out;
}

/**
 * Accepted forms: youtube.com/watch?v=ID, m.youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
 * youtube-nocookie.com/embed/ID, youtube.com/shorts/ID, youtube.com/live/ID (scheme optional). Everything else —
 * other hosts, look-alike hosts, user@host, ports, javascript:/data:/file: — is rejected.
 */
export function parseYouTubeUrl(input: string): YouTubeParse {
  const raw = (input ?? '').trim();
  if (!raw) return fail(YT_REASONS.empty);
  if (raw.length > MAX_LEN) return fail(YT_REASONS.long);
  // Whitespace, control characters and backslashes never appear in a real YouTube link (and can confuse hosts).
  if (/[\s\\]/.test(raw) || [...raw].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return fail(YT_REASONS.form);
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  let rest: string;
  if (scheme) {
    const s = scheme[1].toLowerCase();
    if (s !== 'https' && s !== 'http') return fail(YT_REASONS.scheme);
    if (!raw.slice(scheme[0].length).startsWith('//')) return fail(YT_REASONS.scheme);
    rest = raw.slice(scheme[0].length + 2);
  } else {
    // "youtube.com/watch?v=…" without a scheme. "//host" alone is not allowed.
    if (raw.startsWith('/')) return fail(YT_REASONS.host);
    rest = raw;
  }
  const m = /^([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/.exec(rest);
  if (!m) return fail(YT_REASONS.form);
  const authority = m[1];
  // user@host and host:port are never needed for YouTube links and are a common way to disguise the real host.
  if (!authority || authority.includes('@') || authority.includes(':')) return fail(YT_REASONS.host);
  const host = authority.toLowerCase();
  const path = m[2].replace(/\/+$/, '');
  const q = query(m[3] ?? '');
  const segs = path.split('/').filter(Boolean);
  const start = parseStart(q.t ?? q.start);

  let id: string | undefined;
  if (SHORT_HOSTS.has(host)) {
    if (segs.length !== 1) return fail(YT_REASONS.form);
    id = segs[0];
  } else if (WATCH_HOSTS.has(host) || EMBED_HOSTS.has(host)) {
    if (segs.length === 1 && segs[0] === 'watch' && WATCH_HOSTS.has(host)) id = q.v;
    else if (segs.length === 2 && segs[0] === 'embed' && EMBED_HOSTS.has(host)) id = segs[1];
    else if (segs.length === 2 && (segs[0] === 'shorts' || segs[0] === 'live') && WATCH_HOSTS.has(host)) id = segs[1];
    else return fail(YT_REASONS.form);
  } else {
    return fail(YT_REASONS.host);
  }
  if (!id) return fail(YT_REASONS.form);
  if (!VIDEO_ID.test(id)) return fail(YT_REASONS.id);
  return start ? { ok: true, videoId: id, startSeconds: start } : { ok: true, videoId: id };
}

export const isVideoId = (id: string) => VIDEO_ID.test(id);
/** Canonical watch link (for "YouTube'da aç"); built only from a validated id. */
export const watchUrl = (videoId: string) => (isVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null);
export const thumbnailUrl = (videoId: string) => (isVideoId(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
/**
 * Origin the native player page is loaded from. YouTube's embedded player needs a referrer (error 152/153
 * without it); this must be the app's own https domain once it has one.
 */
export const EMBED_ORIGIN = 'https://similarclub.app';
/** Hosts the native player's web view may navigate to; any other link opens outside the app. */
export const isYouTubeHost = (url: string) => /^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com)(\/|$)/i.test(url);

/** IFrame Player API error codes → what the room shows. Video-level codes come from the video, not the viewer. */
export const YT_ERRORS: Record<number, { text: string; videoLevel: boolean }> = {
  2: { text: 'Video kimliği YouTube tarafından kabul edilmedi.', videoLevel: true },
  5: { text: 'Bu cihazda video oynatılamadı (HTML5 oynatıcı hatası).', videoLevel: false },
  100: { text: 'Video bulunamadı: silinmiş veya özel olabilir.', videoLevel: true },
  101: { text: 'Video sahibi videonun başka sitelerde oynatılmasına izin vermiyor.', videoLevel: true },
  150: { text: 'Video sahibi videonun başka sitelerde oynatılmasına izin vermiyor.', videoLevel: true },
  152: { text: 'YouTube oynatıcısı yapılandırma hatası verdi (yönlendiren bilgisi).', videoLevel: false },
  153: { text: 'YouTube oynatıcısı yapılandırma hatası verdi (yönlendiren bilgisi).', videoLevel: false },
};
export const ytErrorText = (code: number) => YT_ERRORS[code]?.text ?? `Video oynatılamadı (YouTube hata kodu ${code}).`;
