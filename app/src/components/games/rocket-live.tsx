// Canlı Yörünge: Yörünge played live by everyone at once (lib/live/rocket-live; the server's rocket-live.mjs). One round
// for all: fuel goes on board while the countdown runs (a tap on a can adds one stake), the engine lights, the rocket
// climbs, and whoever taps Kaç before it blows up gets their fuel × the multiplier at that moment; an automatic escape
// leaves at its target by itself. Everyone's fuel flies in to the rocket, whoever escapes drifts down under a parachute
// at their multiplier, and after the crash the round's best three stand on the podium. The stage is Yörünge's
// (rocket-stage); the scale on its right grows with the climb, so the rocket keeps rising toward the top. Nothing here
// decides a round: the server's view leads, and this phone's clock only moves the climb between two of its messages.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { GoldText } from '@/components/games/fx/gold-text';
import { ChoiceChip, SALON, SalonStage, choiceInk, salonScreen, tabular, useBox, useSalonFx } from '@/components/games/fx/salon';
import { useGameQuake } from '@/components/games/fx/quake';
import { ClimbLabel } from '@/components/games/fx/climb-label';
import type { ClimbFormat } from '@/components/games/fx/climb-format';
import { RocketPlayer } from '@/components/games/rocket';
import { pathAt, pathSamples, stageGeo, type Geo } from '@/components/games/rocket-flight';
import { BLAST_MS, Explosion, ORBIT, Planet, ROCKET_SIZE, ReadyRocket, RocketSprite, SheetPreload, Space, useSpin } from '@/components/games/rocket-stage';
import { BalancePill, fmt, type PillFrame } from '@/components/games/slot-kit';
import type { RocketMine, RocketSeat, RocketView } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, heavyHaptic, pressHaptic, rumbleHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { liveMode } from '@/lib/live';
import { BANDS, bandCounts, momentOf, type Moment } from '@/lib/live/rocket-live-core';
import { addFuel, escapeNow, rocketSimOn, setRocketSim, useRocketLive } from '@/lib/live/rocket-live';
import { makeRocketSim } from '@/lib/live/rocket-sim';
import { AUTO_CHOICES, multAt, mulText, payoutOf, reachChance } from '@/lib/rocket-live';
import { useApp } from '@/store';
import { SCRIM, fonts } from '@/theme';

const GREEN = '#4ADE80';
/** The multiplier's words (fx/climb-format): one object, so the Skia label's worklet is not rebuilt on each render. */
const MULT: ClimbFormat = { kind: 'mult' };
/** Yörünge's own set (rocket-stage has the rest): the fuel can on its key, the parachute, Kaç's key in three parts. */
const CAN: number | undefined = require('../../../assets/games/yorunge/bidon.png');
const CHUTE = require('../../../assets/games/yorunge/parasut.png');
const KAC = { left: require('../../../assets/games/yorunge/kac-sol.png'), mid: require('../../../assets/games/yorunge/kac-orta.png'), right: require('../../../assets/games/yorunge/kac-sag.png') };
/**
 * Yörünge's keys (26 Kasım 2026, rendered in Blender: app/scripts/yorunge-3d/plate.py): a gold-rimmed enamel plate
 * cut in three, its round ends kept whole at any width; navy, or ruby when the key is on.
 */
const PLATE = {
  off: { l: require('../../../assets/games/yorunge/tus-sol.png'), m: require('../../../assets/games/yorunge/tus-orta.png'), r: require('../../../assets/games/yorunge/tus-sag.png') },
  on: { l: require('../../../assets/games/yorunge/tus-acik-sol.png'), m: require('../../../assets/games/yorunge/tus-acik-orta.png'), r: require('../../../assets/games/yorunge/tus-acik-sag.png') },
};
/** A plate's round end is half as wide as the plate is tall. */
const PLATE_CAP = 0.5;
/** Kaç's end caps: as wide as this part of the key's height. */
const KAC_CAP = 0.616;
const RULES =
  'Her turda herkes aynı roketi izler. Geri sayım bitene kadar bidonlara dokunarak yakıt al; her dokunuş bir bahistir. Roket kalkınca çarpan yükselir: istediğin an Kaç’a bas, yakıtın o anki çarpanla ödenir. Roket sen kaçmadan patlarsa yakıtın gider. Otomatik kaç seçersen roket o çarpana gelince kendiliğinden kaçarsın. Tırmanışın hızı her turda aynıdır.';

// Development only: the web preview opened with `?rocketsim` plays the live rounds on this device (lib/live/rocket-sim).
if (__DEV__ && typeof window !== 'undefined' && typeof window.location?.search === 'string' && window.location.search.includes('rocketsim')) setRocketSim(makeRocketSim());

/** Yörünge: live and shared on a server that plays it that way; the one-player screen in the demo and on an older server. */
export function YorungePlayer({ entry }: { entry: Entry }) {
  const { rocketLive } = useGames();
  return (liveMode() && rocketLive) || rocketSimOn() ? <LiveRocketPlayer entry={entry} /> : <RocketPlayer entry={entry} />;
}

