// Canlı Yörünge: Yörünge played live by everyone at once (lib/live/rocket-live; the server's rocket-live.mjs). One round
// for all: fuel goes on board while the countdown runs (a tap on a can adds one stake), the engine lights, the rocket
// climbs, and whoever taps Kaç before it blows up gets their fuel × the multiplier at that moment; an automatic escape
// leaves at its target by itself. Everyone's fuel flies in to the rocket, whoever escapes drifts down under a parachute
// at their multiplier, and after the crash the round's best three stand on the podium. The stage is Yörünge's
// (rocket-stage); the scale on its right grows with the climb, so the rocket keeps rising toward the top. Nothing here
// decides a round: the server's view leads, and this phone's clock only moves the climb between two of its messages.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { SALON, SalonStage, WideAction, salonScreen, tabular, useBox, useSalonFx, wideInk } from '@/components/games/fx/salon';
import { useWinFx } from '@/components/games/fx/win-fx';
import { RocketPlayer } from '@/components/games/rocket';
import { pathAt, pathSamples, stageGeo, type Geo } from '@/components/games/rocket-flight';
import { Explosion, ORBIT, Planet, ROCKET_SIZE, ReadyRocket, RocketSprite, Space } from '@/components/games/rocket-stage';
import { BalancePill, fmt } from '@/components/games/slot-kit';
import type { RocketMine, RocketSeat, RocketView } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { liveMode } from '@/lib/live';
import { BANDS, bandCounts, momentOf, type Moment } from '@/lib/live/rocket-live-core';
import { addFuel, escapeNow, useRocketLive, useRocketState } from '@/lib/live/rocket-live';
import { AUTO_CHOICES, mulText, payoutOf, reachChance } from '@/lib/rocket-live';
import { useApp } from '@/store';
import { SCRIM } from '@/theme';

const GREEN = '#4ADE80';
const RED = '#FB7185';
const CLIMB = '#FDE047';
const RULES =
  'Her turda herkes aynı roketi izler. Geri sayım bitene kadar bidonlara dokunarak yakıt al; her dokunuş bir bahistir. Roket kalkınca çarpan yükselir: istediğin an Kaç’a bas, yakıtın o anki çarpanla ödenir. Roket sen kaçmadan patlarsa yakıtın gider. Otomatik kaç seçersen roket o çarpana gelince kendiliğinden kaçarsın. Patlama noktası tur açılırken sunucuda belirlenir; tırmanışın hızı her turda aynıdır, sonucu önceden göstermez.';

/** Yörünge: live and shared on a server that plays it that way; the one-player screen in the demo and on an older server. */
export function YorungePlayer({ entry }: { entry: Entry }) {
  const { rocketLive } = useGames();
  return liveMode() && rocketLive ? <LiveRocketPlayer entry={entry} /> : <RocketPlayer entry={entry} />;
}

