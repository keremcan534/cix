// Bereket Ağacı: 3 reels, the middle row pays by combination (lib/gold-tree). playCasino (lib/games) settles the round
// before the reels come to rest; they (components/games/fx/reel) only replay outcome.tree, the last one waited for
// when the first two already match. Oto stops at a big win, the loss limit or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { Reel, type ReelHandle } from '@/components/games/fx/reel';
import { useWinFx } from '@/components/games/fx/win-fx';
import { SpinControls, fmt, sleep } from '@/components/games/slot-kit';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { playRound } from '@/lib/live/casino';
import { TREE_LABEL, TREE_OPENING, TREE_PAYS, TREE_STRIPS, treeWindow, type TreeSym } from '@/lib/gold-tree';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { REEL_PACE, reelRun } from '@/lib/reel-plan';
import { winTierOf } from '@/lib/win-tier';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
const COIN: Partial<Record<TreeSym, [string, string]>> = { red: ['#F87171', '#B91C1C'], blue: ['#60A5FA', '#1D4ED8'], green: ['#4ADE80', '#15803D'] };

function TreeCell({ sym }: { sym: TreeSym }) {
  const c = COIN[sym];
  if (c)
    return (
      <LinearGradient colors={c} style={t.coin}>
        <View style={t.coinHole} />
      </LinearGradient>
    );
  // An empty stop: a faint bar, so a reel that stops between symbols still reads as a reel.
  if (sym === 'blank') return <View style={t.blank} />;
  return <Text style={{ fontSize: 46 }}>{TREE_LABEL[sym]}</Text>;
}


/** A reel's symbol and the space under it (px): the pay line runs through the middle row. */
const CELL = 70;
const GAP = 4;

