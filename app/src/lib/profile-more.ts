// Live mode: the parts of a profile the server keeps beyond the basics (server/api/profiles.mjs), in the profile
// screen's terms: the personal extras (and their edit form's rules), the album, the Vitrin's gifts, rides, entry
// effects, medals and titles. The server checks every value again and decides what is earned; this only reads its
// answers and catches mistakes before a save. Pure, for node --test (tests/profile-more.test.ts).
import { COSMETICS } from '@/data/catalog';
import { GIFTS, type Gift } from '@/data/mock';
import { MEDALS, NO_EXTRAS, PERSONALITY_TAGS, TITLES, type Medal, type ProfileExtras, type Title } from '@/data/profile';
import type { ServerExtras, Showcase } from '@/lib/api';
import { CONTACT_MESSAGE, checkText, contactRefusal } from '@/lib/contact-filter';

/** The same limits as the server (server/api/profile-rules.mjs EXTRA_LIMITS). */
export const EXTRA_LIMITS = { heightMin: 120, heightMax: 230, weightMin: 30, weightMax: 250, job: 30, slogan: 80, languages: 5, tags: 5 } as const;
/** The languages the form offers (server/api/profile-rules.mjs LANGUAGES). */
export const LANGUAGE_OPTIONS = ['Türkçe', 'English', 'Deutsch', 'العربية', 'Français', 'Español', 'Русский', 'Azərbaycanca', 'Nederlands', 'Kurdî'] as const;

/** The server's extras as the profile screen shows them; nothing given is empty, never a sample value. */
export function extrasFromServer(x: ServerExtras | null | undefined): ProfileExtras {
  if (!x) return NO_EXTRAS;
  return {
    height: x.height ?? 0,
    weight: x.weight ?? 0,
    job: x.job ?? '',
    languages: x.languages ?? [],
    zodiac: x.zodiac ?? '',
    slogan: x.slogan || null,
    // A tag this app doesn't know (a newer server's) stays out rather than showing without its emoji.
    tags: (x.tags ?? []).flatMap((label) => PERSONALITY_TAGS.filter((t) => t.label === label)),
    relationship: x.relationship ?? '',
    education: x.education ?? '',
    birthday: '',
  };
}

/** The extras part of the edit form: numbers as typed, choices as their labels. */
export type ExtrasDraft = {
  height: string;
  weight: string;
  job: string;
  languages: string[];
  zodiac: string;
  tags: string[];
  relationship: string;
  education: string;
  slogan: string;
};
export type ExtrasErrors = Partial<Record<keyof ExtrasDraft, string>>;

export const draftFromExtras = (x: ProfileExtras): ExtrasDraft => ({
  height: x.height > 0 ? String(x.height) : '',
  weight: x.weight > 0 ? String(x.weight) : '',
  job: x.job,
  languages: [...x.languages],
  zodiac: x.zodiac,
  tags: x.tags.map((t) => t.label),
  relationship: x.relationship,
  education: x.education,
  slogan: x.slogan ?? '',
});

/** A typed whole number, null when empty; NaN when it isn't one. */
const whole = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  return /^\d{1,3}$/.test(t) ? Number(t) : NaN;
};

/** The same checks the server makes (ranges, lengths, the contact filter on free text); {} when all is well. */
export function validateExtras(d: ExtrasDraft): ExtrasErrors {
  const e: ExtrasErrors = {};
  const L = EXTRA_LIMITS;
  const h = whole(d.height);
  if (h !== null && !(h >= L.heightMin && h <= L.heightMax)) e.height = `Boy ${L.heightMin}–${L.heightMax} cm arasında olmalı.`;
  const w = whole(d.weight);
  if (w !== null && !(w >= L.weightMin && w <= L.weightMax)) e.weight = `Kilo ${L.weightMin}–${L.weightMax} kg arasında olmalı.`;
  if (d.job.trim().length > L.job) e.job = `En fazla ${L.job} karakter.`;
  else if (!checkText(d.job.trim()).ok) e.job = CONTACT_MESSAGE;
  if (d.slogan.trim().length > L.slogan) e.slogan = `En fazla ${L.slogan} karakter.`;
  else if (!checkText(d.slogan.trim()).ok) e.slogan = CONTACT_MESSAGE;
  return e;
}

/** A save turned down for contact details is counted once, at its first such field (as the server counts one). */
export function noteExtrasRefusal(d: ExtrasDraft, e: ExtrasErrors) {
  const field = (['job', 'slogan'] as const).find((k) => e[k] === CONTACT_MESSAGE);
  if (field) contactRefusal(d[field].trim(), `profile.${field}`);
}

/** The PATCH /api/me/extras body: every field, so a cleared one is cleared on the server too. */
export function extrasPatch(d: ExtrasDraft, country: string | null, genderHidden: boolean) {
  return {
    height: whole(d.height),
    weight: whole(d.weight),
    job: d.job.trim() || null,
    languages: [...new Set(d.languages)].slice(0, EXTRA_LIMITS.languages),
    zodiac: d.zodiac || null,
    tags: [...new Set(d.tags)].slice(0, EXTRA_LIMITS.tags),
    relationship: d.relationship || null,
    education: d.education || null,
    slogan: d.slogan.trim() || null,
    country: country || null,
    genderHidden,
  };
}

/** One of `list` picked or unpicked; a full list takes no more. */
export const toggleIn = (list: readonly string[], v: string, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? [...list] : [...list, v]);

// --- Vitrin --------------------------------------------------------------------------------------------------------
/** How the server gives medals and titles (server/api/profile-rules.mjs MEDAL_RULES, TITLE_RULES), for the Vitrin's notes. */
export const HONOUR_RULES = { weekTop: 3, generousPeople: 10, friends: 20, roomLevel: 10, risingCharm: 5, risingDays: 30 } as const;
const R = HONOUR_RULES;
export const MEDAL_HOWTO = `Haftanın Yıldızı: haftanın Yankı sıralamasında ilk ${R.weekTop}. Cömert Kalp: ${R.generousPeople} farklı kişiye hediye. Sosyal Kelebek: ${R.friends} arkadaş (karşılıklı takip).`;
export const TITLE_HOWTO = `Oda Efsanesi: odan Lv.${R.roomLevel} olunca. Yükselen Yıldız: katıldıktan sonraki ${R.risingDays} gün içinde Yankı Lv.${R.risingCharm}.`;

export type Pedestal = { id: string; emoji: string; name: string };
export type ShowcaseView = { medals: Medal[]; titles: Title[]; rides: Pedestal[]; entries: Pedestal[]; giftWall: (Gift & { count: number })[] };

// Items taken out of the shop (data/catalog `retired`) aren't shown on the Vitrin either.
const shopItems = (skus: readonly string[]) => skus.flatMap((sku) => COSMETICS.filter((c) => c.id === sku && !c.retired).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })));

/** The server's Vitrin answer with the app's names and looks; an id this app doesn't know is left out. */
export function showcaseView(s: Showcase): ShowcaseView {
  const got = new Map(s.gifts.map((g) => [g.id, g.count]));
  return {
    medals: MEDALS.filter((m) => s.medals.includes(m.id)),
    titles: TITLES.filter((t) => s.titles.includes(t.id)),
    rides: shopItems(s.rides),
    entries: shopItems(s.entries),
    giftWall: GIFTS.map((g) => ({ ...g, count: got.get(g.id) ?? 0 })),
  };
}