/** The server's time, read again every animation frame while `fast`, else every `slowMs`; 0 until the first read. */
function useServerTime(offset: number, fast: boolean, slowMs = 200) {
  const [t, setT] = useState(0);
  const off = useRef(offset);
  useEffect(() => {
    off.current = offset;
  }, [offset]);
  useEffect(() => {
    if (fast) {
      let id = 0;
      const step = () => {
        setT(Date.now() + off.current);
        id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
      return () => cancelAnimationFrame(id);
    }
    const timer = setInterval(() => setT(Date.now() + off.current), slowMs);
    const first = setTimeout(() => setT(Date.now() + off.current), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [fast, slowMs]);
  return t;
}

/** The top of the scale for a climb at `x` (hundredths): it grows with the climb, so the rocket nears the top as it rises. */
const topOf = (x: number) => Math.max(200, Math.ceil(x * 1.6));
/** How far up the path (0 ramp … 1 top) `x` stands on a scale reaching `top`. */
const uOf = (x: number, top = topOf(x)) => (x <= 100 ? 0 : Math.min(1, Math.log(x / 100) / Math.log(top / 100)));
const MARKS = [0.25, 0.5, 0.75, 1];
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
  const t = useServerTime(st.offset, false);
  const now = t || st.view?.now || 0;
  const moment = momentOf(st.view, now);
  const round = st.view?.round ?? null;
  const mine = st.view && round && st.mine ? st.mine : null;
  const [auto, setAuto] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(false);
  const [history, setHistory] = useState(false);
  const win = useWinFx();
  const [flick] = useState(() => new Animated.Value(0));
  const [breathe] = useState(() => new Animated.Value(0));

  useEffect(() => {
    warmSfx(['launch', 'boom', 'cashout', 'tick', 'coin', 'tap']);
  }, []);
  // The stars twinkle and the flame flickers.
  useEffect(() => {
    if (still) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(flick, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(flick, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
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
  }, [still, flick, breathe]);

  // The last three seconds of the countdown tick; the launch roars.
  const secLeft = moment.kind === 'bet' ? Math.ceil(moment.left / 1000) : null;
  useEffect(() => {
    if (secLeft !== null && secLeft > 0 && secLeft <= 3) playSfx('tick', 0.5);
  }, [secLeft]);
  const flying = moment.kind === 'fly';
  useEffect(() => {
    if (flying) playSfx('launch', 0.8);
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
    void win.celebrate({ amount: paid, bet: fuel });
    // Once per escape of mine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashed, round?.id]);

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
            <Space geo={geo} flight={null} still={still} breathe={breathe} />
            <Planet geo={geo} />
            <Sky geo={geo} view={st.view} offset={st.offset} still={still} flick={flick} />
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
        <View style={[StyleSheet.absoluteFill, { left: '30%' }]} pointerEvents="box-none">
          {win.layer}
        </View>
      </SalonStage>

      <View style={{ gap: SALON.row }}>
        <View style={s.row}>
          <BalancePill />
          <View style={s.fuelBox} accessibilityLabel={`Bu turdaki yakıtın ${fmt(fuel)} jeton`}>
            <Text style={s.fuelHead}>YAKITIN</Text>
            <Text style={[tabular, s.fuelValue]} numberOfLines={1}>
              {fmt(fuel)}
            </Text>
          </View>
          <Pressable
            style={[s.autoChip, (mine ? mine.auto : auto) !== null && s.autoOn, !!mine && { opacity: 0.7 }]}
            disabled={!!mine}
            onPress={() => {
              tapHaptic();
              setPicking((p) => !p);
            }}
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Otomatik kaçış bu turda ilk yakıtla belirlendi' : 'Otomatik kaçış seç'}
          >
            <Text style={s.autoHead}>OTO KAÇ</Text>
            <Text style={[tabular, s.autoValue]} numberOfLines={1}>
              {(mine ? mine.auto : auto) === null ? 'Kapalı' : mulText((mine ? mine.auto : auto)!)}
            </Text>
          </Pressable>
        </View>
        {picking && !mine && (
          <View style={s.picks} accessibilityRole="radiogroup" accessibilityLabel="Otomatik kaçış çarpanı">
            {[null, ...AUTO_CHOICES].map((x) => (
              <Pressable
                key={String(x)}
                style={[s.pick, auto === x && s.pickOn]}
                onPress={() => {
                  tapHaptic();
                  setAuto(x);
                  setPicking(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: auto === x }}
              >
                <Text style={[tabular, s.pickText, auto === x && { color: SALON.goldInk }]}>{x === null ? 'Kapalı' : mulText(x)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Action moment={moment} mine={mine} bets={st.game?.bets ?? game.bets} maxFuel={st.game?.maxFuel ?? 0} busy={st.busy} offset={st.offset} onFuel={onFuel} onEscape={onEscape} />
        {st.note && (
          <Text style={s.note} accessibilityLiveRegion="polite">
            {st.note}
          </Text>
        )}
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={RULES}>
        <View style={s.pays}>
          {/* Upper case the Turkish way (i → İ): the style doesn't transform it. */}
          <Text style={s.paysHead}>{`Roketin ulaşma şansı · kasa payı %${100 - ret}`.toLocaleUpperCase('tr-TR')}</Text>
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
            Oynanan her 100 jetonun ortalama {ret} jetonu kazananlara döner, {100 - ret} jetonu kasada kalır. Roket her 100 turun yaklaşık {100 - ret} turunda kalkmadan patlar. Bir turda en çok {fmt(st.game?.maxFuel ?? 0)} jeton yakıt alınır. Ödül havuzu yetmezse roket daha erken patlayabilir.
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
 * The climb, redrawn every animation frame while the rocket is in the air: the scale on the right edge, the trail of
 * light behind the rocket, the rocket itself (on the ramp before the launch), the big multiplier, and the explosion.
 */
const Sky = memo(function Sky({ geo, view, offset, still, flick }: { geo: Geo; view: RocketView | null; offset: number; still: boolean; flick: Animated.Value }) {
  const phase = view?.round?.phase;
  const t = useServerTime(offset, phase === 'fly' && !still, still ? 500 : 120);
  const m = momentOf(view, t || view?.now || 0);
  const x = xOf(m);
  const top = topOf(x);
  const u = uOf(x, top);
  const p = pathAt(geo, u);
  const samples = useMemo(() => pathSamples(geo, TRAIL), [geo]);
  const half = ROCKET_SIZE / 2;
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
  const color = m.kind === 'done' ? RED : m.kind === 'fly' ? CLIMB : '#EEF2FF';
  const big = m.kind === 'bet' ? `${Math.ceil(m.left / 1000)}` : m.kind === 'ignite' ? '1,00×' : m.kind === 'idle' ? '' : mulText(x);
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
      {MARKS.map((v) => {
        const at = pathAt(geo, v);
        return (
          <Text key={v} style={[tabular, s.mark, { top: at.y - 8 }]}>
            {mulText(Math.round(100 * (top / 100) ** v))}
          </Text>
        );
      })}
      {(m.kind === 'fly' || m.kind === 'done') &&
        samples
          .filter((q) => q.u > 0.02 && q.u <= u)
          .map((q, i) => <View key={i} style={[s.trailDot, { left: q.x - 2.5, top: q.y - 2.5, opacity: 0.35 + 0.65 * (q.u / Math.max(u, 0.01)), backgroundColor: m.kind === 'done' ? '#FDA4AF' : '#FDE68A' }]} />)}
      {(m.kind === 'bet' || m.kind === 'ignite' || m.kind === 'idle') && <ReadyRocket geo={geo} arm={arm} ignite={ignite} flick={flick} />}
      {m.kind === 'fly' && (
        <View style={[s.rocketBox, { transform: [{ translateX: p.x - half }, { translateY: p.y - half }, { rotate: `${p.deg}deg` }] }]}>
          <RocketSprite power={1} flick={flick} />
        </View>
      )}
      {m.kind === 'done' && view?.round && <Blast key={view.round.id} x={p.x} y={p.y} still={still} />}
      {!!big && (
        <View style={s.readout} accessibilityLiveRegion="polite">
          <Text style={[s.mult, { color }]} numberOfLines={1}>
            {big}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      )}
    </View>
  );
});

/** The rocket blowing up where it stopped, once per round. */
function Blast({ x, y, still }: { x: number; y: number; still: boolean }) {
  const [fx] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    playSfx('boom', 0.9);
    if (!still) Animated.timing(fx, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }).start();
  }, [fx, still]);
  return <Explosion x={x} y={y} fx={fx} />;
}

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

function Chute({ x, y, label, me, still }: { x: number; y: number; label: string; me: boolean; still: boolean }) {
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
      <View style={[s.canopy, me && { backgroundColor: GREEN }]} />
      <View style={s.lines} />
      <Text style={[tabular, s.chuteText, me && { color: '#BBF7D0' }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

/** Everyone's fuel flying in to the rocket on the ramp while the countdown runs; each add is one flight. */
function Arrivals({ geo, round, seats, mine, still }: { geo: Geo; round: number; seats: RocketSeat[]; mine: RocketMine | null; still: boolean }) {
  if (still) return null;
  const to = pathAt(geo, 0);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {seats.slice(0, 16).map((p) => {
        const side = spread(p.k, 1) < 0.5;
        const from = { x: side ? -40 : geo.w + 10, y: geo.h * (0.12 + 0.55 * spread(p.k, 2)) };
        return <Arrival key={`${round}-${p.k}-${p.b}`} from={from} to={to} label={`${p.n} ${fmt(p.b)}`} me={mine?.k === p.k} />;
      })}
    </View>
  );
}

function Arrival({ from, to, label, me }: { from: { x: number; y: number }; to: { x: number; y: number }; label: string; me: boolean }) {
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
}

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
  offset,
  onFuel,
  onEscape,
}: {
  moment: Moment;
  mine: RocketMine | null;
  bets: number[];
  maxFuel: number;
  busy: boolean;
  offset: number;
  onFuel: (bet: number) => void;
  onEscape: () => void;
}) {
  if (moment.kind === 'bet') {
    const room = maxFuel ? maxFuel - (mine?.fuel ?? 0) : Infinity;
    const closing = moment.left < 300;
    return (
      <View style={s.cans} accessibilityRole="toolbar" accessibilityLabel="Yakıt bidonları">
        {bets.slice(0, 6).map((b) => {
          const off = busy || closing || b > room;
          return (
            <Pressable key={b} style={[s.can, off && { opacity: 0.45 }]} disabled={off} onPress={() => onFuel(b)} accessibilityRole="button" accessibilityLabel={`${fmt(b)} jeton yakıt al`}>
              <Ionicons name="flame" size={14} color={SALON.goldInk} />
              <Text style={[tabular, s.canText]} numberOfLines={1}>
                +{b >= 1000 ? `${b / 1000}B` : b}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  const aboard = !!mine && mine.onBoard > 0 && mine.cashed === null;
  if ((moment.kind === 'fly' || moment.kind === 'ignite') && aboard) return <EscapeButton fuel={mine.onBoard} offset={offset} busy={busy} ready={moment.kind === 'fly'} onPress={onEscape} />;
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
    <View style={[s.wait, good && s.waitGood]} accessibilityLiveRegion="polite">
      <Ionicons name={good ? 'checkmark-circle' : moment.kind === 'done' && mine ? 'flame' : 'hourglass-outline'} size={18} color={good ? GREEN : SALON.dim} />
      <Text style={[s.waitText, good && { color: '#BBF7D0' }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Kaç: what my fuel on board pays now, counted every frame; a tap leaves the rocket. */
function EscapeButton({ fuel, offset, busy, ready, onPress }: { fuel: number; offset: number; busy: boolean; ready: boolean; onPress: () => void }) {
  const t = useServerTime(offset, ready);
  const { view } = useRocketState();
  const m = momentOf(view, t || view?.now || 0);
  const x = m.kind === 'fly' ? m.x : 100;
  return (
    <WideAction onPress={onPress} disabled={busy || !ready} label={`Kaç, ${mulText(x)}, ${fmt(payoutOf(fuel, x))} jeton`} style={s.escape}>
      <Ionicons name="rocket" size={20} color={SALON.goldInk} />
      <Text style={[tabular, s.escapeText, wideInk()]} numberOfLines={1}>
        {ready ? `KAÇ · ${fmt(payoutOf(fuel, x))}` : 'Kalkıyor…'}
      </Text>
    </WideAction>
  );
}

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

const s = StyleSheet.create({
  stage: { padding: 0, gap: 0 },
  topRight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  crowd: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(4,5,26,0.6)' },
  crowdText: { color: '#E0E7FF', fontSize: 11, fontWeight: '800' },
  mark: { position: 'absolute', right: 8, color: 'rgba(199,210,254,0.6)', fontSize: 10, fontWeight: '800' },
  trailDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
  rocketBox: { position: 'absolute', left: 0, top: 0, width: ROCKET_SIZE, height: ROCKET_SIZE },
  readout: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center' },
  // The italic digits lean past their box: room on both sides keeps the last one whole (centred, so even).
  mult: { fontSize: 50, lineHeight: 58, paddingHorizontal: 14, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(4,5,26,0.9)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 },
  sub: { color: '#E0E7FF', fontWeight: '800', fontSize: 13, textShadowColor: 'rgba(4,5,26,0.9)', textShadowRadius: 6 },
  chute: { position: 'absolute', width: 80, alignItems: 'center' },
  canopy: { width: 30, height: 15, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FB923C', borderWidth: 1.5, borderColor: '#FFEDD5' },
  lines: { width: 16, height: 7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
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
  fuelBox: { minWidth: 76, height: SALON.control, borderRadius: SALON.controlRadius, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#13213A', borderWidth: 1, borderColor: SALON.glassRim },
  fuelHead: { color: SALON.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  fuelValue: { color: SALON.win, fontSize: 16, fontWeight: '900' },
  autoChip: { minWidth: 86, height: SALON.control, borderRadius: SALON.controlRadius, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#13213A', borderWidth: 1, borderColor: SALON.glassRim },
  autoOn: { borderColor: GREEN, backgroundColor: 'rgba(22,101,52,0.45)' },
  autoHead: { color: SALON.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  autoValue: { color: '#fff', fontSize: 15, fontWeight: '900' },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { paddingHorizontal: 10, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: '#13213A', borderWidth: 1, borderColor: SALON.glassRim },
  pickOn: { backgroundColor: SALON.gold, borderColor: SALON.goldHi },
  pickText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cans: { flexDirection: 'row', gap: 6 },
  can: { flex: 1, height: 52, borderRadius: SALON.controlRadius, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: SALON.gold, borderWidth: 1.5, borderColor: SALON.goldHi },
  canText: { color: SALON.goldInk, fontSize: 14, fontWeight: '900' },
  escape: { height: 56, backgroundColor: GREEN },
  escapeText: { fontSize: 19 },
  wait: { height: 52, borderRadius: SALON.controlRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: 'rgba(15,28,51,0.9)', borderWidth: 1, borderColor: SALON.glassRim },
  waitGood: { borderColor: GREEN, backgroundColor: 'rgba(22,101,52,0.4)' },
  waitText: { color: SALON.dim, fontSize: 14, fontWeight: '800', flexShrink: 1 },
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
