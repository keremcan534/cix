// Şimşek Dağı: the 6×5 "pays anywhere" slot (lib/olympus-slot). playCasino (lib/games) settles the whole round, free
// spins included, before anything moves; the grid only replays outcome.olympus. Oto stops at free spins, a big win,
// the loss limit or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { COLS, FREE_SPINS, MIN_COUNT, OPAYTABLE, OSYMBOLS, ORB, ROWS, SCATTER, SCATTER_PAY, type OCell, type OSpin, type OSym } from '@/lib/olympus-slot';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
const FILLER: OSym[] = ['ring', 'blue', 'blue', 'purple', 'red', 'red', 'purple', 'green', 'gold', 'purple', 'gold', 'green', 'green', 'gold', 'ring'];
const INITIAL: OCell[][] = Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => ({ sym: FILLER[(c * ROWS + r) % FILLER.length] })));
const BLUR: OSym[] = ['crown', 'blue', 'red', 'green', 'gold', 'purple', 'ring', 'goblet', 'hourglass'];
const PAY_ORDER: OSym[] = ['crown', 'hourglass', 'ring', 'goblet', 'red', 'purple', 'gold', 'green', 'blue'];

function Cell({ cell, lit, dim }: { cell: OCell; lit: boolean; dim?: boolean }) {
  return (
    <View style={[o.cell, lit && o.cellOn]}>
      {cell.sym === ORB ? (
        <LinearGradient colors={['#A78BFA', '#4C1D95']} style={o.orb}>
          <Text style={o.orbText}>×{cell.orb}</Text>
        </LinearGradient>
      ) : (
        <Text style={[o.sym, dim && { opacity: 0.4 }]}>{OSYMBOLS[cell.sym].emoji}</Text>
      )}
      {cell.sym === SCATTER && !dim && <Text style={o.tag}>ZEUS</Text>}
    </View>
  );
}

