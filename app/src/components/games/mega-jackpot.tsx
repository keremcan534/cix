// Mega Jackpot: the 5×3 slot with a progressive JACKPOT (lib/mega-jackpot). playCasino (lib/games) settles the round
// before the reels move; the reels only replay outcome.mega. Oto is repeated rounds from this screen and stops at the
// JACKPOT, a big win, the loss limit or any refusal (daily limit, balance, pool).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Art } from '@/components/Art';
import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { LINES, PAYTABLE, REELS, STRIPS, SYMBOLS, WILD, reelWindow, type Sym } from '@/lib/mega-jackpot';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
/** Oto stops when the net loss reaches this many stakes. */
const AUTO_LOSS = 25;
const INITIAL = reelWindow([0, 4, 8, 12, 16]);
const PAY_ORDER: Sym[] = ['seven', 'dollar', 'bar2', 'bar', 'bell', 'cherry'];
const blur = (reel: number, row: number, tick: number) => {
  const n = STRIPS[reel].length;
  return STRIPS[reel][(((reel * 5 - tick + row) % n) + n) % n];
};

/** One reel symbol, drawn like the classic fruit machine: fruit pictures, BAR plates and gold 7s. */
function Symbol({ sym, dim }: { sym: Sym; dim?: boolean }) {
  const o = dim ? { opacity: 0.45 } : null;
  if (sym === 'cherry') return <Art name="slot-kiraz" size={44} style={o ?? undefined} />;
  if (sym === 'bell') return <Art name="slot-can" size={44} style={o ?? undefined} />;
  if (sym === 'bar' || sym === 'bar2')
    return (
      <View style={[m.barWrap, o]}>
        {(sym === 'bar2' ? [0, 1] : [0]).map((i) => (
          <Text key={i} style={[m.bar, sym === 'bar2' && { fontSize: 11 }]}>
            BAR
          </Text>
        ))}
      </View>
    );
  if (sym === 'dollar') return <Text style={[m.dollar, o]}>$</Text>;
  return <Text style={[m.seven, sym === WILD && m.sevenWild, o]}>{sym === WILD ? '77' : '7'}</Text>;
}

