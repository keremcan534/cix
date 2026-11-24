// A reel machine dressed in delivered art instead of the shell's code-drawn stage (docs/GORSEL_URETIM_LISTESI.md
// §24): a picture behind the whole game panel, a cabinet frame over the reels (the reels sit in its transparent
// window), the symbols, the spin button and the win plate as pictures, and a JACKPOT / Büyük Kazanç show of its own
// (fx/jackpot-show). The payline slots (games/line-slot) and Bereket Ağacı (games/gold-tree) wear one. A game without
// a skin keeps the shell's look (fx/salon); a skin only changes the drawing, never the round. A new machine gets one
// block in SLOT_SKINS once its pictures are in fx/salon-art.
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { salonArt, type SalonArtName } from '@/components/games/fx/salon-art';
import { FitBox, GoldText } from '@/components/games/fx/gold-text';
import { CountUp, SALON, type StatusTone } from '@/components/games/fx/salon';
import { Text } from '@/components/text';
import type { LineSlotId } from '@/lib/casino-odds';
import { fonts } from '@/theme';

/** A picture with the shape it is drawn in (width / height). */
export type SkinPic = { src: number; aspect: number };
export type PlateWindow = { top: number; bottom: number; left: number; right: number };
const PLATE_WINDOW: PlateWindow = { top: 0.3, bottom: 0.26, left: 0.15, right: 0.15 };

export type SlotSkin = {
  /** Behind the whole game panel, under `veil` so the controls read. */
  backdrop: number;
  veil: readonly [string, string, ...string[]];
  /**
   * The cabinet, drawn over the reels. `window`: its transparent opening, as parts of the picture. `stretch`: the
   * bands (top, bottom as parts of its height, inside the opening's) where its sides are plain, so they can be drawn
   * taller to give a low window square cells (fitSkin). A machine whose cabinet hasn't come has none: its reels stand
   * in a drawn box with a `rim` of its colour.
   */
  frame?: SkinPic & { window: SkinWindow; stretch?: readonly (readonly [number, number])[] };
  rim?: string;
  /** Inside the window, behind the symbols. */
  reels: readonly [string, string, ...string[]];
  /** Every symbol of the machine as a picture. */
  symbols: Record<string, number>;
  spin: SkinPic;
  /**
   * The win plate: the status line and a win's amount are written in its empty middle. `window`: where that dark
   * middle is, as parts of the picture from each edge (measured from the pictures), so the words sit in it.
   */
  plate: SkinPic & { window?: PlateWindow };
  /**
   * The win shows (fx/jackpot-show), by how many stakes a round paid. A machine with a JACKPOT fund keeps the name
   * for the fund (`jackpotX` Infinity): a big line win is a Büyük Kazanç there, never called a JACKPOT.
   */
  show: {
    jackpotX: number;
    bigX: number;
    plaque: SkinPic;
    rays: number;
    coin: number;
    pile: SkinPic;
    sparkle: number;
  };
};

/** A frame's opening, as parts of its picture. */
export type SkinWindow = { x: number; y: number; w: number; h: number };

const pic = (name: SalonArtName) => salonArt(name) as number;
/** The JACKPOT pieces every machine shares (§24): the plaque, the rays, the coin, the pile, the sparkle. */
const SHARED = {
  plaque: { src: pic('jackpot-levha'), aspect: 900 / 301 },
  rays: pic('jackpot-isik'),
  coin: pic('jeton-altin'),
  pile: { src: pic('jeton-yigini'), aspect: 768 / 414 },
  sparkle: pic('parilti'),
};
/** A machine with a JACKPOT fund: its line JACKPOT is the fund's (games/line-slot), its show only Büyük Kazanç. */
const FUND_SHOW = { jackpotX: Number.POSITIVE_INFINITY, bigX: 10, ...SHARED };
/** A frame's opening from its picture's alpha: the picture's size, then x, y, width, height of the opening (px). */
const opening = (w: number, h: number, x: number, y: number, ow: number, oh: number): SkinWindow => ({ x: x / w, y: y / h, w: ow / w, h: oh / h });
/** A frame's plain bands from its picture: the picture's height, then each band's top and bottom (px). */
const bands = (h: number, ...ys: [number, number][]) => ys.map(([top, bottom]) => [top / h, bottom / h] as const);

