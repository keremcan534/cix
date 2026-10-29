// Lucky 77: the fruit wheel. Pick Karpuz (2x), 77 (8x) or Elma (2x), set the bet and spin; the round is decided by
// playCasino (lib/games) before the wheel moves, and the wheel only lands on the drawn slice.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt } from '@/components/games/slot-kit';
import { LUCKY_NAMES, LUCKY_PAYS, LUCKY_WHEEL, type LuckySlice } from '@/lib/casino-odds';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

const FACE: Record<LuckySlice, string> = { seven: '77', apple: '🍎', melon: '🍉', lemon: '🍋', grape: '🍇' };
const SLICE = 360 / LUCKY_WHEEL.length;
const SIZE = 250;
const PICKS: LuckySlice[] = ['melon', 'seven', 'apple'];

export function Lucky77Player({ entry }: { entry: Entry }) {
  const { wealthLevel } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'slot')!;
  const [bet, setBet] = useState(game.bets[1] ?? game.bets[0]);
  const [pick, setPick] = useState<LuckySlice>('seven');
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [msg, setMsg] = useState<{ text: string; win?: boolean } | null>(null);
  const [last, setLast] = useState<LuckySlice[]>([]);
  const [placed, setPlaced] = useState<Partial<Record<LuckySlice, number>>>({});
  const [angle] = useState(() => new Animated.Value(0));
  const turns = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const spin = () => {
    if (busy) return;
    const r = playCasino('slot', bet, pick, entry, newRequestId());
    if (!r.ok) {
      setMsg({ text: r.reason });
      errorHaptic();
      return;
    }
    pressHaptic();
    setBusy(true);
    setMsg(null);
    setPlaced({ [pick]: bet });
    const slice = Number(r.outcome.display[0]);
    // Five more turns, then land the drawn slice under the top pointer.
    turns.current += 5;
    const target = turns.current * 360 + (360 - slice * SLICE);
    Animated.timing(angle, { toValue: target, duration: 3200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      if (!alive.current) return;
      turns.current = Math.ceil(target / 360);
      const hit = LUCKY_WHEEL[slice];
      setRound((n) => n + 1);
      setLast((l) => [hit, ...l].slice(0, 8));
      const payout = r.row.payout;
      setMsg(payout > 0 ? { text: `${LUCKY_NAMES[hit]}! +${fmt(payout)} jeton`, win: true } : { text: `${LUCKY_NAMES[hit]} geldi · bu tur kazanç yok` });
      if (payout > 0) successHaptic();
      setBusy(false);
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <LinearGradient colors={['#2B1065', '#4C1D95', '#1E0B45']} style={s.stage}>
        <View style={s.topRow}>
          <Text style={s.round}>Tur: {round}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {last.map((x, i) => (
              <Text key={i} style={[s.lastChip, i === 0 && { borderColor: '#FACC15' }]}>
                {FACE[x]}
              </Text>
            ))}
          </View>
        </View>
        <View style={s.wheelWrap}>
          <Text style={s.pointer}>▼</Text>
          <LinearGradient colors={['#FDE68A', '#B45309', '#FDE68A']} style={s.rim}>
            <Animated.View
              style={[s.wheel, { transform: [{ rotate: angle.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }]}
              accessibilityLabel="Meyve çarkı"
            >
              {LUCKY_WHEEL.map((x, i) => (
                <View key={i} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${i * SLICE}deg` }] }]}>
                  <View style={[s.slice, x === 'seven' && s.sliceSeven]}>
                    <Text style={x === 'seven' ? s.seven : s.fruit}>{FACE[x]}</Text>
                  </View>
                </View>
              ))}
            </Animated.View>
            <View style={s.hub} pointerEvents="none">
              <Text style={s.hubText}>{round}</Text>
            </View>
          </LinearGradient>
        </View>
        <View style={[s.msg, msg?.win && { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.18)' }]} accessibilityLiveRegion="polite">
          <Text style={[s.msgText, msg?.win && { color: '#FDE68A' }]}>{busy ? 'Çark dönüyor…' : (msg?.text ?? 'Bir meyve seç ve çevir')}</Text>
        </View>
        <View style={s.board}>
          {PICKS.map((p) => (
            <Pressable
              key={p}
              disabled={busy}
              onPress={() => {
                tapHaptic();
                setPick(p);
              }}
              style={[s.card, pick === p && s.cardOn]}
              accessibilityLabel={`${LUCKY_NAMES[p]} seç, ${LUCKY_PAYS[p]} kat`}
            >
              <Text style={s.cardTop}>{fmt(placed[p] ?? 0)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={p === 'seven' ? s.cardSeven : s.cardFruit}>{FACE[p]}</Text>
                <Text style={s.mult}>x{LUCKY_PAYS[p]}</Text>
              </View>
              <Text style={s.cardBottom}>{pick === p ? `Seçili · ${fmt(bet)}` : 'Seç'}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BalancePill />
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} />
      </View>
      <Pressable onPress={spin} disabled={busy} style={({ pressed }) => [s.spin, (busy || pressed) && { opacity: 0.7 }]} accessibilityLabel={`Çevir, ${LUCKY_NAMES[pick]}, ${bet} jeton`}>
        <LinearGradient colors={['#F472B6', '#A21CAF']} style={s.spinInner}>
          <Text style={s.spinText}>{busy ? '…' : `ÇEVİR · ${LUCKY_NAMES[pick]} · ${fmt(bet)}`}</Text>
        </LinearGradient>
      </Pressable>
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { borderRadius: 22, padding: 12, gap: 12, alignItems: 'center' },
  topRow: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between' },
  round: { color: '#E9D5FF', fontWeight: '800' },
  lastChip: { fontSize: 13, paddingHorizontal: 4, borderRadius: 6, borderWidth: 1, borderColor: 'transparent', color: '#fff', fontWeight: '900', overflow: 'hidden' },
  wheelWrap: { alignItems: 'center' },
  pointer: { color: '#FACC15', fontSize: 30, marginBottom: -14, zIndex: 2, textShadowColor: '#000', textShadowRadius: 4 },
  rim: { width: SIZE + 16, height: SIZE + 16, borderRadius: (SIZE + 16) / 2, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: '#1D4ED8', borderWidth: 3, borderColor: '#60A5FA', overflow: 'hidden' },
  slice: { marginTop: 6, width: 34, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  sliceSeven: { backgroundColor: '#DB2777' },
  fruit: { fontSize: 24 },
  seven: { fontSize: 18, fontWeight: '900', fontStyle: 'italic', color: '#FDE68A', textShadowColor: '#7C3AED', textShadowRadius: 3 },
  hub: { position: 'absolute', top: (SIZE + 16) / 2 - 34, left: (SIZE + 16) / 2 - 34, width: 68, height: 68, borderRadius: 34, backgroundColor: '#312E81', borderWidth: 3, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  hubText: { color: '#A3E635', fontWeight: '900', fontSize: 20 },
  msg: { alignSelf: 'stretch', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 8 },
  msgText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  board: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  card: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14, borderWidth: 2, borderColor: '#A16207', backgroundColor: '#86198F' },
  cardOn: { borderColor: '#FACC15', backgroundColor: '#A21CAF' },
  cardTop: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cardFruit: { fontSize: 30 },
  cardSeven: { fontSize: 24, fontWeight: '900', fontStyle: 'italic', color: '#FDE68A', textShadowColor: '#7C3AED', textShadowRadius: 3 },
  mult: { color: '#FACC15', fontWeight: '900', fontSize: 20 },
  cardBottom: { color: '#FDE68A', fontWeight: '800', fontSize: 11 },
  spin: { borderRadius: 999, overflow: 'hidden' },
  spinInner: { paddingVertical: 15, alignItems: 'center' },
  spinText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
});
