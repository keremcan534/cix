// Fener Kayalığı: ships land on a night sea, the lighthouse beam sweeps the rows and stops on one, and the ships in the
// light bring their cargo home (lib/fener-slot). playCasino (lib/games) settles the whole round, storm included, before
// anything moves; the board and the beam only replay outcome.fener. Oto stops at the storm, a big win, the loss limit
// or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { BRIGHTNESS, CARGO, COLS, ROWS, STORM_SPINS, STORM_TRIGGER, cargoLabel, type FCell, type FSpin } from '@/lib/fener-slot';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp, useSettings } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
const LIGHT = '#FFD27A';
const SEA = '#13D9DF';

const sea: FCell = { kind: 'sea' };
const ship = (cargo: number): FCell => ({ kind: 'ship', cargo });
// The board before the first spin: a calm sea with a few small boats, nothing lit.
const INITIAL: FCell[][] = [
  [sea, ship(2), sea, sea, sea],
  [sea, sea, sea, ship(10), sea],
  [ship(5), sea, sea, sea, sea],
  [sea, sea, ship(1), sea, sea],
];
// What a spinning column flickers through.
const BLUR: FCell[] = [sea, ship(5), sea, ship(50), sea, { kind: 'lamp' }, sea, ship(1)];

/** Ship size and colour follow the cargo: dinghies, coasters, and the rare golden freighter. */
const shipLook = (tenths: number) => (tenths >= 100 ? { size: 30, color: LIGHT } : tenths >= 10 ? { size: 26, color: '#E6FBFF' } : { size: 21, color: 'rgba(230,251,255,0.75)' });

/** Ping-pong path of the beam over the rows that ends on `target`: 0,1,2,3,2,1,0,1… */
function sweepPath(target: number, minSteps: number): number[] {
  const path: number[] = [];
  let row = 0;
  let dir = 1;
  while (path.length < minSteps || row !== target) {
    path.push(row);
    if (row + dir < 0 || row + dir >= ROWS) dir = -dir;
    row += dir;
  }
  path.push(target);
  return path;
}

function Cell({ cell, lit, blur }: { cell: FCell; lit: boolean; blur?: boolean }) {
  if (cell.kind === 'sea') {
    return (
      <View style={f.cell}>
        <Ionicons name="water-outline" size={14} color="rgba(19,217,223,0.16)" />
      </View>
    );
  }
  if (cell.kind === 'lamp') {
    return (
      <View style={f.cell}>
        <View style={[f.lamp, blur && { opacity: 0.45 }]}>
          <Ionicons name="flame" size={18} color="#3A2400" />
        </View>
        {!blur && <Text style={f.lampTag}>KANDİL</Text>}
      </View>
    );
  }
  const look = shipLook(cell.cargo);
  return (
    <View style={f.cell} accessibilityLabel={`Gemi, yük ${cargoLabel(cell.cargo)}`}>
      <Ionicons name="boat" size={look.size} color={lit ? LIGHT : look.color} style={[blur && { opacity: 0.45 }, lit && f.shipLit]} />
      {!blur && <Text style={[f.cargo, lit && f.cargoLit, cell.cargo >= 100 && { color: LIGHT }]}>{cargoLabel(cell.cargo)}</Text>}
    </View>
  );
}