export const SLOT_SKINS: Partial<Record<LineSlotId | 'goldtree', SlotSkin>> = {
  super777: {
    backdrop: pic('kizil-yedi-arka-plan'),
    veil: ['rgba(8,6,14,0.55)', 'rgba(8,6,14,0.28)', 'rgba(8,6,14,0.45)', 'rgba(8,6,14,0.82)'],
    // Measured from the picture's alpha: the opening runs x 154–785, y 402–893 of 1000 × 1250.
    frame: { src: pic('kizil-yedi-cerceve'), aspect: 1000 / 1250, window: { x: 154 / 1000, y: 402 / 1250, w: 632 / 1000, h: 492 / 1250 } },
    reels: ['#120A16', '#24101A', '#120A16'],
    symbols: {
      cherry: pic('slot-kiraz'),
      lemon: pic('slot-limon'),
      mango: pic('slot-mango'),
      grape: pic('slot-uzum'),
      diamond: pic('slot-elmas'),
      seven: pic('slot-yedi'),
    },
    spin: { src: pic('kizil-yedi-cevir'), aspect: 296 / 320 },
    plate: { src: pic('kizil-yedi-kazanc'), aspect: 900 / 299, window: { top: 0.4, bottom: 0.27, left: 0.11, right: 0.11 } },
    // Three 7s on a line pay 100 line stakes = 20.6 stakes of the round (5 lines): the JACKPOT. Nothing else on
    // this machine reaches 20 stakes; a round of 10 stakes or more (two diamond lines and up) is a Büyük Kazanç.
    show: { jackpotX: 20, bigX: 10, ...SHARED },
  },
  jackpot: {
    backdrop: pic('hazine-kulesi-arka-plan'),
    veil: ['rgba(12,6,4,0.55)', 'rgba(12,6,4,0.28)', 'rgba(12,6,4,0.45)', 'rgba(12,6,4,0.82)'],
    frame: { src: pic('hazine-kulesi-cerceve'), aspect: 768 / 691, window: opening(768, 691, 85, 257, 594, 353), stretch: bands(691, [340, 520]) },
    reels: ['#1A0C08', '#2A140C', '#1A0C08'],
    // Kiraz and 7 are Kızıl Yedi's (the Hazine Kulesi pack was drawn to match them).
    symbols: {
      cherry: pic('slot-kiraz'),
      bell: pic('slot-can'),
      bar: pic('slot-bar'),
      bar2: pic('slot-bar2'),
      dollar: pic('slot-dolar'),
      seven: pic('slot-yedi'),
      wild: pic('slot-77-wild'),
    },
    spin: { src: pic('hazine-kulesi-cevir'), aspect: 251 / 288 },
    plate: { src: pic('hazine-kulesi-kazanc'), aspect: 768 / 228, window: { top: 0.24, bottom: 0.12, left: 0.08, right: 0.08 } },
    show: FUND_SHOW,
  },
  jungle: {
    backdrop: pic('vahsi-patika-arka-plan'),
    veil: ['rgba(4,10,4,0.55)', 'rgba(4,10,4,0.28)', 'rgba(4,10,4,0.45)', 'rgba(4,10,4,0.82)'],
    frame: { src: pic('vahsi-patika-cerceve'), aspect: 768 / 499, window: opening(768, 499, 62, 170, 639, 245), stretch: bands(499, [195, 395]) },
    reels: ['#0A170C', '#132A16', '#0A170C'],
    symbols: {
      ten: pic('patika-10'),
      j: pic('patika-j'),
      q: pic('patika-q'),
      k: pic('patika-k'),
      a: pic('patika-a'),
      rhino: pic('patika-gergedan'),
      croc: pic('patika-timsah'),
      elephant: pic('patika-fil'),
      gorilla: pic('patika-goril'),
      wild: pic('patika-aslan-wild'),
    },
    spin: { src: pic('vahsi-patika-cevir'), aspect: 284 / 288 },
    plate: { src: pic('vahsi-patika-kazanc'), aspect: 768 / 260, window: { top: 0.26, bottom: 0.21, left: 0.1, right: 0.1 } },
    show: FUND_SHOW,
  },
  pinata: {
    backdrop: pic('konfeti-kutusu-arka-plan'),
    veil: ['rgba(4,10,22,0.55)', 'rgba(4,10,22,0.28)', 'rgba(4,10,22,0.45)', 'rgba(4,10,22,0.82)'],
    // Its cabinet hasn't come: the reels stand in a drawn box in the machine's coral.
    rim: '#FF8E9A',
    reels: ['#081428', '#0F2440', '#081428'],
    symbols: {
      j: pic('konfeti-j'),
      q: pic('konfeti-q'),
      k: pic('konfeti-k'),
      a: pic('konfeti-a'),
      chili: pic('konfeti-biber'),
      taco: pic('konfeti-tako'),
      maraca: pic('konfeti-marakas'),
      guitar: pic('konfeti-gitar'),
      skull: pic('konfeti-kafatasi'),
      wild: pic('konfeti-pinata-wild'),
    },
    spin: { src: pic('konfeti-kutusu-cevir'), aspect: 288 / 286 },
    plate: { src: pic('konfeti-kutusu-kazanc'), aspect: 768 / 287, window: { top: 0.46, bottom: 0.17, left: 0.12, right: 0.12 } },
    show: FUND_SHOW,
  },
  spellbook: {
    backdrop: pic('kayip-parsomen-arka-plan'),
    veil: ['rgba(2,10,10,0.55)', 'rgba(2,10,10,0.28)', 'rgba(2,10,10,0.45)', 'rgba(2,10,10,0.82)'],
    // Its sides' gems (the corners and the middle) keep their shape: the plain lengths between them stretch.
    frame: { src: pic('kayip-parsomen-cerceve'), aspect: 768 / 503, window: opening(768, 503, 36, 144, 697, 249), stretch: bands(503, [158, 245], [290, 368]) },
    reels: ['#061412', '#0D2421', '#061412'],
    symbols: {
      candle: pic('parsomen-mum'),
      scroll: pic('parsomen-tomar'),
      staff: pic('parsomen-asa'),
      goblet: pic('parsomen-kadeh'),
      ring: pic('parsomen-yuzuk'),
      amulet: pic('parsomen-muska'),
      cat: pic('parsomen-kedi'),
      wild: pic('parsomen-cadi-wild'),
      book: pic('parsomen-kitap'),
    },
    spin: { src: pic('kayip-parsomen-cevir'), aspect: 288 / 286 },
    plate: { src: pic('kayip-parsomen-kazanc'), aspect: 768 / 258, window: { top: 0.35, bottom: 0.17, left: 0.15, right: 0.15 } },
    show: FUND_SHOW,
  },
  neon: {
    backdrop: pic('neon-bulvar-arka-plan'),
    veil: ['rgba(2,6,16,0.55)', 'rgba(2,6,16,0.28)', 'rgba(2,6,16,0.45)', 'rgba(2,6,16,0.82)'],
    frame: { src: pic('neon-bulvar-cerceve'), aspect: 768 / 543, window: opening(768, 543, 42, 155, 684, 307), stretch: bands(543, [185, 425]) },
    reels: ['#03060F', '#0A1426', '#03060F'],
    symbols: {
      j: pic('neon-j'),
      q: pic('neon-q'),
      k: pic('neon-k'),
      melon: pic('neon-karpuz'),
      lips: pic('neon-dudak'),
      heart: pic('neon-kalp'),
      gem: pic('neon-elmas'),
      wild: pic('neon-wild'),
    },
    spin: { src: pic('neon-bulvar-cevir'), aspect: 286 / 288 },
    plate: { src: pic('neon-bulvar-kazanc'), aspect: 768 / 249, window: { top: 0.27, bottom: 0.15, left: 0.15, right: 0.14 } },
    show: FUND_SHOW,
  },
  // Bereket Ağacı (games/gold-tree): 3 reels, the middle row pays. Three trees (188 stakes) are its JACKPOT, three
  // coins of a colour (18 stakes and up) a Büyük Kazanç. A blank stop has no picture (an empty cell).
  goldtree: {
    backdrop: pic('bereket-agaci-arka-plan'),
    veil: ['rgba(10,4,4,0.55)', 'rgba(10,4,4,0.28)', 'rgba(10,4,4,0.45)', 'rgba(10,4,4,0.82)'],
    frame: { src: pic('bereket-agaci-cerceve'), aspect: 718 / 768, window: opening(718, 768, 98, 269, 521, 370), stretch: bands(768, [310, 590]) },
    reels: ['#1C0A0A', '#2E1210', '#1C0A0A'],
    symbols: {
      tree: pic('bereket-agac'),
      red: pic('bereket-para-kirmizi'),
      blue: pic('bereket-para-mavi'),
      green: pic('bereket-para-yesil'),
    },
    spin: { src: pic('bereket-agaci-cevir'), aspect: 234 / 288 },
    plate: { src: pic('bereket-agaci-kazanc'), aspect: 768 / 277, window: { top: 0.4, bottom: 0.2, left: 0.08, right: 0.08 } },
    show: { jackpotX: 100, bigX: 10, ...SHARED },
  },
};

