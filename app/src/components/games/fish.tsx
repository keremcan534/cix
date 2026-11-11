// Mercan Avı: fish swim across the scene; tap one and the cannon fires. Every shot at a fish is one casino round
// (playRound, pick = the fish), settled before the shot leaves the cannon; the shot then flies to the fish and shows
// what the round decided: the fish bursts into coins, or it flinches and swims on. A shot that hits no fish is free
// and is not a round. Freeze stops the fish for a moment and lock-on keeps Oto on one fish; neither changes the odds
// (lib/fish-hunt). What the stage is made of is in fish-stage, where a fish is at any moment in fish-swim.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { aimDeg, freeDepth, leadShot, shotMs, swimAt, swimRanges, type Swim } from '@/components/games/fish-swim';
import { BARREL, BurstView, Cannon, FishSprite, Frost, HUB_UP, ShotView, Water, tierColor, type Burst, type Fish, type Shot } from '@/components/games/fish-stage';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { useWinFx } from '@/components/games/fx/win-fx';
import { BalancePill, BetStepper, fmt } from '@/components/games/slot-kit';
import { FISH, FISH_HIT, fishDraw } from '@/lib/fish-hunt';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { liveMode } from '@/lib/live';
import { playRound } from '@/lib/live/casino';
import { useApp, useSettings } from '@/store';

const SCHOOL = 7;
const FREEZE_MS = 6_000;
const FREEZE_COOLDOWN = 30_000;
const AUTO_EVERY = 700;
/** A live build asks the server for every shot: Oto fires a little slower there (the server takes 90 rounds a minute). */
const LIVE_AUTO_EVERY = 1000;
/** Oto stops when the net loss reaches this many shots. */
const AUTO_LOSS = 50;
/** A catch that pays this many stakes or more takes the whole stage; a smaller one pops where the fish was. */
const BIG_CATCH = 5;
/** How long a caught fish takes to pop (ms). */
const POP_MS = 620;
const SPAWN_TOTAL = FISH.reduce((n, f) => n + f.spawn, 0);
const ICE = '#7DD3FC';