export function FenerPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, setSetting } = useApp();
  const settings = useSettings();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'olympus')!;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [grid, setGrid] = useState<FCell[][]>(INITIAL);
  const [spinning, setSpinning] = useState<boolean[]>(Array(COLS).fill(false));
  const [tick, setTick] = useState(0);
  // Rows the beam is on now (sweeping or settled) and whether it has settled.
  const [beam, setBeam] = useState<{ rows: number[]; settled: boolean } | null>(null);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' | 'bonus' }>({ text: 'Işık hangi sıraya düşerse oradaki gemiler limana döner' });
  const [last, setLast] = useState<{ win: number; ships: number } | null>(null);
  const [storm, setStorm] = useState<{ n: number; won: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [showPays, setShowPays] = useState(false);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const anySpin = spinning.some(Boolean);
  const calm = settings.reduceMotion;

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

  /** Lands the board column by column, then sweeps the beam onto the drawn row(s). */
  const replay = async (s: FSpin, fast: boolean) => {
    setBeam(null);
    setBrightness(null);
    setSpinning(Array(COLS).fill(true));
    await sleep(fast ? 220 : 520);
    for (let c = 0; c < COLS; c++) {
      if (!alive.current) return;
      setGrid((g) => g.map((row, r) => row.map((cell, i) => (i === c ? s.grid[r][c] : cell))));
      setSpinning((sp) => sp.map((v, i) => (i === c ? false : v)));
      await sleep(fast ? 50 : 130);
    }
    if (!calm) {
      // One beam sweeps the sea and slows down; the storm's two rows open from where it stops.
      const path = sweepPath(s.lit[0], fast ? 5 : 9);
      for (let i = 0; i < path.length; i++) {
        if (!alive.current) return;
        setBeam({ rows: [path[i]], settled: false });
        await sleep((fast ? 40 : 70) + (i / path.length) ** 2 * (fast ? 90 : 260));
      }
    }
    setBeam({ rows: s.lit, settled: true });
    setBrightness(s.brightness);
    if (s.pay > 0) tapHaptic();
  };

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const r = playCasino('olympus', bet, '', entry, newRequestId());
    if (!r.ok) {
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const round = r.outcome.fener!;
    setStorm(null);
    setStatus({ text: 'Fener dönüyor…' });
    await replay(round.base, turbo);
    if (!alive.current) return null;
    const ships = round.base.grid[round.base.lit[0]].filter((c) => c.kind === 'ship').length;
    setLast({ win: Math.floor(round.base.pay * bet), ships });
    if (round.storm.length) {
      successHaptic();
      setStatus({ text: `Fırtına Gecesi! ${STORM_SPINS} dönüş, ışık iki sırayı birden tarar`, tone: 'bonus' });
      await sleep(1500);
      let won = round.base.pay;
      for (let i = 0; i < round.storm.length; i++) {
        if (!alive.current) return null;
        setStorm({ n: i + 1, won: Math.floor(won * bet) });
        await replay(round.storm[i], true);
        won += round.storm[i].pay;
        setStorm({ n: i + 1, won: Math.floor(won * bet) });
        await sleep(round.storm[i].pay ? 700 : 300);
      }
    }
    const payout = r.row.payout;
    if (payout > 0) {
      setStatus({ text: `Limana dönen yük +${fmt(payout)}${round.capped ? ' · en yüksek kazanç' : ''}`, tone: 'win' });
      successHaptic();
    } else setStatus({ text: 'Işıkta gemi yok, bir daha dene' });
    return { net: payout - bet, stop: round.storm.length ? 'Fırtına Gecesi' : payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
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
  const settled = beam?.settled ?? false;

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={storm ? ['#1B2433', '#0B1220', '#04070D'] : ['#0E2B47', '#071A2E', '#030C17']} style={f.stage}>
        <View style={f.head}>
          <Pressable style={f.icon} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color={LIGHT} />
          </Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={f.title} numberOfLines={1} adjustsFontSizeToFit>
              FENER KAYALIĞI
            </Text>
            <Text style={f.kicker}>{storm ? `FIRTINA GECESİ · ${storm.n}/${STORM_SPINS}` : 'IŞIK HUZMESİ'}</Text>
          </View>
          <Pressable style={f.icon} onPress={() => setShowPays((v) => !v)} accessibilityLabel="Kurallar ve yük değerleri">
            <Ionicons name="help" size={17} color={LIGHT} />
          </Pressable>
        </View>

        <View style={f.board} accessibilityLabel="Deniz">
          {grid.map((row, r) => {
            const on = beam?.rows.includes(r) ?? false;
            return (
              <View key={r} style={f.row}>
                {/* The lamp at the head of each row; the lit one glows and throws the beam across its row. */}
                <View style={[f.source, on && f.sourceOn]}>
                  <Ionicons name="sunny" size={13} color={on ? '#3A2400' : 'rgba(255,210,122,0.35)'} />
                </View>
                <View style={f.lane}>
                  {on && (
                    <LinearGradient
                      pointerEvents="none"
                      colors={settled ? ['rgba(255,210,122,0.55)', 'rgba(255,210,122,0.22)', 'rgba(255,210,122,0.06)'] : ['rgba(255,210,122,0.35)', 'rgba(255,210,122,0.1)', 'rgba(255,210,122,0)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={f.beam}
                    />
                  )}
                  {row.map((cell, c) => (
                    <Cell key={c} cell={spinning[c] ? BLUR[(c * 3 + r + tick) % BLUR.length] : cell} blur={spinning[c]} lit={settled && on && cell.kind === 'ship'} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <View style={f.meterRow}>
          <View style={[f.meter, brightness !== null && brightness > 1 && f.meterHot]} accessibilityLabel={brightness ? `Parlaklık ${brightness} kat` : 'Parlaklık'}>
            <Ionicons name="flashlight" size={13} color={LIGHT} />
            <Text style={f.meterText}>Parlaklık {brightness ? `×${brightness}` : '—'}</Text>
          </View>
          <Text style={[f.status, status.tone === 'win' && { color: '#BBF7D0' }, status.tone === 'bonus' && { color: LIGHT }, status.tone === 'err' && { color: '#FCA5A5' }]} accessibilityLiveRegion="polite" numberOfLines={2}>
            {storm ? `Fırtına ${storm.n}/${STORM_SPINS} · +${fmt(storm.won)}` : status.text}
          </Text>
        </View>
      </LinearGradient>

      <View style={f.controls}>
        <View style={f.info}>
          <Text style={f.infoHead}>Son dönüş</Text>
          <Text style={f.infoVal}>{last ? (last.win ? `+${fmt(last.win)}` : '0') : '—'}</Text>
          {last && <Text style={f.infoSub}>{last.ships ? `ışıkta ${last.ships} gemi` : 'ışıkta gemi yok'}</Text>}
        </View>
        <Pressable onPress={play} disabled={busy} style={[busy && { opacity: 0.6 }]} accessibilityLabel={`Çevir, ${bet} jeton`}>
          <LinearGradient colors={[LIGHT, '#E8A93A']} style={f.spinRing}>
            <View style={f.spinCore}>
              <Ionicons name="sync" size={38} color={LIGHT} />
            </View>
          </LinearGradient>
        </Pressable>
        <View style={{ gap: 8 }}>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[f.side, auto !== null && f.sideOn]} accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            {auto !== null ? <Text style={f.sideText}>{auto}</Text> : <Ionicons name="play-circle" size={26} color={LIGHT} />}
          </Pressable>
          <Pressable
            onPress={() => {
              tapHaptic();
              setTurbo((t) => !t);
            }}
            style={[f.side, turbo && f.sideOn]}
            accessibilityLabel={turbo ? 'Hızlı çevirmeyi kapat' : 'Hızlı çevir'}
          >
            <Ionicons name="flash" size={24} color={LIGHT} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BalancePill tint="#0B2238" />
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#0B2238" />
      </View>
      <Text style={f.dim}>Oto {AUTO_SPINS} tur; Fırtına Gecesi’nde, {BIG_WIN}x kazançta veya {AUTO_LOSS} bahislik kayıpta durur.</Text>
      {showPays && (
        <View style={f.pays}>
          <Text style={f.paysHead}>Nasıl oynanır</Text>
          <Text style={f.paysLine}>Her dönüşte denize gemiler düşer; her geminin bir yükü vardır. Sonra fener sıraları tarar ve birinde durur.</Text>
          <Text style={f.paysLine}>Işıktaki gemilerin yükleri toplanır ve ışığın parlaklığıyla çarpılır. Parlaklık: {BRIGHTNESS.map((b) => `×${b.value}`).join(' / ')}.</Text>
          <Text style={f.paysLine}>
            {STORM_TRIGGER} veya daha fazla kandil Fırtına Gecesi’ni başlatır: {STORM_SPINS} dönüş boyunca ışık iki sırayı birden tarar ve her dönüşte bir kat daha parlar (×1’den ×{STORM_SPINS}’ya).
          </Text>
          <Text style={[f.paysHead, { marginTop: 4 }]}>Yük değerleri ({fmt(bet)} jeton bahiste)</Text>
          <View style={f.cargoGrid}>
            {CARGO.map((c) => (
              <View key={c.tenths} style={f.cargoItem}>
                <Ionicons name="boat" size={shipLook(c.tenths).size - 6} color={shipLook(c.tenths).color} />
                <Text style={f.cargoName}>{cargoLabel(c.tenths)}</Text>
                <Text style={f.cargoVal}>{fmt((c.tenths * bet) / 10)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const f = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, borderWidth: 1, borderColor: 'rgba(255,210,122,0.22)', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,210,122,0.1)', borderWidth: 1, borderColor: 'rgba(255,210,122,0.45)', alignItems: 'center', justifyContent: 'center' },
  title: { color: LIGHT, fontSize: 24, fontWeight: '900', letterSpacing: 2, lineHeight: 28, textShadowColor: 'rgba(255,210,122,0.55)', textShadowRadius: 12 },
  kicker: { color: SEA, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  board: { gap: 4, backgroundColor: 'rgba(2,10,20,0.55)', borderRadius: 14, padding: 6, borderWidth: 1, borderColor: 'rgba(19,217,223,0.18)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  source: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,210,122,0.3)' },
  sourceOn: { backgroundColor: LIGHT, borderColor: LIGHT, boxShadow: '0 0 14px rgba(255,210,122,0.9)' },
  lane: { flex: 1, flexDirection: 'row', borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(19,217,223,0.04)' },
  beam: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  shipLit: { textShadowColor: 'rgba(255,210,122,0.9)', textShadowRadius: 10 },
  cargo: { color: 'rgba(230,251,255,0.8)', fontSize: 10, fontWeight: '800', marginTop: -2 },
  cargoLit: { color: '#fff', fontWeight: '900' },
  lamp: { width: 30, height: 30, borderRadius: 15, backgroundColor: LIGHT, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(255,210,122,0.75)' },
  lampTag: { position: 'absolute', bottom: 1, color: LIGHT, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,210,122,0.35)', backgroundColor: 'rgba(255,210,122,0.08)' },
  meterHot: { backgroundColor: 'rgba(255,210,122,0.22)', borderColor: LIGHT },
  meterText: { color: LIGHT, fontWeight: '900', fontSize: 12 },
  status: { flex: 1, color: '#E6FBFF', fontWeight: '800', fontSize: 13, lineHeight: 17 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  info: { flex: 1, minHeight: 92, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,210,122,0.35)', backgroundColor: '#0B2238', alignItems: 'center', justifyContent: 'center', gap: 2 },
  infoHead: { color: 'rgba(230,251,255,0.7)', fontSize: 11, fontWeight: '700' },
  infoVal: { color: LIGHT, fontSize: 20, fontWeight: '900' },
  infoSub: { color: SEA, fontSize: 11, fontWeight: '800' },
  spinRing: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 22px rgba(255,210,122,0.35)' },
  spinCore: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#071A2E', alignItems: 'center', justifyContent: 'center' },
  side: { width: 54, height: 46, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,210,122,0.45)', backgroundColor: '#0B2238', alignItems: 'center', justifyContent: 'center' },
  sideOn: { backgroundColor: 'rgba(255,210,122,0.25)', borderColor: LIGHT },
  sideText: { color: LIGHT, fontWeight: '900', fontSize: 16 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pays: { backgroundColor: '#0B2238', borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: 'rgba(19,217,223,0.18)' },
  paysHead: { color: '#fff', fontWeight: '800', fontSize: 13 },
  paysLine: { color: 'rgba(230,251,255,0.85)', fontSize: 12, lineHeight: 17 },
  cargoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cargoItem: { width: '31%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(19,217,223,0.06)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  cargoName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cargoVal: { color: LIGHT, fontWeight: '800', fontSize: 12, marginLeft: 'auto' },
});
