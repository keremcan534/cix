// Renk Kartları as it is played on the screen: the others round the top of the table with their card counts, the
// two piles on the felt with the colour to follow and the direction of play, my own cards as a fan underneath. A
// new state isn't just shown: the card flies from whoever played it to the pile, drawn cards leave the pile for
// whoever took them, and a missed turn, a SON KART and a new pile are said over the table.
//
// One stage for both ways to play. CardsPractice runs the app's own copy of the rules (lib/room-games/cards) here on
// the phone against opponents that play by themselves. CardsLive shows a live room's table: the server deals and
// checks every card (server/api/room-games/cards.mjs), this screen sends my taps and plays back what comes.
// "Animasyonları azalt" skips the flying: the table just changes.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { CARD_COLORS, CardBack, CardFace, cardHeight } from '@/components/games/room/card-face';
import { ActionButton, EndCard, SeatFace, endSound, firstName, rnd, usePracticeTable, useSecondsLeft, type Seat } from '@/components/games/room/table-kit';
import { Text } from '@/components/text';
import type { CardsServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { META, cardName, cardOf, fits, moveTable, openTable, pickCard, sitDown, startTable, timeoutTable, viewOf, type CardsEvent, type CardsMove, type CardsTable } from '@/lib/room-games/cards';
import { useSettings } from '@/store';
import { colors, fonts, semantic } from '@/theme';

/** What the stage shows: a table as one seat is told it, with the people on its seats. `me` −1: I watch. */
export type CardsView = {
  status: 'waiting' | 'playing' | 'over';
  turn: number;
  winner: number | null;
  seats: Seat[];
  me: number;
  log: string;
  counts: number[];
  mine: number[] | null;
  /** The card on the table; null before the first hand. */
  top: number | null;
  under: number[];
  pile: number;
  color: number;
  dir: 1 | -1;
  drawn: number | null;
  deal: number;
  n: number;
  last: CardsEvent | null;
};

type Point = { x: number; y: number };
type Slot = Point & { r: number; z: number };

const SEAT = 46;
const TOP_H = 76;
const FELT_H = 172;
const LIFT = 14;
const FLY_MS = 340;

/** My cards in the order they are held: by colour, numbers first, the Jokers last. */
const sorted = (ids: number[]) =>
  [...ids].sort((a, b) => {
    const [x, y] = [cardOf(a), cardOf(b)];
    const rank = (v: unknown) => (typeof v === 'number' ? v : 10 + ['Atla', 'Yön', '+2', 'Joker', '+4'].indexOf(String(v)));
    return (x.color ?? 9) - (y.color ?? 9) || rank(x.value) - rank(y.value) || a - b;
  });

/** Where each of my cards lies: a fan across the width, in two rows when one would crowd them, the playable ones raised. */
function layoutHand(ids: number[], width: number, cw: number, raised: (id: number) => boolean) {
  const room = width - 8 - cw;
  const perRow = Math.max(1, Math.floor(room / 21) + 1);
  const half = Math.ceil(ids.length / 2);
  const rows = ids.length > perRow ? [ids.slice(0, half), ids.slice(half)] : [ids];
  const slots = new Map<number, Slot>();
  rows.forEach((row, ri) => {
    const m = row.length;
    const step = m > 1 ? Math.min(cw * 0.7, room / (m - 1)) : 0;
    const x0 = (width - (cw + step * (m - 1))) / 2;
    const mid = (m - 1) / 2;
    const fan = m > 1 ? Math.min(3.4, 24 / m) : 0;
    const sag = mid > 0 ? Math.min(1.1, 10 / (mid * mid)) : 0;
    row.forEach((id, j) => {
      const d = j - mid;
      slots.set(id, { x: x0 + j * step, y: LIFT + ri * 36 + d * d * sag - (raised(id) ? LIFT : 0), r: d * fan, z: ri * 100 + j });
    });
  });
  return { slots, height: LIFT + (rows.length - 1) * 36 + cardHeight(cw) + 12 };
}

/** One of my cards: it comes from the pile to its place in the fan, and moves when the fan changes. */
function HandCard({ id, slot, from, delay, cw, playable, dim, still, onPress }: { id: number; slot: Slot; from: Point; delay: number; cw: number; playable: boolean; dim: boolean; still: boolean; onPress: () => void }) {
  const [x] = useState(() => new Animated.Value(still ? slot.x : from.x));
  const [y] = useState(() => new Animated.Value(still ? slot.y : from.y));
  const [r] = useState(() => new Animated.Value(still ? slot.r : 0));
  const first = useRef(true);
  useEffect(() => {
    const wait = first.current ? delay : 0;
    if (first.current && !still) setTimeout(() => playSfx('card', 0.5), wait);
    first.current = false;
    if (still) return void [x.setValue(slot.x), y.setValue(slot.y), r.setValue(slot.r)];
    const a = Animated.parallel([
      Animated.timing(x, { toValue: slot.x, duration: 300, delay: wait, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(y, { toValue: slot.y, duration: 300, delay: wait, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(r, { toValue: slot.r, duration: 300, delay: wait, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
    // `delay` only matters for the first flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.x, slot.y, slot.r, still, x, y, r]);
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, zIndex: slot.z, transform: [{ translateX: x }, { translateY: y }, { rotate: r.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) }] }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${cardName(id)}${playable ? ', atılabilir' : ''}`} accessibilityState={{ disabled: !playable }} hitSlop={{ top: 6 }}>
        <CardFace id={id} w={cw} dim={dim} />
        {playable && <View style={[s.playable, { borderRadius: cw * 0.15 }]} />}
      </Pressable>
    </Animated.View>
  );
}

/** The card on the table. A new one flies in from whoever played it (`from`, with the turn it had there). */
function TopCard({ id, w, from, tilt, still }: { id: number; w: number; from: (Point & { r: number; scale: number }) | null; tilt: number; still: boolean }) {
  const [t] = useState(() => new Animated.Value(from && !still ? 0 : 1));
  const [start] = useState(from);
  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: FLY_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [t]);
  const go = (a: number, b: number) => t.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: start ? [{ translateX: go(start.x, 0) }, { translateY: go(start.y, 0) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${start.r}deg`, `${tilt}deg`] }) }, { scale: go(start.scale, 1) }] : [{ rotate: `${tilt}deg` }],
      }}
    >
      <CardFace id={id} w={w} />
    </Animated.View>
  );
}

/** A card face down flying from the pile to whoever drew it, then gone. */
function Flight({ from, to, delay, w }: { from: Point; to: Point; delay: number; w: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const sound = setTimeout(() => playSfx('card', 0.45), delay);
    const a = Animated.timing(t, { toValue: 1, duration: FLY_MS + 60, delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => {
      clearTimeout(sound);
      a.stop();
    };
  }, [t, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: from.x - w / 2,
        top: from.y - cardHeight(w) / 2,
        opacity: t.interpolate({ inputRange: [0, 0.01, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, to.x - from.x] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, to.y - from.y] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }],
      }}
    >
      <CardBack w={w} />
    </Animated.View>
  );
}

