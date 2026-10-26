// Profile field rules. They mirror what the server must enforce on every profile update;
// the app runs them first only to show errors before sending.
import { USERS } from '@/data/mock';
import { scanMessage } from '@/lib/safety';

export const LIMITS = { name: 20, bio: 150, city: 30, interests: 5, photos: 6 } as const;
const RESERVED = ['admin', 'yonetici', 'moderator', 'destek', 'similarclub', 'similar', 'sistem', 'support', 'official', 'resmi'];
// Small demo list; production uses the moderation service's dictionary and image checks.
const BANNED = ['amk', 'aq', 'siktir', 'orospu', 'piç', 'yavşak', 'gerizekalı', 'şerefsiz', 'pezevenk'];

const words = (t: string) => t.toLocaleLowerCase('tr-TR').split(/[^a-zçğıöşü0-9]+/i);
export const hasProfanity = (t: string) => words(t).some((w) => BANNED.includes(w));

export function ageFrom(birthDate: string, today = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** "14.03.2002" → "2002-03-14"; null when it isn't a real date. */
export function parseTrDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const formatTrDate = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

export type ProfileDraft = { name: string; username: string; bio: string; city: string; birth: string };
export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

export function validateProfile(d: ProfileDraft, selfId = 'me'): ProfileErrors {
  const e: ProfileErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'Görünen ad boş olamaz.';
  else if (name.length > LIMITS.name) e.name = `En fazla ${LIMITS.name} karakter.`;
  else if (hasProfanity(name)) e.name = 'Bu ad topluluk kurallarına uymuyor.';

  const u = d.username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._]{2,19}$/.test(u)) e.username = '3–20 karakter; harfle başlamalı, yalnızca a-z, 0-9, nokta ve alt çizgi.';
  else if (/[._]{2}|[._]$/.test(u)) e.username = 'Nokta/alt çizgi art arda veya sonda olamaz.';
  else if (RESERVED.some((r) => u.includes(r))) e.username = 'Bu kullanıcı adı ayrılmış; başka bir tane seç.';
  else if (USERS.some((x) => x.id !== selfId && x.username === u)) e.username = 'Bu kullanıcı adı alınmış.';
  else if (hasProfanity(u)) e.username = 'Bu kullanıcı adı topluluk kurallarına uymuyor.';

  const bio = d.bio.trim();
  if (bio.length > LIMITS.bio) e.bio = `En fazla ${LIMITS.bio} karakter.`;
  else if (hasProfanity(bio)) e.bio = 'Biyografide uygunsuz ifade var.';
  else if (scanMessage(bio).some((r) => r !== 'link' || /https?:|www\./i.test(bio)))
    e.bio = 'Biyografide telefon, IBAN, bağlantı veya başka uygulama hesabı paylaşılamaz.';

  if (d.city.trim().length > LIMITS.city) e.city = `En fazla ${LIMITS.city} karakter.`;

  const iso = parseTrDate(d.birth);
  if (!iso) e.birth = 'Tarihi GG.AA.YYYY biçiminde yaz (ör. 14.03.2002).';
  else {
    const age = ageFrom(iso);
    if (age < 18) e.birth = 'Similar Club 18 yaş ve üzeri içindir.';
    else if (age > 100) e.birth = 'Geçerli bir doğum tarihi gir.';
  }
  return e;
}
