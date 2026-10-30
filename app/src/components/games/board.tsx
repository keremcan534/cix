// Screen for the bet boards (lib/board-games): Lucky 77 fruit wheel, Lezzet Çarkı and Büyücü Kartı. Pick a chip, tap
// options to stack it on them (several options per round), then start: playBoard (lib/games) draws one result and
// settles every bet before anything moves; the wheel or the light only lands on that result. Tekrar puts the last
// round's bets back. Every option returns at most 40 % on its own (house rule).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BalancePill, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { BOARDS, LUCKY_WHEEL, type BoardResult } from '@/lib/board-games';
import type { BoardId } from '@/lib/casino-odds';
import { casinoAccess, newRequestId, playBoard, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : String(n));
const CHIP_COLORS = ['#7C3AED', '#EA580C', '#65A30D', '#2563EB'];
const WHEEL = 230;
const SLICE = 360 / LUCKY_WHEEL.length;

type Look = { title: string; colors: [string, string, string]; card: string; cardOn: string; ink: string };
const LOOKS: Record<BoardId, Look> = {
  slot: { title: 'Lucky 77', colors: ['#2B1065', '#4C1D95', '#1E0B45'], card: '#86198F', cardOn: '#C026D3', ink: '#FDE68A' },
  foodwheel: { title: 'Lezzet Çarkı', colors: ['#4C1D95', '#7E22CE', '#312E81'], card: '#5B21B6', cardOn: '#DB2777', ink: '#FDE68A' },
  magiccard: { title: 'Büyücü Kartı', colors: ['#3B0764', '#581C87', '#1E1B4B'], card: '#2E1065', cardOn: '#A16207', ink: '#FDE68A' },
};

