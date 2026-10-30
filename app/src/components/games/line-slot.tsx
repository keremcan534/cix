// Screen for every payline slot (lib/line-slot + lib/slot-configs): Mega Jackpot, Süper 777, Orman Avı, Piñata,
// Büyü Kitabı, Neon Jackpot. Each game only brings its theme below. playCasino (lib/games) settles the round before
// the reels move; the reels only replay outcome.slot. Oto is repeated rounds from this screen and stops at the
// JACKPOT, a big win, the loss limit or any refusal (daily limit, balance, pool).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Art, type ArtName } from '@/components/Art';
import { CasinoLock } from '@/components/games/casino';
import { BalancePill, BetStepper, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import type { LineSlotId } from '@/lib/casino-odds';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { slotWindow, stripsOf } from '@/lib/line-slot';
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
    title: 'MEGA JACKPOT',
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
    title: 'Süper 777',
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
    title: 'Orman Avı',
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
    title: 'Piñata',
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
    title: 'Büyü Kitabı',
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
    title: 'NEON JACKPOT',
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
  const { wealthLevel, settings, setSetting } = useApp();
  const { casino, bank } = useGames();
  const game = casino.find((g) => g.id === id)!;
  const [bet, setBet] = useState(game.bets[Math.min(2, game.bets.length - 1)]);
  const [grid, setGrid] = useState<string[][]>(() => slotWindow(c, c.counts.map((_, r) => r * 4)));
  const [spinning, setSpinning] = useState<boolean[]>(Array(reels).fill(false));
  const [tick, setTick] = useState(0);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ text: string; tone?: 'win' | 'err' | 'jackpot' }>({ text: theme.status });
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
    const t = setInterval(() => setTick((n) => n + 1), 70);
    return () => clearInterval(t);
  }, [anySpin]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const strips = stripsOf(c);
  const blur = (reel: number, row: number) => {
    const n = strips[reel].length;
    return strips[reel][(((reel * 5 - tick + row) % n) + n) % n];
  };
  const fund = bank.jackpots[id];
  const cell = reels === 3 ? 76 : 50;

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const r = playCasino(id, bet, '', entry, newRequestId());
    if (!r.ok) {
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const sp = r.outcome.slot!;
    setLit(new Set());
    setStatus({ text: theme.status });
    setSpinning(Array(reels).fill(true));
    await sleep(turbo ? 250 : 650);
    for (let reel = 0; reel < reels; reel++) {
      if (!alive.current) return null;
      setGrid((g) => g.map((col, i) => (i === reel ? sp.grid[reel] : col)));
      setSpinning((v) => v.map((x, i) => (i === reel ? false : x)));
      await sleep(turbo ? 60 : 180);
    }
    const cells = new Set<string>();
    sp.wins.forEach((w) => c.lines[w.line].slice(0, w.count).forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (c.jackpotShare) sp.jackpotLines.forEach((l) => c.lines[l].forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (sp.scatters >= 3) sp.grid.forEach((col, reel) => col.forEach((x, row) => x === c.scatter && cells.add(`${reel}-${row}`)));
    setLit(cells);
    const payout = r.row.payout;
    if (c.jackpotShare && sp.jackpotLines.length) {
      setStatus({ text: `🎉 ${id === 'spellbook' ? 'GRAND' : 'JACKPOT'}! +${fmt(payout)} jeton`, tone: 'jackpot' });
      successHaptic();
      return { net: payout - bet, stop: 'JACKPOT kazandın' };
    }
    if (payout > 0) {
      const prize = id === 'spellbook' && sp.scatters >= 3 ? ` · ${sp.scatters >= 5 ? 'MAJOR' : sp.scatters === 4 ? 'MINOR' : 'MINI'}` : '';
      setStatus({ text: `KAZANÇ +${fmt(payout)}${prize}`, tone: 'win' });
      successHaptic();
    } else setStatus({ text: theme.status });
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
  const paySyms = Object.keys(c.paytable).reverse();

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={theme.colors} style={s.stage}>
        <View style={s.iconRow}>
          <Pressable style={[s.icon, { borderColor: theme.frame }]} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          </Pressable>
          <Pressable style={[s.icon, { borderColor: theme.frame }]} onPress={() => setShowPays((v) => !v)} accessibilityLabel="Ödeme tablosu">
            <Ionicons name="help" size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={[s.title, { color: theme.ink, textShadowColor: theme.accent }, theme.title.length > 10 && { fontSize: 23 }]} accessibilityRole="header">
          {theme.title}
        </Text>
        {fund !== undefined && (
          <LinearGradient colors={['#EF4444', '#991B1B']} style={[s.jpBox, { borderColor: theme.frame }]}>
            <Text style={s.jpLabel}>{id === 'spellbook' ? 'GRAND' : 'JACKPOT'}</Text>
            <Text style={s.jpValue} accessibilityLabel={`JACKPOT ${Math.floor(fund)} jeton`}>
              {fmt(fund)}
            </Text>
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
        <View style={[s.reels, { backgroundColor: theme.reels, borderColor: theme.frame }]} accessibilityLabel={`Makaralar: ${grid.map((col) => col.map((x) => c.symbols[x].name).join(', ')).join(' | ')}`}>
          {grid.map((col, reel) => (
            <View key={reel} style={[s.reel, { backgroundColor: theme.reel }]}>
              {col.map((sym, row) => {
                const shown = spinning[reel] ? blur(reel, row) : sym;
                return (
                  <View key={row} style={[s.cell, lit.has(`${reel}-${row}`) && s.cellOn]}>
                    <Symbol label={c.symbols[shown].label} sym={shown} theme={theme} dim={spinning[reel]} size={cell} />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={[s.status, { borderColor: theme.frame, backgroundColor: theme.accent }, status.tone === 'win' && s.statusWin, status.tone === 'jackpot' && s.statusJp]} accessibilityLiveRegion="polite">
          <Text style={[s.statusText, { color: theme.ink }, status.tone === 'err' && { fontSize: 13, letterSpacing: 0 }]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
      </LinearGradient>

      <View style={s.controls}>
        <BalancePill tint="#2A0F3D" />
        <Pressable onPress={play} disabled={busy} style={[busy && { opacity: 0.6 }]} accessibilityLabel={`Çevir, ${bet} jeton`}>
          <LinearGradient colors={theme.spin} style={s.spinRing}>
            <View style={[s.spinCore, { backgroundColor: theme.accent }]}>
              <Ionicons name="sync" size={34} color={theme.ink} />
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
            accessibilityLabel={turbo ? 'Turbo kapat' : 'Turbo aç'}
          >
            <Text style={s.sideText}>⚡ TURBO</Text>
          </Pressable>
          <Pressable onPress={toggleAuto} disabled={busy && auto === null} style={[s.side, auto !== null && s.sideOn]} accessibilityLabel={auto !== null ? 'Otomatik çevirmeyi durdur' : `${AUTO_SPINS} kez otomatik çevir`}>
            <Text style={s.sideText}>{auto !== null ? `Dur · ${auto}` : 'OTO'}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} disabled={busy} tint="#3B0F4F" />
      </View>
      <Text style={s.dim}>
        {c.lines.length} çizgi × {fmt(bet / c.lines.length)} · Oto {AUTO_SPINS} tur; {c.jackpotShare ? 'JACKPOT, ' : ''}
        {BIG_WIN}x kazanç veya {AUTO_LOSS} bahislik kayıpta durur.
      </Text>
      {showPays && (
        <View style={s.pays}>
          <Text style={s.paysHead}>Bir çizgideki kazanç (jeton) · {reels === 3 ? '3 aynı' : '3 / 4 / 5 aynı'}</Text>
          {paySyms.map((x) => (
            <View key={x} style={s.payRow}>
              <View style={{ width: 52, alignItems: 'center' }}>
                <Symbol label={c.symbols[x].label} sym={x} theme={theme} size={34} />
              </View>
              <Text style={s.payName}>{c.symbols[x].name}</Text>
              <Text style={s.payVals}>{c.paytable[x].map((p) => fmt((p * bet) / c.lines.length)).join(' / ')}</Text>
            </View>
          ))}
          {c.wild && <Text style={s.dim}>{c.symbols[c.wild].label} her sembolün yerine geçer{c.jackpotShare ? `; bir çizgide beşi JACKPOT’un bahis / ${fmt(Math.max(...game.bets))} kadarını kazandırır.` : '.'}</Text>}
        </View>
      )}
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center' },
  iconRow: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6, zIndex: 2 },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1, marginTop: 4, marginRight: 70, alignSelf: 'flex-start', marginLeft: 6 },
  jpBox: { alignSelf: 'stretch', marginHorizontal: 18, borderRadius: 999, borderWidth: 3, paddingVertical: 3, alignItems: 'center' },
  jpLabel: { color: '#FEF3C7', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  jpValue: { color: '#FDE68A', fontSize: 28, fontWeight: '900', letterSpacing: 2, marginTop: -2 },
  prize: { flex: 1, alignItems: 'center', borderRadius: 10, backgroundColor: '#1D4ED8', paddingVertical: 4, borderWidth: 1.5, borderColor: '#FDE68A' },
  prizeName: { color: '#FDE68A', fontSize: 11, fontWeight: '900' },
  prizeVal: { color: '#fff', fontSize: 15, fontWeight: '900' },
  reels: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', borderRadius: 16, padding: 5, borderWidth: 3 },
  reel: { flex: 1, minWidth: 0, gap: 4, borderRadius: 10, padding: 3 },
  cell: { aspectRatio: 0.9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cellOn: { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.25)' },
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
  side: { borderRadius: 14, borderWidth: 2, borderColor: '#F0ABFC', backgroundColor: '#7C3AED', paddingVertical: 9, alignItems: 'center' },
  sideOn: { backgroundColor: '#DB2777', borderColor: '#FACC15' },
  sideText: { color: '#FDE68A', fontWeight: '900', fontSize: 14 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pays: { backgroundColor: '#2A0F3D', borderRadius: 14, padding: 12, gap: 6 },
  paysHead: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payName: { color: '#fff', fontWeight: '700', flex: 1 },
  payVals: { color: '#FDE68A', fontWeight: '800' },
});