export function MegaJackpotPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, settings, setSetting } = useApp();
  const { casino, bank } = useGames();
  const game = casino.find((g) => g.id === 'jackpot')!;
  const [bet, setBet] = useState(game.bets[3] ?? game.bets[0]);
  const [grid, setGrid] = useState<Sym[][]>(INITIAL);
  const [spinning, setSpinning] = useState<boolean[]>(Array(REELS).fill(false));
  const [tick, setTick] = useState(0);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' | 'jackpot' }>({ text: 'İYİ ŞANSLAR' });
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [showPays, setShowPays] = useState(false);
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
    const id = setInterval(() => setTick((t) => t + 1), 70);
    return () => clearInterval(id);
  }, [anySpin]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const r = playCasino('jackpot', bet, '', entry, newRequestId());
    if (!r.ok) {
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const s = r.outcome.mega!;
    setLit(new Set());
    setStatus({ text: 'İYİ ŞANSLAR' });
    setSpinning(Array(REELS).fill(true));
    await sleep(turbo ? 250 : 650);
    for (let reel = 0; reel < REELS; reel++) {
      if (!alive.current) return null;
      setGrid((g) => g.map((col, i) => (i === reel ? s.grid[reel] : col)));
      setSpinning((sp) => sp.map((v, i) => (i === reel ? false : v)));
      await sleep(turbo ? 60 : 180);
    }
    const cells = new Set<string>();
    s.wins.forEach((w) => LINES[w.line].slice(0, w.count).forEach((row, reel) => cells.add(`${reel}-${row}`)));
    s.jackpotLines.forEach((l) => LINES[l].forEach((row, reel) => cells.add(`${reel}-${row}`)));
    setLit(cells);
    const payout = r.row.payout;
    if (s.jackpotLines.length) {
      setStatus({ text: `🎉 JACKPOT! +${fmt(payout)} jeton`, tone: 'jackpot' });
      successHaptic();
      return { net: payout - bet, stop: 'JACKPOT kazandın' };
    }
    if (payout > 0) {
      setStatus({ text: `KAZANÇ +${fmt(payout)} · ${s.wins.length} çizgi`, tone: 'win' });
      successHaptic();
    } else setStatus({ text: 'İYİ ŞANSLAR' });
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
    setStatus((st) => (st.tone === 'jackpot' ? st : { text: `${note} · net ${net >= 0 ? '+' : ''}${fmt(net)}`, tone: net > 0 ? 'win' : undefined }));
  };
  const muted = settings.gameVolume === 0;

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={['#F472B6', '#C026D3', '#7E22CE']} style={m.stage}>
        <View style={m.iconRow}>
          <Pressable style={m.icon} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
          </Pressable>
          <Pressable style={m.icon} onPress={() => setShowPays((v) => !v)} accessibilityLabel="Ödeme tablosu">
            <Ionicons name="help" size={20} color="#fff" />
          </Pressable>
        </View>
        <Text style={m.jpTitle}>JACKPOT</Text>
        <LinearGradient colors={['#EF4444', '#B91C1C']} style={m.jpBox}>
          <Text style={m.jpValue} accessibilityLabel={`JACKPOT ${Math.floor(bank.jackpot)} jeton`}>
            {fmt(bank.jackpot)}
          </Text>
        </LinearGradient>
        <View style={m.reels} accessibilityLabel={`Makaralar: ${grid.map((col) => col.map((x) => SYMBOLS[x].name).join(', ')).join(' | ')}`}>
          {grid.map((col, reel) => (
            <View key={reel} style={m.reel}>
              {col.map((sym, row) => {
                const shown = spinning[reel] ? blur(reel, row, tick) : sym;
                return (
                  <View key={row} style={[m.cell, lit.has(`${reel}-${row}`) && m.cellOn]}>
                    <Symbol sym={shown} dim={spinning[reel]} />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={[m.status, status.tone === 'win' && m.statusWin, status.tone === 'jackpot' && m.statusJp]} accessibilityLiveRegion="polite">
          <Text style={[m.statusText, status.tone === 'err' && { fontSize: 13, letterSpacing: 0 }]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
      </LinearGradient>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#6B21A8" />
      </View>
      <View style={m.controls}>
        <BalancePill tint="#4A1A63" />
        <Pressable onPress={play} disabled={busy} style={[m.spin, busy && { opacity: 0.6 }]} accessibilityLabel={`Çevir, ${bet} jeton`}>
          <LinearGradient colors={['#FDE68A', '#F59E0B']} style={m.spinRing}>
            <View style={m.spinCore}>
              <Ionicons name="sync" size={38} color="#FACC15" />
            </View>
          </LinearGradient>
        </Pressable>
        <View style={{ gap: 6, flex: 1 }}>
          <Pressable
            onPress={() => {
              tapHaptic();
              setTurbo((t) => !t);
            }}
            style={[m.side, turbo && m.sideOn]}
            accessibilityLabel={turbo ? 'Turbo kapat' : 'Turbo aç'}
          >
            <Text style={m.sideText}>TURBO</Text>
          </Pressable>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[m.side, auto !== null && m.sideOn]} accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            <Text style={m.sideText}>{auto !== null ? `Dur · ${auto}` : 'Oto'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={m.dim}>
        10 çizgi × {fmt(bet / LINES.length)} · Oto {AUTO_SPINS} tur, JACKPOT, {BIG_WIN}x kazanç veya {AUTO_LOSS} bahislik kayıpta durur.
      </Text>
      {showPays && (
        <View style={m.pays}>
          <Text style={m.paysHead}>Bir çizgideki kazanç (jeton) · 3 / 4 / 5 aynı</Text>
          {PAY_ORDER.map((x) => (
            <View key={x} style={m.payRow}>
              <View style={{ width: 52, alignItems: 'center' }}>
                <Symbol sym={x} />
              </View>
              <Text style={m.payName}>{SYMBOLS[x].name}</Text>
              <Text style={m.payVals}>{PAYTABLE[x]!.map((p) => fmt((p * bet) / LINES.length)).join(' / ')}</Text>
            </View>
          ))}
          <Text style={m.dim}>77 her sembolün yerine geçer. Bir çizgide beş 77: JACKPOT’un bahis / {fmt(Math.max(...game.bets))} kadarı.</Text>
        </View>
      )}
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const m = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center' },
  iconRow: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6, zIndex: 2 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#4338CA', borderWidth: 2, borderColor: '#A5B4FC', alignItems: 'center', justifyContent: 'center' },
  jpTitle: { color: '#FDF4FF', fontSize: 34, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1, textShadowColor: '#7E22CE', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1, marginTop: 6 },
  jpBox: { alignSelf: 'stretch', marginHorizontal: 18, borderRadius: 999, borderWidth: 3, borderColor: '#FDBA74', paddingVertical: 4, alignItems: 'center' },
  jpValue: { color: '#FDE68A', fontSize: 34, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7C2D12', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  reels: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', backgroundColor: '#F0ABFC', borderRadius: 16, padding: 5 },
  reel: { flex: 1, minWidth: 0, gap: 4, backgroundColor: '#6B21A8', borderRadius: 10, padding: 3 },
  cell: { aspectRatio: 0.9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.25)' },
  barWrap: { gap: 2, alignItems: 'center' },
  bar: { color: '#7C2D12', backgroundColor: '#FBBF24', fontWeight: '900', fontSize: 13, paddingHorizontal: 4, borderRadius: 3, borderWidth: 1.5, borderColor: '#7C2D12', overflow: 'hidden' },
  dollar: { color: '#FACC15', fontSize: 40, fontWeight: '900', textShadowColor: '#92400E', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  seven: { color: '#EF4444', fontSize: 36, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#FDE68A', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  sevenWild: { fontSize: 28, color: '#F97316', letterSpacing: -3 },
  status: { alignSelf: 'stretch', borderRadius: 10, borderWidth: 2, borderColor: '#FBBF24', backgroundColor: '#9D174D', paddingVertical: 6, paddingHorizontal: 8 },
  statusWin: { backgroundColor: '#15803D' },
  statusJp: { backgroundColor: '#B45309' },
  statusText: { color: '#FDE68A', fontWeight: '900', fontSize: 20, textAlign: 'center', letterSpacing: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spin: { borderRadius: 50 },
  spinRing: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  spinCore: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#6B21A8', alignItems: 'center', justifyContent: 'center' },
  side: { borderRadius: 14, borderWidth: 2, borderColor: '#F0ABFC', backgroundColor: '#7C3AED', paddingVertical: 9, alignItems: 'center' },
  sideOn: { backgroundColor: '#DB2777', borderColor: '#FACC15' },
  sideText: { color: '#FDE68A', fontWeight: '900', fontSize: 15 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pays: { backgroundColor: '#2A0F3D', borderRadius: 14, padding: 12, gap: 6 },
  paysHead: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payName: { color: '#fff', fontWeight: '700', flex: 1 },
  payVals: { color: '#FDE68A', fontWeight: '800' },
});