export function BoardPlayer({ id, entry }: { id: BoardId; entry: Entry }) {
  const board = BOARDS[id];
  const look = LOOKS[id];
  const { wealthLevel } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === id)!;
  const [chip, setChip] = useState(game.bets[0]);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [last, setLast] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [won, setWon] = useState(0);
  const [history, setHistory] = useState<BoardResult[]>([]);
  const [lit, setLit] = useState<string | null>(null);
  const [center, setCenter] = useState<BoardResult | null>(null);
  const [msg, setMsg] = useState<{ text: string; win?: boolean } | null>(null);
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

  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const place = (opt: string) => {
    if (busy) return;
    tapHaptic();
    setBets((b) => ({ ...b, [opt]: (b[opt] ?? 0) + chip }));
  };

  /** Lucky 77 turns the wheel; the others run a light around the options and stop on the result. */
  const land = async (r: BoardResult) => {
    if (id === 'slot') {
      const slices = LUCKY_WHEEL.map((x, i) => (x === r.id ? i : -1)).filter((i) => i >= 0);
      const slice = slices[Math.floor(Math.random() * slices.length)];
      turns.current += 5;
      const target = turns.current * 360 + (360 - slice * SLICE);
      await new Promise<void>((done) => Animated.timing(angle, { toValue: target, duration: 3000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => done()));
      turns.current = Math.ceil(target / 360);
      return;
    }
    const ids = board.options.map((o) => o.id);
    const stopAt = ids.includes(r.id) ? ids.indexOf(r.id) : -1;
    const steps = ids.length * 3 + (stopAt >= 0 ? stopAt : Math.floor(Math.random() * ids.length));
    for (let i = 0; i <= steps; i++) {
      if (!alive.current) return;
      setLit(ids[i % ids.length]);
      await sleep(60 + (i / steps) ** 3 * 260);
    }
    if (stopAt < 0) {
      setLit(null);
      setCenter(r);
    }
  };

  const start = async (placed = bets) => {
    if (busy) return;
    const res = playBoard(id, placed, entry, newRequestId());
    if (!res.ok) {
      setMsg({ text: res.reason });
      errorHaptic();
      return;
    }
    pressHaptic();
    setBusy(true);
    setBets(placed);
    setMsg(null);
    setCenter(null);
    const r = res.outcome.board!;
    await land(r);
    if (!alive.current) return;
    const payout = res.row.payout;
    setRound((n) => n + 1);
    setHistory((h) => [r, ...h].slice(0, 9));
    setLast(placed);
    setWon((w) => w + payout);
    setMsg(payout > 0 ? { text: `${r.label} ${r.name}! +${fmt(payout)} jeton`, win: true } : { text: `${r.label} ${r.name} · bu tur kazanç yok` });
    if (payout > 0) successHaptic();
    setBets({});
    setBusy(false);
  };

  const optionCard = (o: (typeof board.options)[number], style?: object) => (
    <Pressable
      key={o.id}
      onPress={() => place(o.id)}
      disabled={busy}
      style={[s.card, { backgroundColor: look.card }, lit === o.id && { backgroundColor: look.cardOn, borderColor: '#FACC15' }, style]}
      accessibilityLabel={`${o.name}, ${o.mult} kat${bets[o.id] ? `, bahsin ${bets[o.id]}` : ''}`}
    >
      <Text style={o.label === '77' ? s.seven : id === 'magiccard' ? s.zodiac : s.optEmoji}>{o.label}</Text>
      <Text style={[s.mult, { color: look.ink }]}>x{o.mult}</Text>
      <Text style={s.myBet}>{bets[o.id] ? `🪙 ${short(bets[o.id])}` : o.name}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={look.colors} style={s.stage}>
        <View style={s.topRow}>
          <Text style={s.round}>Tur: {round}</Text>
          <Text style={[s.title, { color: look.ink }]}>{look.title}</Text>
          <Text style={s.round}>Bugün +{short(won)}</Text>
        </View>

        {id === 'slot' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={s.pointer}>▼</Text>
            <LinearGradient colors={['#FDE68A', '#B45309', '#FDE68A']} style={s.rim}>
              <Animated.View style={[s.wheel, { transform: [{ rotate: angle.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }]} accessibilityLabel="Meyve çarkı">
                {LUCKY_WHEEL.map((x, i) => {
                  const r = board.results.find((y) => y.id === x)!;
                  return (
                    <View key={i} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${i * SLICE}deg` }] }]}>
                      <View style={[s.slice, x === 'seven' && s.sliceSeven]}>
                        <Text style={x === 'seven' ? s.sevenSmall : { fontSize: 22 }}>{r.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
              <View style={s.hub} pointerEvents="none">
                <Text style={s.hubText}>{round}</Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {id === 'foodwheel' && (
          <View style={s.ferris}>
            {board.options.map((o, i) => {
              const a = (i / board.options.length) * Math.PI * 2 - Math.PI / 2;
              return optionCard(o, { position: 'absolute', left: 140 + Math.cos(a) * 104 - 36, top: 140 + Math.sin(a) * 104 - 36, width: 72, height: 72 });
            })}
            <View style={s.ferrisHub}>
              <Text style={{ fontSize: 34 }}>{center ? center.label : '🧑‍🚀'}</Text>
              <Text style={s.hubName}>{center ? center.name : busy ? 'Dönüyor…' : 'Seç ve başlat'}</Text>
            </View>
          </View>
        )}

        {id === 'magiccard' && (
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <View style={s.cardGrid}>{board.options.map((o) => optionCard(o, { width: '23%', aspectRatio: 0.7 }))}</View>
            {center && (
              <Text style={s.joker}>
                {center.label} {center.name} açıldı
              </Text>
            )}
          </View>
        )}

        {id === 'slot' && <View style={s.board}>{board.options.map((o) => optionCard(o, { flex: 1 }))}</View>}

        <View style={s.history}>
          <Text style={s.histLabel}>Sonuç</Text>
          {history.length ? (
            history.map((r, i) => (
              <Text key={i} style={[s.histItem, i === 0 && s.histNew]}>
                {r.label}
              </Text>
            ))
          ) : (
            <Text style={s.histLabel}>henüz yok</Text>
          )}
        </View>
        <View style={[s.msg, msg?.win && { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.18)' }]} accessibilityLiveRegion="polite">
          <Text style={[s.msgText, msg?.win && { color: '#FDE68A' }]}>{busy ? 'Sonuç bekleniyor…' : (msg?.text ?? `Toplam bahis 🪙 ${fmt(total)}`)}</Text>
        </View>
      </LinearGradient>

      <View style={s.chips}>
        {game.bets.map((b, i) => (
          <Pressable key={b} onPress={() => setChip(b)} style={[s.chip, { backgroundColor: CHIP_COLORS[i % 4] }, chip === b && s.chipOn]} accessibilityLabel={`Fiş ${b}`}>
            <Text style={s.chipText}>{short(b)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BalancePill />
        <Pressable onPress={() => setBets({})} disabled={busy || !total} style={[s.small, (!total || busy) && { opacity: 0.5 }]} accessibilityLabel="Bahisleri temizle">
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={() => start(last)} disabled={busy || !Object.keys(last).length} style={[s.small, (busy || !Object.keys(last).length) && { opacity: 0.5 }]} accessibilityLabel="Son bahisleri tekrarla">
          <Text style={s.smallText}>Tekrar</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => start()} disabled={busy || !total} style={[s.go, (busy || !total) && { opacity: 0.55 }]} accessibilityLabel={`Başlat, toplam ${total} jeton`}>
        <LinearGradient colors={['#F472B6', '#A21CAF']} style={s.goInner}>
          <Text style={s.goText}>{busy ? '…' : total ? `BAŞLAT · 🪙 ${fmt(total)}` : 'Önce bir seçeneğe fiş koy'}</Text>
        </LinearGradient>
      </Pressable>
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { borderRadius: 22, padding: 12, gap: 12, alignItems: 'center' },
  topRow: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '900', fontSize: 18, fontStyle: 'italic' },
  round: { color: '#E9D5FF', fontWeight: '800', fontSize: 12 },
  pointer: { color: '#FACC15', fontSize: 28, marginBottom: -14, zIndex: 2 },
  rim: { width: WHEEL + 16, height: WHEEL + 16, borderRadius: (WHEEL + 16) / 2, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: WHEEL, height: WHEEL, borderRadius: WHEEL / 2, backgroundColor: '#1D4ED8', borderWidth: 3, borderColor: '#60A5FA', overflow: 'hidden' },
  slice: { marginTop: 6, width: 32, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  sliceSeven: { backgroundColor: '#DB2777' },
  sevenSmall: { fontSize: 16, fontWeight: '900', fontStyle: 'italic', color: '#FDE68A' },
  hub: { position: 'absolute', top: (WHEEL + 16) / 2 - 30, left: (WHEEL + 16) / 2 - 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#312E81', borderWidth: 3, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  hubText: { color: '#A3E635', fontWeight: '900', fontSize: 18 },
  board: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  card: { alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 6, borderRadius: 14, borderWidth: 2, borderColor: '#A16207' },
  optEmoji: { fontSize: 28 },
  zodiac: { fontSize: 30, color: '#FDE68A' },
  seven: { fontSize: 24, fontWeight: '900', fontStyle: 'italic', color: '#FDE68A', textShadowColor: '#7C3AED', textShadowRadius: 3 },
  mult: { fontWeight: '900', fontSize: 15 },
  myBet: { color: '#fff', fontWeight: '800', fontSize: 10 },
  ferris: { width: 280, height: 280 },
  ferrisHub: { position: 'absolute', left: 90, top: 90, width: 100, height: 100, borderRadius: 50, backgroundColor: '#312E81', borderWidth: 3, borderColor: '#A78BFA', alignItems: 'center', justifyContent: 'center' },
  hubName: { color: '#E9D5FF', fontSize: 10, fontWeight: '800', textAlign: 'center' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  joker: { color: '#FDE68A', fontWeight: '900', textAlign: 'center' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  histLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  histItem: { fontSize: 16, color: '#FDE68A', fontWeight: '900' },
  histNew: { backgroundColor: 'rgba(250,204,21,0.25)', borderRadius: 6, paddingHorizontal: 2, overflow: 'hidden' },
  msg: { alignSelf: 'stretch', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 8 },
  msgText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  chip: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed' },
  chipOn: { borderColor: '#FACC15', borderStyle: 'solid', transform: [{ scale: 1.12 }] },
  chipText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  small: { borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#DB2777', alignItems: 'center', justifyContent: 'center' },
  smallText: { color: '#fff', fontWeight: '900' },
  go: { borderRadius: 999, overflow: 'hidden' },
  goInner: { paddingVertical: 15, alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
});