export function GoldTreePlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, settings, coins, gameCoins } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'goldtree')!;
  const still = settings.reduceMotion;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [opening] = useState<TreeSym[][]>(() => treeWindow(TREE_OPENING));
  const [grid, setGrid] = useState(opening);
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' }>({ text: 'BOL ŞANS' });
  const [hit, setHit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // The balance with the stake taken, while the reels run; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const handles = useRef<(ReelHandle | null)[]>([]);
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const [pulse] = useState(() => new Animated.Value(0));
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const win = useWinFx();
  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'stop', 'win', 'coin']);
    return () => {
      alive.current = false;
      stopAuto.current = true;
      beat.current?.stop();
    };
  }, []);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const pace = REEL_PACE[turbo ? 'turbo' : 'normal'];
    beat.current?.stop();
    pulse.setValue(0);
    setHit(null);
    setWaiting(false);
    setStatus({ text: 'BOL ŞANS' });
    setHeld(balance.current - bet);
    pressHaptic();
    playSfx('spin', 0.7);
    let answered = false;
    const asked = playRound('goldtree', bet, '', entry).then((r) => {
      answered = true;
      return r;
    });
    // The demo answers at once; a server needs a moment, and the reels run meanwhile.
    await sleep(30);
    if (!alive.current) return null;
    if (!answered && !still) handles.current.forEach((h) => h?.spin(pace));
    const r = await asked;
    if (!alive.current) return null;
    if (!r.ok) {
      await Promise.all(handles.current.map((h, i) => h?.land(grid[i], reelRun(i, CELL + GAP, 3, REEL_PACE.turbo), REEL_PACE.turbo, still)));
      if (!alive.current) return null;
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    const sp = r.outcome.tree!;
    // The first two already match on the pay line (two trees, two coins of a colour): the third is waited for.
    const [a, b] = [sp.grid[0][1], sp.grid[1][1]];
    const wait = !turbo && !still && a === b && (a === 'tree' || a in COIN);
    await Promise.all(
      sp.grid.map((col, i) =>
        handles.current[i]?.land(col, reelRun(i, CELL + GAP, 3, pace, wait && i === 2 ? 1 : 0), pace, still).then(() => {
          if (!alive.current) return;
          playSfx('stop', 0.75);
          tapHaptic();
          if (wait && i === 1) {
            setWaiting(true);
            playSfx('tease', 0.6);
          }
        }),
      ),
    );
    if (!alive.current) return null;
    setGrid(sp.grid);
    setWaiting(false);
    setHeld(null);
    const payout = r.row.payout;
    if (sp.win) {
      setHit(sp.win.name);
      setStatus({ text: `${sp.win.name} · +${fmt(payout)}`, tone: 'win' });
      if (!still) {
        beat.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        beat.current.start();
      }
      const seen = win.celebrate({ amount: payout, bet });
      if (!(turbo && winTierOf(payout, bet) === 'small')) await seen;
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
        <View style={t.iconRow}>
          <InfoButton onPress={() => setInfo(true)} tint="#FACC15" />
        </View>
        <Text style={t.tree}>🌳</Text>
        <Text style={t.title} accessibilityRole="header">
          BEREKET AĞACI
        </Text>
        <View style={t.paytable}>
          {TREE_PAYS.map((p) => (
            <View key={p.name} style={[t.pay, hit === p.name && t.payOn]}>
              <Text style={t.payName}>{p.name}</Text>
              <Text style={t.payVal}>{p.pay}</Text>
            </View>
          ))}
        </View>
        <View style={t.reels} accessibilityLabel={`Orta çizgi: ${grid.map((c) => c[1]).join(', ')}`}>
          {opening.map((col, reel) => (
            <View key={reel} style={[t.reel, waiting && reel === 2 && t.reelWait]}>
              <Reel
                ref={(h) => {
                  handles.current[reel] = h;
                }}
                symbols={col}
                strip={TREE_STRIPS[reel]}
                cell={CELL}
                gap={GAP}
                pulse={pulse}
                dim={!!hit}
                // Only the middle row pays.
                lit={[false, !!hit, false]}
                shade="rgba(15,23,42,0.28)"
                render={(sym) => <TreeCell sym={sym as TreeSym} />}
              />
            </View>
          ))}
          <View style={t.line} pointerEvents="none" />
        </View>
        <View style={[t.status, status.tone === 'win' && { backgroundColor: '#15803D' }]} accessibilityLiveRegion="polite">
          <Text style={[t.statusText, status.tone === 'err' && { fontSize: 13 }]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
        {win.layer}
      </LinearGradient>
      <SpinControls
        tint="#14532D"
        held={held}
        bets={game.bets}
        bet={bet}
        onBet={setBet}
        busy={busy}
        turbo={turbo}
        onTurbo={() => setTurbo((v) => !v)}
        auto={auto}
        autoSpins={AUTO_SPINS}
        onAuto={toggleAuto}
        onSpin={play}
        side={{ bg: '#CA8A04', border: '#FACC15', ink: '#fff', onBg: '#B91C1C', onBorder: '#FACC15' }}
        spin={
          <LinearGradient colors={['#FDE68A', '#DC2626']} style={t.spin}>
            {auto !== null ? <Text style={t.autoLeft}>{auto}</Text> : <Ionicons name="sync" size={36} color="#FDE68A" />}
          </LinearGradient>
        }
      />
      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={{ gap: 6 }}>
          <Text style={t.infoHead}>Orta çizgi öder · bahsin katı</Text>
          {TREE_PAYS.map((p) => (
            <View key={p.name} style={t.infoRow}>
              <Text style={t.infoName}>{p.name}</Text>
              <Text style={t.infoVal}>
                {p.pay}× · {fmt(p.pay * bet)}
              </Text>
            </View>
          ))}
          <Text style={t.infoNote}>
            Oto {AUTO_SPINS} tur çevirir; {BIG_WIN} kat kazanç veya {AUTO_LOSS} bahislik kayıpta kendiliğinden durur.
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

const t = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center', overflow: 'hidden' },
  iconRow: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6, zIndex: 2 },
  tree: { fontSize: 44, marginBottom: -8 },
  title: { color: '#FACC15', fontSize: 28, fontWeight: '900', textShadowColor: '#14532D', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  paytable: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', backgroundColor: '#166534', borderRadius: 12, padding: 6, borderWidth: 2, borderColor: '#FACC15' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  payOn: { backgroundColor: 'rgba(250,204,21,0.35)' },
  payName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  payVal: { color: '#FDE68A', fontWeight: '900', fontSize: 16 },
  reels: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', backgroundColor: '#14532D', borderRadius: 14, padding: 5, borderWidth: 3, borderColor: '#FACC15' },
  reel: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  reelWait: { borderColor: '#EA580C' },
  coin: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FACC15' },
  coinHole: { width: 16, height: 16, backgroundColor: '#FEF3C7', borderWidth: 2, borderColor: '#92400E' },
  blank: { width: 26, height: 5, borderRadius: 3, backgroundColor: 'rgba(15,23,42,0.13)' },
  // Through the middle of the middle row (the box's padding and the reel's border above it).
  line: { position: 'absolute', left: 0, right: 0, top: 5 + 2 + CELL + GAP + CELL / 2 - 1, height: 3, backgroundColor: '#EA580C', opacity: 0.85 },
  status: { alignSelf: 'stretch', borderRadius: 10, backgroundColor: '#0F766E', borderWidth: 2, borderColor: '#FACC15', paddingVertical: 6 },
  statusText: { color: '#FDE68A', fontWeight: '900', fontSize: 19, textAlign: 'center', letterSpacing: 1 },
  spin: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FDE68A' },
  autoLeft: { color: '#FDE68A', fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  infoHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  infoName: { color: '#fff', fontWeight: '700', flex: 1 },
  infoVal: { color: '#FDE68A', fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
