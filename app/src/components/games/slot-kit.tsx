// Shared controls of every Oyun Salonu game, drawn in the shell's look (fx/salon): the balance pill, the bet stepper,
// the wallet row, the reel games' spin controls and the round helpers. Rounds always go through playCasino
// (lib/games); these only show them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { RollingNumber } from '@/components/fx/rolling-number';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { GoldText } from '@/components/games/fx/gold-text';
import { ActionButton, LuxFrame, SALON, SideButton, tabular, type ActionLook } from '@/components/games/fx/salon';
import { salonArt } from '@/components/games/fx/salon-art';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import type { Entry } from '@/lib/games';
import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { Photo } from '@/components/photo';
import { fonts } from '@/theme';

/**
 * How a game opens another screen (Jeton yükle, Cömertlik). Oyun Merkezi shows the games in a modal, which has to
 * close first or the screen opens underneath it; GamePanel provides that.
 */
export const GameNav = createContext<(href: Href) => void>((href) => router.push(href));
export const useGameNav = () => useContext(GameNav);

/** A phone too short for a game's stage and its controls on one screen (in a room the game is a sheet over the seats). */
export const useShortGame = (entry: Entry) => useWindowDimensions().height < (entry.from === 'room' ? 960 : 700);

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');
/** Balance for tight spots: 99.950, 999K, 1,2M. */
const compact = (n: number) => (n >= 1_000_000 ? `${(Math.floor(n / 100_000) / 10).toLocaleString('tr-TR')}M` : n >= 100_000 ? `${Math.floor(n / 1_000)}K` : fmt(n));
/** A pill at least this wide inside its gold frame (px) has room for every digit of the balance, with its avatar or without. */
const ROOMY = 196;
const ROOMY_BARE = 140;
/** A pill narrower than this (px) gives its avatar's place to the digits. */
const NO_AVATAR = 196;

/** Avatar, coins you can play with (wallet + game balance) and a + that opens the wallet. Navy glass, gold digits. */
/** A frame for the balance pill: Salon's gold LuxFrame, or a game's own keys (Yörünge's Blender plates). */
export type PillFrame = (p: { style?: StyleProp<ViewStyle>; face?: StyleProp<ViewStyle>; children?: ReactNode }) => ReactNode;

