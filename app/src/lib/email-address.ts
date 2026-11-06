// E-mail addresses on the sign-in and Ayarlar screens: the same checks as the server (server/api/mail.mjs
// normalizeEmail), a Turkish reason when an address can't be right, and a gentle "did you mean" for the big
// providers' common typos (gmial.com → gmail.com). Pure logic, no React.

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}$/;
// The server turns a Unicode domain into its ASCII form; here any letter or digit may stand in a label.
const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;

/** Trimmed, NFC and lower case, as the server keeps it; null when it can't be an address. */
export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().normalize('NFC').toLowerCase();
  if (s.length > 254) return null;
  const at = s.split('@');
  if (at.length !== 2) return null;
  const [local, domain] = at;
  if (!LOCAL_PART.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!domain || domain.length > 253 || !domain.includes('.')) return null;
  const labels = domain.split('.');
  if (!labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels[labels.length - 1])) return null;
  return s;
}

/** Why an address can't be right, in Turkish; null when it looks fine. */
export function emailError(raw: string): string | null {
  const s = raw.trim();
  if (!s) return 'E-posta adresini yaz.';
  if (normalizeEmail(s)) return null;
  if (/\s/.test(s)) return 'Adreste boşluk olmamalı.';
  const at = s.split('@');
  if (at.length < 2) return 'Adreste @ işareti eksik.';
  if (at.length > 2) return 'Adreste yalnızca bir @ olmalı.';
  const [local, domain] = at;
  if (!local) return '@ işaretinden önce adının olduğu kısım eksik.';
  if (/[çğıİöşüâîû]/i.test(local)) return '@ işaretinden önce Türkçe karakter olamaz (ç, ğ, ı, ö, ş, ü).';
  if (!domain || !domain.includes('.')) return '@ işaretinden sonraki kısım eksik, örneğin gmail.com.';
  return 'Bu adres geçerli görünmüyor. Kontrol edip tekrar yaz.';
}

// Addresses at these never get a hint, even when they are one letter away from a bigger provider.
const KNOWN = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.tr', 'hotmail.co.uk', 'outlook.com', 'outlook.com.tr', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'yandex.com', 'yandex.com.tr', 'yandex.ru', 'icloud.com', 'me.com', 'mac.com', 'mynet.com',
  'proton.me', 'protonmail.com', 'mail.com', 'email.com', 'gmx.com', 'gmx.de', 'aol.com', 'mail.ru', 'windowslive.com',
]);
// The providers most people here use: a near miss of one of these is most likely a typo.
const POPULAR = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'yandex.com'];
const FIXES: Record<string, string> = { 'gmail.com.tr': 'gmail.com', 'icloud.com.tr': 'icloud.com', 'yahoo.com.tr': 'yahoo.com' };
// Not real endings, and only ever a slip for .com (.co, .cm and .om are real countries, so they stay).
const NOT_COM = new Set(['con', 'cmo', 'ocm', 'vom', 'xom', 'cpm', 'comm', 'coom', 'cim', 'clm']);

/** Optimal string alignment distance: insertions, deletions, substitutions and swapping two neighbours. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function fixDomain(domain: string): string | null {
  if (KNOWN.has(domain)) return null;
  if (FIXES[domain]) return FIXES[domain];
  const flat = domain.replace(/\./g, '');
  const joined = POPULAR.find((p) => p.replace(/\./g, '') === flat); // gmailcom, gma.ilcom
  if (joined) return joined;
  // "gmail" alone is read as gmail.com, unless that is a known address of its own (mail → mail.com).
  const probe = domain.includes('.') ? domain : `${domain}.com`;
  if (probe !== domain && KNOWN.has(probe)) return probe;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const p of POPULAR) {
    const d = distance(probe, p);
    if (d <= (p.length <= 9 ? 1 : 2) && d < bestDistance) [best, bestDistance] = [p, d];
  }
  if (best) return best === domain ? null : best;
  const dot = domain.lastIndexOf('.');
  if (dot > 0 && NOT_COM.has(domain.slice(dot + 1))) return `${domain.slice(0, dot)}.com`;
  return null;
}

/** The address with its likely meant domain ("ali@gmial.com" → "ali@gmail.com"), or null when nothing looks off. */
export function emailTypoHint(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const at = s.split('@');
  if (at.length !== 2 || !at[0] || !at[1] || /\s/.test(s)) return null;
  const fixed = fixDomain(at[1]);
  return fixed ? `${at[0]}@${fixed}` : null;
}