const pickKind = () => {
  let r = Math.random() * SPAWN_TOTAL;
  return FISH.find((f) => (r -= f.spawn) < 0) ?? FISH[0];
};
/** Coins a catch throws up, by how much the fish pays. */
const coinsFor = (mult: number) => (mult >= 50 ? 16 : mult >= 15 ? 12 : mult >= 5 ? 9 : 6);
const percent = (p: number) => `%${(p * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

/** Where a fish's crossing stood when it last started or stopped: what a tap or a shot is aimed with. */
type Run = { p0: number; at: number; on: boolean };

export function FishPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, coins, gameCoins, setSetting } = useApp();
  const settings = useSettings();
  const calm = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'fish')!;
  const screen = useWindowDimensions();
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [width, setWidth] = useState(0);
  const [fish, setFish] = useState<Fish[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [freezeReady, setFreezeReady] = useState(0);
  /** Wall clock of the last look at the freeze timers, read in render instead of Date.now(). */
  const [wall, setWall] = useState(0);
  const [lockOn, setLockOn] = useState(false);
  const [lockKey, setLockKey] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [session, setSession] = useState({ shots: 0, net: 0 });
  const [info, setInfo] = useState(false);
  // While shots are in the air the pill shows what has been seen so far: stakes taken, catches added as they land.
  const [shown, setShown] = useState<number | null>(null);
  const [aim] = useState(() => new Animated.Value(0));
  const [kick] = useState(() => new Animated.Value(0));
  const [flow] = useState(() => new Animated.Value(0));
  const [sway] = useState(() => new Animated.Value(0));
  const [flex] = useState(() => new Animated.Value(0));
  const [turn] = useState(() => new Animated.Value(0));
  const [frost] = useState(() => new Animated.Value(0));
  const win = useWinFx();
  const alive = useRef(true);
  const nextKey = useRef(1);
  const fishRef = useRef<Fish[]>([]);
  const runs = useRef(new Map<number, Run>());
  const autoNet = useRef(0);
  // Fish with a shot on its way (to the server, then through the water): not a target again until it has landed.
  const pending = useRef(new Set<number>());
  const icy = useRef(false);
  const aimNow = useRef(0);
  const cheering = useRef(false);
  const balance = useRef(coins + gameCoins);
  const ledger = useRef<{ value: number; open: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const room = entry.from === 'room';
  // The stage is as tall as the screen allows with the stake row still on screen under it; a room's sheet is shorter.
  const height = room ? Math.max(240, Math.min(300, Math.round(screen.height * 0.36))) : Math.max(320, Math.min(460, Math.round(screen.height * 0.56)));
  const cx = width / 2;
  const cy = height - HUB_UP;
  // The fish keep between the top row of buttons and the cannon.
  const top = 50;
  const bottom = height - (room ? 100 : 122);
  const scale = room ? 0.9 : 1.18;

  const progress = (f: Fish) => {
    const r = runs.current.get(f.key);
    return !r ? 0 : r.on ? Math.min(1, r.p0 + (Date.now() - r.at) / f.dur) : r.p0;
  };
  const go = (f: Fish) => {
    const r = runs.current.get(f.key);
    if (!r || r.on || f.gone) return;
    r.at = Date.now();
    r.on = true;
    Animated.timing(f.p, { toValue: 1, duration: f.dur * (1 - r.p0), easing: Easing.linear, useNativeDriver: true }).start();
  };
  const halt = (f: Fish) => {
    const r = runs.current.get(f.key);
    if (!r || !r.on) return;
    r.p0 = progress(f);
    r.on = false;
    f.p.stopAnimation();
    f.p.setValue(r.p0);
  };
  const change = (fn: (list: Fish[]) => Fish[]) => {
    fishRef.current = fn(fishRef.current);
    setFish(fishRef.current);
  };

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['shot', 'splash', 'coin', 'win']);
    const pendingTimers = timers.current;
    const school = fishRef;
    return () => {
      alive.current = false;
      pendingTimers.forEach(clearTimeout);
      school.current.forEach((f) => f.p.stopAnimation());
    };
  }, []);
  // The water's standing motion: bubbles rise, weed and light sway, the fish flex and the lock ring turns.
  useEffect(() => {
    if (calm) return;
    const loop = (v: Animated.Value, ms: number) => Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    const wave = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const all = [loop(flow, 9000), wave(sway, 2600), wave(flex, 280), loop(turn, 4000)];
    all.forEach((a) => a.start());
    return () => all.forEach((a) => a.stop());
  }, [calm, flow, sway, flex, turn]);

  // Keep a school swimming: take out the fish that have left the scene (or have popped), bring new ones in.
  useEffect(() => {
    if (!width) return;
    const spawn = (first: boolean, others: Fish[]): Fish => {
      const kind = pickKind();
      const size = Math.round(kind.size * scale);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const edge = size / 2 + 16;
      // Each fish has its own pace around its kind's.
      const dur = kind.cross * 1000 * (0.86 + Math.random() * 0.28);
      const swim: Swim = {
        dir,
        x0: dir === 1 ? -edge : width + edge,
        x1: dir === 1 ? width + edge : -edge,
        y: freeDepth(others.map((f) => f.swim.y), top + size / 2, Math.max(top + size / 2 + 1, bottom - size / 2)),
        amp: 5 + Math.random() * 11,
        bobs: dur / (2100 + Math.random() * 1300),
        phase: Math.random(),
      };
      // The first school starts spread across the scene; later fish enter from the edge.
      const p0 = first ? 0.1 + Math.random() * 0.75 : 0;
      const p = new Animated.Value(p0);
      const r = swimRanges(swim);
      const half = (size + 22) / 2;
      const f: Fish = {
        key: nextKey.current++,
        kind,
        swim,
        size,
        dur,
        p,
        hit: new Animated.Value(0),
        move: { x: p.interpolate({ inputRange: r.input, outputRange: r.x.map((v) => v - half) }), y: p.interpolate({ inputRange: r.input, outputRange: r.y.map((v) => v - half) }), tilt: p.interpolate({ inputRange: r.input, outputRange: r.tilt }) },
      };
      const run: Run = { p0, at: Date.now(), on: false };
      runs.current.set(f.key, run);
      if (!icy.current) {
        run.on = true;
        Animated.timing(p, { toValue: 1, duration: dur * (1 - p0), easing: Easing.linear, useNativeDriver: true }).start();
      }
      return f;
    };
    const tick = () => {
      const now = Date.now();
      const list = fishRef.current;
      const next = list.filter((f) => {
        if (f.gone) return now - f.gone < POP_MS;
        const r = runs.current.get(f.key);
        const at = !r ? 1 : r.on ? r.p0 + (now - r.at) / f.dur : r.p0;
        return at < 1 || pending.current.has(f.key);
      });
      const first = list.length === 0;
      while (next.filter((f) => !f.gone).length < SCHOOL) next.push(spawn(first, next));
      if (next.length === list.length && next.every((f, i) => f === list[i])) return;
      for (const f of list) if (!next.includes(f)) runs.current.delete(f.key);
      fishRef.current = next;
      setFish(next);
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [width, top, bottom, scale]);

  // Freeze: every fish stops where it is and swims on when the ice melts.
  useEffect(() => {
    const left = frozenUntil - Date.now();
    if (left <= 0) return;
    icy.current = true;
    fishRef.current.forEach(halt);
    Animated.timing(frost, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const melt = setTimeout(() => {
      icy.current = false;
      fishRef.current.forEach(go);
      Animated.timing(frost, { toValue: 0, duration: 450, useNativeDriver: true }).start();
    }, left);
    return () => clearTimeout(melt);
    // halt and go only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenUntil, frost]);
  // The freeze card counts down while the ice holds and while the card rests.
  useEffect(() => {
    if (!freezeReady) return;
    const id = setInterval(() => {
      setWall(Date.now());
      if (Date.now() >= freezeReady) clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, [freezeReady]);

  /** The cannon turns toward a point. */
  const point = (x: number, y: number) => {
    aimNow.current = aimDeg(cx, cy, x, y);
    if (calm) aim.setValue(aimNow.current);
    else Animated.timing(aim, { toValue: aimNow.current, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  /** Something left in the water where a shot landed. */
  const burst = (kind: Burst['kind'], x: number, y: number, amount = 0, coinCount = 0) => {
    if (calm && kind !== 'catch') return;
    const ms = kind === 'catch' ? 1050 : 460;
    const b: Burst = { key: nextKey.current++, kind, x, y, amount, coins: coinCount, ms, v: new Animated.Value(0) };
    setBursts((l) => [...l, b]);
    Animated.timing(b.v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }).start(() => alive.current && setBursts((l) => l.filter((o) => o !== b)));
  };
  /** The cannon fires: it kicks back and a shot flies to `to`; `land` runs when it gets there. */
  const volley = (to: { x: number; y: number; ms: number }, land: () => void, gain: number) => {
    playSfx('shot', gain);
    if (calm) return land();
    const rad = (aimNow.current * Math.PI) / 180;
    kick.setValue(1);
    Animated.timing(kick, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const shot: Shot = { key: nextKey.current++, x0: cx + Math.sin(rad) * BARREL, y0: cy - Math.cos(rad) * BARREL, x1: to.x, y1: to.y, v: new Animated.Value(0) };
    setShots((l) => [...l, shot]);
    Animated.timing(shot.v, { toValue: 1, duration: to.ms, easing: Easing.linear, useNativeDriver: true }).start(() => {
      if (!alive.current) return;
      setShots((l) => l.filter((o) => o !== shot));
      land();
    });
  };
  /** A shot has been seen landing (or was refused): the pill shows the real balance again once none is in the air. */
  const settle = (l: { value: number; open: number }) => {
    l.open--;
    if (l.open > 0) return setShown(l.value);
    ledger.current = null;
    setShown(null);
  };

  const fire = async (target: Fish | null, at: { x: number; y: number }): Promise<number | null> => {
    if (!width) return null;
    point(at.x, at.y);
    if (!target) {
      tapHaptic();
      volley({ ...at, ms: shotMs(Math.hypot(at.x - cx, at.y - cy)) }, () => burst('free', at.x, at.y), 0.45);
      return null;
    }
    pending.current.add(target.key);
    const l = (ledger.current ??= { value: balance.current, open: 0 });
    l.value -= bet;
    l.open++;
    setShown(l.value);
    const r = await playRound('fish', bet, target.kind.id, entry);
    if (!alive.current) return null;
    if (!r.ok) {
      pending.current.delete(target.key);
      l.value += bet;
      settle(l);
      setNote(r.reason);
      errorHaptic();
      return null;
    }
    pressHaptic();
    setNote(null);
    const payout = r.row.payout;
    // The round is settled; the shot leaves now, aimed where the fish will be when it gets there.
    const swimming = runs.current.get(target.key)?.on ?? false;
    const rad = (aimNow.current * Math.PI) / 180;
    const to = leadShot(target.swim, progress(target), swimming ? 1 / target.dur : 0, cx + Math.sin(rad) * BARREL, cy - Math.cos(rad) * BARREL);
    point(to.x, to.y);
    volley(
      to,
      () => {
        pending.current.delete(target.key);
        l.value += payout;
        settle(l);
        setSession((s) => ({ shots: s.shots + 1, net: s.net + payout - bet }));
        if (payout > 0) {
          // Caught: the fish stops, flashes and bursts into coins where it was hit.
          halt(target);
          change((list) => list.map((f) => (f.key === target.key ? { ...f, gone: Date.now() } : f)));
          setLockKey((k) => (k === target.key ? null : k));
          if (calm) target.hit.setValue(1);
          else Animated.timing(target.hit, { toValue: 1, duration: POP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
          burst('catch', to.x, to.y, payout, coinsFor(target.kind.mult));
          playSfx('splash', 0.9);
          timers.current.push(setTimeout(() => alive.current && playSfx('coin', 0.8), 150));
          if (payout >= bet * BIG_CATCH) {
            // The fish is seen bursting first; then the catch takes the stage (and Oto waits for it).
            cheering.current = true;
            timers.current.push(setTimeout(() => alive.current && void win.celebrate({ amount: payout, bet }).then(() => (cheering.current = false)), calm ? 0 : 700));
          } else successHaptic();
        } else {
          // Missed: a small splash, and the fish flinches and swims on.
          burst('miss', to.x, to.y);
          playSfx('splash', 0.2);
          if (!calm) {
            target.hit.setValue(0);
            Animated.timing(target.hit, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true }).start();
          }
        }
      },
      0.7,
    );
    return payout - bet;
  };

  // The tap layer is empty and covers the scene, so locationX/Y are scene coordinates.
  const onTap = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    let hit: Fish | null = null;
    let near = Infinity;
    for (const f of fishRef.current) {
      if (f.gone || pending.current.has(f.key)) continue;
      const at = swimAt(f.swim, progress(f));
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < f.size / 2 + 14 && d < near) {
        near = d;
        hit = f;
      }
    }
    if (lockOn && hit) setLockKey(hit.key);
    void fire(hit, { x, y });
  };

  // Oto: fire at the locked fish, else at a random fish on screen; stops at the loss limit or any refusal.
  useEffect(() => {
    if (!auto) return;
    autoNet.current = 0;
    const id = setInterval(
      () => {
        // A big catch is being celebrated: the cannon waits for it.
        if (cheering.current) return;
        const live = fishRef.current
          .filter((f) => !f.gone && !pending.current.has(f.key))
          .map((f) => ({ f, at: swimAt(f.swim, progress(f)) }))
          .filter((o) => o.at.x > 0 && o.at.x < width);
        const target = live.find((o) => o.f.key === lockKey) ?? (lockOn ? undefined : live[Math.floor(Math.random() * live.length)]);
        if (!target) return;
        void fire(target.f, target.at).then((net) => {
          if (net === null) return setAuto(false);
          autoNet.current += net;
          if (-autoNet.current >= bet * AUTO_LOSS) {
            setAuto(false);
            setNote(`Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)} jeton)`);
          }
        });
      },
      liveMode() ? LIVE_AUTO_EVERY : AUTO_EVERY,
    );
    return () => clearInterval(id);
    // fire reads the latest fish through refs; restarting on every render would reset the loss count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, lockKey, lockOn, bet, width]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const frozen = wall < frozenUntil;
  const freezeWait = Math.max(0, Math.ceil((freezeReady - wall) / 1000));
  const freezeLeft = Math.max(0, Math.ceil((frozenUntil - wall) / 1000));
  const freeze = () => {
    if (freezeWait > 0 || frozen) return;
    tapHaptic();
    playSfx('spin', 0.6);
    setWall(Date.now());
    setFrozenUntil(Date.now() + FREEZE_MS);
    setFreezeReady(Date.now() + FREEZE_COOLDOWN);
  };
  const muted = settings.gameVolume === 0;
  // The big fish swim behind the small ones, so a small one is never hidden.
  const school = [...fish].sort((a, b) => b.size - a.size);

  return (
    <View style={{ gap: 10 }}>
      <View style={[f.scene, { height }]} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && <Water w={width} h={height} still={calm} flow={flow} sway={sway} />}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {school.map((x) => (
            <FishSprite key={x.key} fish={x} locked={x.key === lockKey} flex={flex} turn={turn} />
          ))}
          {shots.map((b) => (
            <ShotView key={b.key} shot={b} />
          ))}
          {bursts.map((b) => (
            <BurstView key={b.key} burst={b} still={calm} />
          ))}
        </View>
        <Frost on={frost} />
        {/* A responder view, not a Pressable: press events on web carry no tap position. */}
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={onTap} accessibilityRole="button" accessibilityLabel="Ateş etmek için bir balığa dokun" />
        <Cannon aim={aim} kick={kick} />

        <View style={f.stats} pointerEvents="none" accessibilityLabel={`Bu oturum ${session.shots} atış, net ${session.net} jeton`}>
          <Text style={f.statHead}>ATIŞ</Text>
          <Text style={f.statValue}>{fmt(session.shots)}</Text>
          <View style={f.statLine} />
          <Text style={f.statHead}>NET</Text>
          <Text style={[f.statValue, session.net > 0 && { color: '#86EFAC' }, session.net < 0 && { color: '#FDA4AF' }]}>
            {session.net > 0 ? '+' : ''}
            {fmt(session.net)}
          </Text>
        </View>
        <View style={f.icons}>
          <Pressable style={f.icon} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} hitSlop={6} accessibilityRole="button" accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color="#fff" />
          </Pressable>
          <InfoButton onPress={() => setInfo(true)} tint="#67E8F9" />
        </View>
        {session.shots === 0 && !note && (
          <View style={f.hint} pointerEvents="none">
            <Text style={f.hintText}>Bir balığa dokun · atış {fmt(bet)} jeton</Text>
          </View>
        )}
        {note && (
          <View style={f.note} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={f.noteText}>{note}</Text>
          </View>
        )}

        <View style={f.cards}>
          <Pressable
            onPress={() => {
              tapHaptic();
              playSfx('tap', 0.6);
              setLockOn((v) => !v);
              setLockKey(null);
            }}
            style={[f.card, lockOn && { backgroundColor: '#BE123C', borderColor: '#FECDD3' }]}
            accessibilityRole="button"
            accessibilityState={{ selected: lockOn }}
            accessibilityLabel={lockOn ? 'Kilidi kapat' : 'Hedef kilidi: Oto bir balığa ateş eder'}
          >
            <Ionicons name="locate" size={21} color={lockOn ? '#fff' : '#FDA4AF'} />
            <Text style={f.cardText}>{lockOn ? (lockKey === null ? 'Seç' : 'Kilitli') : 'Kilit'}</Text>
          </Pressable>
          <Pressable onPress={freeze} style={[f.card, frozen && { backgroundColor: '#0369A1', borderColor: '#E0F2FE' }, !frozen && freezeWait > 0 && { opacity: 0.55 }]} accessibilityRole="button" accessibilityState={{ disabled: frozen || freezeWait > 0 }} accessibilityLabel="Balıkları dondur">
            <Ionicons name="snow" size={21} color={frozen ? '#fff' : ICE} />
            <Text style={f.cardText}>{frozen ? `${freezeLeft} sn` : freezeWait > 0 ? `${freezeWait} sn` : 'Dondur'}</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            tapHaptic();
            playSfx('tap', 0.6);
            setNote(null);
            setAuto((a) => !a);
          }}
          style={[f.card, f.auto, auto && { backgroundColor: '#B45309', borderColor: '#FEF3C7' }]}
          accessibilityRole="button"
          accessibilityState={{ selected: auto }}
          accessibilityLabel={auto ? 'Otomatik atışı durdur' : 'Otomatik atış'}
        >
          <Ionicons name={auto ? 'pause' : 'play'} size={20} color={auto ? '#fff' : '#FDE68A'} />
          <Text style={f.cardText}>{auto ? 'DUR' : 'OTO'}</Text>
        </Pressable>
        {win.layer}
      </View>

      <View style={f.controls}>
        <BalancePill tint="#0A2C6E" shown={shown} />
        <BetStepper bets={game.bets} bet={bet} onChange={setBet} tint="#0A2C6E" />
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={f.pays}>
          <Text style={f.paysHead}>Balıklar · {fmt(bet)} jeton atışta</Text>
          <View style={f.payRow}>
            <View style={{ width: 30 }} />
            <Text style={[f.payName, f.payDim]}>Balık</Text>
            <Text style={[f.payCell, f.payDim]}>Öder</Text>
            <Text style={[f.payCell, f.payDim]}>Yakalanma</Text>
            <Text style={[f.payCell, f.payDim, { flex: 1.2 }]}>Kazanç</Text>
          </View>
          {FISH.map((x) => (
            <View key={x.id} style={f.payRow}>
              <Text style={{ fontSize: 20, width: 30 }}>{x.emoji}</Text>
              <Text style={[f.payName, { color: '#fff' }]} numberOfLines={1}>
                {x.name}
              </Text>
              <Text style={[f.payCell, { color: tierColor(x.mult) }]}>{x.mult}×</Text>
              <Text style={[f.payCell, { color: 'rgba(255,255,255,0.8)' }]}>{percent(FISH_HIT / fishDraw(x))}</Text>
              <Text style={[f.payCell, { color: '#FDE68A', flex: 1.2 }]}>{fmt(x.mult * bet)}</Text>
            </View>
          ))}
          <Text style={f.paysNote}>Boş suya giden atış ücretsizdir. Kilit açıkken dokunduğun balık hedef olur ve Oto yalnızca ona ateş eder. Dondur balıkları {FREEZE_MS / 1000} saniye durdurur, {FREEZE_COOLDOWN / 1000} saniyede bir kullanılır. İkisi de yakalanma şansını değiştirmez.</Text>
          <Text style={f.paysNote}>
            Oto art arda ateş eder; {AUTO_LOSS} atışlık kayıpta ya da tur kabul edilmediğinde kendiliğinden durur.
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

const f = StyleSheet.create({
  scene: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#0A2C6E' },
  stats: { position: 'absolute', left: 10, top: 10, height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, backgroundColor: 'rgba(4,14,44,0.55)' },
  statHead: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  statValue: { color: '#fff', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLine: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 2 },
  icons: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: '#67E8F9', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, top: 52, alignItems: 'center' },
  hintText: { color: '#fff', fontWeight: '800', fontSize: 13, backgroundColor: 'rgba(4,14,44,0.6)', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  note: { position: 'absolute', top: 50, left: 12, right: 12, backgroundColor: 'rgba(4,14,44,0.86)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(253,230,138,0.5)' },
  noteText: { color: '#FDE68A', fontWeight: '700', textAlign: 'center', fontSize: 12, lineHeight: 17 },
  cards: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  card: { width: 54, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: 'rgba(4,14,44,0.72)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  auto: { position: 'absolute', right: 8, bottom: 8, width: 64 },
  cardText: { color: '#fff', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pays: { gap: 4 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  payName: { flex: 2.2, fontWeight: '700', fontSize: 13 },
  payCell: { flex: 1, fontWeight: '800', fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  payDim: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700' },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19, marginTop: 4 },
});
