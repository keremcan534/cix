// Sign-up rules for giris/profil and the step counter of the sign-up screens. Pure, so the node tests load it.
//
// Only the birth year is asked. The server keeps it as the year's last day (lib/live saveProfile sends
// YYYY-12-31), so the age is never overstated: someone who turns 18 this year counts as 18 only from 31 December
// (giris-11).
import { ageFrom } from '@/lib/profile-rules';

export const MIN_AGE = 18;
const MAX_AGE = 99;

/** The birth date kept for a year-only answer. */
export const birthDateOf = (year: number) => `${year}-12-31`;

/** The age a birth year gives today, counted from the year's last day. */
export const ageFromYear = (year: number, today = new Date()) => ageFrom(birthDateOf(year), today);

/** What is wrong with a 4-digit birth year, or null when it is fine (shorter input is not judged yet). */
export function birthYearError(year: string, today = new Date()): string | null {
  if (!/^\d{4}$/.test(year)) return null;
  const y = Number(year);
  if (y > today.getFullYear()) return 'Doğum yılı gelecekte olamaz.';
  const age = ageFromYear(y, today);
  if (age > MAX_AGE) return 'Geçerli bir doğum yılı yaz.';
  if (age < MIN_AGE) {
    return today.getFullYear() - y === MIN_AGE
      ? 'Bu yıl 18 yaşına giriyorsun. Yalnızca doğum yılı sorulduğu için hesabını 31 Aralık’tan itibaren açabilirsin.'
      : `Uygulamayı kullanmak için en az ${MIN_AGE} yaşında olmalısın.`;
  }
  return null;
}

/** Letters as a person sees them: an emoji counts once (a UTF-16 length counts it twice). */
export const nameLength = (name: string) => [...name.trim()].length;

export type SignupDraft = { name: string; gender: string | null; year: string };

/** The first thing missing or wrong on the profile form, in screen order; null when Devam can go on. */
export function firstSignupProblem(d: SignupDraft, today = new Date()): string | null {
  const n = nameLength(d.name);
  if (n === 0) return 'Adını yaz.';
  if (n < 2) return 'Adın en az 2 karakter olmalı.';
  if (!d.gender) return 'Cinsiyet seç.';
  if (!/^\d{4}$/.test(d.year)) return 'Doğum yılını 4 haneli yaz.';
  return birthYearError(d.year, today);
}

/** The text of the welcome alert at the end of sign-up. Test coins are mentioned only in a demo build. */
export function welcomeText(live: boolean, demo: boolean): string {
  if (!live) return 'Hoş geldin hediyesi olarak 100 jeton hesabına eklendi.';
  return demo ? 'Hesabın açıldı. Jeton Yükle ekranından ücretsiz test jetonu ekleyebilirsin.' : 'Hesabın açıldı.';
}

export type SignupScreen = 'telefon' | 'kod' | 'profil' | 'dogrulama';

/**
 * The sign-up screens a person actually goes through. A live build has no phone code and no selfie check
 * (giris-6, giris-10): the profile is the only step. The demo keeps the four-step prototype.
 */
export const signupScreens = (live: boolean): SignupScreen[] => (live ? ['profil'] : ['telefon', 'kod', 'profil', 'dogrulama']);

/** "step of total" for the header; total 1 means there is nothing to count (the header hides the counter). */
export function signupStep(screen: SignupScreen, live: boolean): { step: number; total: number } {
  const all = signupScreens(live);
  const i = all.indexOf(screen);
  return { step: i < 0 ? 1 : i + 1, total: all.length };
}