/** The server's time, read again every `slowMs` (a small part that counts: the multiplier, Kaç's amount); 0 until the first read. */
function useServerTime(offset: number, slowMs = 200) {
  const [t, setT] = useState(0);
  const off = useRef(offset);
  useEffect(() => {
    off.current = offset;
  }, [offset]);
  useEffect(() => {
    const timer = setInterval(() => setT(Date.now() + off.current), slowMs);
    const first = setTimeout(() => setT(Date.now() + off.current), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [slowMs]);
  return t;
}

/** How long (ms) until the moment on the screen next looks different: a second of the countdown, its last 300 ms, the launch. */
function nextChange(m: Moment): number | null {
  if (m.kind === 'bet') {
    if (m.left <= 0) return null;
    const second = m.left % 1000 || 1000;
    return Math.min(second, m.left > 300 ? m.left - 300 : m.left);
  }
  if (m.kind === 'ignite') return m.left;
  return null;
}

/**
 * The round's moment for the big parts of the screen, redrawn only when it changes: each second of the countdown,
 * as it closes, at the launch, and when the server's view changes (fuel, an escape, the crash, a new round). The
 * climb itself is drawn without them (useClimb, ClimbText). It used to be read five times a second and redrew the
 * whole screen with it, which a phone felt as a stutter all through the round.
 */
function useMoment(view: RocketView | null, offset: number): Moment {
  const [now, setNow] = useState(() => Date.now() + offset);
  const m = momentOf(view, now);
  useEffect(() => {
    const t = Date.now() + offset;
    const wait = nextChange(momentOf(view, t));
    // A new view (or a late timer) reads the clock again at once; then the next change is waited for.
    const id = setTimeout(() => setNow(Date.now() + offset), Math.abs(t - now) > 40 ? 0 : wait === null ? 60_000 : wait + 8);
    return () => clearTimeout(id);
  }, [view, offset, now]);
  return m;
}

/** The top of the scale for a climb at `x` (hundredths): it grows with the climb, so the rocket nears the top as it rises. */
const topOf = (x: number) => Math.max(200, Math.ceil(x * 1.6));
/** How far up the path (0 ramp … 1 top) `x` stands on a scale reaching `top`. */
const uOf = (x: number, top = topOf(x)) => (x <= 100 ? 0 : Math.min(1, Math.log(x / 100) / Math.log(top / 100)));
const MARKS = [0.25, 0.5, 0.75, 1];
/** The climb's milestones (hundredths): passing one knocks in the hand and flares the multiplier. */
const MILESTONES = [200, 300, 500, 1000, 2000, 5000, 10000];
const TRAIL = 30;

/** The multiplier the stage shows now: the climb, the crash point, or 1,00× before the launch. */
const xOf = (m: Moment) => (m.kind === 'fly' ? m.x : m.kind === 'done' ? m.crash : 100);

/** Deterministic spread 0…1 from a number (a seat's key), so a fuel flies in from the same place on every render. */
const spread = (k: number, salt: number) => {
  const s = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export function LiveRocketPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel } = useApp();
  const { still } = useSalonFx();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'rocket')!;
  const st = useRocketLive();
  const box = useBox();
  const geo = useMemo(() => (box.w && box.h ? stageGeo(box.w, box.h) : null), [box.w, box.h]);
  const moment = useMoment(st.view, st.offset);
  const round = st.view?.round ?? null;
  const mine = st.view && round && st.mine ? st.mine : null;
  const [auto, setAuto] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(false);
  const [history, setHistory] = useState(false);
  const [flick] = useState(() => new Animated.Value(0));
  const [breathe] = useState(() => new Animated.Value(0));
  // While the rocket is in the air the stars stream past (rocket-stage Space `cruise`): one loop every 6 s.
  const [cruise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    warmSfx(['launch', 'boom', 'cashout', 'tick', 'coin', 'tap']);
  }, []);
  // The stars twinkle.
  useEffect(() => {
    if (still) return;
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    b.start();
    return () => b.stop();
  }, [still, breathe]);
  // The engine's glow flickers, its flame's licks flow and the rocket rolls only while the engine burns.
  const burning = !still && (moment.kind === 'ignite' || moment.kind === 'fly');
  const spin = useSpin(burning);
  useEffect(() => {
    if (!burning) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(flick, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(flick, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [burning, flick]);

  const inAir = moment.kind === 'fly';
  useEffect(() => {
    if (!inAir || still) return;
    cruise.setValue(0);
    const a = Animated.loop(Animated.timing(cruise, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [inAir, still, cruise]);

  // The last three seconds of the countdown tick in the ear and the hand, the digit jumping; the launch roars and
  // shakes the game; every milestone of the climb (2×, 3×, 5×, 10×…) knocks and makes the multiplier flare.
  const shake = useGameQuake();
  const [flash] = useState(() => new Animated.Value(1));
  const flare = (to: number) => {
    if (still) return;
    flash.setValue(to);
    Animated.spring(flash, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  };
  const secLeft = moment.kind === 'bet' ? Math.ceil(moment.left / 1000) : null;
  useEffect(() => {
    if (secLeft === null || secLeft <= 0 || secLeft > 3) return;
    playSfx('tick', 0.6);
    tapHaptic();
    flare(1.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secLeft]);
  const flying = moment.kind === 'fly';
  useEffect(() => {
    if (!flying) return;
    playSfx('launch', 0.8);
    heavyHaptic();
    shake(6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, round?.id]);
  // The milestones: read ten times a second while it climbs (no redraw: only a knock and a flare when one is passed).
  useEffect(() => {
    const r = st.view?.round;
    if (!flying || !r) return;
    const launch = r.launchAt ?? r.betUntil;
    let passed = MILESTONES.filter((m) => multAt(Date.now() + st.offset - launch, st.view?.rate) >= m).length;
    const t = setInterval(() => {
      const x = multAt(Date.now() + st.offset - launch, st.view?.rate);
      const now = MILESTONES.filter((m) => x >= m).length;
      if (now > passed) {
        passed = now;
        pressHaptic();
        playSfx('coin', 0.55);
        flare(1.28);
        if (now >= 4) shake(2.5);
      }
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, round?.id]);
  // My fuel left the rocket (by hand or at its target): the win is celebrated once it is seen.
  const cashed = mine?.cashed ?? null;
  const paid = mine?.payout ?? 0;
  const fuel = mine?.fuel ?? 0;
  // A win above my fuel sends a shine across the stage, once per round.
  const shine = cashed !== null && cashed > 0 && paid > fuel ? (round?.id ?? 0) : 0;
  useEffect(() => {
    if (cashed === null || cashed <= 0) return;
    playSfx('cashout');
    successHaptic();
    // Once per escape of mine (the badge on the stage shows it: EscapeBadge).
  }, [cashed, round?.id]);
  // The climb, worked out every frame on the UI thread: the rocket, its trail, the multiplier and Kaç's payout follow it.
  const climb = useClimb(st.view, st.offset, still);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;
  if (st.game && !st.game.active) return <CasinoLock reason={`${game.name} şu an kapalı.`} />;

  const seats = st.view?.players ?? [];
  const ret = round?.ret ?? 40;
  const lastCrashes = st.history.length ? st.history : (st.view?.last ?? []);

  const onFuel = async (bet: number) => {
    tapHaptic();
    const ok = await addFuel(bet, mine ? mine.auto : auto, entry);
    if (ok) {
      pressHaptic();
      playSfx('coin', 0.7);
    } else errorHaptic();
  };
  const onEscape = async () => {
    pressHaptic();
    const r = await escapeNow();
    if (!r) errorHaptic();
  };

  return (
    <View style={salonScreen}>
      <SalonStage colors={['#141F52', '#0B1234', '#05081C']} accent={ORBIT} win={shine} minHeight={290} inner={s.stage}>
        <View style={StyleSheet.absoluteFill} onLayout={box.onLayout} pointerEvents="none" />
        {geo && (
          <>
            <Space geo={geo} flight={null} still={still} breathe={breathe} cruise={moment.kind === 'fly' ? cruise : null} />
            <Planet geo={geo} />
            <Sky geo={geo} view={st.view} offset={st.offset} still={still} flick={flick} spin={spin} flash={flash} climb={climb} />
            <Chutes geo={geo} round={round?.id ?? 0} seats={seats} mine={mine} still={still} />
            {moment.kind === 'bet' && <Arrivals geo={geo} round={round?.id ?? 0} seats={seats} mine={mine} still={still} />}
            {moment.kind === 'done' && <Podium seats={seats} mine={mine} />}
          </>
        )}
        <SeatList seats={seats} mine={mine} done={moment.kind === 'done'} />
        <View style={s.topRight}>
          {round && (
            <View style={s.crowd} accessibilityLabel={`Bu turda ${round.players} kişi, ${fmt(round.fuel)} jeton yakıt`}>
              <Ionicons name="people" size={12} color="#C7D2FE" />
              <Text style={[tabular, s.crowdText]}>
                {round.players} · {fmt(round.fuel)}
              </Text>
            </View>
          )}
          <InfoButton onPress={() => setInfo(true)} tint={ORBIT} />
        </View>
        <Pressable style={s.trail} onPress={() => setHistory(true)} accessibilityRole="button" accessibilityLabel="Son patlama noktaları, tümünü aç">
          {/* As many whole chips as the stage's width holds (a 360 px phone: four), Tümü always at the end. */}
          <View style={s.chips}>
            {lastCrashes.slice(0, Math.max(3, Math.floor((box.w - 70) / 56))).map((x, i) => (
              <View key={`${i}-${x}`} style={[s.chip, chipTone(x)]}>
                <Text style={[tabular, s.chipText]} numberOfLines={1}>
                  {mulText(x)}
                </Text>
              </View>
            ))}
            {!lastCrashes.length && (
              <Text style={s.trailEmpty} numberOfLines={1}>
                Son patlama noktaları burada görünür
              </Text>
            )}
          </View>
          <View style={s.allChip}>
            <Text style={s.allText}>Tümü</Text>
          </View>
        </Pressable>
        {cashed !== null && cashed > 0 && <EscapeBadge key={round?.id ?? 0} x={cashed} amount={paid} still={still} />}
        {/* The sprite sheets decoded now, so the launch and the blast don't wait for a big picture to open. */}
        <SheetPreload />
      </SalonStage>

      <View style={{ gap: SALON.row }}>
        <View style={s.row}>
          <BalancePill Frame={PlateFrame} />
          <KeyPlate height={SALON.control} style={s.boxFrame} face={s.boxFace}>
            <View accessibilityLabel={`Bu turdaki yakıtın ${fmt(fuel)} jeton`}>
              <Text style={s.boxHead}>YAKITIN</Text>
              <Text style={[tabular, s.boxValue]} numberOfLines={1}>
                {fmt(fuel)}
              </Text>
            </View>
          </KeyPlate>
          <Pressable
            style={[!!mine && { opacity: 0.7 }]}
            disabled={!!mine}
            onPress={() => {
              tapHaptic();
              setPicking((p) => !p);
            }}
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Otomatik kaçış bu turda ilk yakıtla belirlendi' : 'Otomatik kaçış seç'}
          >
            <KeyPlate on={(mine ? mine.auto : auto) !== null} height={SALON.control} style={s.boxFrame} face={s.boxFace}>
              <Text style={s.boxHead}>OTO KAÇ</Text>
              <Text style={[tabular, s.boxValue, (mine ? mine.auto : auto) === null && s.boxOff]} numberOfLines={1}>
                {(mine ? mine.auto : auto) === null ? 'Kapalı' : mulText((mine ? mine.auto : auto)!)}
              </Text>
            </KeyPlate>
          </Pressable>
        </View>
        {picking && !mine && (
          <View style={s.picks} accessibilityRole="radiogroup" accessibilityLabel="Otomatik kaçış çarpanı">
            {[null, ...AUTO_CHOICES].map((x) => (
              <ChoiceChip
                key={String(x)}
                on={auto === x}
                onPress={() => {
                  tapHaptic();
                  setAuto(x);
                  setPicking(false);
                }}
                label={x === null ? 'Otomatik kaçış kapalı' : `${mulText(x)} çarpanında otomatik kaç`}
              >
                <Text style={[tabular, s.pickText, choiceInk(auto === x)]}>{x === null ? 'Kapalı' : mulText(x)}</Text>
              </ChoiceChip>
            ))}
          </View>
        )}
        <Action moment={moment} mine={mine} bets={st.game?.bets ?? game.bets} maxFuel={st.game?.maxFuel ?? 0} busy={st.busy} climb={climb} onFuel={onFuel} onEscape={onEscape} />
        {st.note && (
          <Text style={s.note} accessibilityLiveRegion="polite">
            {st.note}
          </Text>
        )}
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={RULES}>
        <View style={s.pays}>
          {/* Upper case the Turkish way (i → İ): the style doesn't transform it. */}
          <Text style={s.paysHead}>{'Roketin ulaşma şansı'.toLocaleUpperCase('tr-TR')}</Text>
          <View style={s.payRow}>
            <Text style={[s.payCell, s.payDim]}>Çarpan</Text>
            <Text style={[s.payCell, s.payDim, { textAlign: 'center' }]}>Ulaşma şansı</Text>
            <Text style={[s.payCell, s.payDim, { textAlign: 'right' }]}>1.000 yakıt</Text>
          </View>
          {[150, 200, 300, 500, 1000, 10000].map((x) => (
            <View key={x} style={s.payRow}>
              <Text style={[tabular, s.payCell, { color: '#fff' }]}>{mulText(x)}</Text>
              <Text style={[tabular, s.payCell, { color: 'rgba(255,255,255,0.8)', textAlign: 'center' }]}>%{(reachChance(x, ret) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</Text>
              <Text style={[tabular, s.payCell, { color: '#FDE68A', textAlign: 'right' }]}>{fmt(payoutOf(1000, x))}</Text>
            </View>
          ))}
          <Text style={s.paysNote}>
            Bir turda en çok {fmt(st.game?.maxFuel ?? 0)} jeton yakıt alınır. Çok yakıt alınan turlarda roket tablodakinden daha erken patlayabilir.
          </Text>
        </View>
      </GameInfoSheet>
      <HistorySheet visible={history} onClose={() => setHistory(false)} history={lastCrashes} />
    </View>
  );
}

/** A crash point's chip colour: high ones gold, middle ones violet, the rest plain. */
const chipTone = (x: number) => (x >= 1000 ? s.chipHot : x >= 200 ? s.chipMid : null);

/**
 * The climb on the UI thread: while the rocket is in the air its multiplier (hundredths) is worked out every frame
 * there from the server's clock, so the rocket and its trail glide even while the JS thread is busy with a message.
 * Before the launch it is 1×, after the crash the crash point. With motion reduced it steps twice a second instead.
 */
function useClimb(view: RocketView | null, offset: number, still: boolean): SharedValue<number> {
  const r = view?.round;
  const phase = r?.phase;
  const launch = r ? (r.launchAt ?? r.betUntil) : 0;
  const rate = view?.rate;
  const crash = r?.crash ?? 100;
  const x = useSharedValue(100);
  const p = useSharedValue({ launch, rate: rate ?? 0, offset });
  const flying = phase === 'fly';
  const frame = useFrameCallback(() => {
    'worklet';
    const q = p.get();
    x.set(multAt(Date.now() + q.offset - q.launch, q.rate || undefined));
  }, false);
  useEffect(() => {
    p.set({ launch, rate: rate ?? 0, offset });
    frame.setActive(flying && !still);
    // Stopped first, so no last frame of the climb lands after the crash point.
    if (!flying) x.set(phase === 'done' ? crash : 100);
    if (!flying || !still) return;
    const step = () => {
      x.set(multAt(Date.now() + offset - launch, rate));
    };
    step();
    const id = setInterval(step, 500);
    return () => clearInterval(id);
  }, [frame, p, x, flying, still, phase, crash, offset, launch, rate]);
  return x;
}

/** The top of the scale and how far up the path a climb at `x` stands, on the UI thread (the same as topOf / uOf). */
function climbU(x: number) {
  'worklet';
  const top = Math.max(200, Math.ceil(x * 1.6));
  return x <= 100 ? 0 : Math.min(1, Math.log(x / 100) / Math.log(top / 100));
}

/**
 * The climb: the scale on the right edge, the trail of light behind the rocket, the rocket itself (on the ramp before
 * the launch), the big multiplier, and the explosion. The rocket and the trail move on the UI thread (useClimb); the
 * numbers are small parts of their own that count on their own clock, so nothing big is redrawn while it flies.
 */
const Sky = memo(function Sky({ geo, view, offset, still, flick, spin, flash, climb }: { geo: Geo; view: RocketView | null; offset: number; still: boolean; flick: Animated.Value; spin: Animated.Value; /** The multiplier's flare (a countdown second, a milestone). */ flash: Animated.Value; climb: SharedValue<number> }) {
  // Redrawn only when the moment changes (the countdown's seconds, the ignition); the flight itself doesn't wait for it.
  const m = useMoment(view, offset);
  const x = xOf(m);
  const p = pathAt(geo, uOf(x));
  const samples = useMemo(() => pathSamples(geo, TRAIL), [geo]);
  const half = ROCKET_SIZE / 2;
  const rocketStyle = useAnimatedStyle(() => {
    const q = pathAt(geo, climbU(climb.get()));
    return { transform: [{ translateX: q.x - half }, { translateY: q.y - half }, { rotate: `${q.deg}deg` }] };
  });
  const [arm] = useState(() => new Animated.Value(1));
  const [ignite] = useState(() => new Animated.Value(0));
  const lighting = m.kind === 'ignite';
  useEffect(() => {
    if (!lighting) {
      ignite.setValue(0);
      return;
    }
    if (still) {
      ignite.setValue(1);
      return;
    }
    Animated.timing(ignite, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [lighting, still, ignite]);
  const big = m.kind === 'bet' ? `${Math.ceil(m.left / 1000)}` : m.kind === 'ignite' ? '1,00×' : m.kind === 'idle' || m.kind === 'fly' ? '' : mulText(x);
  const sub =
    m.kind === 'bet'
      ? 'saniye · yakıt al'
      : m.kind === 'ignite'
        ? 'Motor ateşlendi'
        : m.kind === 'fly'
          ? 'Uçuşta · istediğin an kaç'
          : m.kind === 'done'
            ? x <= 100
              ? 'Rampada patladı'
              : 'Patladı'
            : 'Tur hazırlanıyor…';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The scale: four marks on the right edge, at the heights the path passes them. */}
      <Marks geo={geo} view={view} offset={offset} fly={m.kind === 'fly'} />
      {(m.kind === 'fly' || m.kind === 'done') && <Trail samples={samples} climb={climb} done={m.kind === 'done'} />}
      {(m.kind === 'bet' || m.kind === 'ignite' || m.kind === 'idle') && <ReadyRocket geo={geo} arm={arm} ignite={ignite} flick={flick} spin={spin} />}
      {m.kind === 'fly' && (
        <Reanimated.View style={[s.rocketBox, rocketStyle]}>
          <RocketSprite power={1} flick={flick} spin={spin} roll />
        </Reanimated.View>
      )}
      {m.kind === 'done' && view?.round && <Blast key={view.round.id} x={p.x} y={p.y} still={still} />}
      {(!!big || m.kind === 'fly') && (
        <Animated.View style={[s.readout, { transform: [{ scale: flash }] }]} accessibilityLiveRegion="polite">
          {/* The multiplier in metal: gold while it climbs, ruby where it blew up, silver for the countdown. While it
              climbs it is drawn by Skia on the UI thread every frame (fx/climb-label): no render, no text layout. */}
          {m.kind === 'fly' ? (
            <ClimbLabel climb={climb} format={MULT} size={50} height={66} fallback={<GoldText size={50} lite>1,00×</GoldText>} />
          ) : (
            <GoldText size={50} metal={m.kind === 'done' ? 'ruby' : 'silver'}>
              {big}
            </GoldText>
          )}
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        </Animated.View>
      )}
    </View>
  );
});

/** The scale's four marks: the top grows with the climb, so their numbers change; read 2,5 times a second while it flies. */
const Marks = memo(function Marks({ geo, view, offset, fly }: { geo: Geo; view: RocketView | null; offset: number; fly: boolean }) {
  const t = useServerTime(offset, fly ? 400 : 1000);
  const top = topOf(xOf(momentOf(view, t || view?.now || 0)));
  return (
    <>
      {MARKS.map((v) => {
        const at = pathAt(geo, v);
        return (
          <Text key={v} style={[tabular, s.mark, { top: at.y - 8 }]}>
            {mulText(Math.round(100 * (top / 100) ** v))}
          </Text>
        );
      })}
    </>
  );
});

/** The trail of light behind the rocket: each dot lights once the climb has passed it, brighter near the rocket. */
const Trail = memo(function Trail({ samples, climb, done }: { samples: { u: number; x: number; y: number }[]; climb: SharedValue<number>; done: boolean }) {
  return (
    <>
      {samples.map((q, i) => (q.u > 0.02 ? <TrailDot key={i} q={q} climb={climb} color={done ? '#FDA4AF' : '#FDE68A'} /> : null))}
    </>
  );
});

function TrailDot({ q, climb, color }: { q: { u: number; x: number; y: number }; climb: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const u = climbU(climb.get());
    return { opacity: q.u <= u ? 0.35 + 0.65 * (q.u / Math.max(u, 0.01)) : 0 };
  });
  return <Reanimated.View style={[s.trailDot, { left: q.x - 2.5, top: q.y - 2.5, backgroundColor: color }, style]} />;
}

/** The rocket blowing up where it stopped, once per round. */
function Blast({ x, y, still }: { x: number; y: number; still: boolean }) {
  // With motion reduced (or the game minimised) the fireball stands at its fullest instead of playing.
  const [fx] = useState(() => new Animated.Value(still ? 0.3 : 0));
  const shake = useGameQuake();
  useEffect(() => {
    playSfx('boom', 0.9);
    // The blast in the hand and the whole game shaking with it.
    rumbleHaptic([90, 60]);
    shake(12);
    if (!still) Animated.timing(fx, { toValue: 1, duration: BLAST_MS, easing: Easing.linear, useNativeDriver: true }).start();
    // Once per blast (mounted per round): not again when `still` changes (the game shown again after a minimise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);
  return <Explosion x={x} y={y} fx={fx} />;
}

/**
 * My escape, said at once and lightly while the rocket flies on for the others: a green and gold plate drops in under
 * the multiplier with the multiplier I left at and what it paid, then fades. A full win show over a climbing rocket cost
 * the phone frames at that very moment, and on the stage's right part only it was cut in half.
 */
const EscapeBadge = memo(function EscapeBadge({ x, amount, still }: { x: number; amount: number; still: boolean }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    const a = Animated.sequence([
      Animated.spring(t, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(t, { toValue: 2, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [t, still]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Kaçtın, ${mulText(x)}, ${fmt(amount)} jeton`}
      style={[
        s.badge,
        {
          opacity: t.interpolate({ inputRange: [0, 0.25, 1, 2], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, -8] }) }, { scale: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0.75, 1, 0.97] }) }],
        },
      ]}
    >
      <LinearGradient colors={['#1E7A4C', '#0B3D24']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.badgeFace}>
        <Text style={s.badgeHead}>KAÇTIN · {mulText(x)}</Text>
        <GoldText size={26} glow={false}>{`+${fmt(amount)}`}</GoldText>
      </LinearGradient>
    </Animated.View>
  );
});

/** Whoever escaped drifts down under a parachute from where the rocket was, with their multiplier; mine in green. */
function Chutes({ geo, round, seats, mine, still }: { geo: Geo; round: number; seats: RocketSeat[]; mine: RocketMine | null; still: boolean }) {
  const gone = seats.filter((p) => p.c !== null && p.c > 0).slice(0, 14);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {gone.map((p) => {
        const at = pathAt(geo, uOf(p.c!));
        return <Chute key={`${round}-${p.k}`} x={at.x} y={at.y} label={`${p.n} ${mulText(p.c!)}`} me={mine?.k === p.k} still={still} />;
      })}
    </View>
  );
}

// Memoised: the round's every message (someone's fuel, an escape) redraws the list round it, and a redraw here would
// rebuild its native animation nodes.
const Chute = memo(function Chute({ x, y, label, me, still }: { x: number; y: number; label: string; me: boolean; still: boolean }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (!still) Animated.timing(t, { toValue: 1, duration: 5200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t, still]);
  return (
    <Animated.View
      style={[
        s.chute,
        {
          left: x - 40,
          top: y - 8,
          opacity: still ? 0.9 : t.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: still ? 30 : t.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }) },
            { translateX: still ? 0 : t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -6, 0, 6, 0] }) },
          ],
        },
      ]}
    >
      <Image source={CHUTE} style={[s.chutePic, me && s.chuteMe]} accessibilityIgnoresInvertColors />
      <Text style={[tabular, s.chuteText, me && { color: '#BBF7D0' }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
});

/** Everyone's fuel flying in to the rocket on the ramp while the countdown runs; each add is one flight. */
function Arrivals({ geo, round, seats, mine, still }: { geo: Geo; round: number; seats: RocketSeat[]; mine: RocketMine | null; still: boolean }) {
  if (still) return null;
  const to = pathAt(geo, 0);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {seats.slice(0, 16).map((p) => {
        const side = spread(p.k, 1) < 0.5;
        const from = { x: side ? -40 : geo.w + 10, y: geo.h * (0.12 + 0.55 * spread(p.k, 2)) };
        return <Arrival key={`${round}-${p.k}-${p.b}`} fx={from.x} fy={from.y} tx={to.x} ty={to.y} label={`${p.n} ${fmt(p.b)}`} me={mine?.k === p.k} />;
      })}
    </View>
  );
}

/** One fuel flying in from (fx, fy) to the rocket at (tx, ty); memoised like Chute. */
const Arrival = memo(function Arrival({ fx, fy, tx, ty, label, me }: { fx: number; fy: number; tx: number; ty: number; label: string; me: boolean }) {
  const from = { x: fx, y: fy };
  const to = { x: tx, y: ty };
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      style={[
        s.capsule,
        me && s.capsuleMe,
        {
          left: from.x,
          top: from.y,
          opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, to.x - from.x - 30] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, to.y - from.y - 10] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }],
        },
      ]}
    >
      <Ionicons name="flame" size={11} color={me ? '#052E16' : '#FDBA74'} />
      <Text style={[tabular, s.capsuleText, me && { color: '#052E16' }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
});

/** The fuel on board on the left: the biggest first, what each one won once it left, dimmed when it blew up. */
function SeatList({ seats, mine, done }: { seats: RocketSeat[]; mine: RocketMine | null; done: boolean }) {
  if (!seats.length) return null;
  return (
    <View style={s.seats} pointerEvents="none">
      {seats.slice(0, 7).map((p) => {
        const left = p.c !== null && p.c > 0;
        const lost = p.c === 0 || (done && p.c === null);
        return (
          <View key={p.k} style={s.seat}>
            <Text style={[s.seatName, mine?.k === p.k && { color: GREEN }, lost && s.seatLost]} numberOfLines={1}>
              {p.n}
            </Text>
            <Text style={[tabular, s.seatValue, left && { color: GREEN }, lost && s.seatLost]} numberOfLines={1}>
              {left ? `+${fmt(p.p)}` : fmt(p.b)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** After the crash: the round's best three escapes on the podium, or a word when nobody made it out. */
function Podium({ seats, mine }: { seats: RocketSeat[]; mine: RocketMine | null }) {
  const best = seats
    .filter((p) => p.c !== null && p.c > 0)
    .sort((a, b) => b.c! - a.c! || b.p - a.p)
    .slice(0, 3);
  if (!seats.length) return null;
  if (!best.length)
    return (
      <View style={s.podium} pointerEvents="none">
        <Text style={s.nobody}>Bu turda kimse kaçamadı</Text>
      </View>
    );
  // Second on the left, first in the middle, third on the right.
  const order = [best[1], best[0], best[2]];
  const heights = [34, 50, 24];
  return (
    <View style={s.podium} pointerEvents="none" accessibilityLabel={`Turun en iyileri: ${best.map((p) => `${p.n} ${mulText(p.c!)}`).join(', ')}`}>
      {order.map((p, i) =>
        p ? (
          <View key={p.k} style={s.step}>
            <Ionicons name="person-circle" size={i === 1 ? 30 : 24} color={mine?.k === p.k ? GREEN : i === 1 ? '#FDE68A' : '#C7D2FE'} />
            <Text style={[s.stepName, mine?.k === p.k && { color: GREEN }]} numberOfLines={1}>
              {p.n}
            </Text>
            <Text style={[tabular, s.stepMult]}>{mulText(p.c!)}</Text>
            <View style={[s.block, { height: heights[i] }, i === 1 && s.blockFirst]}>
              <Text style={s.blockText}>{i === 1 ? 1 : i === 0 ? 2 : 3}</Text>
            </View>
          </View>
        ) : (
          <View key={i} style={s.step} />
        ),
      )}
    </View>
  );
}

/** The big control under the stage: the cans while fuel goes on board, Kaç while mine is in the air, else where it stands. */
function Action({
  moment,
  mine,
  bets,
  maxFuel,
  busy,
  climb,
  onFuel,
  onEscape,
}: {
  moment: Moment;
  mine: RocketMine | null;
  bets: number[];
  maxFuel: number;
  busy: boolean;
  climb: SharedValue<number>;
  onFuel: (bet: number) => void;
  onEscape: () => void;
}) {
  if (moment.kind === 'bet') {
    const room = maxFuel ? maxFuel - (mine?.fuel ?? 0) : Infinity;
    const closing = moment.left < 300;
    return (
      <View style={s.cans} accessibilityRole="toolbar" accessibilityLabel="Yakıt bidonları">
        {bets.slice(0, 6).map((b) => (
          <FuelCan key={b} bet={b} off={busy || closing || b > room} onPress={() => onFuel(b)} />
        ))}
      </View>
    );
  }
  const aboard = !!mine && mine.onBoard > 0 && mine.cashed === null;
  if ((moment.kind === 'fly' || moment.kind === 'ignite') && aboard) return <EscapeButton fuel={mine.onBoard} climb={climb} busy={busy} ready={moment.kind === 'fly'} onPress={onEscape} />;
  const text =
    mine && mine.cashed !== null && mine.cashed > 0
      ? `Kaçtın: ${mulText(mine.cashed)} · +${fmt(mine.payout)} jeton`
      : moment.kind === 'done'
        ? mine
          ? 'Roket patladı, yakıtın gitti'
          : 'Sıradaki tur hazırlanıyor'
        : moment.kind === 'idle'
          ? 'Tur hazırlanıyor…'
          : 'Bu turda yakıtın yok · sıradaki turu bekle';
  const good = !!mine && mine.cashed !== null && mine.cashed > 0;
  return (
    <KeyPlate height={56} face={s.wait}>
      <View style={s.waitRow} accessibilityLiveRegion="polite">
        <Ionicons name={good ? 'checkmark-circle' : moment.kind === 'done' && mine ? 'flame' : 'hourglass-outline'} size={18} color={good ? GREEN : SALON.dim} />
        <Text style={[s.waitText, good && { color: '#BBF7D0' }]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </KeyPlate>
  );
}

/** A Yörünge key: the Blender plate in three parts (PLATE), `children` laid on its face. */
function KeyPlate({ on, height, style, face, children }: { on?: boolean; height: number; style?: StyleProp<ViewStyle>; face?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const p = on ? PLATE.on : PLATE.off;
  const cap = height * PLATE_CAP;
  return (
    <View style={[s.plate, { height }, style]}>
      {/* The ends give way (squeezed a little) only on a key narrower than both of them. */}
      <Image source={p.l} style={{ width: cap, height, flexShrink: 1 }} resizeMode="stretch" fadeDuration={0} accessibilityIgnoresInvertColors />
      <Image source={p.m} style={{ flex: 1, height }} resizeMode="stretch" fadeDuration={0} accessibilityIgnoresInvertColors />
      <Image source={p.r} style={{ width: cap, height, flexShrink: 1 }} resizeMode="stretch" fadeDuration={0} accessibilityIgnoresInvertColors />
      <View style={[StyleSheet.absoluteFill, s.plateFace, face]}>{children}</View>
    </View>
  );
}
/** The balance pill (slot-kit) on Yörünge's plate. */
const PlateFrame: PillFrame = ({ style, face, children }) => (
  <KeyPlate height={SALON.control} style={style} face={[face, s.pillFace]}>
    {children}
  </KeyPlate>
);

/** A fuel can under the stage: a gold-rimmed key with the can and its stake; it sinks and clicks when pressed. */
function FuelCan({ bet, off, onPress }: { bet: number; off: boolean; onPress: () => void }) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (to: number) => Animated.spring(scale, { toValue: to, speed: 40, bounciness: to === 1 ? 10 : 0, useNativeDriver: true }).start();
  return (
    <Pressable
      style={[s.canBox, off && { opacity: 0.45 }]}
      disabled={off}
      onPress={onPress}
      onPressIn={() => {
        spring(0.9);
        playSfx('tap', 0.6);
      }}
      onPressOut={() => spring(1)}
      accessibilityRole="button"
      accessibilityLabel={`${fmt(bet)} jeton yakıt al`}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <KeyPlate height={62} face={s.can}>
          {CAN !== undefined ? <Image source={CAN} style={s.canPic} fadeDuration={0} accessibilityIgnoresInvertColors /> : <Ionicons name="flame" size={18} color="#FFB347" />}
          <Text style={[tabular, s.canText]} numberOfLines={1}>
            {`+${bet >= 1000 ? `${bet / 1000}B` : bet}`}
          </Text>
        </KeyPlate>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Kaç: what my fuel on board pays now, drawn every frame from the climb by Skia on the UI thread (fx/climb-label; the
 * button itself never redraws, so its glow and press never stutter); a tap leaves the rocket.
 */
function EscapeButton({ fuel, climb, busy, ready, onPress }: { fuel: number; climb: SharedValue<number>; busy: boolean; ready: boolean; onPress: () => void }) {
  const pays = useMemo<ClimbFormat>(() => ({ kind: 'pay', fuel, prefix: 'KAÇ · ' }), [fuel]);
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (to: number) => Animated.spring(scale, { toValue: to, speed: 40, bounciness: to === 1 ? 10 : 0, useNativeDriver: true }).start();
  const off = busy || !ready;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        spring(0.95);
        playSfx('tap', 0.75);
        tapHaptic();
      }}
      onPressOut={() => spring(1)}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={`Kaç, ${fmt(fuel)} jeton yakıtla`}
      accessibilityState={{ disabled: off }}
    >
      {/* The emerald key (Yörünge's own picture, its round ends kept whole at any width) with the payout counting on it. */}
      <Animated.View style={[s.kac, off && { opacity: 0.6 }, { transform: [{ scale }] }]}>
        <Image source={KAC.left} style={{ width: KAC_H * KAC_CAP, height: KAC_H }} accessibilityIgnoresInvertColors />
        <Image source={KAC.mid} style={{ flex: 1, height: KAC_H }} resizeMode="stretch" accessibilityIgnoresInvertColors />
        <Image source={KAC.right} style={{ width: KAC_H * KAC_CAP, height: KAC_H }} accessibilityIgnoresInvertColors />
        <View style={s.kacLabel} pointerEvents="none">
          {ready ? (
            <ClimbLabel climb={climb} format={pays} size={21} height={KAC_H} metal="emerald" style={s.kacText} fallback={<GoldText size={20} lite>{`KAÇ · ${fmt(payoutOf(fuel, 100))}`}</GoldText>} />
          ) : (
            <GoldText size={18} metal="silver">
              Kalkıyor…
            </GoldText>
          )}
        </View>
        <Ionicons name="rocket" size={20} color="#FFF5C8" style={s.kacIcon} />
      </Animated.View>
    </Pressable>
  );
}
/** Kaç's key height (px). */
const KAC_H = 62;

/** Son turlar: the last 50 crash points and how the last 10, 20, 50 and 100 rounds fell into bands. */
function HistorySheet({ visible, onClose, history }: { visible: boolean; onClose: () => void; history: number[] }) {
  const spans = [10, 20, 50, 100];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {/* The tap-outside area beside the card, not around it: no button inside another. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Son patlama noktaları</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={s.grid}>
              {history.slice(0, 50).map((x, i) => (
                <View key={`${i}-${x}`} style={[s.cell, chipTone(x)]}>
                  <Text style={[tabular, s.cellText]}>{mulText(x)}</Text>
                </View>
              ))}
              {!history.length && <Text style={s.trailEmpty}>Henüz tur yok</Text>}
            </View>
            <View style={s.table}>
              <View style={s.tableRow}>
                <Text style={[s.tableCell, s.tableHead, { flex: 1.3 }]}>Patlama</Text>
                {spans.map((n) => (
                  <Text key={n} style={[s.tableCell, s.tableHead]}>
                    Son {n}
                  </Text>
                ))}
              </View>
              {BANDS.map((b, i) => (
                <View key={b.label} style={s.tableRow}>
                  <Text style={[tabular, s.tableCell, { flex: 1.3, color: '#fff' }]}>{b.label}</Text>
                  {spans.map((n) => (
                    <Text key={n} style={[tabular, s.tableCell]}>
                      {history.length ? bandCounts(history, n)[i] : '–'}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
            <Text style={s.paysNote}>Rampada patlayan turlar 1,00× olarak yazılır.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A dark edge under the keys' words. */
const INK = { textShadowColor: 'rgba(3,4,20,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } as const;

const s = StyleSheet.create({
  stage: { padding: 0, gap: 0 },
  topRight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  crowd: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(4,5,26,0.6)' },
  crowdText: { color: '#E0E7FF', fontSize: 11, fontWeight: '800' },
  mark: { position: 'absolute', right: 8, color: 'rgba(199,210,254,0.6)', fontSize: 10, fontWeight: '800' },
  trailDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
  rocketBox: { position: 'absolute', left: 0, top: 0, width: ROCKET_SIZE, height: ROCKET_SIZE },
  readout: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center' },
  badge: { position: 'absolute', top: '44%', alignSelf: 'center', borderRadius: 16, padding: 2, backgroundColor: '#E8B53A', boxShadow: '0 6px 18px rgba(0,0,0,0.55)' },
  badgeFace: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 6, alignItems: 'center' },
  badgeHead: { color: '#D1FAE5', fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textShadowColor: 'rgba(3,20,10,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  // The italic digits lean past their box: room on both sides keeps the last one whole (centred, so even).
  sub: { color: '#E0E7FF', fontWeight: '800', fontSize: 13, textShadowColor: 'rgba(4,5,26,0.9)', textShadowRadius: 6 },
  chute: { position: 'absolute', width: 80, alignItems: 'center' },
  chutePic: { width: 34, height: 34 },
  // Mine is drawn a little bigger, with a green light round it.
  chuteMe: { width: 40, height: 40, boxShadow: '0 0 12px rgba(74,222,128,0.9)', borderRadius: 20 },
  chuteText: { color: '#FDE68A', fontSize: 10, fontWeight: '900', textShadowColor: 'rgba(4,5,26,0.95)', textShadowRadius: 4 },
  capsule: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, maxWidth: 120, paddingHorizontal: 7, borderRadius: 10, backgroundColor: 'rgba(30,41,99,0.9)', borderWidth: 1, borderColor: 'rgba(253,186,116,0.7)' },
  capsuleMe: { backgroundColor: GREEN, borderColor: '#BBF7D0' },
  capsuleText: { color: '#FFEDD5', fontSize: 10, fontWeight: '800' },
  seats: { position: 'absolute', top: 10, left: 8, width: '38%', gap: 2 },
  seat: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(4,5,26,0.45)' },
  seatName: { flex: 1, color: '#E0E7FF', fontSize: 11, fontWeight: '700' },
  seatValue: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
  seatLost: { color: 'rgba(199,210,254,0.4)', textDecorationLine: 'line-through' },
  podium: { position: 'absolute', left: '18%', right: '18%', bottom: 46, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  nobody: { color: '#FECDD3', fontWeight: '800', fontSize: 13, textAlign: 'center', backgroundColor: 'rgba(4,5,26,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  step: { flex: 1, alignItems: 'center' },
  stepName: { color: '#E0E7FF', fontSize: 10, fontWeight: '800' },
  stepMult: { color: '#FDE68A', fontSize: 12, fontWeight: '900' },
  block: { alignSelf: 'stretch', marginTop: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: 'rgba(103,232,249,0.35)', alignItems: 'center', justifyContent: 'center' },
  blockFirst: { backgroundColor: 'rgba(253,230,138,0.55)' },
  blockText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  trail: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  trailEmpty: { color: 'rgba(199,210,254,0.6)', fontSize: 11, fontWeight: '700' },
  chip: { paddingHorizontal: 6, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(148,163,184,0.22)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.45)' },
  chipMid: { backgroundColor: 'rgba(167,139,250,0.25)', borderColor: 'rgba(167,139,250,0.7)' },
  chipHot: { backgroundColor: 'rgba(250,204,21,0.25)', borderColor: 'rgba(250,204,21,0.8)' },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  allChip: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(103,232,249,0.2)', borderWidth: 1, borderColor: ORBIT },
  allText: { color: ORBIT, fontSize: 11, fontWeight: '900' },
  row: { flexDirection: 'row', gap: SALON.row, alignItems: 'center' },
  boxFrame: { minWidth: 92 },
  boxFace: { alignItems: 'flex-start', paddingHorizontal: 16 },
  // The keys' words: the brand's bold face, sharp at any size, with a dark edge that lifts them off the enamel.
  boxHead: { color: '#F6D58A', fontFamily: fonts.display, fontSize: 9.5, lineHeight: 12, letterSpacing: 1.3, ...INK },
  boxValue: { color: '#FFFFFF', fontFamily: fonts.display, fontSize: 17, lineHeight: 21, ...INK },
  boxOff: { color: 'rgba(222,232,250,0.75)', fontSize: 15 },
  plate: { flexDirection: 'row' },
  plateFace: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  // The pill's row runs the plate's whole width (its avatar and full balance show when it is wide enough).
  pillFace: { alignItems: 'stretch', paddingHorizontal: 6 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickText: { fontSize: 13, fontWeight: '800' },
  cans: { flexDirection: 'row', gap: 6 },
  canBox: { flex: 1 },
  can: { gap: 0, paddingHorizontal: 4 },
  canPic: { width: 30, height: 30, marginTop: -2 },
  canText: { color: '#FFE7A6', fontFamily: fonts.display, fontSize: 14, lineHeight: 17, ...INK },
  kac: { flexDirection: 'row', alignItems: 'center', height: KAC_H },
  kacLabel: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  kacText: { flex: 1, marginHorizontal: 44 },
  kacIcon: { position: 'absolute', left: 30, top: KAC_H / 2 - 10 },
  wait: { paddingHorizontal: 18 },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waitText: { color: 'rgba(232,238,255,0.88)', fontFamily: fonts.display, fontSize: 14, flexShrink: 1, ...INK },
  note: { color: '#FDE68A', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pays: { gap: 6 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  payCell: { flex: 1, fontWeight: '800', fontSize: 14 },
  payDim: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
  // The tap-outside area stays clear (theme SCRIM); the card carries its own rim and shadow.
  backdrop: { flex: 1, backgroundColor: SCRIM, justifyContent: 'center', padding: 16 },
  sheet: { maxHeight: '85%', borderRadius: 18, padding: 14, gap: 10, backgroundColor: '#0D1440', borderWidth: 1.5, borderColor: 'rgba(103,232,249,0.6)', boxShadow: '0 12px 40px rgba(2,3,15,0.65)' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  cell: { width: '18.4%', height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(148,163,184,0.22)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.45)' },
  cellText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  table: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(103,232,249,0.25)' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(103,232,249,0.2)' },
  tableCell: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tableHead: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
});