export function BalancePill({ shown, Frame = LuxFrame }: { /** Shown instead of the balance while a round's result is still on its way to the screen (the stake taken, the win not yet seen). */ shown?: number | null; Frame?: PillFrame }) {
  const { me, coins, gameCoins } = useApp();
  const go = useGameNav();
  const [pillW, setPillW] = useState(0);
  const avatar = pillW === 0 || pillW >= NO_AVATAR;
  const roomy = pillW >= (avatar ? ROOMY : ROOMY_BARE);
  const value = shown ?? coins + gameCoins;
  // With room, every digit is shown: at "4,9M" a win of a few hundred would not be seen arriving.
  const format = (n: number) => (roomy && n < 100_000_000 ? fmt(n) : compact(n));
  return (
    <Frame style={k.pillFrame} face={k.pill}>
      <View style={k.pillInner} onLayout={(e) => setPillW(e.nativeEvent.layout.width)} accessibilityLabel={`Bakiye ${coins + gameCoins} jeton`}>
      {avatar && <Photo uri={me.avatar} kind="face" style={k.avatar} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={k.name} numberOfLines={1}>
          {me.name}
        </Text>
        <View style={k.coinRow}>
          <Icon3D name="coin" size={14} />
          {/* Rolls to the new balance after a round, so a win is seen arriving. */}
          <RollingNumber value={value} format={format} duration={900} style={[tabular, k.coins]} shrink={0.7} />
        </View>
      </View>
      <Pressable onPress={() => go('/cuzdan')} hitSlop={8} accessibilityLabel="Jeton yükle">
        <Medal size={28}>
          <Ionicons name="add" size={18} color={SALON.goldHi} />
        </Medal>
      </Pressable>
      </View>
    </Frame>
  );
}

// The shared controls' pictures (fx/salon-art, "Ortak kontroller"); each falls back to its icon.
const MINUS = salonArt('dugme-eksi');
const PLUS = salonArt('dugme-arti');
const TURBO = { off: salonArt('dugme-turbo'), on: salonArt('dugme-turbo-acik') };
const AUTO = { off: salonArt('dugme-oto'), on: salonArt('dugme-oto-acik') };

function StepFace({ pic, icon }: { pic: number | undefined; icon: 'remove' | 'add' }) {
  return pic !== undefined ? <Image source={pic} style={k.stepPic} accessibilityIgnoresInvertColors /> : <Ionicons name={icon} size={20} color={SALON.win} />;
}

/** A small round gold medallion (the wallet's +): a bevelled rim round a deep enamel middle. */
function Medal({ size, children }: { size: number; children: ReactNode }) {
  return (
    <LinearGradient colors={['#FFF6D2', '#F2B84A', '#8A4F0E', '#F7D27A']} locations={[0, 0.35, 0.7, 1]} style={[k.medal, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient colors={['#3A2A08', '#1A1004']} style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </LinearGradient>
    </LinearGradient>
  );
}

/** − amount + over the game's allowed bets: the stake in gold digits under a small BAHİS. */
export function BetStepper({ bets, bet, onChange, disabled }: { bets: number[]; bet: number; onChange: (b: number) => void; disabled?: boolean }) {
  const i = bets.indexOf(bet);
  const step = (d: number) => {
    const next = bets[Math.max(0, Math.min(bets.length - 1, i + d))];
    if (next !== bet) {
      tapHaptic();
      // A stake going up clicks a little louder than one coming down.
      playSfx('chip', d > 0 ? 0.8 : 0.55);
      onChange(next);
    }
  };
  const low = disabled || i <= 0;
  const high = disabled || i >= bets.length - 1;
  return (
    <LuxFrame style={[k.stepFrame, disabled && { opacity: 0.6 }]} face={k.stepper}>
      <Pressable onPress={() => step(-1)} disabled={low} style={({ pressed }) => [k.stepBtn, low && { opacity: 0.35 }, pressed && k.stepPressed]} accessibilityLabel="Bahsi azalt">
        <StepFace pic={MINUS} icon="remove" />
      </Pressable>
      <View style={k.betBox} accessibilityLabel={`Bahis ${bet} jeton`}>
        <Text style={k.betHead}>BAHİS</Text>
        <GoldText size={17} glow={false}>
          {fmt(bet)}
        </GoldText>
      </View>
      <Pressable onPress={() => step(1)} disabled={high} style={({ pressed }) => [k.stepBtn, high && { opacity: 0.35 }, pressed && k.stepPressed]} accessibilityLabel="Bahsi artır">
        <StepFace pic={PLUS} icon="add" />
      </Pressable>
    </LuxFrame>
  );
}

/** The balance and the stake on one row, as every Salon game shows them. */
export function WalletRow({ held, bets, bet, onBet, disabled }: { held: number | null; bets: number[]; bet: number; onBet: (b: number) => void; disabled?: boolean }) {
  return (
    <View style={k.row}>
      <BalancePill shown={held} />
      <BetStepper bets={bets} bet={bet} onChange={onBet} disabled={disabled} />
    </View>
  );
}

/**
 * The controls under a reel game, one layout for all of them: the balance and the stake on a row, then the round
 * action button with Turbo and Oto either side. The balance takes the row's free width, so it is read in full on a
 * 360 px phone (squeezed beside the spin button it had 40 px and was cut to "4…").
 */
export function SpinControls({
  held,
  bets,
  bet,
  onBet,
  busy,
  turbo,
  onTurbo,
  auto,
  autoSpins,
  onAuto,
  onSpin,
  look,
  art,
  caption,
  short,
}: {
  /** The balance with the stake taken while the reels run (BalancePill's `shown`). */
  held: number | null;
  bets: number[];
  bet: number;
  onBet: (b: number) => void;
  busy: boolean;
  turbo: boolean;
  onTurbo: () => void;
  /** Spins left on Oto, or null while it is off. */
  auto: number | null;
  autoSpins: number;
  onAuto: () => void;
  onSpin: () => void;
  /** The action button's core in the game's own colour (its ring is always gold). */
  look?: ActionLook;
  /** The spin button as a picture (a skinned machine's, fx/slot-skin). */
  art?: number;
  /** A quiet line under the buttons (lines × line stake, the most a round pays). */
  caption?: string;
  /** useShortGame: a smaller action button, so it ends above the fold. */
  short?: boolean;
}) {
  // A single spin is on its way; Oto's rounds can still be stopped.
  const waiting = busy && auto === null;
  return (
    <View style={{ gap: SALON.row }}>
      <WalletRow held={held} bets={bets} bet={bet} onBet={onBet} disabled={busy} />
      <View style={k.row}>
        <SideButton
          onPress={() => {
            tapHaptic();
            onTurbo();
          }}
          on={turbo}
          icon="flash"
          pic={turbo ? TURBO.on : TURBO.off}
          label="TURBO"
          a11y={turbo ? 'Turbo kapat' : 'Turbo aç'}
        />
        <ActionButton onPress={auto !== null ? onAuto : onSpin} disabled={waiting} busy={busy} count={auto} look={look} art={art} size={short ? 68 : undefined} label={auto !== null ? 'Otomatik çevirmeyi durdur' : `Çevir, ${bet} jeton`} />
        <SideButton onPress={onAuto} on={auto !== null} disabled={waiting} icon={auto !== null ? 'stop' : 'repeat'} pic={auto !== null ? AUTO.on : AUTO.off} label={auto !== null ? 'DUR' : 'OTO'} a11y={auto !== null ? 'Otomatik çevirmeyi durdur' : `${autoSpins} kez otomatik çevir`} />
      </View>
      {!!caption && <Text style={k.caption}>{caption}</Text>}
    </View>
  );
}

/**
 * Under a game's controls: one quiet line that opens the game's "?" sheet (how it is played, the game balance).
 * The long notes used to stand here in full under every game; a game with its own "?" button passes its paytable
 * to GameInfoSheet instead and doesn't need this.
 */
export function GameBalanceNote({ rules, title = 'Kurallar' }: { rules: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={k.noteRow} onPress={() => setOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Kurallar ve oyun bakiyesi">
        <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.6)" />
        <Text style={k.note}>Kurallar ve oyun bakiyesi</Text>
      </Pressable>
      <GameInfoSheet visible={open} onClose={() => setOpen(false)} title={title} rules={rules} />
    </>
  );
}

const k = StyleSheet.create({
  pillFrame: { flex: 1, height: SALON.control },
  pill: { justifyContent: 'center' },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 7 },
  medal: { alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' },
  avatar: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: '#F2B84A' },
  name: { color: '#fff', fontWeight: '800', fontSize: 12.5, lineHeight: 16 },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coins: { color: SALON.win, fontSize: 14, lineHeight: 18, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SALON.row },
  caption: { color: SALON.dim, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: -4, fontVariant: ['tabular-nums'] },
  stepFrame: { height: SALON.control },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepPic: { width: 34, height: 34 },
  stepBtn: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: 'rgba(246,189,96,0.22)' },
  betBox: { minWidth: 66, alignItems: 'center', paddingHorizontal: 4 },
  betHead: { color: SALON.goldHi, fontFamily: fonts.casinoBold, fontSize: 9.5, lineHeight: 11, letterSpacing: 1.6, opacity: 0.8 },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
});
