// Koruma on the phone (server/api/guards.mjs, docs/KORUMA.md): the answers read without trusting them, the points as
// people read them, and the rules the Koruma page explains. Pure (no React, no storage), so the tests run it.

/** The gift that starts a Koruma (server catalog.mjs, data/mock GIFTS). */
export const GUARD_CARD = 'koruma';

/** One person of a Koruma: the guardian or the guarded, their points and how many days it has lasted. */
export type GuardPerson = { id: string; name: string; avatarUrl: string | null; points: number; days: number };
/** A profile's Koruma area: its top guardian (over the threshold), whom they guard most, and my own Koruma of them. */
export type GuardArea = { guardian: GuardPerson | null; ward: GuardPerson | null; mine: { points: number; days: number } | null; off: boolean };
export type GuardSettings = { off: boolean; threshold: number; thresholdMax: number; thresholdNextAt: string | null };
export type GuardMine = { guardians: GuardPerson[]; wards: GuardPerson[]; settings: GuardSettings };

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const whole = (v: unknown, max = 1e15) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : null);
const ID = /^[0-9a-f-]{36}$/i;
const URL_OK = /^https?:\/\/[^\s"'<>\\]{1,600}$/;

/** A person the server sent; null when its id, name or numbers are malformed. */
export function parseGuardPerson(raw: unknown): GuardPerson | null {
  const r = obj(raw);
  const points = whole(r.points);
  const days = whole(r.days, 100_000);
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : null;
  if (typeof r.id !== 'string' || !ID.test(r.id) || !name || points === null || days === null) return null;
  return { id: r.id, name, avatarUrl: typeof r.avatarUrl === 'string' && URL_OK.test(r.avatarUrl) ? r.avatarUrl : null, points, days };
}

/** GET /api/guard?user=: what a profile shows; anything malformed is left out. */
export function parseGuardArea(raw: unknown): GuardArea {
  const r = obj(raw);
  const m = obj(r.mine);
  const points = whole(m.points);
  const days = whole(m.days, 100_000);
  return {
    guardian: parseGuardPerson(r.guardian),
    ward: parseGuardPerson(r.ward),
    mine: points !== null && days !== null ? { points, days } : null,
    off: r.off === true,
  };
}

/** GET /api/guard/me: Benim Koruma's two lists (a malformed row is skipped) and my settings. */
export function parseGuardMine(raw: unknown): GuardMine {
  const r = obj(raw);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 50).map(parseGuardPerson).filter((x): x is GuardPerson => !!x) : []);
  return { guardians: list(r.guardians), wards: list(r.wards), settings: parseGuardSettings(r.settings) };
}

export function parseGuardSettings(raw: unknown): GuardSettings {
  const s = obj(raw);
  return {
    off: s.off === true,
    threshold: whole(s.threshold) ?? 0,
    thresholdMax: whole(s.thresholdMax) ?? 0,
    thresholdNextAt: typeof s.thresholdNextAt === 'string' && !Number.isNaN(Date.parse(s.thresholdNextAt)) ? s.thresholdNextAt : null,
  };
}

/** Points as people read them: 950, 12,4 B, 296,49 B, 1,25 Mn. */
export function guardPoints(n: number): string {
  const short = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  if (n >= 1_000_000) return `${short(n / 1_000_000)} Mn`;
  if (n >= 10_000) return `${short(n / 1000)} B`;
  return n.toLocaleString('tr-TR');
}

/** The rules the Koruma page explains (server/api/guards.mjs GUARD_RULES says the same numbers). */
export const GUARD_RULES_TEXT: { title: string; lines: string[] }[] = [
  { title: 'Koruma nedir?', lines: ['Koruma, birinin yanında olduğunu göstermenin yoludur. Birine Koruma Kartı gönderince onun koruyucusu olursun.'] },
  { title: 'Nasıl koruyucu olunur?', lines: ['Kişiye Koruma Kartı hediye et. Hediye gidince onun koruyucusu olursun; kartın jetonu ilk puanın olur.'] },
  {
    title: 'Koruma puanı nasıl artar?',
    lines: ['Koruduğun kişiye gönderdiğin her hediye puan getirir: 1 jeton = 1 koruma puanı. Odada, mesajda, profilde ya da ailede, nereden gönderirsen.', 'En çok puanı olan koruyucu, kişinin profilindeki Koruma alanında görünür.'],
  },
  {
    title: 'Koruma nasıl sürer?',
    lines: [
      'Her gece 00:00’da (Türkiye saati) bir önceki gün hiç hediye göndermediysen puan düşer:',
      '5.000 puan ve üstünde puanın %10’u düşer; 5.000’in altında 1.000 puan düşer.',
      'Kartı gönderdiğin günün gecesi puan düşmez.',
    ],
  },
  { title: 'Koruma nasıl biter?', lines: ['Korunan kişi korumayı bitiremez; yalnız koruyucu bitirir. Benim Koruma › Koruduklarım’da kişiye uzun bas.', 'Koruma bitince puan sıfırlanır.'] },
  { title: 'Korumayı kapatmak', lines: ['Kimsenin seni korumasını istemiyorsan Benim Koruma’daki ayarlardan ya da Ayarlar › Gizlilik’ten korumayı kapat. Başkalarının korumalarını yine görürsün.'] },
  { title: 'Koruma alanına nasıl çıkılır?', lines: ['En çok puanı olan koruyucu profilde görünür. Kişi bir eşik koyduysa o puana da ulaşmak gerekir.'] },
  { title: 'Eşik nasıl ayarlanır?', lines: ['Benim Koruma › ayarlar’dan eşiği koyarsın. Yankı seviyen yükseldikçe koyabileceğin en yüksek eşik artar. Eşik haftada bir değişir.'] },
];
