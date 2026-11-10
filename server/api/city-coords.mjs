// Where the app's cities are, for how far apart two people are (Keşfet, Anlar and the profile: GET /api/discover,
// GET /api/moments, GET /api/user). Only the two profile cities are used, never a phone's location, and only a
// rounded distance leaves the server, never these coordinates. Plain values with no imports, so the app's test
// (app/tests/city-distance.test.ts) can read them.
//
// The cities: Türkiye's 81 provinces (at the province centre) and the main cities of the other countries the app
// offers (profile-rules.mjs COUNTRIES: AZ, DE, NL, CY). The city on a profile is free text, so a name is read the
// way people write it: any case, with or without Turkish letters, the local or the English name, or with a
// district or a country beside it ("Kadıköy, İstanbul", "Köln / Almanya").

/** [name, latitude, longitude, other names…] by country. A name that is also a town elsewhere is left out. */
const TABLE = {
  TR: [
    ['Adana', 37.0, 35.3213],
    ['Adıyaman', 37.7648, 38.2786],
    ['Afyonkarahisar', 38.7507, 30.5567, 'Afyon'],
    ['Ağrı', 39.7191, 43.0503],
    ['Amasya', 40.6499, 35.8353],
    ['Ankara', 39.9334, 32.8597],
    ['Antalya', 36.8969, 30.7133],
    ['Artvin', 41.1828, 41.8183],
    ['Aydın', 37.856, 27.8416],
    ['Balıkesir', 39.6484, 27.8826],
    ['Bilecik', 40.1506, 29.9792],
    ['Bingöl', 38.8854, 40.498],
    ['Bitlis', 38.4006, 42.1095],
    ['Bolu', 40.736, 31.607],
    ['Burdur', 37.72, 30.29],
    ['Bursa', 40.1885, 29.061],
    ['Çanakkale', 40.1553, 26.4142],
    ['Çankırı', 40.6013, 33.6134],
    ['Çorum', 40.5506, 34.9556],
    ['Denizli', 37.7765, 29.0864],
    ['Diyarbakır', 37.9144, 40.2306],
    ['Edirne', 41.6818, 26.5623],
    ['Elazığ', 38.681, 39.2264],
    ['Erzincan', 39.75, 39.49],
    ['Erzurum', 39.9043, 41.2679],
    ['Eskişehir', 39.7767, 30.5206],
    ['Gaziantep', 37.0662, 37.3833, 'Antep'],
    ['Giresun', 40.9128, 38.3895],
    ['Gümüşhane', 40.4603, 39.4814],
    ['Hakkari', 37.5744, 43.7408],
    ['Hatay', 36.2021, 36.16, 'Antakya'],
    ['Isparta', 37.7648, 30.5566],
    ['Mersin', 36.8121, 34.6415, 'İçel'],
    ['İstanbul', 41.0082, 28.9784],
    ['İzmir', 38.4237, 27.1428],
    ['Kars', 40.6013, 43.095],
    ['Kastamonu', 41.3887, 33.7827],
    ['Kayseri', 38.7312, 35.4787],
    ['Kırklareli', 41.7351, 27.2252],
    ['Kırşehir', 39.1458, 34.1606],
    ['Kocaeli', 40.7654, 29.9408, 'İzmit'],
    ['Konya', 37.8746, 32.4932],
    ['Kütahya', 39.4192, 29.9857],
    ['Malatya', 38.3554, 38.3335],
    ['Manisa', 38.6191, 27.4289],
    ['Kahramanmaraş', 37.5753, 36.9228, 'Maraş', 'K. Maraş'],
    ['Mardin', 37.3122, 40.7351],
    ['Muğla', 37.2153, 28.3636],
    ['Muş', 38.7432, 41.5065],
    ['Nevşehir', 38.6247, 34.7142],
    ['Niğde', 37.9698, 34.6766],
    ['Ordu', 40.9839, 37.8764],
    ['Rize', 41.0201, 40.5234],
    ['Sakarya', 40.7806, 30.4033, 'Adapazarı'],
    ['Samsun', 41.2867, 36.33],
    ['Siirt', 37.9333, 41.95],
    ['Sinop', 42.0264, 35.1551],
    ['Sivas', 39.7505, 37.015],
    ['Tekirdağ', 40.978, 27.511],
    ['Tokat', 40.3139, 36.5544],
    ['Trabzon', 41.0027, 39.7168],
    ['Tunceli', 39.108, 39.547, 'Dersim'],
    ['Şanlıurfa', 37.1674, 38.7955, 'Urfa', 'Ş. Urfa'],
    ['Uşak', 38.6742, 29.4058],
    ['Van', 38.4942, 43.38],
    ['Yozgat', 39.82, 34.8044],
    ['Zonguldak', 41.4564, 31.7987],
    ['Aksaray', 38.3687, 34.037],
    ['Bayburt', 40.2552, 40.2249],
    ['Karaman', 37.1811, 33.215],
    ['Kırıkkale', 39.8468, 33.5153],
    ['Batman', 37.8812, 41.1351],
    ['Şırnak', 37.5164, 42.4611],
    ['Bartın', 41.6344, 32.3375],
    ['Ardahan', 41.1105, 42.7022],
    ['Iğdır', 39.9208, 44.045],
    ['Yalova', 40.655, 29.2769],
    ['Karabük', 41.2061, 32.6204],
    ['Kilis', 36.7184, 37.1212],
    ['Osmaniye', 37.0742, 36.2478],
    ['Düzce', 40.8438, 31.1565],
  ],
  AZ: [
    ['Bakü', 40.4093, 49.8671, 'Bakı', 'Baku'],
    ['Gence', 40.6828, 46.3606, 'Ganja', 'Genje'],
    ['Sumgayıt', 40.5897, 49.6686, 'Sumqayıt', 'Sumgait'],
    ['Mingeçevir', 40.7703, 47.0496, 'Mingachevir'],
    ['Nahçıvan', 39.2089, 45.4122, 'Naxçıvan', 'Nakhchivan'],
    ['Lenkeran', 38.7543, 48.8506, 'Lankaran'],
    ['Şeki', 41.1919, 47.1706, 'Shaki', 'Sheki'],
    ['Yevlah', 40.6172, 47.15, 'Yevlax', 'Yevlakh'],
  ],
  DE: [
    ['Berlin', 52.52, 13.405],
    ['Hamburg', 53.5511, 9.9937],
    ['Münih', 48.1351, 11.582, 'München', 'Muenchen', 'Munich'],
    ['Köln', 50.9375, 6.9603, 'Koeln', 'Cologne', 'Kolonya'],
    ['Frankfurt', 50.1109, 8.6821, 'Frankfurt am Main'],
    ['Stuttgart', 48.7758, 9.1829],
    ['Düsseldorf', 51.2277, 6.7735, 'Duesseldorf'],
    ['Dortmund', 51.5136, 7.4653],
    ['Essen', 51.4556, 7.0116],
    ['Leipzig', 51.3397, 12.3731],
    ['Bremen', 53.0793, 8.8017],
    ['Dresden', 51.0504, 13.7373],
    ['Hannover', 52.3759, 9.732, 'Hanover'],
    ['Nürnberg', 49.4521, 11.0767, 'Nuernberg', 'Nuremberg'],
    ['Duisburg', 51.4344, 6.7623],
    ['Bochum', 51.4818, 7.2162],
    ['Wuppertal', 51.2562, 7.1508],
    ['Bielefeld', 52.0302, 8.5325],
    ['Bonn', 50.7374, 7.0982],
    ['Münster', 51.9607, 7.6261, 'Muenster'],
    ['Mannheim', 49.4875, 8.466],
    ['Karlsruhe', 49.0069, 8.4037],
    ['Augsburg', 48.3705, 10.8978],
    ['Wiesbaden', 50.0782, 8.2398],
    ['Gelsenkirchen', 51.5177, 7.0857],
    ['Mönchengladbach', 51.1805, 6.4428, 'Moenchengladbach'],
    ['Aachen', 50.7753, 6.0839],
    ['Kiel', 54.3233, 10.1228],
    ['Mainz', 49.9929, 8.2473],
    ['Freiburg', 47.999, 7.8421],
    ['Kassel', 51.3127, 9.4797],
    ['Offenbach', 50.0956, 8.7761],
    ['Heilbronn', 49.1427, 9.2109],
    ['Ulm', 48.4011, 9.9876],
  ],
  NL: [
    ['Amsterdam', 52.3676, 4.9041],
    ['Rotterdam', 51.9244, 4.4777],
    ['Lahey', 52.0705, 4.3007, 'Den Haag', 'The Hague', "'s-Gravenhage"],
    ['Utrecht', 52.0907, 5.1214],
    ['Eindhoven', 51.4416, 5.4697],
    ['Groningen', 53.2194, 6.5665],
    ['Tilburg', 51.5555, 5.0913],
    ['Almere', 52.3508, 5.2647],
    ['Breda', 51.5719, 4.7683],
    ['Nijmegen', 51.8126, 5.8372],
    ['Arnhem', 51.9851, 5.8987],
    ['Haarlem', 52.3874, 4.6462],
    ['Enschede', 52.2215, 6.8937],
    ['Zaandam', 52.442, 4.8292, 'Zaanstad'],
    ['Apeldoorn', 52.2112, 5.9699],
    ['Amersfoort', 52.1561, 5.3878],
    ['Maastricht', 50.8514, 5.691],
    ['Leiden', 52.1601, 4.497],
    ['Dordrecht', 51.8133, 4.6901],
    ['Zwolle', 52.5168, 6.083],
    ['Deventer', 52.2551, 6.1639],
  ],
  CY: [
    ['Lefkoşa', 35.1856, 33.3823, 'Lefkoşe', 'Nicosia'],
    ['Girne', 35.3364, 33.3182, 'Kyrenia'],
    ['Gazimağusa', 35.125, 33.9417, 'Mağusa', 'Famagusta'],
    ['İskele', 35.2867, 33.8917, 'Trikomo'],
    ['Lefke', 35.1103, 32.8492],
    ['Larnaka', 34.9229, 33.6233, 'Larnaca'],
    ['Limasol', 34.7071, 33.0226, 'Limassol', 'Leymosun'],
    ['Baf', 34.7754, 32.4245, 'Paphos'],
  ],
};

