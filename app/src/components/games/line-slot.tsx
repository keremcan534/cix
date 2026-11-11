// Screen for every payline slot (lib/line-slot + lib/slot-configs): Hazine Kulesi, Kızıl Yedi, Vahşi Patika, Konfeti Kutusu,
// Kayıp Parşömen, Neon Bulvar. Each game only brings its theme below. playCasino (lib/games) settles the round before
// the reels come to rest; the reels (components/games/fx/reel) only replay outcome.slot: they run while the round is
// asked for, stop one after another, wait on the last ones when a scatter or the JACKPOT is one symbol away, and the
// win is shown by win-fx. Oto is repeated rounds from this screen and stops at the JACKPOT, a big win, the loss limit
// or any refusal (daily limit, balance, pool).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { RollingNumber } from '@/components/fx/rolling-number';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { Reel, type ReelHandle } from '@/components/games/fx/reel';
import { useWinFx } from '@/components/games/fx/win-fx';
import { BalancePill, BetStepper, fmt, sleep } from '@/components/games/slot-kit';
import type { LineSlotId } from '@/lib/casino-odds';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { playRound } from '@/lib/live/casino';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { slotWindow, stripsOf } from '@/lib/line-slot';
import { REEL_PACE, reelRun, teasedReels } from '@/lib/reel-plan';
import { winTierOf } from '@/lib/win-tier';
import { SLOT_CONFIGS, SPELL_PRIZES } from '@/lib/slot-configs';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
/** Oto stops when the net loss reaches this many stakes. */
const AUTO_LOSS = 25;

type Theme = {
  title: string;
  /** Gradient of the machine, top to bottom. */
  colors: [string, string, string];
  reels: string;
  reel: string;
  frame: string;
  ink: string;
  accent: string;
  status: string;
  spin: [string, string];
  /** Pictures for some symbols (else the label is drawn). */
  art?: Record<string, ArtName>;
  /** Colors of letter/number symbols. */
  letters?: Record<string, string>;
};
const THEMES: Record<LineSlotId, Theme> = {
  jackpot: {
    title: 'HAZİNE KULESİ',
    colors: ['#F472B6', '#C026D3', '#7E22CE'],
    reels: '#F0ABFC',
    reel: '#6B21A8',
    frame: '#FBBF24',
    ink: '#FDE68A',
    accent: '#9D174D',
    status: 'İYİ ŞANSLAR',
    spin: ['#FDE68A', '#F59E0B'],
    art: { cherry: 'slot-kiraz', bell: 'slot-can' },
    letters: { seven: '#EF4444', wild: '#F97316', dollar: '#FACC15' },
  },
  super777: {
    title: 'Kızıl Yedi',
    colors: ['#14532D', '#166534', '#052E16'],
    reels: '#B45309',
    reel: '#FEF3C7',
    frame: '#FACC15',
    ink: '#FDE68A',
    accent: '#065F46',
    status: 'BOL ŞANS',
    spin: ['#FDE68A', '#CA8A04'],
    art: { cherry: 'slot-kiraz', lemon: 'slot-limon', grape: 'slot-uzum' },
    letters: { seven: '#DC2626' },
  },
  jungle: {
    title: 'Vahşi Patika',
    colors: ['#4D7C0F', '#365314', '#422006'],
    reels: '#78350F',
    reel: '#451A03',
    frame: '#A3E635',
    ink: '#FDE68A',
    accent: '#1E3A8A',
    status: 'KAZANÇ',
    spin: ['#4ADE80', '#15803D'],
    letters: { ten: '#F59E0B', j: '#2DD4BF', q: '#E879F9', k: '#F87171', a: '#FB923C' },
  },
  pinata: {
    title: 'Konfeti Kutusu',
    colors: ['#38BDF8', '#F472B6', '#7C2D12'],
    reels: '#9A3412',
    reel: '#4C1D95',
    frame: '#FACC15',
    ink: '#FDE68A',
    accent: '#B91C1C',
    status: 'FIESTA!',
    spin: ['#FDE68A', '#EA580C'],
    letters: { j: '#A78BFA', q: '#FB923C', k: '#2DD4BF', a: '#F87171' },
  },
  spellbook: {
    title: 'Kayıp Parşömen',
    colors: ['#312E81', '#4C1D95', '#1E1B4B'],
    reels: '#6D28D9',
    reel: '#0B0A1A',
    frame: '#C4B5FD',
    ink: '#FDE68A',
    accent: '#1E3A8A',
    status: 'BÜYÜ BAŞLASIN',
    spin: ['#4ADE80', '#15803D'],
  },
  neon: {
    title: 'NEON BULVAR',
    colors: ['#4C1D95', '#6D28D9', '#312E81'],
    reels: '#F59E0B',
    reel: '#7C2D12',
    frame: '#38BDF8',
    ink: '#FDE68A',
    accent: '#4C1D95',
    status: 'İYİ ŞANSLAR',
    spin: ['#FDE68A', '#D97706'],
    letters: { j: '#818CF8', q: '#FACC15', k: '#F97316', wild: '#F43F5E' },
  },
};