/** A word that pops over a seat or the table and fades: a missed turn, cards taken, SON KART. */
function Burst({ at, text, icon, color, delay = 0, still }: { at: Point; text: string; icon?: keyof typeof Ionicons.glyphMap; color: string; delay?: number; still: boolean }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(t, { toValue: 1, speed: 14, bounciness: still ? 0 : 14, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(t, { toValue: 2, duration: 260, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [t, delay, still]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.burst, { left: at.x - 60, top: at.y - 13, opacity: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.1] }) }, { translateY: t.interpolate({ inputRange: [0, 1, 2], outputRange: [8, 0, -10] }) }] }]}
    >
      <View style={[s.burstPill, { backgroundColor: color }]}>
        {icon && <Ionicons name={icon} size={13} color="#04161D" />}
        <Text style={s.burstText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** The direction of play: an arrow turning slowly round the piles, clockwise or the other way. */
function Direction({ dir, color, size, still }: { dir: 1 | -1; color: string; size: number; still: boolean }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [spin, still]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: dir }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Ionicons name="refresh" size={size} color={color} style={{ opacity: 0.3 }} />
    </Animated.View>
  );
}

/** Someone else at the table: their face with the turn's clock, their name and how many cards they hold. */
function Rival({ seat, count, active, endsAt, winner, waiting }: { seat: Seat; count: number; active: boolean; endsAt: number | null; winner: boolean; waiting: boolean }) {
  const one = count === 1 && !waiting;
  return (
    <View style={s.rival} accessibilityLabel={`${seat.name}${waiting ? '' : `, ${count} kart`}${active ? ', sıra onda' : ''}`}>
      <SeatFace
        seat={seat}
        size={SEAT}
        color={semantic.action}
        active={active}
        endsAt={endsAt}
        winner={winner}
        badge={
          waiting ? null : (
            <View style={[s.count, one && { backgroundColor: semantic.social, borderColor: '#FFD0D6' }]}>
              <Text style={[s.countText, one && { color: '#FFFFFF' }]}>{count}</Text>
            </View>
          )
        }
      />
      <Text style={[s.rivalName, active && { color: colors.text }]} numberOfLines={1}>
        {firstName(seat.name)}
      </Text>
    </View>
  );
}