/**
 * A city name as it is compared: lower case, the marks off the letters, words only ("İSTANBUL" and "Istanbul" are
 * "istanbul", "K.Maraş" is "k maras"). Empty for anything that isn't text.
 */
export function cityKey(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ə/g, 'e')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every city once, { name, country, lat, lon }, frozen. */
export const CITIES = Object.freeze(
  Object.entries(TABLE).flatMap(([country, rows]) => rows.map(([name, lat, lon]) => Object.freeze({ name, country, lat, lon }))),
);

const BY_KEY = new Map();
for (const [country, rows] of Object.entries(TABLE))
  for (const [name, , , ...others] of rows) {
    const city = CITIES.find((c) => c.country === country && c.name === name);
    for (const n of [name, ...others]) BY_KEY.set(cityKey(n), city);
  }
/** The most words in one name ("frankfurt am main"). */
const LONGEST = Math.max(...[...BY_KEY.keys()].map((k) => k.split(' ').length));

/**
 * The city a profile's text names, or null: the whole text, else the longest run of its words that is a name we
 * know ("Kadıköy, İstanbul" → İstanbul, "Frankfurt am Main, Almanya" → Frankfurt).
 */
export function findCity(text) {
  const key = cityKey(text);
  if (!key) return null;
  const whole = BY_KEY.get(key);
  if (whole) return whole;
  const words = key.split(' ');
  for (let n = Math.min(LONGEST, words.length); n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const city = BY_KEY.get(words.slice(i, i + n).join(' '));
      if (city) return city;
    }
  return null;
}

const RAD = Math.PI / 180;
/** The great-circle distance between two cities, in km (the Earth as a sphere of 6371 km). */
export function kmBetween(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A distance as it is shown: to the nearest 10 km under 100 km (never 0 between two cities), else to the nearest 50. */
export const roundKm = (km) => (km < 100 ? Math.max(10, Math.round(km / 10) * 10) : Math.round(km / 50) * 50);

/**
 * How far apart two profile cities are, as people see it: { km: 0, sameCity: true } for one city (the same text,
 * or two names of one city), { km, sameCity: false } rounded (roundKm) for two we know, else null (a city empty
 * or not in the table).
 */
export function cityDistance(a, b) {
  const ka = cityKey(a);
  const kb = cityKey(b);
  if (!ka || !kb) return null;
  const ca = findCity(a);
  const cb = findCity(b);
  if (ka === kb || (ca && ca === cb)) return { km: 0, sameCity: true };
  if (!ca || !cb) return null;
  return { km: roundKm(kmBetween(ca, cb)), sameCity: false };
}
