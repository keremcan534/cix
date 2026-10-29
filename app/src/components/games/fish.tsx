// Balık Avı: fish swim across the scene; tap one and the cannon fires. Every shot at a fish is one casino round
// (playCasino, pick = the fish), settled before the bullet lands; a shot that hits no fish is free and is not a round.
// Freeze stops the fish for a moment and lock-on keeps Oto on one fish; neither changes the odds (lib/fish-hunt).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BetStepper, GameBalanceNote, fmt } from '@/components/games/slot-kit';
import { FISH, type FishKind } from '@/lib/fish-hunt';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

const HEIGHT = 380;
const FRAME = 50;
const SCHOOL = 7;
const FREEZE_MS = 6_000;
const FREEZE_COOLDOWN = 30_000;
const AUTO_EVERY = 700;
/** Oto stops when the net loss reaches this many shots. */
const AUTO_LOSS = 50;
const SPAWN_TOTAL = FISH.reduce((n, f) => n + f.spawn, 0);

type Fish = { key: number; kind: FishKind; y: number; dir: 1 | -1; born: number; amp: number; caught?: number; win?: number; missed?: number };
type Shot = { key: number; x: number; y: number; at: number; hit: boolean };

const pickKind = () => {
  let r = Math.random() * SPAWN_TOTAL;
  return FISH.find((f) => (r -= f.spawn) < 0) ?? FISH[0];
};

