// Yörünge: crash game screen (lib/crash-rocket). Pick the stake and the escape multiplier, then launch. The crash
// point is drawn by playRound before anything moves; the flight only replays it: the engine lights, the rocket climbs
// its path while the multiplier counts up, and it either reaches the escape orbit (you win bet × multiplier) or blows
// up first. How it looks is in rocket-stage, the numbers of a flight in rocket-flight. Oto launches again and stops
// at the loss limit or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { ResultTrail, pushTrail, type TrailItem } from '@/components/games/fx/result-trail';
import { ChoiceChip, SALON, SalonStage, SideButton, WideAction, choiceInk, salonScreen, tabular, useBox, wideInk } from '@/components/games/fx/salon';
import { useWinFx } from '@/components/games/fx/win-fx';
import { climbSeconds, driftEnd, flightPlan, milestones, multiplierAt, orbitY, stageGeo, type FlightPlan } from '@/components/games/rocket-flight';
import { EndMark, FlightLayer, ORBIT, Planet, ReadyRocket, Route, STAR_LAYERS, Space, type Flight } from '@/components/games/rocket-stage';
import { WalletRow, fmt, sleep } from '@/components/games/slot-kit';
import { ROCKET_TARGETS, rocketReturn } from '@/lib/crash-rocket';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { playRound } from '@/lib/live/casino';
import { winTierOf } from '@/lib/win-tier';
import { useApp, useSettings } from '@/store';

const AUTO_LOSS = 20;
/** The engine burns this long on the ramp before the rocket leaves it. */
const IGNITE_MS = 480;
/** A crash point from here up is a rare one in the trail of last results. */
const HOT = 10;

/** A multiplier as it is written everywhere on this screen: 1,37×. Never rounded up. */
const mul = (x: number) => {
  const c = Math.floor(x * 100 + 1e-6);
  return `${fmt(Math.floor(c / 100))},${String(c % 100).padStart(2, '0')}×`;
};
/** A target the player picks: 1,2× · 2× · 1.000×. */
const short = (t: number) => `${t.toLocaleString('tr-TR')}×`;
const percent = (p: number) => `%${(p * 100).toLocaleString('tr-TR', { maximumFractionDigits: p < 0.01 ? 2 : 1 })}`;

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

type Phase = { kind: 'idle' } | { kind: 'wait' } | { kind: 'ignite' } | { kind: 'fly' } | { kind: 'cashed'; x: number; win: number } | { kind: 'boom'; x: number };

/**
 * The multiplier in big digits. In flight it reads the same clock as the rocket's climb and counts up by itself
 * (a count-up, so it is the one thing here that sets state every frame); otherwise it shows `value`.
 */
