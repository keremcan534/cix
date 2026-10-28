// Altın Kasa: the 5×3 casino slot screen (Servet Seviyesi 2+). The round is decided by playCasino (lib/games) like
// every casino game: stake, pool and payout are settled before the reels move, and the reels only replay
// outcome.fortune. Auto-spin is repeated rounds from this screen; it stops at the bonus, a big win, the loss limit or
// any refusal (daily limit, balance, pool). It never touches the room or the microphone.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { Icon3D } from '@/components/Icon3D';
import { FREE_MULT, FREE_SPINS, LINES, PAYTABLE, REELS, ROWS, SCATTER, STRIPS, SYMBOLS, WILD, reelWindow, type Spin, type Sym } from '@/lib/fortune-slot';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

/** A round paying at least this many times the stake gets the big-win screen and stops auto-spin. */
export const BIG_WIN = 10;
const AUTO_COUNTS = [10, 25, 50];
/** Auto-spin loss limits, in multiples of the stake. */
const LOSS_LIMITS = [10, 25, 50];
const INITIAL = reelWindow([0, 6, 12, 18, 24]);
const IDLE = Array<boolean>(REELS).fill(false);
const PAY_ORDER: Sym[] = ['yacht', 'car', 'crown', 'gem', 'watch', 'ring', 'cash', 'coin'];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('tr-TR');
const bigLabel = (m: number) => (m >= 50 ? 'SÜPER KAZANÇ' : m >= 25 ? 'MEGA KAZANÇ' : 'BÜYÜK KAZANÇ');
/** What a spinning reel shows: its strip scrolling downwards. */
const blur = (reel: number, row: number, tick: number) => {
  const n = STRIPS[reel].length;
  return STRIPS[reel][(((reel * 7 - tick + row) % n) + n) % n];
};

type Done = { payout: number; bonus: boolean; mult: number } | null;