export const slotSkinOf = (id: string): SlotSkin | undefined => SLOT_SKINS[id as LineSlotId | 'goldtree'];

/** A machine without a cabinet picture: its drawn box, a little wider than the reels' cells, the reels inside. */
const DRAWN_WINDOW: SkinWindow = { x: 0.025, y: 0.035, w: 0.95, h: 0.93 };
/** The cabinet's shape and opening: its picture's, or the drawn box's for `reels` × `rows` near-square cells. */
const frameOf = (skin: SlotSkin, reels: number, rows: number): Omit<NonNullable<SlotSkin['frame']>, 'src'> => skin.frame ?? { aspect: (reels / rows) * 1.05, window: DRAWN_WINDOW };

/** Between two symbols and two reels of a skinned machine, its window's inner margin and a reel's rim (px). */
export const SKIN_GAP = 3;
export const SKIN_PAD = 3;
export const SKIN_RIM = 1.5;

/** How much taller a cabinet's plain bands may be drawn, and how much taller than wide its cells may grow (fitSkin). */
const MAX_STRETCH = 2.5;
const tallest = (reels: number) => (reels === 3 ? 1.2 : 1.5);

export type SkinFit = ReturnType<typeof fitSkin>;
/**
 * A skinned machine in the area it is given: the win plate under the cabinet, the cabinet as large as the rest
 * allows, the reels in its window. Most cabinets open a wide, low window (5 reels of 3 rows), which left the symbols
 * small and the phone's height empty: with height to spare, the picture's plain bands (`stretch`) are drawn taller,
 * so the window is too, up to cells a little taller than wide. `drawn` is the picture's own height at this width,
 * `stretch` how much its bands grew.
 */