export function FishPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, me, coins, gameCoins } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'fish')!;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [width, setWidth] = useState(340);
  const [now, setNow] = useState(0);
  /** Wall clock of the last frame (freeze timers), read in render instead of Date.now(). */
  const [wall, setWall] = useState(0);
  const [fish, setFish] = useState<Fish[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [aim, setAim] = useState(0);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [freezeReady, setFreezeReady] = useState(0);
  const [lockOn, setLockOn] = useState(false);
  const [lockKey, setLockKey] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [session, setSession] = useState({ shots: 0, net: 0 });
  const clock = useRef(0);
  const nextKey = useRef(1);
  const fishRef = useRef<Fish[]>([]);
  useEffect(() => {
    fishRef.current = fish;
  }, [fish]);
  const autoNet = useRef(0);

  // Scene clock: advances only while the fish are not frozen.
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() >= frozenUntil) clock.current += FRAME;
      setNow(clock.current);
      setWall(Date.now());
    }, FRAME);
    return () => clearInterval(id);
  }, [frozenUntil]);

  const xOf = (f: Fish, t: number) => {
    const p = (t - f.born) / (f.kind.cross * 1000);
    const span = width + f.kind.size * 2;
    return f.dir === 1 ? -f.kind.size + p * span : width + f.kind.size - p * span;
  };
  const yOf = (f: Fish, t: number) => f.y + Math.sin((t - f.born) / 600) * f.amp;

  // Keep a school swimming: drop fish that left the scene (or were caught), spawn new ones.
  useEffect(() => {
    setFish((list) => {
      const alive = list.filter((f) => {
        const p = (now - f.born) / (f.kind.cross * 1000);
        return p < 1.05 && !(f.caught && now - f.caught > 900);
      });
      // The first school starts spread across the scene; later fish enter from the edge.
      const first = list.length === 0;
      while (alive.length < SCHOOL) {
        const kind = pickKind();
        alive.push({ key: nextKey.current++, kind, y: 30 + Math.random() * (HEIGHT - 150), dir: Math.random() < 0.5 ? 1 : -1, born: now - (first ? Math.random() * kind.cross * 900 : 0), amp: 6 + Math.random() * 14 });
      }
      return alive;
    });
    setShots((s) => s.filter((x) => now - x.at < 600));
  }, [now]);

  const fire = (target: Fish | null, at: { x: number; y: number }) => {
    const cx = width / 2;
    setAim((Math.atan2(at.x - cx, HEIGHT - 40 - at.y) * 180) / Math.PI);
    const key = nextKey.current++;
    if (!target) {
      setShots((s) => [...s, { key, x: at.x, y: at.y, at: clock.current, hit: false }]);
      tapHaptic();
      return null;
    }
    const r = playCasino('fish', bet, target.kind.id, entry, newRequestId());
    if (!r.ok) {
      setNote(r.reason);
      errorHaptic();
      return null;
    }
    pressHaptic();
    setNote(null);
    setShots((s) => [...s, { key, x: at.x, y: at.y, at: clock.current, hit: true }]);
    const payout = r.row.payout;
    setFish((list) => list.map((f) => (f.key !== target.key ? f : payout > 0 ? { ...f, caught: clock.current, win: payout } : { ...f, missed: clock.current })));
    if (payout > 0) successHaptic();
    setSession((s) => ({ shots: s.shots + 1, net: s.net + payout - bet }));
    return payout - bet;
  };

  // The tap layer is empty and covers the scene, so locationX/Y are scene coordinates.
  const onTap = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const hit = fishRef.current.filter((f) => !f.caught).find((f) => Math.hypot(xOf(f, clock.current) - x, yOf(f, clock.current) - y) < f.kind.size / 2 + 12);
    if (lockOn && hit) setLockKey(hit.key);
    fire(hit ?? null, { x, y });
  };

  // Oto: fire at the locked fish, else at a random fish on screen; stops at the loss limit or any refusal.
  useEffect(() => {
    if (!auto) return;
    autoNet.current = 0;
    const id = setInterval(() => {
      const t = clock.current;
      const live = fishRef.current.filter((f) => !f.caught && xOf(f, t) > 0 && xOf(f, t) < width);
      const target = live.find((f) => f.key === lockKey) ?? (lockOn ? undefined : live[Math.floor(Math.random() * live.length)]);
      if (!target) return;
      const net = fire(target, { x: xOf(target, t), y: yOf(target, t) });
      if (net === null) return setAuto(false);
      autoNet.current += net;
      if (-autoNet.current >= bet * AUTO_LOSS) {
        setAuto(false);
        setNote(`Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)} jeton)`);
      }
    }, AUTO_EVERY);
    return () => clearInterval(id);
    // fire/xOf read the latest fish through fishRef; restarting on every frame would reset the loss count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, lockKey, lockOn, bet, width]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const frozen = wall < frozenUntil;
  const freezeWait = Math.max(0, Math.ceil((freezeReady - wall) / 1000));
  const freeze = () => {
    if (freezeWait > 0 || frozen) return;
    tapHaptic();
    setFrozenUntil(Date.now() + FREEZE_MS);
    setFreezeReady(Date.now() + FREEZE_COOLDOWN);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={f.scene} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LinearGradient colors={['#1E1B4B', '#4C1D95', '#7C2D12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[f.glow, { left: -40, top: 40, backgroundColor: 'rgba(249,115,22,0.25)' }]} />
        <View style={[f.glow, { right: -50, top: 160, backgroundColor: 'rgba(56,189,248,0.18)' }]} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {fish.map((x) => {
            const fx = xOf(x, now);
            const fy = yOf(x, now);
            const s = x.kind.size;
            const caught = x.caught !== undefined;
            const spinT = caught ? Math.min(1, (now - x.caught!) / 800) : 0;
            return (
              <View key={x.key} pointerEvents="none" style={[f.fish, { left: fx - s / 2, top: fy - s / 2, width: s, height: s + 14, opacity: caught ? 1 - spinT * 0.8 : 1 }]}>
                {x.key === lockKey && <View style={[f.lock, { width: s + 10, height: s + 10, borderRadius: (s + 10) / 2, left: -5, top: -5 }]} />}
                <Text style={{ fontSize: s * 0.82, transform: [{ scaleX: x.dir === 1 ? -1 : 1 }, { rotate: `${spinT * 540}deg` }] }}>{x.kind.emoji}</Text>
                <Text style={f.mult}>{x.kind.mult}x</Text>
                {frozen && <Text style={f.ice}>❄️</Text>}
                {caught && <Text style={[f.win, { top: -18 - spinT * 26 }]}>+{fmt(x.win ?? 0)}</Text>}
                {x.missed !== undefined && now - x.missed < 400 && <Text style={f.miss}>💨</Text>}
              </View>
            );
          })}
          {shots.map((b) => {
            const t = Math.min(1, (now - b.at) / 200);
            const cx = width / 2;
            const cy = HEIGHT - 40;
            return t < 1 ? (
              <View key={b.key} pointerEvents="none" style={[f.bullet, { left: cx + (b.x - cx) * t - 5, top: cy + (b.y - cy) * t - 5 }]} />
            ) : (
              <Text key={b.key} pointerEvents="none" style={[f.net, { left: b.x - 22, top: b.y - 22 }]}>
                {b.hit ? '🕸️' : '💧'}
              </Text>
            );
          })}
        </View>
        {/* A responder view, not a Pressable: press events on web carry no tap position. */}
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={onTap} accessibilityRole="button" accessibilityLabel="Ateş etmek için bir balığa dokun" />

        <View style={f.player} pointerEvents="none">
          <Text style={f.playerName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text style={f.playerCoins}>🪙 {fmt(coins + gameCoins)}</Text>
        </View>
        <View style={f.cards}>
          <Pressable onPress={() => (setLockOn((v) => !v), setLockKey(null))} style={[f.card, { backgroundColor: '#DC2626' }, lockOn && f.cardOn]} accessibilityLabel={lockOn ? 'Kilidi kapat' : 'Hedef kilidi: Oto bir balığa ateş eder'}>
            <Ionicons name="locate" size={22} color="#fff" />
            <Text style={f.cardText}>{lockOn ? 'Açık' : 'Kilit'}</Text>
          </Pressable>
          <Pressable onPress={freeze} style={[f.card, { backgroundColor: '#0284C7' }, (freezeWait > 0 || frozen) && { opacity: 0.55 }]} accessibilityLabel="Balıkları dondur">
            <Ionicons name="snow" size={22} color="#fff" />
            <Text style={f.cardText}>{frozen ? 'Donuk' : freezeWait > 0 ? `${freezeWait}s` : 'Dondur'}</Text>
          </Pressable>
        </View>
        <View style={f.cannonRow} pointerEvents="box-none">
          <View style={[f.cannon, { transform: [{ rotate: `${aim}deg` }] }]} pointerEvents="none">
            <LinearGradient colors={['#9CA3AF', '#1F2937']} style={f.barrel} />
            <View style={f.base} />
          </View>
        </View>
        {note && (
          <View style={f.note} pointerEvents="none">
            <Text style={f.noteText}>{note}</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} tint="#1E3A8A" />
        <Pressable onPress={() => (setNote(null), setAuto((a) => !a))} style={[f.auto, auto && f.autoOn]} accessibilityLabel={auto ? 'Otomatik atışı durdur' : 'Otomatik atış'}>
          <Text style={f.autoText}>{auto ? 'DUR' : 'AUTO'}</Text>
        </Pressable>
      </View>
      <Text style={f.dim}>
        Atış başı {fmt(bet)} jeton · bu oturum {session.shots} atış, net {session.net >= 0 ? '+' : ''}
        {fmt(session.net)}. Boşa giden atış ücretsizdir; Oto {AUTO_LOSS} atışlık kayıpta durur.
      </Text>
      <View style={f.table}>
        {FISH.map((x) => (
          <View key={x.id} style={f.tableItem}>
            <Text style={{ fontSize: 18 }}>{x.emoji}</Text>
            <Text style={f.tableMult}>{x.mult}x</Text>
          </View>
        ))}
      </View>
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const f = StyleSheet.create({
  scene: { height: HEIGHT, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#7C3AED' },
  glow: { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
  fish: { position: 'absolute', alignItems: 'center' },
  lock: { position: 'absolute', borderWidth: 2, borderColor: '#F87171', borderStyle: 'dashed' },
  mult: { color: '#FDE68A', fontSize: 10, fontWeight: '900', marginTop: -4, textShadowColor: '#000', textShadowRadius: 3 },
  ice: { position: 'absolute', right: -6, top: -6, fontSize: 14 },
  win: { position: 'absolute', color: '#FACC15', fontWeight: '900', fontSize: 16, textShadowColor: '#000', textShadowRadius: 4, width: 90, textAlign: 'center' },
  miss: { position: 'absolute', left: -14, top: 0, fontSize: 18 },
  bullet: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FACC15', borderWidth: 2, borderColor: '#F97316' },
  net: { position: 'absolute', fontSize: 40 },
  player: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(30,58,138,0.85)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 130 },
  playerName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  playerCoins: { color: '#FDE68A', fontWeight: '900', fontSize: 14 },
  cards: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  card: { width: 48, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  cardOn: { borderColor: '#FACC15', borderWidth: 3 },
  cardText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  cannonRow: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  cannon: { width: 60, height: 80, alignItems: 'center', justifyContent: 'flex-end', marginBottom: -20 },
  barrel: { width: 20, height: 46, borderRadius: 6, borderWidth: 2, borderColor: '#DC2626' },
  base: { width: 56, height: 36, borderRadius: 28, backgroundColor: '#374151', borderWidth: 3, borderColor: '#FACC15', marginTop: -10 },
  note: { position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 8 },
  noteText: { color: '#FDE68A', fontWeight: '700', textAlign: 'center', fontSize: 12 },
  auto: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1D4ED8', borderWidth: 2, borderColor: '#FACC15' },
  autoOn: { backgroundColor: '#B91C1C' },
  autoText: { color: '#FDE68A', fontWeight: '900', fontSize: 15 },
  dim: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  table: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  tableItem: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tableMult: { color: '#FDE68A', fontWeight: '800', fontSize: 12 },
});