function Readout({ live, value, color, sub, pop, top }: { live: { t0: number; plan: FlightPlan } | null; value: number; color: string; sub: string; pop: Animated.Value; top: number }) {
  const [at, setAt] = useState<{ of: object | null; x: number }>({ of: null, x: 1 });
  useEffect(() => {
    if (!live) return;
    let id = 0;
    const step = () => {
      const x = multiplierAt(live.plan, Date.now() - live.t0);
      setAt((p) => (p.of === live && Math.floor(p.x * 100) === Math.floor(x * 100) ? p : { of: live, x }));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [live]);
  const x = live ? (at.of === live ? at.x : 1) : value;
  const size = x < 100 ? 52 : x < 1000 ? 44 : 38;
  return (
    <View style={[s.readout, { top }]} accessibilityLiveRegion="polite" pointerEvents="none">
      <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] }) }] }}>
        <Text style={[s.mult, { color, fontSize: size }]} numberOfLines={1}>
          {mul(x)}
        </Text>
      </Animated.View>
      <Text style={s.sub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

export function RocketPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, coins, gameCoins } = useApp();
  const settings = useSettings();
  const calm = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'rocket')!;
  const [bet, setBet] = useState(game.bets[0]);
  // A rocket that escaped sends a shine across the stage.
  const [shine, setShine] = useState(0);
  const [target, setTarget] = useState(2);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // The flight on the stage: the one in the air, or the last one (its trail stays until the next rocket fires).
  const [flight, setFlight] = useState<Flight | null>(null);
  const [live, setLive] = useState<{ t0: number; plan: FlightPlan } | null>(null);
  // A rocket stands on the ramp (not while one is in the air, and not right after it is gone).
  const [armed, setArmed] = useState(true);
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  // The stage takes the height the phone leaves it; the flight's path is drawn to its size.
  const box = useBox();
  const width = box.w;
  // While a rocket is on its way the pill shows the balance with the stake taken; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const [arm] = useState(() => new Animated.Value(1));
  const [ignite] = useState(() => new Animated.Value(0));
  const [flick] = useState(() => new Animated.Value(0));
  const [march] = useState(() => new Animated.Value(0));
  const [breathe] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const win = useWinFx();
  const alive = useRef(true);
  const autoOn = useRef(false);
  // From the tap until the result is on screen: a second tap doesn't launch again.
  const busy = useRef(false);
  const balance = useRef(coins + gameCoins);
  const flights = useRef(0);
  const last = useRef<Flight | null>(null);
  const starAt = useRef<number[]>(STAR_LAYERS.map(() => 0));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rearm = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['launch', 'boom', 'cashout', 'tick', 'win']);
    const pending = timers.current;
    return () => {
      alive.current = false;
      autoOn.current = false;
      pending.forEach(clearTimeout);
      if (rearm.current) clearTimeout(rearm.current);
    };
  }, []);
  // The stage's standing motion: the route's lights walk up to the orbit and a few stars twinkle.
  useEffect(() => {
    if (calm) return;
    const a = Animated.loop(Animated.timing(march, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [calm, march, breathe]);
  // The flame flickers only while an engine burns.
  const burning = phase.kind === 'wait' || phase.kind === 'ignite' || phase.kind === 'fly';
  useEffect(() => {
    if (!burning || calm) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(flick, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(flick, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [burning, calm, flick]);

  const height = box.h;
  const geo = useMemo(() => (width && height ? stageGeo(width, height) : null), [width, height]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  /** The engine lights on the ramp; the last flight's trail goes out. */
  const light = () => {
    if (rearm.current) clearTimeout(rearm.current);
    setArmed(true);
    arm.setValue(1);
    setPhase({ kind: 'ignite' });
    pressHaptic();
    playSfx('launch');
    ignite.setValue(0);
    if (calm) return;
    Animated.timing(ignite, { toValue: 1, duration: IGNITE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (last.current) Animated.timing(last.current.glow, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };

  /** One launch; resolves with the round's net, or null when it was refused. */
  const launch = async (): Promise<number | null> => {
    if (busy.current || !geo) return null;
    busy.current = true;
    setNote(null);
    setPhase({ kind: 'wait' });
    setHeld(balance.current - bet);
    let answered = false;
    const asked = playRound('rocket', bet, String(target), entry).then((r) => {
      answered = true;
      return r;
    });
    // The demo answers at once; a server needs a moment, and the engine lights meanwhile instead of standing still.
    await sleep(30);
    if (!alive.current) return null;
    const lit = Date.now();
    const early = !answered;
    if (early) light();
    const r = await asked;
    if (!alive.current) return null;
    if (!r.ok) {
      // Refused (limit, balance, pool): the engine is cut and nothing leaves the ramp.
      ignite.stopAnimation();
      ignite.setValue(0);
      busy.current = false;
      setHeld(null);
      setPhase({ kind: 'idle' });
      setNote(r.reason);
      errorHaptic();
      return null;
    }
    if (!early) light();
    const { crash } = r.outcome.rocket!;
    const plan = flightPlan(target, crash);
    const won = crash >= target;
    const beat = IGNITE_MS - (Date.now() - lit);
    if (!calm && beat > 0) await sleep(beat);
    if (!alive.current) return null;

    const f: Flight = { id: ++flights.current, plan, u: new Animated.Value(calm ? plan.uStop : 0), fx: new Animated.Value(calm ? 1 : 0), glow: new Animated.Value(1), end: won ? 'escape' : 'boom', from: starAt.current };
    last.current = f;
    setFlight(f);
    setArmed(false);
    setPhase({ kind: 'fly' });
    if (!calm && plan.ms > 0) {
      // The flight is drawn before it starts to move, and the digits read the clock the climb starts on.
      await frame();
      const total = climbSeconds(target) * 1000;
      setLive({ t0: Date.now(), plan });
      for (const m of milestones(target)) if (m.m < plan.stop) timers.current.push(setTimeout(() => alive.current && playSfx('tick', 0.45), m.u * total));
      await run(Animated.timing(f.u, { toValue: plan.uStop, duration: plan.ms, easing: Easing.linear, useNativeDriver: true }));
      timers.current.forEach(clearTimeout);
      timers.current.length = 0;
      if (!alive.current) return null;
      starAt.current = STAR_LAYERS.map((l, i) => driftEnd(total / 1000, l.speed, geo.h, f.from[i], plan.uStop));
    }

    // The result is on screen from here: the balance may show it and the next launch may be asked for.
    setLive(null);
    busy.current = false;
    setHeld(null);
    setTrail((t) => pushTrail(t, { key: `r${f.id}`, label: mul(crash || 1), tone: won ? 'win' : crash >= HOT ? 'hot' : undefined }));
    if (!calm) {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true }).start();
      Animated.timing(f.fx, { toValue: 1, duration: won ? 720 : 880, easing: Easing.linear, useNativeDriver: true }).start();
      Animated.timing(f.glow, { toValue: 0.45, duration: 900, useNativeDriver: true }).start();
    } else f.glow.setValue(0.6);
    // A new rocket is rolled onto the ramp once this one is gone.
    rearm.current = setTimeout(() => {
      if (!alive.current) return;
      ignite.setValue(0);
      arm.setValue(calm ? 1 : 0);
      setArmed(true);
      if (!calm) Animated.timing(arm, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, 950);
    if (won) {
      setPhase({ kind: 'cashed', x: target, win: r.row.payout });
      if (r.row.payout > bet) setShine((x) => x + 1);
      playSfx('cashout');
      // The rocket is seen leaving before the win takes the stage.
      if (!calm) await sleep(460);
      if (!alive.current) return null;
      await win.celebrate({ amount: r.row.payout, bet });
    } else {
      setPhase({ kind: 'boom', x: crash || 1 });
      playSfx('boom', plan.uStop > 0 ? 1 : 0.8);
      errorHaptic();
    }
    return r.row.payout - bet;
  };

  const play = () => void launch();
  const toggleAuto = async () => {
    if (autoOn.current) {
      autoOn.current = false;
      setAuto(false);
      return;
    }
    autoOn.current = true;
    setAuto(true);
    let net = 0;
    while (autoOn.current && alive.current) {
      const d = await launch();
      if (d === null) break;
      net += d;
      if (-net >= bet * AUTO_LOSS) {
        setNote(`Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)} jeton)`);
        break;
      }
      await sleep(1200);
    }
    autoOn.current = false;
    setAuto(false);
  };

  const locked = burning || auto;
  const prize = Math.floor(bet * target);
  const shown = phase.kind === 'cashed' || phase.kind === 'boom' ? phase.x : 1;
  const color = phase.kind === 'boom' ? '#FB7185' : phase.kind === 'cashed' ? '#4ADE80' : phase.kind === 'fly' ? '#FDE047' : '#EEF2FF';
  const sub =
    phase.kind === 'cashed'
      ? `Kaçtın! +${fmt(phase.win)} jeton`
      : phase.kind === 'boom'
        ? phase.x <= 1
          ? 'Rampada patladı'
          : 'Yörüngeye varamadan patladı'
        : phase.kind === 'fly'
          ? 'Yörüngeye tırmanıyor'
          : phase.kind === 'idle'
            ? `Kaçarsa +${fmt(prize)} jeton`
            : 'Motor ateşlendi';
  // A crash shakes the stage and lights it for an instant.
  const hit = flight && flight.end === 'boom' && !calm ? flight.fx : null;

  return (
    <View style={salonScreen}>
      <SalonStage colors={['#141F52', '#0B1234', '#05081C']} accent={ORBIT} win={shine} minHeight={250} inner={s.stage}>
        <View style={StyleSheet.absoluteFill} onLayout={box.onLayout} pointerEvents="none" />
        {geo && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              hit && {
                transform: [
                  { translateX: hit.interpolate({ inputRange: [0, 0.07, 0.14, 0.21, 0.28, 0.36, 0.45, 1], outputRange: [0, -8, 7, -6, 4, -2, 0, 0] }) },
                  { translateY: hit.interpolate({ inputRange: [0, 0.07, 0.14, 0.21, 0.28, 0.45, 1], outputRange: [0, 4, -4, 3, -2, 0, 0] }) },
                ],
              },
            ]}
          >
            <Space geo={geo} flight={flight} still={calm} breathe={breathe} />
            <Route geo={geo} target={target} label={short(target)} march={march} still={calm} />
            <Planet geo={geo} />
            {flight && <FlightLayer key={flight.id} geo={geo} flight={flight} flick={flick} />}
            {flight && calm && <EndMark geo={geo} flight={flight} />}
            {armed && <ReadyRocket geo={geo} arm={arm} ignite={ignite} flick={flick} />}
            <Readout live={live} value={shown} color={color} sub={sub} pop={pop} top={orbitY(geo, geo.w * 0.3) + 20} />
          </Animated.View>
        )}
        {hit && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.flash, { opacity: hit.interpolate({ inputRange: [0, 0.05, 0.3], outputRange: [0, 0.5, 0], extrapolate: 'clamp' }) }]} />}
        <View style={s.icons}>
          <InfoButton onPress={() => setInfo(true)} tint={ORBIT} />
        </View>
        <View style={s.trail}>
          <ResultTrail items={trail} empty="Son patlama noktaları burada görünür" />
        </View>
        {note && (
          <View style={s.note} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={s.noteText}>{note}</Text>
          </View>
        )}
        {/* A small win throws its coins where the rocket crossed the orbit, beside the digits; a big one takes the stage. */}
        <View style={[StyleSheet.absoluteFill, winTierOf(prize, bet) === 'small' && { left: '34%' }]} pointerEvents="box-none">
          {win.layer}
        </View>
      </SalonStage>

      <View style={{ gap: SALON.row }}>
        <View style={s.targets} accessibilityRole="radiogroup" accessibilityLabel="Kaçış çarpanı">
          {ROCKET_TARGETS.map((t) => (
            <ChoiceChip
              key={t}
              on={target === t}
              disabled={locked}
              onPress={() => {
                if (t === target) return;
                tapHaptic();
                playSfx('tap', 0.6);
                setTarget(t);
                if (phase.kind !== 'idle') setPhase({ kind: 'idle' });
              }}
              style={s.target}
              label={`Kaçış ${t.toLocaleString('tr-TR')} kat`}
            >
              <Text style={[tabular, s.targetText, choiceInk(target === t)]}>{short(t)}</Text>
            </ChoiceChip>
          ))}
        </View>
        <WalletRow
          held={held}
          bets={game.bets}
          bet={bet}
          onBet={(b) => {
            setBet(b);
            if (phase.kind !== 'idle') setPhase({ kind: 'idle' });
          }}
          disabled={locked}
        />
        <View style={s.row}>
          <SideButton onPress={toggleAuto} on={auto} disabled={burning && !auto} icon={auto ? 'stop' : 'repeat'} label={auto ? 'DUR' : 'OTO'} a11y={auto ? 'Otomatik fırlatmayı durdur' : 'Otomatik fırlat'} style={{ flex: 0, minWidth: 96 }} />
          <WideAction onPress={play} disabled={locked} label={`Fırlat, kaçış ${target.toLocaleString('tr-TR')} kat, ${bet} jeton`} style={{ flex: 1 }}>
            <Ionicons name="rocket" size={19} color={SALON.goldInk} />
            <Text style={[tabular, s.goText, wideInk()]} numberOfLines={1}>
              {burning ? 'Roket yolda…' : `Fırlat · ${short(target)} · ${fmt(bet)}`}
            </Text>
          </WideAction>
        </View>
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={s.pays}>
          <Text style={s.paysHead}>Kaçış çarpanları · {fmt(bet)} jeton bahiste</Text>
          <View style={s.payRow}>
            <Text style={[s.payCell, s.payDim]}>Çarpan</Text>
            <Text style={[s.payCell, s.payDim, { textAlign: 'center' }]}>Ulaşma şansı</Text>
            <Text style={[s.payCell, s.payDim, { textAlign: 'right' }]}>Kazanç</Text>
          </View>
          {ROCKET_TARGETS.map((t) => (
            <View key={t} style={[s.payRow, t === target && s.payRowOn]}>
              <Text style={[s.payCell, { color: '#fff' }]}>{short(t)}</Text>
              <Text style={[s.payCell, { color: 'rgba(255,255,255,0.8)', textAlign: 'center' }]}>{percent(rocketReturn(t) / t)}</Text>
              <Text style={[s.payCell, { color: '#FDE68A', textAlign: 'right' }]}>{fmt(Math.floor(bet * t))}</Text>
            </View>
          ))}
          <Text style={s.paysNote}>Roket seçtiğin çarpana ulaşınca kendiliğinden kaçar; yolda bir şey yapman gerekmez. Tırmanışın hızı yalnızca seçtiğin çarpana bağlıdır, sonucu önceden göstermez.</Text>
          <Text style={s.paysNote}>
            Oto art arda fırlatır; {AUTO_LOSS} bahislik kayıpta ya da tur kabul edilmediğinde kendiliğinden durur.
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

const s = StyleSheet.create({
  // The scene is drawn edge to edge inside the shell's frame.
  stage: { padding: 0, gap: 0 },
  flash: { backgroundColor: '#FFF7ED' },
  readout: { position: 'absolute', left: 16, alignItems: 'flex-start' },
  mult: { lineHeight: 60, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(4,5,26,0.9)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 },
  sub: { color: '#E0E7FF', fontWeight: '800', fontSize: 13, textShadowColor: 'rgba(4,5,26,0.9)', textShadowRadius: 6 },
  icons: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  trail: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  note: { position: 'absolute', left: 14, right: 14, bottom: 50, backgroundColor: 'rgba(4,5,26,0.86)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(253,230,138,0.5)' },
  noteText: { color: '#FDE68A', fontWeight: '700', textAlign: 'center', fontSize: 12, lineHeight: 17 },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  target: { flexBasis: '17%', flexGrow: 1 },
  targetText: { fontSize: 14 },
  row: { flexDirection: 'row', gap: SALON.row, alignItems: 'center' },
  goText: { fontSize: 17 },
  pays: { gap: 6 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  payRowOn: { backgroundColor: 'rgba(103,232,249,0.14)' },
  payCell: { flex: 1, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  payDim: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
