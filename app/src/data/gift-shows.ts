// Full-screen shows for the most expensive gifts (docs/BUYUK_HEDIYELER.md). Each show is a small stage
// of separate picture parts (body, wings, wheels…) that code moves: ChatGPT draws only still PNGs, the
// motion lives here. Until a gift's parts are delivered the show plays its single 512 px gift picture
// with the same entrance, light and sparkle, so nothing waits on art.
// Pure data (no React, no images): tests check it against GIFTS and the art list.

/** How the stage comes in. */
export type ShowEnter = 'rise' | 'left' | 'right' | 'zoom' | 'drop';
/** Looping motion of one part while the show holds. */
export type PartMotion =
  | 'still'
  | 'float' // slow up and down
  | 'flap' // swings around its pivot (wings)
  | 'spin' // turns round and round (wheels, a globe)
  | 'pulse' // grows a little and back (rings, halos)
  | 'flicker' // quick small flutter (flames)
  | 'sway' // tilts left and right (flags, a boat)
  | 'drift' // slides sideways and back (clouds, waves)
  | 'open' // unfolds from nothing once, then breathes (a peacock tail)
  | 'orbit'; // circles the middle of the stage (a plane round a globe)

export type ShowPart = {
  /** File part name: assets/gifts/show/<slug>-<part>.png */
  part: string;
  /** Short Turkish description for the ChatGPT list. */
  draw: string;
  motion: PartMotion;
  /** Centre on the stage, 0..1 of its width/height. */
  x: number;
  y: number;
  /** Width on the stage, 0..1 of the stage width (parts are square PNGs). */
  size: number;
  /** Pivot for flap/sway, -0.5..0.5 of the part's own size from its centre (e.g. a wing's shoulder). */
  pivot?: { x: number; y: number };
  /** Mirror the picture (one wing file used for both sides). */
  mirror?: boolean;
  /** Start of the loop, 0..1, so twin parts don't move in lockstep. */
  phase?: number;
};

export type Sparkle = 'stars' | 'petals' | 'glints' | 'bubbles';

export type GiftShow = {
  giftId: string;
  /** File name stem shared with the gift picture (hediye-<slug>.png). */
  slug: string;
  durationMs: number;
  enter: ShowEnter;
  /** Glow and sparkle colour. */
  glow: string;
  sparkle: Sparkle;
  /** Drawn back to front. */
  parts: ShowPart[];
};

const GOLD = '#F6BD60';
const TURQ = '#5EEAD4';
const CORAL = '#FF8A95';
const ICE = '#BFE9FF';

const wingL = (x: number, y: number, size: number, draw: string): ShowPart => ({ part: 'kanat', draw, motion: 'flap', x, y, size, pivot: { x: 0.42, y: 0.1 } });
const wingR = (x: number, y: number, size: number, draw: string): ShowPart => ({ part: 'kanat', draw, motion: 'flap', x, y, size, pivot: { x: -0.42, y: 0.1 }, mirror: true });

