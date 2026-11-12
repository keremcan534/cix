// Shared pieces of the launch casino games (Gece Yarısı Çarkı, Hazine Kulesi, Yıldız Avı, Balon Avı): the balance pill, the
// bet stepper and the round helpers. Rounds always go through playCasino (lib/games); these only show them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RollingNumber } from '@/components/fx/rolling-number';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { Text } from '@/components/text';
import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { Photo } from '@/components/photo';

/**
 * How a game opens another screen (Jeton yükle, Cömertlik). Oyun Merkezi shows the games in a modal, which has to
 * close first or the screen opens underneath it; GamePanel provides that.
 */
export const GameNav = createContext<(href: Href) => void>((href) => router.push(href));
export const useGameNav = () => useContext(GameNav);

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');
/** Balance for tight spots: 99.950, 999K, 1,2M. */
const compact = (n: number) => (n >= 1_000_000 ? `${(Math.floor(n / 100_000) / 10).toLocaleString('tr-TR')}M` : n >= 100_000 ? `${Math.floor(n / 1_000)}K` : fmt(n));
/** A pill at least this wide (px) has room for every digit of the balance. */
const ROOMY = 160;

/** Avatar, coins you can play with (wallet + game balance) and a + that opens the wallet. */
export function BalancePill({ tint = '#2A0F3D', shown }: { tint?: string; /** Shown instead of the balance while a round's result is still on its way to the screen (the stake taken, the win not yet seen). */ shown?: number | null }) {
  const { me, coins, gameCoins } = useApp();
  const go = useGameNav();
  const [roomy, setRoomy] = useState(false);
  const value = shown ?? coins + gameCoins;
  // With room, every digit is shown: at "4,9M" a win of a few hundred would not be seen arriving.
  const format = (n: number) => `🪙 ${roomy && n < 100_000_000 ? fmt(n) : compact(n)}`;
  return (
    <View style={[k.pill, { backgroundColor: tint }]} onLayout={(e) => setRoomy(e.nativeEvent.layout.width >= ROOMY)} accessibilityLabel={`Bakiye ${coins + gameCoins} jeton`}>
      <Photo uri={me.avatar} kind="face" style={k.avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={k.name} numberOfLines={1}>
          {me.name}
        </Text>
        {/* Rolls to the new balance after a round, so a win is seen arriving. */}
        <RollingNumber value={value} format={format} duration={900} style={k.coins} numberOfLines={1} />
      </View>
      <Pressable onPress={() => go('/cuzdan')} hitSlop={8} accessibilityLabel="Jeton yükle">
        <Ionicons name="add-circle" size={24} color="#FACC15" />
      </Pressable>
    </View>
  );
}

/** − amount + over the game's allowed bets. */
export function BetStepper({ bets, bet, onChange, disabled, tint = '#3B0F4F' }: { bets: number[]; bet: number; onChange: (b: number) => void; disabled?: boolean; tint?: string }) {
  const i = bets.indexOf(bet);
  const step = (d: number) => {
    const next = bets[Math.max(0, Math.min(bets.length - 1, i + d))];
    if (next !== bet) {
      tapHaptic();
      onChange(next);
    }
  };
  return (
    <View style={[k.stepper, { backgroundColor: tint }, disabled && { opacity: 0.6 }]}>
      <Pressable onPress={() => step(-1)} disabled={disabled || i <= 0} style={[k.stepBtn, i <= 0 && { opacity: 0.4 }]} accessibilityLabel="Bahsi azalt">
        <Ionicons name="remove" size={22} color="#fff" />
      </Pressable>
      <Text style={k.bet} accessibilityLabel={`Bahis ${bet} jeton`}>
        {fmt(bet)}
      </Text>
      <Pressable onPress={() => step(1)} disabled={disabled || i >= bets.length - 1} style={[k.stepBtn, i >= bets.length - 1 && { opacity: 0.4 }]} accessibilityLabel="Bahsi artır">
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

/**
 * The controls under a reel game, one layout for all of them: the balance and the stake on a row, then the spin
 * button with Turbo and Oto either side. The balance takes the row's free width, so it is read in full on a 360 px
 * phone (squeezed beside the spin button it had 40 px and was cut to "🪙 4…").
 */
export function SpinControls({
  tint,
  stepTint = tint,
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
  spin,
  side,
  caption,
}: {
  /** The dark colour behind the balance, and behind the stake unless `stepTint` is given. */
  tint: string;
  stepTint?: string;
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
  /** The round button's face in the game's own colours; pressing is handled here. */
  spin: ReactNode;
  /** Turbo and Oto: resting and lit colours. */
  side: { bg: string; border: string; ink: string; onBg: string; onBorder: string; onInk?: string };
  /** A quiet line under the buttons (lines × line stake, the most a round pays). */
  caption?: string;
}) {
  // A single spin is on its way; Oto's rounds can still be stopped.
  const waiting = busy && auto === null;
  const box = (on: boolean) => [k.side, { backgroundColor: on ? side.onBg : side.bg, borderColor: on ? side.onBorder : side.border }];
  const ink = (on: boolean) => ({ color: on ? (side.onInk ?? side.ink) : side.ink });
  return (
    <View style={{ gap: 10 }}>
      <View style={k.row}>
        <BalancePill tint={tint} shown={held} />
        <BetStepper bets={bets} bet={bet} onChange={onBet} disabled={busy} tint={stepTint} />
      </View>
      <View style={k.row}>
        <Pressable
          onPress={() => {
            tapHaptic();
            onTurbo();
          }}
          style={box(turbo)}
          accessibilityRole="button"
          accessibilityState={{ selected: turbo }}
          accessibilityLabel={turbo ? 'Turbo kapat' : 'Turbo aç'}
        >
          <Text style={[k.sideText, ink(turbo)]}>⚡ TURBO</Text>
        </Pressable>
        <Pressable onPress={auto !== null ? onAuto : onSpin} disabled={waiting} style={waiting && { opacity: 0.75 }} accessibilityRole="button" accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `Çevir, ${bet} jeton`}>
          {spin}
        </Pressable>
        <Pressable onPress={onAuto} disabled={waiting} style={box(auto !== null)} accessibilityRole="button" accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${autoSpins} kez otomatik çevir`}>
          <Text style={[k.sideText, ink(auto !== null)]}>{auto !== null ? 'DUR' : 'OTO'}</Text>
        </Pressable>
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6, flex: 1, borderWidth: 1, borderColor: 'rgba(250,204,21,0.35)' },
  avatar: { width: 28, height: 28, borderRadius: 7 },
  name: { color: '#fff', fontWeight: '800', fontSize: 13 },
  coins: { color: '#FDE68A', fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  side: { flex: 1, height: 48, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontWeight: '900', fontSize: 14 },
  caption: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: -4 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  stepBtn: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  bet: { color: '#FDE68A', fontWeight: '900', fontSize: 20, minWidth: 64, textAlign: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
});
