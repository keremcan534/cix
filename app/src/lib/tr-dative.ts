// The dative ("-e hali") after a person's name, for lines that say who got something: "Kaan → Artemis’e 🚀 Roket
// gönderdi" (Global hediye, lib/global-gift-core). A proper name takes an apostrophe; the suffix follows the last vowel
// of its last word (a ı o u: -a; e i ö ü: -e) with a buffer y after a vowel: Artemis’e, Ayşe’ye, Ali’ye, Bora’ya,
// Umut’a. A name whose ending can't be read as Turkish (digits, emoji, symbols, q w x, English endings, no vowel) gets
// no guessed suffix: "Artemis kişisine", as the app's other gift lines say it. Pure, for the unit tests.

const BACK = 'aıouâû';
const FRONT = 'eiöüî';
const VOWELS = BACK + FRONT;
const LETTERS = /^[a-zçğıöşüâîû]+$/;
/** Arabic-origin names whose last "a" is said front (a palatal l): Kemal’e, Hilal’e, not Kemal’a. */
const FRONT_L = new Set(['kemal', 'celal', 'cemal', 'hilal', 'bilal', 'nihal', 'meral', 'iclal', 'ikbal', 'kemâl', 'celâl', 'cemâl', 'hilâl']);
/** Turkish lower case without relying on the engine's locale data: I → ı, İ → i. */
const lower = (s: string) => s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();

/** "Artemis’e", "Ayşe’ye", "KAAN’A"; null when the name's ending can't be told (then say "… kişisine"). */
export function dativeOf(name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  const word = n.split(' ').pop() ?? '';
  const w = lower(word);
  if (w.length < 2 || !LETTERS.test(w) || /[qwx]/.test(w)) return null;
  // Spelled the English way: said differently from how it is written (Jack, Hugh, Beth, Josh, Mitch, Ralph, Jenny).
  if (/(ck|gh|th|sh|ch|ph)$/.test(w) || /[^aeıioöuüâîû]y$/.test(w)) return null;
  let last = '';
  for (let i = w.length - 1; i >= 0 && !last; i--) if (VOWELS.includes(w[i])) last = w[i];
  if (!last) return null;
  const front = FRONT.includes(last) || FRONT_L.has(w) || /âl$/.test(w);
  let suffix = `${VOWELS.includes(w[w.length - 1]) ? 'y' : ''}${front ? 'e' : 'a'}`;
  // A name written in capitals gets its suffix in capitals too.
  if (/[A-ZÇĞİÖŞÜ]/.test(word) && word === word.replace(/[a-zçğıöşüâîû]/g, '')) suffix = suffix.toUpperCase();
  return `${n}’${suffix}`;
}

/** Who got it, for a sentence: "Artemis’e", or "Artemis kişisine" when the name's ending can't be told. */
export const toPerson = (name: string) => dativeOf(name) ?? `${name.trim().replace(/\s+/g, ' ')} kişisine`;
