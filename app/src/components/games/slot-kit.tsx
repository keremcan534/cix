// Shared controls of every Oyun Salonu game, drawn in the shell's look (fx/salon): the balance pill, the bet stepper,
// the wallet row, the reel games' spin controls and the round helpers. Rounds always go through playCasino
// (lib/games); these only show them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { createContext, useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { RollingNumber } from '@/components/fx/rolling-number';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { ActionButton, SALON, SideButton, tabular, type ActionLook } from '@/components/games/fx/salon';
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
const ROOMY = 172;

/** Avatar, coins you can play with (wallet + game balance) and a + that opens the wallet. Navy glass, gold digits. */
export function BalancePill({ shown }: { /** Shown instead of the balance while a round's result is still on its way to the screen (the stake taken, the win not yet seen). */ shown?: number | null }) {
  const { me, coins, gameCoins } = useApp();
  const go = useGameNav();
  const [roomy, setRoomy] = useState(false);
  const value = shown ?? coins + gameCoins;
  // With room, every digit is shown: at "4,9M" a win of a few hundred would not be seen arriving.
  const format = (n: number) => (roomy && n < 100_000_000 ? fmt(n) : compact(n));
  return (
    <LinearGradient colors={SALON.glass} style={k.pill} onLayout={(e) => setRoomy(e.nativeEvent.layout.width >= ROOMY)} accessibilityLabel={`Bakiye ${coins + gameCoins} jeton`}>
      <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={k.gloss} pointerEvents="none" />
      <Photo uri={me.avatar} kind="face" style={k.avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={k.name} numberOfLines={1}>
          {me.name}
        </Text>
        <View style={k.coinRow}>
          <Icon3D name="coin" size={14} />
          {/* Rolls to the new balance after a round, so a win is seen arriving. */}
          <RollingNumber value={value} format={format} duration={900} style={[tabular, k.coins]} numberOfLines={1} />
        </View>
      </View>
      <Pressable onPress={() => go('/cuzdan')} hitSlop={8} accessibilityLabel="Jeton yükle">
        <Ionicons name="add-circle" size={26} color={SALON.gold} />
      </Pressable>
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
      onChange(next);
    }
  };
  const low = disabled || i <= 0;
  const high = disabled || i >= bets.length - 1;
  return (
    <LinearGradient colors={SALON.glass} style={[k.stepper, disabled && { opacity: 0.6 }]}>
      <Pressable onPress={() => step(-1)} disabled={low} style={({ pressed }) => [k.stepBtn, low && { opacity: 0.35 }, pressed && k.stepPressed]} accessibilityLabel="Bahsi azalt">
        <Ionicons name="remove" size={20} color={SALON.win} />
      </Pressable>
      <View style={k.betBox}>
        <Text style={k.betHead}>BAHİS</Text>
        <Text style={[tabular, k.bet]} accessibilityLabel={`Bahis ${bet} jeton`} numberOfLines={1}>
          {fmt(bet)}
        </Text>
      </View>
      <Pressable onPress={() => step(1)} disabled={high} style={({ pressed }) => [k.stepBtn, high && { opacity: 0.35 }, pressed && k.stepPressed]} accessibilityLabel="Bahsi artır">
        <Ionicons name="add" size={20} color={SALON.win} />
      </Pressable>
    </LinearGradient>
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
          label="TURBO"
          a11y={turbo ? 'Turbo kapat' : 'Turbo aç'}
        />
        <ActionButton onPress={auto !== null ? onAuto : onSpin} disabled={waiting} busy={busy} count={auto} look={look} art={art} label={auto !== null ? 'Otomatik çevirmeyi durdur' : `Çevir, ${bet} jeton`} />
        <SideButton onPress={onAuto} on={auto !== null} disabled={waiting} icon={auto !== null ? 'stop' : 'repeat'} label={auto !== null ? 'DUR' : 'OTO'} a11y={auto !== null ? 'Otomatik çevirmeyi durdur' : `${autoSpins} kez otomatik çevir`} />
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: SALON.controlRadius, paddingHorizontal: 8, height: SALON.control, flex: 1, borderWidth: 1, borderColor: SALON.glassRim, overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  avatar: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(246,189,96,0.5)' },
  name: { color: '#fff', fontWeight: '800', fontSize: 12.5, lineHeight: 16 },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coins: { color: SALON.win, fontSize: 14, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SALON.row },
  caption: { color: SALON.dim, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: -4, fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', alignItems: 'center', height: SALON.control, borderRadius: SALON.controlRadius, borderWidth: 1, borderColor: SALON.glassRim, overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' },
  stepBtn: { width: 40, height: SALON.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  stepPressed: { backgroundColor: 'rgba(246,189,96,0.22)' },
  betBox: { minWidth: 66, alignItems: 'center', paddingHorizontal: 4 },
  betHead: { color: SALON.dim, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 1.4 },
  bet: { color: SALON.win, fontSize: 18, lineHeight: 22 },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
});