function CardsStage({ view, endsAt, busy, onMove, children }: { view: CardsView; endsAt: number | null; busy?: boolean; onMove: (m: CardsMove) => void; children?: ReactNode }) {
  const { reduceMotion: still } = useSettings();
  const [width, setWidth] = useState(0);
  // The state shown before this one: what changed between the two is what the screen plays.
  const [pair, setPair] = useState<{ cur: CardsView; before: CardsView | null }>({ cur: view, before: null });
  if (pair.cur !== view) setPair({ cur: view, before: pair.cur });
  const before = pair.cur === view ? pair.before : pair.cur;
  const [picking, setPicking] = useState<number | null>(null);
  useEffect(() => warmSfx(['card', 'turn', 'tick', 'fanfare', 'lose', 'capture']), []);

  const { me, seats, status } = view;
  const n = seats.length;
  const playing = status === 'playing';
  const myTurn = playing && view.turn === me;
  const canAct = myTurn && !busy;
  const top = view.top;
  const cw = width >= 350 ? 58 : 54;
  const ch = cardHeight(cw);
  const pw = 62;
  const hand = useMemo(() => sorted(view.mine ?? []), [view.mine]);
  const playable = (id: number) => canAct && top !== null && (view.drawn !== null ? id === view.drawn : fits(id, view.color, top));
  const raised = (id: number) => myTurn && top !== null && (view.drawn !== null ? id === view.drawn : fits(id, view.color, top));
  const { slots, height: handH } = layoutHand(hand, width, cw, raised);
  const any = hand.some(raised);

  // The others, in the order play reaches them from me; someone watching sees every seat.
  const rivals = useMemo(() => (me < 0 ? seats.map((_, i) => i) : seats.map((_, i) => (me + 1 + i) % n).slice(0, n - 1)), [me, n, seats]);
  const feltY = TOP_H + 4;
  const handY = feltY + FELT_H + 30;
  const cx = width / 2;
  const cy = feltY + FELT_H / 2 - 6;
  const pileAt = { x: cx - 52, y: cy };
  const topAt = { x: cx + 36, y: cy };
  const seatAt = (seat: number): Point => {
    const i = rivals.indexOf(seat);
    if (i < 0) return { x: cx, y: handY + handH / 2 };
    const k = rivals.length;
    return { x: (width * (i + 0.5)) / k, y: 4 + SEAT / 2 + (k > 2 ? Math.abs(i - (k - 1) / 2) * 3 : 0) };
  };

  // What made this state, when the one before it was this hand's previous step: that is played. Anything else just shows.
  const stepped = !!before && before.deal === view.deal && view.n > before.n && view.n - before.n <= 2;
  const event = stepped ? view.last : null;
  const dealt = !!before && view.status === 'playing' && view.n === 0 && (before.deal !== view.deal || before.status !== 'playing');
  let enter: (Point & { r: number; scale: number }) | null = null;
  if (event?.type === 'play' && event.card === top && before && width) {
    if (event.seat === me) {
      const old = layoutHand(sorted(before.mine ?? []), width, cw, () => true).slots.get(event.card as number);
      if (old) enter = { x: old.x + cw / 2 - topAt.x, y: handY + old.y + ch / 2 - topAt.y, r: old.r, scale: cw / pw };
    } else {
      const from = seatAt(event.seat);
      enter = { x: from.x - topAt.x, y: from.y - topAt.y, r: -20, scale: 0.35 };
    }
  }
  const stamp = `${view.deal}:${view.n}`;

  // Sounds for what just happened, and for the turn coming to me.
  const left = useSecondsLeft(myTurn ? endsAt : null);
  const heard = useRef({ stamp: '', turn: false, over: false, tick: 99 });
  useEffect(() => {
    const h = heard.current;
    if (h.stamp !== stamp) {
      h.stamp = stamp;
      if (event?.type === 'play') playSfx('card');
      if (event?.took && event.took[0] === me && event.type === 'play') playSfx('capture', 0.7);
      if (event?.one) setTimeout(() => playSfx('turn', 0.9), 200);
    }
    if (myTurn && !h.turn) {
      playSfx('turn', 0.7);
      pressHaptic();
    }
    h.turn = myTurn;
    const over = status === 'over';
    if (over && !h.over && before) {
      const tone = view.winner === me ? 'win' : 'lose';
      endSound(tone);
      if (tone === 'win') successHaptic();
    }
    h.over = over;
    if (myTurn && left !== null && left <= 5 && left > 0 && left < h.tick) playSfx('tick', 0.6);
    h.tick = myTurn && left !== null ? left : 99;
  });

  const tap = (id: number) => {
    if (!playable(id)) return void (myTurn && errorHaptic());
    if (cardOf(id).color === null) {
      tapHaptic();
      return setPicking(id);
    }
    pressHaptic();
    onMove({ card: id });
  };
  const draw = () => {
    if (!canAct || view.drawn !== null) return;
    pressHaptic();
    onMove({ draw: true });
  };
  // The picker closes once the turn is no longer mine to finish.
  const pick = canAct && picking !== null && hand.includes(picking) ? picking : null;

  const turnSeat = seats[view.turn];
  const winner = view.winner !== null ? seats[view.winner] : null;
  const tint = top === null ? CARD_COLORS[0] : CARD_COLORS[view.color];
  const prompt =
    status === 'waiting'
      ? n < META.min
        ? 'Oyuncular bekleniyor'
        : 'Masa hazır'
      : status === 'over'
        ? view.log
        : myTurn
          ? view.drawn !== null
            ? 'Çektiğin kart uyuyor: at ya da tut'
            : any
              ? 'Sıra sende: parlayan kartlardan birini at'
              : 'Uyan kartın yok: desteden çek'
          : `${firstName(turnSeat?.name ?? '')} oynuyor…`;
  const stageH = handY + (me >= 0 ? handH : 0);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: stageH }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && (
          <>
            {rivals.map((seat) => {
              const at = seatAt(seat);
              return (
                <View key={seats[seat].id} style={{ position: 'absolute', left: at.x - 34, top: at.y - SEAT / 2, width: 68, alignItems: 'center' }}>
                  <Rival seat={seats[seat]} count={view.counts[seat] ?? 0} active={playing && view.turn === seat} endsAt={endsAt} winner={status === 'over' && view.winner === seat} waiting={top === null || status === 'waiting'} />
                </View>
              );
            })}

            <LinearGradient colors={['#143A52', '#0C2238', '#0A1A2E']} style={[s.felt, { top: feltY, height: FELT_H, borderColor: top === null ? colors.border : tint.base, boxShadow: top === null ? undefined : `0 0 18px ${tint.base}55` }]}>
              <View style={s.feltRim} />
            </LinearGradient>
            {top !== null && (
              <>
                <View style={{ position: 'absolute', left: cx - 78, top: cy - 78 }}>
                  <Direction dir={view.dir} color={tint.light} size={156} still={still} />
                </View>
                {/* The pile to draw from. */}
                <Pressable onPress={draw} disabled={!canAct || view.drawn !== null} style={{ position: 'absolute', left: pileAt.x - 27, top: pileAt.y - cardHeight(54) / 2 }} accessibilityRole="button" accessibilityLabel={`Desteden kart çek, ${view.pile} kart`}>
                  {view.pile > 2 && <View style={{ position: 'absolute', left: -4, top: 3 }}><CardBack w={54} /></View>}
                  {view.pile > 1 && <View style={{ position: 'absolute', left: -2, top: 1.5 }}><CardBack w={54} /></View>}
                  {view.pile > 0 ? <CardBack w={54} /> : <View style={[s.empty, { width: 54, height: cardHeight(54) }]} />}
                  {canAct && view.drawn === null && !any && <View style={s.pileHint} />}
                  <View style={s.pileCount}>
                    <Text style={s.pileCountText}>{view.pile}</Text>
                  </View>
                </Pressable>
                {/* The played cards: the top one and the two under it. */}
                <View style={{ position: 'absolute', left: topAt.x - pw / 2, top: topAt.y - cardHeight(pw) / 2, width: pw, height: cardHeight(pw) }}>
                  {view.under.map((id) => (
                    <View key={id} style={{ position: 'absolute', left: 0, top: 0, transform: [{ rotate: `${((id * 37) % 23) - 11}deg` }] }}>
                      <CardFace id={id} w={pw} />
                    </View>
                  ))}
                  <TopCard key={`${stamp}:${top}`} id={top} w={pw} from={enter} tilt={((top * 37) % 13) - 6} still={still} />
                </View>
                {/* The colour to follow, said in words and with its emblem. */}
                <View style={[s.gem, { top: feltY + 8, backgroundColor: tint.base, borderColor: tint.light }]} accessibilityLabel={`Renk ${tint.name}`}>
                  <Ionicons name={tint.icon} size={13} color="#FFFFFF" />
                  <Text style={s.gemText}>{tint.name}</Text>
                </View>
                <View style={[s.dirChip, { top: feltY + 8 }]}>
                  <Ionicons name="refresh" size={12} color={colors.textDim} style={{ transform: [{ scaleX: view.dir }] }} />
                  <Text style={s.dirText}>{view.dir === 1 ? 'Saat yönü' : 'Ters yön'}</Text>
                </View>
              </>
            )}
            <Text style={[s.log, { top: feltY + FELT_H - 24 }]} numberOfLines={1}>
              {status === 'playing' ? view.log : status === 'waiting' ? `${n}/${META.max} oyuncu · en az ${META.min}` : ''}
            </Text>
            <Text style={[s.prompt, { top: feltY + FELT_H + 6 }, myTurn && { color: colors.text }]} numberOfLines={1} accessibilityLiveRegion="polite">
              {prompt}
              {myTurn && left !== null && left <= 10 ? ` · ${left} sn` : ''}
            </Text>

            {/* What just happened, said over the table. */}
            <View key={stamp} style={StyleSheet.absoluteFill} pointerEvents="none">
              {!still && event?.took && event.took[0] !== me && Array.from({ length: Math.min(4, event.took[1]) }, (_, i) => <Flight key={i} from={pileAt} to={seatAt(event.took![0])} delay={(event.type === 'play' ? FLY_MS : 0) + i * 110} w={40} />)}
              {!still && dealt && rivals.flatMap((seat, ri) => [0, 1, 2].map((i) => <Flight key={`${seat}-${i}`} from={pileAt} to={seatAt(seat)} delay={ri * 70 + i * 190} w={40} />))}
              {event && event.skipped !== null && <Burst at={{ x: seatAt(event.skipped).x, y: seatAt(event.skipped).y + (event.skipped === me ? -handH / 2 - 8 : 4) }} text={event.took ? `+${event.took[1]} kart` : 'Sıra geçti'} icon={event.took ? 'layers' : 'ban'} color={event.took ? semantic.social : semantic.money} delay={still ? 0 : FLY_MS} still={still} />}
              {event?.turned && event.skipped === null && <Burst at={{ x: cx, y: cy - 62 }} text="Yön değişti" icon="swap-vertical" color={semantic.money} delay={still ? 0 : FLY_MS} still={still} />}
              {event?.one && <Burst at={{ x: seatAt(event.seat).x, y: seatAt(event.seat).y + (event.seat === me ? -handH / 2 - 8 : 30) }} text="SON KART!" icon="flame" color="#FFD166" delay={still ? 200 : FLY_MS + 500} still={still} />}
              {event?.mixed && <Burst at={{ x: pileAt.x, y: pileAt.y - 56 }} text="Deste karıldı" icon="shuffle" color={semantic.action} still={still} />}
            </View>

            {/* My cards. */}
            {me >= 0 && (
              <View style={{ position: 'absolute', left: 0, top: handY, width, height: handH }}>
                {hand.map((id, i) => (
                  <HandCard key={id} id={id} slot={slots.get(id) as Slot} from={{ x: pileAt.x - cw / 2, y: pileAt.y - handY - ch / 2 }} delay={dealt || !before ? i * 70 : 0} cw={cw} playable={playable(id)} dim={myTurn && !raised(id)} still={still} onPress={() => tap(id)} />
                ))}
              </View>
            )}

            {/* A Joker's colour. */}
            {pick !== null && (
              <Pressable style={[s.picker, { top: feltY, height: FELT_H }]} onPress={() => setPicking(null)} accessibilityLabel="Renk seçimini kapat">
                <Text style={s.pickerTitle}>Jokerin rengini seç</Text>
                <View style={s.pickerRow}>
                  {CARD_COLORS.map((c, i) => (
                    <Pressable
                      key={c.name}
                      onPress={() => {
                        pressHaptic();
                        setPicking(null);
                        onMove({ card: pick, color: i });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                    >
                      <LinearGradient colors={[c.light, c.base, c.deep]} style={s.pickerColor}>
                        <Ionicons name={c.icon} size={24} color="#FFFFFF" />
                        <Text style={s.pickerName}>{c.name}</Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            )}

            {status === 'over' && (
              <View style={{ position: 'absolute', left: 0, right: 0, top: feltY, height: FELT_H }}>
                <EndCard tone={view.winner === me ? 'win' : 'lose'} title={view.winner === me ? 'Kazandın!' : winner ? `${firstName(winner.name)} kazandı` : 'El bitti'} sub={view.winner === me ? 'Bütün kartlarını bitirdin' : 'Kartlarını ilk o bitirdi'} size={width} still={still} />
              </View>
            )}
          </>
        )}
      </View>

      {me >= 0 && playing && (
        <View style={s.mine}>
          <SeatFace seat={seats[me]} size={44} color={semantic.action} active={myTurn} endsAt={endsAt} />
          <View style={{ flex: 1 }}>
            <Text style={s.mineName} numberOfLines={1}>
              Sen · {hand.length} kart
            </Text>
            <Text style={s.mineHint} numberOfLines={1}>
              {hand.length === 1 ? 'SON KART!' : myTurn ? 'Sıra sende' : 'Sıranı bekle'}
            </Text>
          </View>
          {view.drawn !== null && myTurn ? (
            <>
              <ActionButton small label="At" icon="arrow-up" disabled={!canAct} onPress={() => tap(view.drawn as number)} />
              <ActionButton small ghost label="Tut" disabled={!canAct} onPress={() => onMove({ pass: true })} />
            </>
          ) : (
            <ActionButton small ghost={any || !myTurn} label="Kart çek" icon="layers" disabled={!canAct} onPress={draw} />
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const PRACTICE_SIZES = [2, 3, 4, 6];
/** Me and `size` − 1 of the others; a room with nobody else in it still has someone to play against. */
const lineupOf = (players: Seat[], size: number): Seat[] => [players[0], ...[...players.slice(1), ...Array.from({ length: META.max }, (_, i) => ({ id: `rakip-${i + 1}`, name: `Rakip ${i + 1}`, avatar: '' }))].slice(0, size - 1)];
/** A hand dealt to `seats`, the table's `deals`-th + 1. */
const dealTo = (seats: Seat[], deals: number) => startTable({ ...seats.slice(1).reduce((t, p) => sitDown(t, p.id), openTable(seats[0].id)), deal: deals }, rnd);

/**
 * A practice game on this phone: me on the first seat against the others in `players`, who play by themselves
 * (lib/room-games/cards pickCard). Nothing is sent anywhere and nothing is won.
 */
export function CardsPractice({ players }: { players: Seat[] }) {
  // The line-up is fixed when a hand is dealt: people coming to or leaving the room don't change a hand being played.
  const [game, setGame] = useState(() => ({ size: Math.min(4, Math.max(META.min, players.length)), seats: lineupOf(players, Math.min(4, Math.max(META.min, players.length))) }));
  const names = game.seats.map((x) => x.name);
  const { table, set, endsAt } = usePracticeTable<CardsTable>(() => dealTo(game.seats, 0), {
    bot: (t) => {
      const r = moveTable(t, t.turn, pickCard(t, t.turn) ?? { draw: true }, names, rnd);
      return r.ok ? r.table : t;
    },
    // Nobody loses a practice seat for thinking too long: the table plays the turn and that is all.
    ranOut: (t) => timeoutTable({ ...t, misses: t.misses.map(() => 0) }, names, rnd),
    think: [900, 700],
  });
  const deal = (size: number) => {
    const seats = lineupOf(players, size);
    setGame({ size, seats });
    set(dealTo(seats, table.deal));
  };
  const view = useMemo<CardsView>(() => {
    const seen = viewOf(table, 0);
    return { status: table.status, turn: table.turn, winner: table.winner, seats: game.seats, me: 0, log: table.log, counts: seen.counts ?? [], mine: seen.mine ?? [], top: seen.top ?? null, under: seen.under ?? [], pile: seen.pile ?? 0, color: table.color, dir: table.dir, drawn: seen.drawn ?? null, deal: table.deal, n: table.n, last: table.last };
  }, [table, game.seats]);
  const act = (m: CardsMove) =>
    set((t) => {
      const r = moveTable(t, 0, m, names, rnd);
      return r.ok ? r.table : t;
    });
  return (
    <CardsStage view={view} endsAt={endsAt} onMove={act}>
      {view.status === 'over' && <ActionButton label="Tekrar oyna" icon="refresh" onPress={() => deal(game.size)} />}
      <View style={s.sizes} accessibilityRole="radiogroup" accessibilityLabel="Oyuncu sayısı">
        <Text style={s.sizesLabel}>Oyuncu</Text>
        {PRACTICE_SIZES.map((v) => (
          <Pressable
            key={v}
            onPress={() => {
              tapHaptic();
              deal(v);
            }}
            style={[s.size, v === game.size && s.sizeOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: v === game.size }}
            accessibilityLabel={`${v} kişi`}
          >
            <Text style={[s.sizeText, v === game.size && { color: '#FFFFFF' }]}>{v} kişi</Text>
          </Pressable>
        ))}
      </View>
    </CardsStage>
  );
}

/**
 * A live room's Renk Kartları table (components/games/room-tables LiveTable reads it and sends the actions): the
 * table for everyone in the room, my cards for me alone. `children`: the table's buttons (sit, start, leave), which
 * are the same for every game.
 */
export function CardsLive({ table, busy, onMove, children }: { table: CardsServerTable; busy: boolean; onMove: (move: CardsMove) => void; children?: ReactNode }) {
  const view = useMemo<CardsView>(
    () => ({
      status: table.status,
      turn: table.turn,
      winner: table.winner,
      seats: table.seats.map((x) => ({ id: x.id, name: x.name, avatar: x.avatarUrl ?? '' })),
      me: table.mySeat,
      log: table.log,
      counts: table.counts ?? [],
      mine: table.mine ?? null,
      top: table.status === 'waiting' ? null : (table.top ?? null),
      under: table.under ?? [],
      pile: table.pile ?? 0,
      color: table.color ?? 0,
      dir: table.dir === -1 ? -1 : 1,
      drawn: table.drawn ?? null,
      deal: table.deal ?? 0,
      n: table.n ?? 0,
      last: table.last ?? null,
    }),
    [table],
  );
  return (
    <CardsStage view={view} endsAt={table.turnEndsAt ? Date.parse(table.turnEndsAt) : null} busy={busy} onMove={onMove}>
      {table.mySeat < 0 && table.status === 'playing' && <Text style={s.note}>Masayı izliyorsun; el bitince boş koltuğa oturabilirsin.</Text>}
      {children}
    </CardsStage>
  );
}

const s = StyleSheet.create({
  felt: { position: 'absolute', left: 0, right: 0, borderRadius: 28, borderWidth: 2, overflow: 'hidden' },
  feltRim: { position: 'absolute', left: 6, top: 6, right: 6, bottom: 6, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  rival: { alignItems: 'center', gap: 2 },
  rivalName: { color: colors.textDim, fontSize: 11, lineHeight: 14, fontWeight: '800', maxWidth: 66 },
  count: { minWidth: 20, height: 24, borderRadius: 5, backgroundColor: '#0E1C36', borderWidth: 1.5, borderColor: semantic.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countText: { color: colors.text, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  playable: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: '#FFFFFF', boxShadow: '0 0 10px rgba(255,255,255,0.75)' },
  empty: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  pileHint: { position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF', boxShadow: '0 0 12px rgba(255,255,255,0.8)' },
  pileCount: { position: 'absolute', left: 0, right: 0, bottom: -9, alignItems: 'center' },
  pileCountText: { color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '900', backgroundColor: '#0A1426', borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  gem: { position: 'absolute', right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 9, height: 24 },
  gemText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  dirChip: { position: 'absolute', left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, height: 24, backgroundColor: 'rgba(8,15,30,0.55)' },
  dirText: { color: colors.textDim, fontSize: 11, lineHeight: 14, fontWeight: '800' },
  log: { position: 'absolute', left: 12, right: 12, color: colors.textDim, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  prompt: { position: 'absolute', left: 0, right: 0, color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  burst: { position: 'absolute', width: 120, alignItems: 'center', zIndex: 20 },
  burstPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, height: 26, borderWidth: 1.5, borderColor: '#0A1426', boxShadow: '0 3px 8px rgba(0,0,0,0.45)' },
  burstText: { color: '#04161D', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  picker: { position: 'absolute', left: 0, right: 0, borderRadius: 28, backgroundColor: 'rgba(8,15,30,0.88)', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 25 },
  pickerTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 22 },
  pickerRow: { flexDirection: 'row', gap: 8 },
  pickerColor: { width: 72, height: 78, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  pickerName: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  mineName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  mineHint: { color: colors.textDim, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  sizes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sizesLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', width: 54 },
  size: { flex: 1, minHeight: 36, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sizeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sizeText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
