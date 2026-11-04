// Bağlar kinds, prices and level steps: pure data, shared by the API (bonds.mjs) and the app's test that keeps
// app/src/data/bonds.ts equal to it.

/** Bond kinds: label, the bond gift's price in coins, and how many of the kind one person may have. */
export const KINDS = {
  cift: { label: 'Çift', gift: 'Bağ Yüzüğü', price: 5000, max: 1 },
  kardes: { label: 'Kardeş', gift: 'Kardeş Bilekliği', price: 1000, max: 3 },
  baci: { label: 'Bacı', gift: 'Bacı Kolyesi', price: 1000, max: 3 },
  agabey: { label: 'Ağabey', gift: 'Ağabey Saati', price: 1000, max: 3 },
  abla: { label: 'Abla', gift: 'Abla Broşu', price: 1000, max: 3 },
  yenge: { label: 'Yenge', gift: 'Yenge Çiçeği', price: 1000, max: 3 },
  enishte: { label: 'Enişte', gift: 'Enişte Kravatı', price: 1000, max: 3 },
  kanka: { label: 'Kanka', gift: 'Kanka Rozeti', price: 500, max: 5 },
};
/** Points needed for Lv.1 … Lv.10. */
export const LEVELS = [0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000];
/** What each level opens (the app draws them). */
export const REWARDS = [
  { level: 2, key: 'rozet', label: 'Profilde bağ rozeti' },
  { level: 4, key: 'mikrofon', label: 'Mikrofonda yan yana oturunca bağ çizgisi' },
  { level: 6, key: 'cerceve', label: 'Profil çerçevesi' },
  { level: 8, key: 'giris', label: 'Odaya birlikte giriş efekti' },
  { level: 10, key: 'balon', label: 'Özel sohbet balonu' },
];
export const levelOf = (score) => LEVELS.reduce((lv, need, i) => (score >= need ? i + 1 : lv), 1);