export function fitSkin(skin: SlotSkin, w: number, h: number, reels: number, rows: number) {
  const frame = frameOf(skin, reels, rows);
  const plateW = Math.round(Math.min(w * 0.86, 330));
  const plateH = Math.round(plateW / skin.plate.aspect);
  // Short of height, the plate stands over the cabinet's base (up to this much of it); with room, under it.
  const most = Math.round(plateH * 0.42);
  const fw = Math.floor(Math.min(w, (h - plateH + most) * frame.aspect));
  const drawn = Math.round(fw / frame.aspect);
  const f = frame.window;
  const reelW = Math.floor((f.w * fw - 2 * SKIN_PAD - (reels - 1) * SKIN_GAP) / reels);
  // A drawn box (no cabinet picture yet) is plain all the way: its whole window may grow.
  const band = skin.frame ? (frame.stretch ?? []).reduce((a, [top, bottom]) => a + bottom - top, 0) * drawn : f.h * drawn;
  // The window's height for the tallest cells, and the height the area has beyond the picture (the plate stays clear).
  const tall = rows * Math.round((reelW - 2 * SKIN_RIM) * tallest(reels)) + (rows - 1) * SKIN_GAP + 2 * SKIN_PAD + 2 * SKIN_RIM;
  const grow = band > 0 ? Math.floor(Math.max(0, Math.min(tall - f.h * drawn, h - plateH - drawn, band * (MAX_STRETCH - 1)))) : 0;
  const fh = drawn + grow;
  const lap = Math.max(0, Math.min(most, fh + plateH - h));
  const win = { x: f.x * fw, y: f.y * drawn, w: f.w * fw, h: f.h * drawn + grow };
  const cellH = Math.floor((win.h - 2 * SKIN_PAD - 2 * SKIN_RIM - (rows - 1) * SKIN_GAP) / rows);
  const symSize = Math.round(Math.min(reelW - 2 * SKIN_RIM, cellH) * 0.96);
  return { plateW, plateH, lap, fw, fh, drawn, stretch: grow > 0 ? 1 + grow / band : 1, win, reelW, cellH, symSize };
}

/** How round the reels' window is: square in a cabinet picture's opening, rounded in a drawn box. */
export const windowRadius = (skin: SlotSkin) => (skin.frame ? 0 : 14);