export const GIFT_SHOWS: GiftShow[] = [
  {
    giftId: 'c6',
    slug: 'yildiz-faytonu',
    durationMs: 5600,
    enter: 'left',
    glow: GOLD,
    sparkle: 'stars',
    parts: [
      { part: 'iz', draw: 'Arkada kalan yıldız tozu izi: soldan sağa incelen altın ışıltılı bir şerit.', motion: 'drift', x: 0.3, y: 0.62, size: 0.7 },
      { part: 'govde', draw: 'Tekerleksiz fayton gövdesi: altın süslemeli, turkuaz camlı, yandan görünüş.', motion: 'float', x: 0.52, y: 0.48, size: 0.74 },
      { part: 'teker', draw: 'Tek bir fayton tekerleği: altın jantlı, yıldız biçimli parmaklıklı, tam karşıdan.', motion: 'spin', x: 0.33, y: 0.7, size: 0.24 },
      { part: 'teker', draw: 'Aynı tekerlek (ikinci kez kullanılır).', motion: 'spin', x: 0.71, y: 0.7, size: 0.24, phase: 0.4 },
    ],
  },
  {
    giftId: 'v12',
    slug: 'atlikarinca-gecesi',
    durationMs: 5600,
    enter: 'rise',
    glow: CORAL,
    sparkle: 'glints',
    parts: [
      { part: 'govde', draw: 'Atlıkarıncanın tabanı ve direkleri, atlar ve tepe olmadan: altın direkler, turkuaz ve mercan süslü yuvarlak platform.', motion: 'still', x: 0.5, y: 0.58, size: 0.86 },
      { part: 'at', draw: 'Direksiz tek bir atlıkarınca atı: beyaz, altın eyerli, mercan yeleli, yandan.', motion: 'float', x: 0.32, y: 0.58, size: 0.3 },
      { part: 'at', draw: 'Aynı at (ikinci kez kullanılır).', motion: 'float', x: 0.68, y: 0.58, size: 0.3, mirror: true, phase: 0.5 },
      { part: 'tepe', draw: 'Atlıkarıncanın çatısı: mercan ve krem dilimli çadır tepesi, altın kenarlı, ucunda küçük bir yıldız.', motion: 'sway', x: 0.5, y: 0.22, size: 0.8, pivot: { x: 0, y: 0.4 } },
    ],
  },
  {
    giftId: 'v8',
    slug: 'gokyuzu-turu',
    durationMs: 5600,
    enter: 'rise',
    glow: TURQ,
    sparkle: 'glints',
    parts: [
      { part: 'bulut', draw: 'Tek bir yumuşak beyaz bulut, altın kenar ışığı.', motion: 'drift', x: 0.2, y: 0.74, size: 0.42 },
      { part: 'govde', draw: 'Pervanesiz turkuaz-altın gezi helikopteri, büyük cam kabinli, yandan; üstteki pervane mili görünsün.', motion: 'float', x: 0.5, y: 0.5, size: 0.7 },
      { part: 'pervane', draw: 'Helikopterin üst pervanesi tek başına: yandan görünen uzun, ince altın kanat çubuğu.', motion: 'flicker', x: 0.5, y: 0.25, size: 0.8 },
      { part: 'bulut', draw: 'Aynı bulut (ikinci kez kullanılır).', motion: 'drift', x: 0.82, y: 0.3, size: 0.36, mirror: true, phase: 0.5 },
    ],
  },
  {
    giftId: 'c8',
    slug: 'dugun-gunu',
    durationMs: 5600,
    enter: 'zoom',
    glow: GOLD,
    sparkle: 'petals',
    parts: [
      { part: 'pasta', draw: 'Üç katlı beyaz düğün pastası: mercan kurdeleler, krem güller, tepesinde yanan mumlar.', motion: 'still', x: 0.6, y: 0.56, size: 0.6 },
      { part: 'buket', draw: 'Mercan kurdeleli büyük bir gül buketi: kırmızı, pembe ve beyaz güller.', motion: 'sway', x: 0.3, y: 0.56, size: 0.52, pivot: { x: 0, y: 0.4 } },
      { part: 'yuzukler', draw: 'İç içe geçmiş iki altın alyans, birinde küçük bir pırlanta.', motion: 'pulse', x: 0.5, y: 0.2, size: 0.26 },
      { part: 'guvercin', draw: 'Kanatları açık uçan tek bir beyaz güvercin, yandan.', motion: 'float', x: 0.2, y: 0.22, size: 0.26 },
      { part: 'guvercin', draw: 'Aynı güvercin (ikinci kez kullanılır).', motion: 'float', x: 0.8, y: 0.2, size: 0.26, mirror: true, phase: 0.5 },
    ],
  },
  {
    giftId: 'v10',
    slug: 'luks-yat',
    durationMs: 5600,
    enter: 'right',
    glow: TURQ,
    sparkle: 'bubbles',
    parts: [
      { part: 'yat', draw: 'Beyaz ve altın çizgili lüks bir yat, yandan; altı düz (su çizgisinde kesik).', motion: 'sway', x: 0.5, y: 0.5, size: 0.86, pivot: { x: 0, y: 0.3 } },
      { part: 'dalga', draw: 'Yatay, uzun turkuaz bir dalga şeridi, köpüklü üst kenar.', motion: 'drift', x: 0.5, y: 0.74, size: 1 },
    ],
  },
  {
    giftId: 'v11',
    slug: 'altin-tavus',
    durationMs: 5600,
    enter: 'zoom',
    glow: GOLD,
    sparkle: 'glints',
    parts: [
      { part: 'kuyruk', draw: 'Tam açılmış tavus kuşu kuyruğu tek başına: altın ve turkuaz göz desenli yarım daire yelpaze.', motion: 'open', x: 0.5, y: 0.44, size: 0.96, pivot: { x: 0, y: 0.4 } },
      { part: 'govde', draw: 'Kuyruksuz altın tavus kuşu gövdesi, başında küçük taç tüyleri, önden üçte bir açıdan.', motion: 'float', x: 0.5, y: 0.6, size: 0.42 },
    ],
  },
  {
    giftId: 'v7',
    slug: 'uzay-yolculugu',
    durationMs: 5600,
    enter: 'rise',
    glow: ICE,
    sparkle: 'stars',
    parts: [
      { part: 'ay', draw: 'Parlak altın hilal ay, yumuşak bulutlara yaslanmış.', motion: 'sway', x: 0.74, y: 0.62, size: 0.5, pivot: { x: 0, y: 0.3 } },
      { part: 'astronot', draw: 'Beyaz uzay giysili sevimli bir astronot, turkuaz kask camı, el sallarken.', motion: 'float', x: 0.76, y: 0.5, size: 0.3, phase: 0.3 },
      { part: 'alev', draw: 'Aşağı doğru yanan roket alevi: içi beyaz-sarı, dışı mercan.', motion: 'flicker', x: 0.32, y: 0.8, size: 0.26, pivot: { x: 0, y: -0.45 } },
      { part: 'roket', draw: 'Yukarı bakan beyaz-altın roket, turkuaz yuvarlak pencereli, alevsiz.', motion: 'float', x: 0.32, y: 0.46, size: 0.52 },
    ],
  },
  {
    giftId: 'h2',
    slug: 'dunya-turu',
    durationMs: 5600,
    enter: 'zoom',
    glow: TURQ,
    sparkle: 'glints',
    parts: [
      { part: 'dunya', draw: 'Yuvarlak dünya küresi: turkuaz denizler, krem kıtalar, altın enlem çizgileri; ülke sınırı yok.', motion: 'spin', x: 0.5, y: 0.5, size: 0.66 },
      { part: 'ucak', draw: 'Küçük beyaz-mercan yolcu uçağı, sağa uçarken yandan.', motion: 'orbit', x: 0.5, y: 0.5, size: 0.24 },
    ],
  },
  {
    giftId: 'v9',
    slug: 'altin-kanatlar',
    durationMs: 5200,
    enter: 'zoom',
    glow: GOLD,
    sparkle: 'glints',
    parts: [
      { part: 'hale', draw: 'Altın ışık halkası: ince parlak çember ve yumuşak ışıma.', motion: 'pulse', x: 0.5, y: 0.42, size: 0.7 },
      wingL(0.3, 0.48, 0.56, 'Tek bir altın melek kanadı (sol kanat), tüyleri katman katman, omzu sağ üstte.'),
      wingR(0.7, 0.48, 0.56, 'Aynı kanat (sağ tarafa aynalanır).'),
    ],
  },
  {
    giftId: 'c3',
    slug: 'masal-kalesi',
    durationMs: 5200,
    enter: 'rise',
    glow: CORAL,
    sparkle: 'stars',
    parts: [
      { part: 'bulut', draw: 'Kalenin altında duran geniş, yumuşak beyaz bulut.', motion: 'drift', x: 0.5, y: 0.82, size: 0.9 },
      { part: 'kale', draw: 'Masal kalesi, bayraksız: krem duvarlar, mercan sivri kuleler, altın süsler, turkuaz pencereler.', motion: 'float', x: 0.5, y: 0.5, size: 0.8 },
      { part: 'bayrak', draw: 'Direğiyle tek bir küçük mercan flama.', motion: 'sway', x: 0.5, y: 0.12, size: 0.16, pivot: { x: -0.4, y: 0.45 } },
    ],
  },
  {
    giftId: 'h12',
    slug: 'altin-kugu',
    durationMs: 5200,
    enter: 'left',
    glow: GOLD,
    sparkle: 'glints',
    parts: [
      { part: 'halka', draw: 'Suda yayılan tek bir halka dalga, turkuaz ve altın ışıltılı, üstten hafif açıyla.', motion: 'pulse', x: 0.5, y: 0.72, size: 0.8 },
      { part: 'govde', draw: 'Kanatları kapalı altın kuğu gövdesi, yüzerken yandan.', motion: 'float', x: 0.5, y: 0.55, size: 0.62 },
      { ...wingL(0.44, 0.42, 0.4, 'Tek bir açık altın kuğu kanadı, yukarı kalkık, omzu sağ altta.'), pivot: { x: 0.4, y: 0.35 } },
    ],
  },
  {
    giftId: 'v6',
    slug: 'kartal',
    durationMs: 5200,
    enter: 'right',
    glow: GOLD,
    sparkle: 'glints',
    parts: [
      wingL(0.27, 0.42, 0.52, 'Tek bir açık kartal kanadı (sol kanat): kahverengi-altın tüyler, omzu sağ üstte.'),
      wingR(0.73, 0.42, 0.52, 'Aynı kanat (sağ tarafa aynalanır).'),
      { part: 'govde', draw: 'Kanatsız kartal gövdesi ve başı, önden: beyaz baş, altın gaga, kahverengi-altın göğüs.', motion: 'float', x: 0.5, y: 0.5, size: 0.42 },
    ],
  },
];

const BY_ID = new Map(GIFT_SHOWS.map((s) => [s.giftId, s]));
export const giftShowOf = (giftId?: string): GiftShow | undefined => (giftId ? BY_ID.get(giftId) : undefined);

/** File name of a part picture. */
export const partFile = (show: GiftShow, part: string) => `${show.slug}-${part}.png`;

/** The distinct files a show needs (twin parts share one file). */
export const showFiles = (show: GiftShow) => [...new Set(show.parts.map((p) => partFile(show, p.part)))];