/** One reel symbol: a picture, a BAR plate, a coloured letter or the emoji. */
function Symbol({ label, sym, theme, dim, size }: { label: string; sym: string; theme: Theme; dim?: boolean; size: number }) {
  const o = dim ? { opacity: 0.45 } : null;
  const art = theme.art?.[sym];
  if (art) return <Art name={art} size={size} style={o ?? undefined} />;
  if (label === 'BAR' || label === 'BAR BAR')
    return (
      <View style={[s.barWrap, o]}>
        {(label === 'BAR BAR' ? [0, 1] : [0]).map((i) => (
          <Text key={i} style={[s.bar, label === 'BAR BAR' && { fontSize: 11 }]}>
            BAR
          </Text>
        ))}
      </View>
    );
  if (/^[\x20-\x7E]+$/.test(label)) {
    const color = theme.letters?.[sym] ?? theme.ink;
    return (
      <Text style={[s.letter, { color, fontSize: label.length > 2 ? size * 0.36 : size * 0.72 }, label === '77' && { letterSpacing: -3 }, o]} numberOfLines={1}>
        {label}
      </Text>
    );
  }
  return <Text style={[{ fontSize: size * 0.72 }, o]}>{label}</Text>;
}

export function LineSlotPlayer({ id, entry }: { id: LineSlotId; entry: Entry }) {
  const c = SLOT_CONFIGS[id];
  const theme = THEMES[id];
  const reels = c.counts.length;
  const { wealthLevel, settings, setSetting, coins, gameCoins } = useApp();
  const { casino, bank } = useGames();
  const game = casino.find((g) => g.id === id)!;
  const still = settings.reduceMotion;
  const [bet, setBet] = useState(game.bets[Math.min(2, game.bets.length - 1)]);
  // The window the machine opens with; after that each reel keeps its own (components/games/fx/reel).
  const [opening] = useState(() => slotWindow(c, c.counts.map((_, r) => r * 4)));
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' | 'jackpot' }>({ text: theme.status });
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  // Reels still being waited for (the border glows on them), and the reels box's width (cells are sized from it).
  const [waiting, setWaiting] = useState<boolean[]>([]);
  const [width, setWidth] = useState(0);
  // While the reels run the pill shows the balance with the stake taken; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const handles = useRef<(ReelHandle | null)[]>([]);
  // What the reels show at rest (the reels keep their own columns; this is for a refused round and screen readers).
  const [grid, setGrid] = useState(opening);
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const [pulse] = useState(() => new Animated.Value(0));
  const [turn] = useState(() => new Animated.Value(0));
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const win = useWinFx();

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'stop', 'win', 'coin', 'tick']);
    return () => {
      alive.current = false;
      stopAuto.current = true;
      beat.current?.stop();
    };
  }, []);
  // The spin button's arrows turn while a round runs.
  useEffect(() => {
    if (!busy || still) return;
    const a = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => {
      a.stop();
      turn.setValue(0);
    };
  }, [busy, still, turn]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const strips = stripsOf(c);
  const fund = bank.jackpots[id];
  // A reel's width in the box (border, padding, gaps taken off); a symbol's cell is a little taller than wide.
  const cellW = width ? Math.floor((width - 16 - (reels - 1) * GAP) / reels) - 6 : 0;
  const cellH = Math.round(cellW / 0.9);
  const symSize = Math.min(reels === 3 ? 78 : 52, Math.round(cellW * 0.88));

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const pace = REEL_PACE[turbo ? 'turbo' : 'normal'];
    beat.current?.stop();
    pulse.setValue(0);
    setLit(new Set());
    setWaiting([]);
    setStatus({ text: theme.status });
    setHeld(balance.current - bet);
    pressHaptic();
    playSfx('spin', 0.7);
    let answered = false;
    const asked = playRound(id, bet, '', entry).then((r) => {
      answered = true;
      return r;
    });
    // The demo answers at once; a server needs a moment, and the reels run meanwhile instead of standing still.
    await sleep(30);
    if (!alive.current) return null;
    if (!answered && !still) handles.current.forEach((h) => h?.spin(pace));
    const r = await asked;
    if (!alive.current) return null;
    if (!r.ok) {
      // Refused (limit, balance, pool): the reels come back to where they stood.
      await Promise.all(handles.current.map((h, i) => h?.land(grid[i], reelRun(i, cellH + GAP, c.rows, REEL_PACE.turbo), REEL_PACE.turbo, still)));
      if (!alive.current) return null;
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    const sp = r.outcome.slot!;
    // One symbol from a scatter prize or the JACKPOT: the remaining reels are waited for (never in turbo).
    const waits = turbo || still ? sp.grid.map(() => 0) : teasedReels(sp.grid, { scatter: c.scatter, wild: c.wild, wildLine: !!c.jackpotShare });
    setWaiting(waits.map((w) => w > 0));
    await Promise.all(
      sp.grid.map((col, i) =>
        handles.current[i]?.land(col, reelRun(i, cellH + GAP, c.rows, pace, waits[i]), pace, still).then(() => {
          if (!alive.current) return;
          playSfx('stop', 0.75);
          tapHaptic();
          setWaiting((w) => w.map((x, k) => (k === i ? false : x)));
          if (waits[i + 1] && !waits[i]) playSfx('tease', 0.6);
        }),
      ),
    );
    if (!alive.current) return null;
    setGrid(sp.grid);
    setWaiting([]);
    const cells = new Set<string>();
    sp.wins.forEach((w) => c.lines[w.line].slice(0, w.count).forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (c.jackpotShare) sp.jackpotLines.forEach((l) => c.lines[l].forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (sp.scatters >= 3) sp.grid.forEach((col, reel) => col.forEach((x, row) => x === c.scatter && cells.add(`${reel}-${row}`)));
    setLit(cells);
    const payout = r.row.payout;
    // Less than the stake back is no win: the paying symbols are shown, but nothing beats, rings or rains.
    const won = payout > bet || (!!c.jackpotShare && sp.jackpotLines.length > 0);
    if (cells.size && won && !still) {
      beat.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      beat.current.start();
    }
    // Now the balance may show the win: it rolls up while the celebration runs.
    setHeld(null);
    if (c.jackpotShare && sp.jackpotLines.length) {
      const name = id === 'spellbook' ? 'GRAND' : 'JACKPOT';
      setStatus({ text: `${name}! +${fmt(payout)}`, tone: 'jackpot' });
      await win.celebrate({ amount: payout, bet, jackpot: true, title: name });
      return { net: payout - bet, stop: 'JACKPOT kazandın' };
    }
    if (won) {
      const prize = id === 'spellbook' && sp.scatters >= 3 ? ` · ${sp.scatters >= 5 ? 'MAJOR' : sp.scatters === 4 ? 'MINOR' : 'MINI'}` : '';
      setStatus({ text: `KAZANÇ +${fmt(payout)}${prize}`, tone: 'win' });
      const seen = win.celebrate({ amount: payout, bet });
      // Turbo doesn't stand still for a small win; everything bigger is watched to the end.
      if (!(turbo && winTierOf(payout, bet) === 'small')) await seen;
    } else if (payout > 0) setStatus({ text: `ÖDEME ${fmt(payout)}` });
    else setStatus({ text: theme.status });
    return { net: payout - bet, stop: payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
  };

  const play = async () => {
    if (busy || !cellW) return;
    setBusy(true);
    await spinOnce();
    if (alive.current) setBusy(false);
  };
  const toggleAuto = async () => {
    if (auto !== null) {
      stopAuto.current = true;
      return;
    }
    if (busy || !cellW) return;
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
  const paySyms = Object.keys(c.paytable).reverse();
  const jackpotName = id === 'spellbook' ? 'GRAND' : 'JACKPOT';

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={theme.colors} style={s.stage}>
        <View style={s.iconRow}>
          <Pressable style={[s.icon, { borderColor: theme.frame }]} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} accessibilityRole="button" accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color="#fff" />
          </Pressable>
          <InfoButton onPress={() => setInfo(true)} tint={theme.frame} />
        </View>
        <Text style={[s.title, { color: theme.ink, textShadowColor: theme.accent }, theme.title.length > 10 && { fontSize: 23 }]} accessibilityRole="header">
          {theme.title}
        </Text>
        {fund !== undefined && (
          <LinearGradient colors={['#EF4444', '#991B1B']} style={[s.jpBox, { borderColor: theme.frame }]} accessibilityLabel={`${jackpotName} ${Math.floor(fund)} jeton`}>
            <Text style={s.jpLabel}>{jackpotName}</Text>
            <RollingNumber value={Math.floor(fund)} style={s.jpValue} duration={900} />
          </LinearGradient>
        )}
        {id === 'spellbook' && (
          <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch' }}>
            {(['MINI', 'MAJOR', 'MINOR'] as const).map((k) => (
              <View key={k} style={[s.prize, k === 'MAJOR' && { backgroundColor: '#6D28D9' }, k === 'MINI' && { backgroundColor: '#047857' }]}>
                <Text style={s.prizeName}>{k}</Text>
                <Text style={s.prizeVal}>{fmt(SPELL_PRIZES[k] * bet)}</Text>
              </View>
            ))}
          </View>
        )}
        <View
          style={[s.reels, { backgroundColor: theme.reels, borderColor: theme.frame }]}
          onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
          accessibilityLabel={`Makaralar: ${grid.map((col) => col.map((x) => c.symbols[x].name).join(', ')).join(' | ')}`}
        >
          {cellW > 0 &&
            opening.map((col, reel) => (
              <View key={reel} style={[s.reel, { backgroundColor: theme.reel }, waiting[reel] && s.reelWait]}>
                <Reel
                  ref={(h) => {
                    handles.current[reel] = h;
                  }}
                  symbols={col}
                  strip={strips[reel]}
                  cell={cellH}
                  gap={GAP}
                  pulse={pulse}
                  dim={lit.size > 0}
                  lit={col.map((_, row) => lit.has(`${reel}-${row}`))}
                  render={(sym) => <Symbol label={c.symbols[sym].label} sym={sym} theme={theme} size={symSize} />}
                />
              </View>
            ))}
          {!cellW && <View style={{ height: 200 }} />}
        </View>
        <View style={[s.status, { borderColor: theme.frame, backgroundColor: theme.accent }, status.tone === 'win' && s.statusWin, status.tone === 'jackpot' && s.statusJp]} accessibilityLiveRegion="polite">
          <Text style={[s.statusText, { color: theme.ink }, status.tone === 'err' && { fontSize: 13, letterSpacing: 0 }]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
        {win.layer}
      </LinearGradient>

      <View style={s.controls}>
        <BalancePill tint="#2A0F3D" shown={held} />
        <Pressable onPress={auto !== null ? toggleAuto : play} disabled={busy && auto === null} style={[busy && auto === null && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `Çevir, ${bet} jeton`}>
          <LinearGradient colors={theme.spin} style={s.spinRing}>
            <View style={[s.spinCore, { backgroundColor: theme.accent }]}>
              {auto !== null ? (
                <Text style={[s.autoLeft, { color: theme.ink }]}>{auto}</Text>
              ) : (
                <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                  <Ionicons name="sync" size={34} color={theme.ink} />
                </Animated.View>
              )}
            </View>
          </LinearGradient>
        </Pressable>
        <View style={{ gap: 6, flex: 1 }}>
          <Pressable
            onPress={() => {
              tapHaptic();
              setTurbo((t) => !t);
            }}
            style={[s.side, turbo && s.sideOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: turbo }}
            accessibilityLabel={turbo ? 'Turbo kapat' : 'Turbo aç'}
          >
            <Text style={s.sideText}>⚡ TURBO</Text>
          </Pressable>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[s.side, auto !== null && s.sideOn]} accessibilityRole="button" accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            <Text style={s.sideText}>{auto !== null ? 'DUR' : 'OTO'}</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.betRow}>
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#3B0F4F" />
        <Text style={s.dim}>
          {c.lines.length} çizgi × {fmt(bet / c.lines.length)}
        </Text>
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={s.pays}>
          <Text style={s.paysHead}>
            Bir çizgideki kazanç · {fmt(bet)} jeton bahiste · {reels === 3 ? '3 aynı' : '3 / 4 / 5 aynı'}
          </Text>
          {paySyms.map((x) => (
            <View key={x} style={s.payRow}>
              <View style={{ width: 52, alignItems: 'center' }}>
                <Symbol label={c.symbols[x].label} sym={x} theme={theme} size={34} />
              </View>
              <Text style={s.payName}>{c.symbols[x].name}</Text>
              <Text style={s.payVals}>{c.paytable[x].map((p) => fmt((p * bet) / c.lines.length)).join(' / ')}</Text>
            </View>
          ))}
          {c.wild && (
            <Text style={s.paysNote}>
              {c.symbols[c.wild].name} her sembolün yerine geçer{c.jackpotShare ? `; bir çizgide beşi ${jackpotName} fonunun bahis / ${fmt(Math.max(...game.bets))} kadarını kazandırır.` : '.'}
            </Text>
          )}
          <Text style={s.paysNote}>
            Oto {AUTO_SPINS} tur çevirir; {c.jackpotShare ? `${jackpotName}, ` : ''}
            {BIG_WIN} kat kazanç veya {AUTO_LOSS} bahislik kayıpta kendiliğinden durur.
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

/** Between two symbols of a reel, and between two reels (px). */
const GAP = 4;

const s = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center', overflow: 'hidden' },
  iconRow: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6, zIndex: 2 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1, marginTop: 4, marginRight: 76, alignSelf: 'flex-start', marginLeft: 6 },
  jpBox: { alignSelf: 'stretch', marginHorizontal: 18, borderRadius: 999, borderWidth: 3, paddingVertical: 3, alignItems: 'center' },
  jpLabel: { color: '#FEF3C7', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  jpValue: { color: '#FDE68A', fontSize: 28, fontWeight: '900', letterSpacing: 2, marginTop: -2, fontVariant: ['tabular-nums'] },
  prize: { flex: 1, alignItems: 'center', borderRadius: 10, backgroundColor: '#1D4ED8', paddingVertical: 4, borderWidth: 1.5, borderColor: '#FDE68A' },
  prizeName: { color: '#FDE68A', fontSize: 11, fontWeight: '900' },
  prizeVal: { color: '#fff', fontSize: 15, fontWeight: '900' },
  reels: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch', borderRadius: 16, padding: 5, borderWidth: 3 },
  reel: { flex: 1, minWidth: 0, borderRadius: 10, padding: 1, borderWidth: 2, borderColor: 'transparent' },
  // A reel being waited for: its frame lights up until it stops.
  reelWait: { borderColor: '#FDE047', shadowColor: '#FDE047', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  barWrap: { gap: 2, alignItems: 'center' },
  bar: { color: '#7C2D12', backgroundColor: '#FBBF24', fontWeight: '900', fontSize: 13, paddingHorizontal: 4, borderRadius: 3, borderWidth: 1.5, borderColor: '#7C2D12', overflow: 'hidden' },
  letter: { fontWeight: '900', fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  status: { alignSelf: 'stretch', borderRadius: 10, borderWidth: 2, paddingVertical: 6, paddingHorizontal: 8 },
  statusWin: { backgroundColor: '#15803D' },
  statusJp: { backgroundColor: '#B45309' },
  statusText: { fontWeight: '900', fontSize: 19, textAlign: 'center', letterSpacing: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spinRing: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  spinCore: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  autoLeft: { fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  side: { borderRadius: 14, borderWidth: 2, borderColor: '#F0ABFC', backgroundColor: '#7C3AED', paddingVertical: 9, alignItems: 'center' },
  sideOn: { backgroundColor: '#DB2777', borderColor: '#FACC15' },
  sideText: { color: '#FDE68A', fontWeight: '900', fontSize: 14 },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17 },
  pays: { gap: 8 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payName: { color: '#fff', fontWeight: '700', flex: 1 },
  payVals: { color: '#FDE68A', fontWeight: '800', fontVariant: ['tabular-nums'] },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