/** The cabinet over the reels: its picture, or the drawn box's rim for a machine without one. Touches pass through. */
export function SkinCabinet({ skin, fit }: { skin: SlotSkin; fit: SkinFit }) {
  const frame = skin.frame;
  if (!frame) return <View style={[p.rim, { left: fit.win.x - 4, top: fit.win.y - 4, width: fit.win.w + 8, height: fit.win.h + 8, borderColor: skin.rim ?? SALON.gold }]} pointerEvents="none" />;
  if (fit.stretch === 1 || !frame.stretch?.length) return <Image source={frame.src} style={{ position: 'absolute', left: 0, top: 0, width: fit.fw, height: fit.fh }} resizeMode="stretch" pointerEvents="none" accessibilityIgnoresInvertColors />;
  // Drawn taller: the picture in strips, its plain bands (every other strip) stretched, the rest as drawn. A strip
  // reaches a pixel into the next, so no seam shows between them.
  const cuts = [0, ...frame.stretch.flat(), 1];
  const strips: ReactNode[] = [];
  let top = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const k = i % 2 ? fit.stretch : 1;
    const height = (cuts[i + 1] - cuts[i]) * fit.drawn * k;
    strips.push(
      <View key={i} style={{ position: 'absolute', left: 0, top, width: fit.fw, height: height + (i + 2 < cuts.length ? 1 : 0), overflow: 'hidden' }}>
        <Image source={frame.src} style={{ position: 'absolute', left: 0, top: -cuts[i] * fit.drawn * k, width: fit.fw, height: fit.drawn * k }} resizeMode="stretch" accessibilityIgnoresInvertColors />
      </View>,
    );
    top += height;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {strips}
    </View>
  );
}

/** Where a skinned machine's big show is drawn: over the whole game panel (games/game-panel), header included. */
export const SkinOverlay = createContext<((layer: ReactNode) => void) | null>(null);

/** The skin's picture filling its parent (the game panel), under the veil. */
export function SkinBackdrop({ skin }: { skin: SlotSkin }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={skin.backdrop} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} accessibilityIgnoresInvertColors />
      <LinearGradient colors={skin.veil} locations={[0, 0.3, 0.62, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/**
 * The win plate in the skin's picture: the status line in its middle, or a win's label and its amount counting up
 * in gold.
 */
export function SkinPlate({ skin, width, text, tone, amount, label, style }: { skin: SlotSkin; width: number; text: string; tone?: StatusTone; amount?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const h = Math.round(width / skin.plate.aspect);
  const won = amount !== undefined && amount > 0 && (tone === 'win' || tone === 'jackpot');
  const win = skin.plate.window ?? PLATE_WINDOW;
  // The words fill most of the window's height; the line is shrunk to its width (FitBox).
  const room = h * (1 - win.top - win.bottom);
  const size = Math.max(14, Math.round(room * 0.62));
  const fitW = width * (1 - win.left - win.right) * 0.9;
  return (
    <View style={[{ width, height: h }, style]} accessibilityLiveRegion="polite">
      <Image source={skin.plate.src} style={{ width, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={[p.text, { left: width * win.left, right: width * win.right, top: h * win.top, bottom: h * win.bottom }]}>
        {won ? (
          // The label and the counting number in metal, shrunk as one line to the plate's window: never over its edge.
          <FitBox width={fitW}>
            <GoldText size={Math.round(size * 0.56)} face="casinoBold" spacing={0.08} glow={false}>
              {label ?? 'KAZANÇ'}
            </GoldText>
            <View style={{ width: Math.round(size * 0.35) }} />
            <CountUp key={amount} value={amount} format={(n) => `+${Math.floor(n).toLocaleString('tr-TR')}`} render={(t) => <GoldText size={size}>{t}</GoldText>} />
          </FitBox>
        ) : tone === 'err' ? (
          <Text style={[p.status, p.err, { fontSize: Math.round(size * 0.62), lineHeight: Math.round(size * 0.82) }]} numberOfLines={2} adjustsFontSizeToFit>
            {text}
          </Text>
        ) : (
          <FitBox width={fitW}>
            <GoldText size={Math.round(size * 0.6)} face="casinoBold" spacing={0.06} glow={false} metal={tone === 'win' || tone === 'jackpot' ? 'gold' : 'silver'}>
              {text}
            </GoldText>
          </FitBox>
        )}
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  rim: { position: 'absolute', borderRadius: 18, borderWidth: 4, boxShadow: '0 8px 18px rgba(0,0,0,0.55), inset 0 2px 8px rgba(0,0,0,0.6)' },
  text: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  status: { color: '#FFF1C9', fontFamily: fonts.displayBold, letterSpacing: 1.2, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  err: { color: '#FFE3D6', letterSpacing: 0 },
});