export function FortunePlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, coins, gameCoins } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'fortune')!;
  const [bet, setBet] = useState(game.bets[0]);
  const [grid, setGrid] = useState<Sym[][]>(INITIAL);
  const [spinning, setSpinning] = useState<boolean[]>(IDLE);
  const [tick, setTick] = useState(0);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<string[]>([]);
  const [free, setFree] = useState<{ n: number; won: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<{ main: string; detail: string; win: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState<{ label: string; amount: number; mult: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoCount, setAutoCount] = useState(AUTO_COUNTS[0]);
  const [lossX, setLossX] = useState(LOSS_LIMITS[0]);
  const [auto, setAuto] = useState<{ left: number; net: number } | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [showPays, setShowPays] = useState(false);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const closeBig = useRef<(() => void) | null>(null);
  const [bigScale] = useState(() => new Animated.Value(0));
  const anySpin = spinning.some(Boolean);
  const lineBet = bet / LINES.length;

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

  /** Spins all reels, then stops them left to right on the target window. */
  const roll = async (target: Sym[][], fast: boolean) => {
    setLit(new Set());
    setLines([]);
    setSpinning(Array<boolean>(REELS).fill(true));
    await sleep(fast ? 300 : 600);
    for (let r = 0; r < REELS; r++) {
      if (!alive.current) return;
      setGrid((g) => g.map((col, i) => (i === r ? target[r] : col)));
      setSpinning((s) => s.map((v, i) => (i === r ? false : v)));
      await sleep(fast ? 90 : 170);
    }
  };
  /** Lights the cells of every winning line (and the Kasa symbols when they trigger the bonus). */
  const showWins = (s: Spin, mult: number, withScatter: boolean) => {
    const cells = new Set<string>();
    s.wins.forEach((w) => LINES[w.line].slice(0, w.count).forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (withScatter) s.grid.forEach((col, reel) => col.forEach((sym, row) => sym === SCATTER && cells.add(`${reel}-${row}`)));
    setLit(cells);
    setLines(s.wins.map((w) => `Çizgi ${w.line + 1} · ${SYMBOLS[w.sym].emoji}×${w.count} · +${fmt(w.pay * lineBet * mult)}`));
  };
  const showBig = (mult: number, amount: number) =>
    new Promise<void>((resolve) => {
      setBig({ label: bigLabel(mult), amount, mult });
      bigScale.setValue(0);
      Animated.spring(bigScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
      const close = () => {
        clearTimeout(timer);
        closeBig.current = null;
        if (alive.current) setBig(null);
        resolve();
      };
      const timer = setTimeout(close, 3500);
      closeBig.current = close;
    });

  const spinOnce = async (): Promise<Done> => {
    setError(null);
    setResult(null);
    setFree(null);
    const r = playCasino('fortune', bet, '', entry, newRequestId());
    if (!r.ok) {
      setError(r.reason);
      errorHaptic();
      return null;
    }
    pressHaptic();
    const round = r.outcome.fortune!;
    await roll(round.base.grid, false);
    const bonus = round.free.length > 0;
    showWins(round.base, 1, bonus);
    if (bonus) {
      successHaptic();
      setBanner(`🏦 KASA AÇILDI! ${FREE_SPINS} bedava dönüş · kazançlar ×${FREE_MULT}`);
      await sleep(1600);
      setBanner(null);
      let won = 0;
      for (let i = 0; i < round.free.length; i++) {
        if (!alive.current) return null;
        setFree({ n: i + 1, won });
        await roll(round.free[i].grid, true);
        won += round.free[i].pay * lineBet * FREE_MULT;
        setFree({ n: i + 1, won });
        showWins(round.free[i], FREE_MULT, false);
        await sleep(round.free[i].pay ? 800 : 350);
      }
    }
    const payout = r.row.payout;
    setResult({ win: payout > 0, main: payout > 0 ? `+${fmt(payout)} jeton · oyun bakiyesine` : 'Bu tur kazanç yok', detail: `${r.outcome.detail} · İşlem ${r.row.txId}` });
    if (payout > 0) successHaptic();
    if (round.multiplier >= BIG_WIN) await showBig(round.multiplier, payout);
    return { payout, bonus, mult: round.multiplier };
  };

  const play = async () => {
    if (busy) return;
    setBusy(true);
    setAutoNote(null);
    await spinOnce();
    if (alive.current) setBusy(false);
  };
  const runAuto = async () => {
    if (busy) return;
    setBusy(true);
    setAutoNote(null);
    stopAuto.current = false;
    const limit = bet * lossX;
    let net = 0;
    let note = 'Otomatik çevirme bitti.';
    for (let left = autoCount; left > 0; left--) {
      if (stopAuto.current) {
        note = 'Otomatik çevirme durduruldu.';
        break;
      }
      setAuto({ left, net });
      const d = await spinOnce();
      if (!alive.current) return;
      if (!d) {
        note = 'Otomatik çevirme durdu: tur kabul edilmedi.';
        break;
      }
      net += d.payout - bet;
      setAuto({ left: left - 1, net });
      if (d.bonus) {
        note = 'Otomatik çevirme durdu: bedava dönüş kazandın.';
        break;
      }
      if (d.mult >= BIG_WIN) {
        note = 'Otomatik çevirme durdu: büyük kazanç.';
        break;
      }
      if (-net >= limit) {
        note = `Otomatik çevirme durdu: kayıp limitine (${fmt(limit)} jeton) ulaşıldı.`;
        break;
      }
      await sleep(350);
    }
    setAutoNote(`${note} Net: ${net >= 0 ? '+' : ''}${fmt(net)} jeton.`);
    setAuto(null);
    setBusy(false);
  };

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={['#FDE68A', '#B45309', '#FDE68A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={f.frame}>
        <View style={f.machine}>
          <Text style={f.title} accessibilityRole="header">
            🏦 ALTIN KASA
          </Text>
          <View style={f.reels} accessibilityLabel={`Makaralar: ${grid.map((col) => col.map((s) => SYMBOLS[s].name).join(', ')).join(' | ')}`}>
            {grid.map((col, reel) => (
              <View key={reel} style={f.reel}>
                {col.map((sym, row) => {
                  const shown = spinning[reel] ? blur(reel, row, tick) : sym;
                  const on = lit.has(`${reel}-${row}`);
                  return (
                    <View key={row} style={[f.cell, on && f.cellOn, !spinning[reel] && shown === WILD && f.cellWild]}>
                      <Text style={[f.sym, spinning[reel] && f.symBlur]}>{SYMBOLS[shown].emoji}</Text>
                      {!spinning[reel] && (shown === WILD || shown === SCATTER) && <Text style={f.tag}>{shown === WILD ? 'WILD' : 'KASA'}</Text>}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {free && (
            <Text style={f.free} accessibilityLiveRegion="polite">
              Bedava dönüş {free.n}/{FREE_SPINS} · ×{FREE_MULT} · +{fmt(free.won)}
            </Text>
          )}
          {banner && (
            <View style={f.banner}>
              <Text style={f.bannerText}>{banner}</Text>
            </View>
          )}
          {big && (
            <Pressable style={f.big} onPress={() => closeBig.current?.()} accessibilityLabel={`${big.label}, ${big.amount} jeton. Kapatmak için dokun`}>
              <Animated.View style={{ alignItems: 'center', transform: [{ scale: bigScale }] }}>
                <Text style={f.bigEmoji}>💰</Text>
                <Text style={f.bigLabel}>{big.label}</Text>
                <Text style={f.bigAmount}>+{fmt(big.amount)}</Text>
                <Text style={f.bigMult}>bahsinin {Math.round(big.mult * 10) / 10} katı</Text>
              </Animated.View>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {(result || error || lines.length > 0) && (
        <View style={[f.result, result?.win && { borderColor: semantic.money }]} accessibilityLiveRegion="polite">
          {error ? <Text style={f.err}>{error}</Text> : result && <Text style={f.resultMain}>{result.main}</Text>}
          {lines.slice(0, 4).map((l) => (
            <Text key={l} style={f.dim}>
              {l}
            </Text>
          ))}
          {lines.length > 4 && <Text style={f.dim}>+{lines.length - 4} çizgi daha</Text>}
          {result && <Text style={f.dim}>{result.detail}</Text>}
        </View>
      )}

      <View style={f.row}>
        {game.bets.map((b) => (
          <Pressable
            key={b}
            disabled={busy}
            onPress={() => {
              tapHaptic();
              setBet(b);
            }}
            style={[f.chip, bet === b && f.chipOn]}
            accessibilityLabel={`Bahis ${b}`}
          >
            <Icon3D name="coin" size={14} />
            <Text style={f.chipText}>{b}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={f.dim}>
        10 çizgi × {fmt(lineBet)} jeton · bakiye {fmt(coins)} · oyun bakiyesi {fmt(gameCoins)}
      </Text>

      <Pressable style={[f.spin, busy && { opacity: 0.6 }]} disabled={busy} onPress={play} accessibilityLabel={`Çevir, ${bet} jeton`}>
        <Text style={f.spinText}>{busy && !auto ? 'Makaralar dönüyor…' : `ÇEVİR · ${bet} jeton`}</Text>
      </Pressable>

      <View style={f.autoBox}>
        {auto ? (
          <>
            <Text style={f.autoText}>
              Otomatik · kalan {auto.left} · net {auto.net >= 0 ? '+' : ''}
              {fmt(auto.net)}
            </Text>
            <Pressable style={f.stop} onPress={() => (stopAuto.current = true)} accessibilityLabel="Otomatik çevirmeyi durdur">
              <Text style={f.stopText}>Durdur</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={f.autoRow}>
              <Text style={f.autoLabel}>Otomatik</Text>
              {AUTO_COUNTS.map((n) => (
                <Pressable key={n} disabled={busy} onPress={() => setAutoCount(n)} style={[f.mini, autoCount === n && f.chipOn]} accessibilityLabel={`${n} kez otomatik çevir`}>
                  <Text style={f.miniText}>{n}×</Text>
                </Pressable>
              ))}
            </View>
            <View style={f.autoRow}>
              <Text style={f.autoLabel}>Kayıp limiti</Text>
              {LOSS_LIMITS.map((x) => (
                <Pressable key={x} disabled={busy} onPress={() => setLossX(x)} style={[f.mini, lossX === x && f.chipOn]} accessibilityLabel={`Kayıp limiti ${bet * x} jeton`}>
                  <Text style={f.miniText}>{fmt(bet * x)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[f.autoBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={runAuto} accessibilityLabel={`${autoCount} kez otomatik çevir`}>
              <Text style={f.chipText}>▶ {autoCount} kez otomatik çevir</Text>
            </Pressable>
            <Text style={f.dim}>Bedava dönüşte, büyük kazançta ve kayıp limitinde kendiliğinden durur.</Text>
          </>
        )}
        {autoNote && !auto && <Text style={f.note}>{autoNote}</Text>}
      </View>

      <Pressable onPress={() => setShowPays((v) => !v)} accessibilityLabel="Ödeme tablosu">
        <Text style={f.link}>{showPays ? '▲ Ödeme tablosunu gizle' : '▼ Ödeme tablosu ve çizgiler'}</Text>
      </Pressable>
      {showPays && <Paytable lineBet={lineBet} />}

      <Text style={f.dim}>
        🎮 Kazançlar oyun bakiyesine yazılır; bahisler önce oradan düşer. Oyun bakiyesi yalnızca oyunlarda kullanılır, hediye edilemez ve paraya çevrilemez.
      </Text>
      <Text style={f.dim}>{game.rules}</Text>
    </View>
  );
}

function Paytable({ lineBet }: { lineBet: number }) {
  return (
    <View style={f.pays}>
      <Text style={f.paysHead}>Bir çizgideki kazanç (jeton) · 3 / 4 / 5 aynı</Text>
      {PAY_ORDER.map((s) => (
        <View key={s} style={f.payRow}>
          <Text style={f.payEmoji}>{SYMBOLS[s].emoji}</Text>
          <Text style={f.payName}>{SYMBOLS[s].name}</Text>
          <Text style={f.payVals}>{PAYTABLE[s]!.map((p) => fmt(p * lineBet)).join(' / ')}</Text>
        </View>
      ))}
      <Text style={f.dim}>
        {SYMBOLS[WILD].emoji} Servet (WILD) 2.–4. makarada çıkar, Kasa dışındaki her sembolün yerine geçer. {SYMBOLS[SCATTER].emoji} Kasa ekranın herhangi bir yerinde 3 veya daha fazla
        gelirse {FREE_SPINS} bedava dönüş, kazançlar ×{FREE_MULT}.
      </Text>
      <View style={f.lineGrid}>
        {LINES.map((rows, i) => (
          <View key={i} style={f.lineCard} accessibilityLabel={`Çizgi ${i + 1}`}>
            <Text style={f.lineNo}>{i + 1}</Text>
            {Array.from({ length: ROWS }, (_, row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 2 }}>
                {rows.map((r, reel) => (
                  <View key={reel} style={[f.dot, r === row && f.dotOn]} />
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  frame: { borderRadius: 22, padding: 3 },
  machine: { backgroundColor: '#1A1206', borderRadius: 19, padding: 10, gap: 8, overflow: 'hidden' },
  title: { color: '#FDE68A', fontWeight: '900', fontSize: 16, letterSpacing: 3, textAlign: 'center' },
  reels: { flexDirection: 'row', gap: 5, alignSelf: 'stretch' },
  reel: { flex: 1, minWidth: 0, gap: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: 3 },
  cell: { aspectRatio: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1D0A', borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.22)' },
  cellWild: { backgroundColor: '#3B2A07' },
  sym: { fontSize: 28 },
  symBlur: { opacity: 0.45 },
  tag: { position: 'absolute', bottom: 1, color: '#FDE68A', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  free: { color: '#FDE68A', fontWeight: '900', textAlign: 'center' },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,18,6,0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  bannerText: { color: '#FDE68A', fontWeight: '900', fontSize: 20, textAlign: 'center', lineHeight: 28 },
  big: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,18,6,0.9)', alignItems: 'center', justifyContent: 'center' },
  bigEmoji: { fontSize: 56 },
  bigLabel: { color: '#FACC15', fontWeight: '900', fontSize: 26, letterSpacing: 2 },
  bigAmount: { color: colors.text, fontWeight: '900', fontSize: 34 },
  bigMult: { color: '#FDE68A', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  chipOn: { borderColor: semantic.money, backgroundColor: 'rgba(246,189,96,0.15)' },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  spin: { backgroundColor: semantic.money, borderRadius: 999, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch' },
  spinText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  autoBox: { backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, gap: 8, borderWidth: 1, borderColor: colors.border },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  autoLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', width: 78 },
  autoText: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  mini: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 },
  miniText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  autoBtn: { borderRadius: 999, borderWidth: 1.5, borderColor: semantic.money, paddingVertical: 9, alignItems: 'center' },
  stop: { backgroundColor: colors.gold, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  stopText: { color: semantic.moneyInk, fontWeight: '900' },
  note: { color: semantic.tonalText, fontSize: 12, textAlign: 'center', fontWeight: '700' },
  result: { backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, gap: 2, borderWidth: 1, borderColor: colors.border },
  resultMain: { color: colors.text, fontWeight: '900', fontSize: 18, textAlign: 'center' },
  err: { color: colors.gold, textAlign: 'center', fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  link: { color: semantic.tonalText, fontSize: 13, textAlign: 'center', fontWeight: '800' },
  pays: { backgroundColor: colors.cardAlt, borderRadius: 14, padding: 12, gap: 6 },
  paysHead: { color: colors.text, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  payName: { color: colors.text, fontWeight: '700', flex: 1 },
  payVals: { color: colors.gold, fontWeight: '800' },
  lineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  lineCard: { alignItems: 'center', gap: 2, padding: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' },
  lineNo: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotOn: { backgroundColor: '#FACC15' },
});
