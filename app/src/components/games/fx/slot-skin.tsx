// A payline machine dressed in delivered art instead of the shell's code-drawn stage (docs/GORSEL_URETIM_LISTESI.md
// §24): a picture behind the whole game panel, a cabinet frame over the reels (the reels sit in its transparent
// window), the symbols, the spin button and the win plate as pictures, and a JACKPOT / Büyük Kazanç show of its own
// (fx/jackpot-show). A game without a skin keeps the shell's look (fx/salon); a skin only changes the drawing, never
// the round. A new machine gets one line in SLOT_SKINS once its pictures are in fx/salon-art.
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { salonArt, type SalonArtName } from '@/components/games/fx/salon-art';
import { CountUp, SALON, glowNumber, type StatusTone } from '@/components/games/fx/salon';
import { Text } from '@/components/text';
import type { LineSlotId } from '@/lib/casino-odds';
import { fonts } from '@/theme';

/** A picture with the shape it is drawn in (width / height). */
export type SkinPic = { src: number; aspect: number };

export type SlotSkin = {
  /** Behind the whole game panel, under `veil` so the controls read. */
  backdrop: number;
  veil: readonly [string, string, ...string[]];
  /** The cabinet, drawn over the reels. `window`: its transparent opening, as parts of the picture. */
  frame: SkinPic & { window: { x: number; y: number; w: number; h: number } };
  /** Inside the window, behind the symbols. */
  reels: readonly [string, string, ...string[]];
  /** Every symbol of the machine as a picture. */
  symbols: Record<string, number>;
  spin: SkinPic;
  /** The win plate: the status line and a win's amount are written in its empty middle. */
  plate: SkinPic;
  /** The win shows (fx/jackpot-show), by how many stakes a round paid. */
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

const pic = (name: SalonArtName) => salonArt(name) as number;

export const SLOT_SKINS: Partial<Record<LineSlotId, SlotSkin>> = {
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
    plate: { src: pic('kizil-yedi-kazanc'), aspect: 900 / 299 },
    // Three 7s on a line pay 100 line stakes = 20.6 stakes of the round (5 lines): the JACKPOT. Nothing else on
    // this machine reaches 20 stakes; a round of 10 stakes or more (two diamond lines and up) is a Büyük Kazanç.
    show: {
      jackpotX: 20,
      bigX: 10,
      plaque: { src: pic('jackpot-levha'), aspect: 900 / 301 },
      rays: pic('jackpot-isik'),
      coin: pic('jeton-altin'),
      pile: { src: pic('jeton-yigini'), aspect: 768 / 414 },
      sparkle: pic('parilti'),
    },
  },
};

export const slotSkinOf = (id: string): SlotSkin | undefined => SLOT_SKINS[id as LineSlotId];

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
  const size = Math.max(14, Math.round(h * 0.3));
  return (
    <View style={[{ width, height: h }, style]} accessibilityLiveRegion="polite">
      <Image source={skin.plate.src} style={{ width, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={[p.text, { left: width * 0.15, right: width * 0.15, top: h * 0.3, bottom: h * 0.26 }]}>
        {won ? (
          <View style={p.row}>
            <Text style={[p.label, { fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.7) }]} numberOfLines={1}>
              {label ?? 'KAZANÇ'}
            </Text>
            <CountUp key={amount} value={amount} format={(n) => `+${Math.floor(n).toLocaleString('tr-TR')}`} style={[glowNumber, p.amount, { fontSize: size, lineHeight: Math.round(size * 1.2) }]} />
          </View>
        ) : (
          <Text style={[p.status, { fontSize: Math.round(size * 0.62), lineHeight: Math.round(size * 0.82) }, tone === 'err' && p.err]} numberOfLines={2} adjustsFontSizeToFit>
            {text}
          </Text>
        )}
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  text: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  label: { color: SALON.goldHi, fontFamily: fonts.displayBold, letterSpacing: 1.6, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  amount: { color: '#FFE08A', textShadowColor: 'rgba(60,10,0,0.9)', textShadowRadius: 6 },
  status: { color: '#FFF1C9', fontFamily: fonts.displayBold, letterSpacing: 1.2, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  err: { color: '#FFE3D6', letterSpacing: 0 },
});
