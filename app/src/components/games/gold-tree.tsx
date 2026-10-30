// Altın Ağacı: 3 reels, the middle row pays by combination (lib/gold-tree). playCasino (lib/games) settles the round
// before the reels move; they only replay outcome.tree. Oto stops at a big win, the loss limit or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { TREE_LABEL, TREE_PAYS, TREE_STRIPS, treeWindow, type TreeSym } from '@/lib/gold-tree';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
const COIN: Partial<Record<TreeSym, [string, string]>> = { red: ['#F87171', '#B91C1C'], blue: ['#60A5FA', '#1D4ED8'], green: ['#4ADE80', '#15803D'] };

function TreeCell({ sym, dim }: { sym: TreeSym; dim?: boolean }) {
  const c = COIN[sym];
  if (c)
    return (
      <LinearGradient colors={c} style={[t.coin, dim && { opacity: 0.45 }]}>
        <View style={t.coinHole} />
      </LinearGradient>
    );
  return <Text style={[{ fontSize: 46 }, dim && { opacity: 0.45 }]}>{TREE_LABEL[sym]}</Text>;
}

export function GoldTreePlayer({ entry }: { entry: Entry }) {
  const { wealthLevel } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'goldtree')!;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [grid, setGrid] = useState<TreeSym[][]>(() => treeWindow([0, 3, 6]));
  const [spinning, setSpinning] = useState([false, false, false]);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' }>({ text: 'BOL ŞANS' });
  const [hit, setHit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const anySpin = spinning.some(Boolean);
  useEffect(
    () => () => {
      alive.current = false;
      stopAuto.current = true;
    },
    [],
  );
  useEffect(() => {
    if (!anySpin) return;
    const id = setInterval(() => setTick((n) => n + 1), 70);
    return () => clearInterval(id);
  }, [anySpin]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const r = playCasino('goldtree', bet, '', entry, newRequestId());
    if (!r.ok) {
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const sp = r.outcome.tree!;
    setHit(null);
    setStatus({ text: 'BOL ŞANS' });
    setSpinning([true, true, true]);
    await sleep(turbo ? 250 : 700);
    for (let reel = 0; reel < 3; reel++) {
      if (!alive.current) return null;
      setGrid((g) => g.map((c, i) => (i === reel ? sp.grid[reel] : c)));
      setSpinning((v) => v.map((x, i) => (i === reel ? false : x)));
      await sleep(turbo ? 80 : 260);
    }
    const payout = r.row.payout;
    if (sp.win) {
      setHit(sp.win.name);
      setStatus({ text: `${sp.win.name} · +${fmt(payout)}`, tone: 'win' });
      successHaptic();
    }
    return { net: payout - bet, stop: payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
  };
  const play = async () => {
    if (busy) return;
    setBusy(true);
    await spinOnce();
    if (alive.current) setBusy(false);
  };
  const toggleAuto = async () => {
    if (auto !== null) {
      stopAuto.current = true;
      return;
    }
    if (busy) return;
    setBusy(true);
    stopAuto.current = false;
    let net = 0;
    let note = 'Oto bitti';
    for (let left = AUTO_SPINS; left > 0; left--) {
      if (stopAuto.current) {
        note = 'Oto durduruldu';
        break;
      }
      setAuto(left);
      const d = await spinOnce();
      if (!alive.current) return;
      if (!d) {
        note = 'Oto durdu: tur kabul edilmedi';
        break;
      }
      net += d.net;
      if (d.stop) {
        note = `Oto durdu: ${d.stop}`;
        break;
      }
      if (-net >= bet * AUTO_LOSS) {
        note = `Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)})`;
        break;
      }
      await sleep(turbo ? 150 : 400);
    }
    setAuto(null);
    setBusy(false);
    setStatus({ text: `${note} · net ${net >= 0 ? '+' : ''}${fmt(net)}`, tone: net > 0 ? 'win' : undefined });
  };

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={['#FBCFE8', '#FDE68A', '#166534']} style={t.stage}>
        <Text style={t.tree}>🌳</Text>
        <Text style={t.title}>ALTIN AĞACI</Text>
        <View style={t.paytable}>
          {TREE_PAYS.map((p) => (
            <View key={p.name} style={[t.pay, hit === p.name && t.payOn]}>
              <Text style={t.payName}>{p.name}</Text>
              <Text style={t.payVal}>{p.pay}</Text>
            </View>
          ))}
        </View>
        <View style={t.reels} accessibilityLabel={`Orta çizgi: ${grid.map((c) => c[1]).join(', ')}`}>
          {grid.map((col, reel) => (
            <View key={reel} style={t.reel}>
              {col.map((sym, row) => {
                const n = TREE_STRIPS[reel].length;
                const shown = spinning[reel] ? TREE_STRIPS[reel][(((reel * 4 - tick + row) % n) + n) % n] : sym;
                return (
                  <View key={row} style={t.cell}>
                    <TreeCell sym={shown} dim={spinning[reel]} />
                  </View>
                );
              })}
            </View>
          ))}
          <View style={t.line} pointerEvents="none" />
        </View>
        <View style={[t.status, status.tone === 'win' && { backgroundColor: '#15803D' }]} accessibilityLiveRegion="polite">
          <Text style={[t.statusText, status.tone === 'err' && { fontSize: 13 }]}>{status.text}</Text>
        </View>
      </LinearGradient>
      <View style={{ alignItems: 'center' }}>
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#14532D" />
      </View>
      <View style={t.controls}>
        <BalancePill tint="#14532D" />
        <Pressable onPress={play} disabled={busy} style={busy && { opacity: 0.6 }} accessibilityLabel={`Çevir, ${bet} jeton`}>
          <LinearGradient colors={['#FDE68A', '#DC2626']} style={t.spin}>
            <Ionicons name="sync" size={36} color="#FDE68A" />
          </LinearGradient>
        </Pressable>
        <View style={{ gap: 6, flex: 1 }}>
          <Pressable
            onPress={() => {
              tapHaptic();
              setTurbo((v) => !v);
            }}
            style={[t.side, turbo && t.sideOn]}
            accessibilityLabel={turbo ? 'Turbo kapat' : 'Turbo aç'}
          >
            <Text style={t.sideText}>⚡ TURBO</Text>
          </Pressable>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[t.side, auto !== null && t.sideOn]} accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            <Text style={t.sideText}>{auto !== null ? `Dur · ${auto}` : 'OTO'}</Text>
          </Pressable>
        </View>
      </View>
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const t = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center' },
  tree: { fontSize: 44, marginBottom: -8 },
  title: { color: '#FACC15', fontSize: 28, fontWeight: '900', textShadowColor: '#14532D', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  paytable: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', backgroundColor: '#166534', borderRadius: 12, padding: 6, borderWidth: 2, borderColor: '#FACC15' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  payOn: { backgroundColor: 'rgba(250,204,21,0.35)' },
  payName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  payVal: { color: '#FDE68A', fontWeight: '900', fontSize: 16 },
  reels: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', backgroundColor: '#14532D', borderRadius: 14, padding: 5, borderWidth: 3, borderColor: '#FACC15' },
  reel: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, overflow: 'hidden' },
  cell: { height: 74, alignItems: 'center', justifyContent: 'center' },
  coin: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FACC15' },
  coinHole: { width: 16, height: 16, backgroundColor: '#FEF3C7', borderWidth: 2, borderColor: '#92400E' },
  line: { position: 'absolute', left: 0, right: 0, top: 5 + 74 + 37, height: 3, backgroundColor: '#EA580C' },
  status: { alignSelf: 'stretch', borderRadius: 10, backgroundColor: '#0F766E', borderWidth: 2, borderColor: '#FACC15', paddingVertical: 6 },
  statusText: { color: '#FDE68A', fontWeight: '900', fontSize: 19, textAlign: 'center', letterSpacing: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spin: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FDE68A' },
  side: { borderRadius: 14, borderWidth: 2, borderColor: '#FACC15', backgroundColor: '#CA8A04', paddingVertical: 9, alignItems: 'center' },
  sideOn: { backgroundColor: '#B91C1C' },
  sideText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