export function OlympusPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, settings, setSetting } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'olympus')!;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [grid, setGrid] = useState<OCell[][]>(INITIAL);
  const [spinning, setSpinning] = useState<boolean[]>(Array(COLS).fill(false));
  const [tick, setTick] = useState(0);
  const [lit, setLit] = useState<Set<OSym>>(new Set());
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' | 'bonus' }>({ text: 'ÇEVİR VE KAZAN!' });
  const [last, setLast] = useState<{ win: number; orbs: number } | null>(null);
  const [free, setFree] = useState<{ n: number; won: number } | null>(null);
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
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, [anySpin]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const roll = async (s: OSpin, fast: boolean) => {
    setLit(new Set());
    setSpinning(Array(COLS).fill(true));
    await sleep(fast ? 250 : 600);
    for (let c = 0; c < COLS; c++) {
      if (!alive.current) return;
      setGrid((g) => g.map((col, i) => (i === c ? s.grid[c] : col)));
      setSpinning((sp) => sp.map((v, i) => (i === c ? false : v)));
      await sleep(fast ? 60 : 150);
    }
    setLit(new Set([...s.wins.map((w) => w.sym), ...(s.wins.length && s.orbs ? [ORB] : [])]));
  };

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const r = playCasino('olympus', bet, '', entry, newRequestId());
    if (!r.ok) {
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const round = r.outcome.olympus!;
    setFree(null);
    setStatus({ text: 'ÇEVİR VE KAZAN!' });
    await roll(round.base, turbo);
    setLast({ win: Math.floor(round.base.pay * bet), orbs: round.base.orbs });
    if (round.free.length) {
      successHaptic();
      setStatus({ text: `⚡ ZEUS! ${FREE_SPINS} bedava dönüş`, tone: 'bonus' });
      await sleep(1500);
      let won = round.base.pay;
      for (let i = 0; i < round.free.length; i++) {
        if (!alive.current) return null;
        setFree({ n: i + 1, won: Math.floor(won * bet) });
        await roll(round.free[i], true);
        won += round.free[i].pay;
        setFree({ n: i + 1, won: Math.floor(won * bet) });
        await sleep(round.free[i].pay ? 700 : 300);
      }
    }
    const payout = r.row.payout;
    if (payout > 0) {
      setStatus({ text: `KAZANÇ +${fmt(payout)}${round.capped ? ' · en yüksek kazanç' : ''}`, tone: 'win' });
      successHaptic();
    } else setStatus({ text: 'ÇEVİR VE KAZAN!' });
    return { net: payout - bet, stop: round.free.length ? 'bedava dönüş' : payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
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
  const muted = settings.gameVolume === 0;

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={['#FDE68A', '#D97706', '#7C2D12']} style={o.stage}>
        <View style={o.head}>
          <Pressable style={o.icon} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#FDE68A" />
          </Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={o.zeus}>🏛️⚡🏛️</Text>
            <Text style={o.title}>ŞİMŞEK DAĞI</Text>
            <Text style={[o.title, o.title2]}>SLOT</Text>
          </View>
          <Pressable style={o.icon} onPress={() => setShowPays((v) => !v)} accessibilityLabel="Ödeme tablosu">
            <Ionicons name="help" size={18} color="#FDE68A" />
          </Pressable>
        </View>
        <Text style={o.tagline}>SEMBOLLER EKRANIN HER YERİNDE ÖDER</Text>
        <View style={o.grid} accessibilityLabel="Olympus makaraları">
          {grid.map((col, c) => (
            <View key={c} style={o.col}>
              {col.map((cell, r) => (
                <Cell key={r} cell={spinning[c] ? { sym: BLUR[(c * 3 + r + tick) % BLUR.length] } : cell} dim={spinning[c]} lit={!spinning[c] && lit.has(cell.sym)} />
              ))}
            </View>
          ))}
        </View>
        <Text style={[o.status, status.tone === 'win' && { color: '#BBF7D0' }, status.tone === 'bonus' && { color: '#FDE68A' }, status.tone === 'err' && { fontSize: 13 }]} accessibilityLiveRegion="polite">
          {free ? `Bedava dönüş ${free.n}/${FREE_SPINS} · +${fmt(free.won)}` : status.text}
        </Text>
      </LinearGradient>

      <View style={o.controls}>
        <View style={o.info}>
          <Text style={o.infoHead}>Son dönüş</Text>
          <Text style={o.infoVal}>{last ? `+${fmt(last.win)}` : '—'}</Text>
          {last && last.orbs > 0 && <Text style={o.infoOrb}>🔮 ×{last.orbs}</Text>}
        </View>
        <Pressable onPress={play} disabled={busy} style={[busy && { opacity: 0.6 }]} accessibilityLabel={`Çevir, ${bet} jeton`}>
          <LinearGradient colors={['#FDE68A', '#B45309']} style={o.spinRing}>
            <View style={o.spinCore}>
              <Ionicons name="sync" size={40} color="#FACC15" />
            </View>
          </LinearGradient>
        </Pressable>
        <View style={{ gap: 8 }}>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[o.side, auto !== null && o.sideOn]} accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            {auto !== null ? <Text style={o.sideText}>{auto}</Text> : <Ionicons name="play-circle" size={28} color="#FDE68A" />}
          </Pressable>
          <Pressable
            onPress={() => {
              tapHaptic();
              setTurbo((t) => !t);
            }}
            style={[o.side, turbo && o.sideOn]}
            accessibilityLabel={turbo ? 'Hızlı çevirmeyi kapat' : 'Hızlı çevir'}
          >
            <Ionicons name="flash" size={26} color="#FDE68A" />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BalancePill tint="#3B1D0A" />
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#4C1D95" />
      </View>
      <Text style={o.dim}>Oto {AUTO_SPINS} tur; bedava dönüşte, {BIG_WIN}x kazançta veya {AUTO_LOSS} bahislik kayıpta durur.</Text>
      {showPays && (
        <View style={o.pays}>
          <Text style={o.paysHead}>Ekranda {MIN_COUNT}–9 / 10–11 / 12+ aynı sembol (jeton)</Text>
          {PAY_ORDER.map((x) => (
            <View key={x} style={o.payRow}>
              <Text style={{ fontSize: 22, width: 30, textAlign: 'center' }}>{OSYMBOLS[x].emoji}</Text>
              <Text style={o.payName}>{OSYMBOLS[x].name}</Text>
              <Text style={o.payVals}>{OPAYTABLE[x]!.map((p) => fmt(p * bet)).join(' / ')}</Text>
            </View>
          ))}
          <Text style={o.dim}>
            ⚡ Zeus 4 / 5 / 6+: {SCATTER_PAY.map((p) => fmt(p * bet)).join(' / ')} jeton ve {FREE_SPINS} bedava dönüş. 🔮 Küreler toplanır, dönüşün kazancını çarpar.
          </Text>
        </View>
      )}
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const o = StyleSheet.create({
  stage: { borderRadius: 22, padding: 8, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#3B0764', borderWidth: 2, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  zeus: { fontSize: 22 },
  title: { color: '#FACC15', fontSize: 30, fontWeight: '900', letterSpacing: 1, lineHeight: 32, textShadowColor: '#7F1D1D', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  title2: { fontSize: 24, lineHeight: 26 },
  tagline: { color: '#78350F', fontWeight: '900', fontSize: 11, textAlign: 'center', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', backgroundColor: '#4C1D95', borderRadius: 12, borderWidth: 3, borderColor: '#FACC15', padding: 3 },
  col: { flex: 1, minWidth: 0, borderRightWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(250,204,21,0.4)' },
  cell: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.25)' },
  sym: { fontSize: 26 },
  orb: { width: '82%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E9D5FF' },
  orbText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  tag: { position: 'absolute', bottom: 0, color: '#FDE68A', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  status: { color: '#fff', fontWeight: '900', fontSize: 17, textAlign: 'center', letterSpacing: 1, textShadowColor: '#000', textShadowRadius: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  info: { flex: 1, minHeight: 92, borderRadius: 12, borderWidth: 3, borderColor: '#D97706', backgroundColor: '#3B0764', alignItems: 'center', justifyContent: 'center', gap: 2 },
  infoHead: { color: '#E9D5FF', fontSize: 11, fontWeight: '700' },
  infoVal: { color: '#FDE68A', fontSize: 20, fontWeight: '900' },
  infoOrb: { color: '#C4B5FD', fontWeight: '800' },
  spinRing: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  spinCore: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#3B0764', alignItems: 'center', justifyContent: 'center' },
  side: { width: 54, height: 46, borderRadius: 14, borderWidth: 2, borderColor: '#D97706', backgroundColor: '#3B0764', alignItems: 'center', justifyContent: 'center' },
  sideOn: { backgroundColor: '#B45309', borderColor: '#FDE68A' },
  sideText: { color: '#FDE68A', fontWeight: '900', fontSize: 16 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pays: { backgroundColor: '#2A0F3D', borderRadius: 14, padding: 12, gap: 6 },
  paysHead: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payName: { color: '#fff', fontWeight: '700', flex: 1 },
  payVals: { color: '#FDE68A', fontWeight: '800' },
});
