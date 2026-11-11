// Şanslı çanta in a server room (lib/live/lucky-bags): the sheet that drops one (coins or gifts, how many shares,
// when it opens, followers only), the show when one is dropped (it comes down at the top, the room dims and bags
// fall), the bag floating over the room while one is open, and the card that opens it and shows who took what.
// The server takes the coins, draws the shares and pays; this only shows its answers.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { Icon3D } from '@/components/Icon3D';
import { ROOM_ICON_ART } from '@/components/RoomArt';
import { useSheetBottom, roomStyles } from '@/components/room/parts';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { GIFTS, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { message } from '@/lib/live';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import { bagResult, dropBag, type Bag, type BagDrop, type BagGot, type BagGrab, type BagRules } from '@/lib/live/lucky-bags';
import { tapHaptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { RollingNumber } from '@/components/fx/rolling-number';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const delayName = (s: number) => (s === 0 ? 'Hemen' : `${Math.round(s / 60)} dk sonra`);
const giftOf = (id: string | null) => GIFTS.find((g) => g.id === id);
/** "1.000 jeton" or "Pasta ×10". */
export const bagWhat = (b: Pick<Bag, 'kind' | 'giftId' | 'units' | 'coins'>) => (b.kind === 'coins' ? `${fmt(b.coins)} jeton` : `${giftOf(b.giftId)?.name ?? 'Hediye'} ×${fmt(b.units)}`);

function Chips<T extends number>({ values, value, onPick, label }: { values: T[]; value: T; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={s.chips}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onPick(v)} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Drops a bag in the room. `onDropped` gets the bag the server stored. */
export function LuckyBagSheet({ visible, room, rules, coins, svipLevel, onClose, onDropped }: { visible: boolean; room: string; rules: BagRules; coins: number; svipLevel: number; onClose: () => void; onDropped: (b: Bag) => void }) {
  const paddingBottom = useSheetBottom();
  const gifts = visibleGifts(GIFTS, useLiveCatalog()).filter((g) => (g.minSvip ?? 0) <= svipLevel && g.price > 0);
  const [kind, setKind] = useState<'coins' | 'gift'>('coins');
  const [amount, setAmount] = useState(rules.coins[0]);
  const [coinPackets, setCoinPackets] = useState(rules.coinPackets[0]);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [count, setCount] = useState(rules.giftCounts[0]);
  const [giftPackets, setGiftPackets] = useState(rules.giftPackets[0]);
  const [delay, setDelay] = useState(rules.delays[0]);
  const [followers, setFollowers] = useState(false);
  const [busy, setBusy] = useState(false);
  const gift: Gift | undefined = gifts.find((g) => g.id === giftId) ?? gifts[0];
  // Choices the server no longer offers fall back to its first.
  const pick = <T,>(list: T[], v: T) => (list.includes(v) ? v : list[0]);
  const a = pick(rules.coins, amount);
  const cp = pick(rules.coinPackets, coinPackets);
  const gc = pick(rules.giftCounts, count);
  const gp = Math.min(pick(rules.giftPackets, giftPackets), gc);
  const d = pick(rules.delays, delay);
  const total = kind === 'coins' ? a : (gift?.price ?? 0) * gc;
  const packets = kind === 'coins' ? cp : gp;
  const short = coins < total;
  const toWallet = () => (onClose(), router.push('/cuzdan'));

  const send = async () => {
    if (busy) return;
    if (kind === 'gift' && !gift) return;
    const body: BagDrop = kind === 'coins' ? { kind, amount: a, packets: cp, delay: d, followersOnly: followers } : { kind, giftId: gift!.id, count: gc, packets: gp, delay: d, followersOnly: followers };
    setBusy(true);
    try {
      const bag = await dropBag(room, body);
      onDropped(bag);
      onClose();
    } catch (e) {
      const coinsShort = e instanceof api.ApiError && (e.data.code === 'insufficient' || e.data.code === 'reward_coins_only');
      showAlert('Çanta atılamadı', message(e), coinsShort ? [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Jeton yükle', onPress: toWallet }] : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[roomStyles.sheet, s.sheet, { paddingBottom }]}>
        <View style={s.head}>
          <Image source={ROOM_ICON_ART.envelope} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Şanslı çanta</Text>
            <Text style={s.sub}>Odadakiler açar, paylar rastgele dağılır</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        <View style={s.segment}>
          {(['coins', 'gift'] as const).map((k) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[s.segItem, kind === k && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
              <Text style={[s.segText, kind === k && s.segTextOn]}>{k === 'coins' ? 'Jeton' : 'Hediye'}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
          {kind === 'coins' ? (
            <>
              <Text style={s.label}>Çantadaki jeton</Text>
              <Chips values={rules.coins} value={a} onPick={setAmount} label={fmt} />
              <Text style={s.label}>Pay sayısı</Text>
              <Chips values={rules.coinPackets} value={cp} onPick={setCoinPackets} label={(n) => `${n} pay`} />
            </>
          ) : (
            <>
              <Text style={s.label}>Hediye</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {gifts.map((g) => {
                  const on = g.id === gift?.id;
                  return (
                    <Pressable key={g.id} onPress={() => setGiftId(g.id)} style={[s.gift, on && s.chipOn]} accessibilityRole="button" accessibilityLabel={`${g.name}, ${fmt(g.price)} jeton`} accessibilityState={{ selected: on }}>
                      <GiftArt giftId={g.id} emoji={g.emoji} size={40} />
                      <Text style={s.giftName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <View style={s.priceRow}>
                        <Icon3D name="coin" size={11} />
                        <Text style={s.giftPrice}>{fmt(g.price)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={s.label}>Adet</Text>
              <Chips values={rules.giftCounts} value={gc} onPick={setCount} label={(n) => `×${n}`} />
              <Text style={s.label}>Pay sayısı</Text>
              <Chips values={rules.giftPackets.filter((p) => p <= gc)} value={gp} onPick={setGiftPackets} label={(n) => `${n} pay`} />
            </>
          )}
          <Text style={s.label}>Açılma zamanı</Text>
          <Chips values={rules.delays} value={d} onPick={setDelay} label={delayName} />
          <View style={s.switchRow}>
            <Ionicons name="people-outline" size={18} color={colors.textDim} />
            <Text style={s.switchText}>Yalnızca beni takip edenler açabilir</Text>
            <Switch value={followers} onValueChange={setFollowers} trackColor={{ true: colors.primary, false: 'rgba(255,255,255,0.18)' }} thumbColor="#fff" />
          </View>
          <Text style={s.note}>
            {kind === 'gift' ? 'Her pay, açan kişiye senden gönderilmiş bir hediye sayılır. ' : ''}
            {`Açıldıktan sonra ${Math.round(rules.windowSeconds / 60)} dakika içinde alınmayan paylar sana geri döner.`}
          </Text>
        </ScrollView>

        <View style={s.total}>
          <View style={{ flex: 1 }}>
            <Text style={s.totalLabel}>
              Toplam · {packets} pay · {delayName(d).toLowerCase()}
            </Text>
            <View style={s.priceRow}>
              <Icon3D name="coin" size={20} />
              <Text style={s.totalValue}>{fmt(total)}</Text>
            </View>
          </View>
          <Pressable onPress={toWallet} style={s.wallet} accessibilityRole="button" accessibilityLabel={`Bakiye ${fmt(coins)} jeton. Jeton yükle`}>
            <Text style={s.walletText}>
              Bakiye <RollingNumber value={coins} />
            </Text>
            <Text style={s.walletLink}>Jeton yükle</Text>
          </Pressable>
        </View>
        <Pressable onPress={send} disabled={busy || (kind === 'gift' && !gift)} style={[s.send, (short || busy) && { opacity: 0.55 }]} accessibilityRole="button" accessibilityLabel={`Çantayı gönder, ${fmt(total)} jeton`}>
          <Text style={s.sendText}>{busy ? 'Gönderiliyor…' : short ? 'Bakiye yetmiyor' : 'Gönder'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** One falling bag: where it starts across the screen, when it first falls, how long a fall takes, its sway, size. */
type Drop = { x: number; delay: number; duration: number; sway: number; size: number };
/** A new set of falling bags across `width`, spread so they don't bunch up (impure: once per show). Slow enough to
 *  catch: a bag takes about 3.6 to 5.1 s from top to bottom (10 % faster than the 4 to 5.6 s before), and they keep
 *  coming for as long as the bag falls. */
function makeDrops(count: number, width: number): Drop[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(((i + Math.random() * 0.8) / count) * Math.max(0, width - 72)),
    delay: Math.round(Math.random() * 2800),
    duration: Math.round((4000 + Math.random() * 1600) / 1.1),
    sway: Math.round((Math.random() - 0.5) * 60),
    size: 50 + Math.round(Math.random() * 18),
  }));
}
const RAIN_DROPS = 10;
/** Room around a falling bag that still counts as a tap on it (its touch box is the picture plus this). */
const DROP_PAD = 12;
/** A collected bag comes back at the top after this long (ms), plus a little chance. */
const RESPAWN_MS = 450;

/**
 * One falling bag. It takes the finger the moment it lands (the responder grant, not a press): react-native-web
 * holds a Pressable's press-in back 50 ms and drops it for a quick tap when there is no onPress, and a press
 * measures the bag where it was laid out (above the screen) because its fall is drawn on the native side. A grant
 * has neither: the touch goes to the view under the finger, wherever its fall has moved it.
 */
const FallingBag = memo(function FallingBag({ drop, fall, height, label, onGrab }: { drop: Drop; fall: Animated.Value; height: number; label: string; onGrab: (x?: number, y?: number) => void }) {
  // Built once: a new interpolation on every render would tie the bag's fall to new animated nodes again and again.
  const [transform] = useState(() => [
    { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, height + 160] }) },
    { translateX: fall.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, drop.sway, 0, -drop.sway, 0] }) },
    { rotate: fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-12deg', '12deg', '-8deg'] }) },
  ]);
  return (
    <Animated.View
      style={[s.drop, { left: drop.x - DROP_PAD, top: -(drop.size + DROP_PAD * 2 + 12), padding: DROP_PAD, transform }]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => onGrab(e.nativeEvent.pageX, e.nativeEvent.pageY)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && onGrab()}
    >
      <Image source={ROOM_ICON_ART.envelope} style={{ width: drop.size, height: drop.size }} />
    </Animated.View>
  );
});

/** The bags' falls, each on its own, so one can be taken and sent back to the top without stopping the others. */
class Falls {
  values: Animated.Value[];
  private drops: Drop[];
  private runs: (Animated.CompositeAnimation | null)[] = [];
  private timers: (ReturnType<typeof setTimeout> | null)[] = [];
  constructor(drops: Drop[]) {
    this.drops = drops;
    this.values = drops.map(() => new Animated.Value(0));
  }
  /** Bag `i` comes down from the top after `wait` ms, again and again. */
  private fall(i: number, wait: number) {
    const t = this.timers[i];
    if (t) clearTimeout(t);
    this.timers[i] = setTimeout(() => {
      this.timers[i] = null;
      this.values[i].setValue(0);
      const run = Animated.loop(Animated.timing(this.values[i], { toValue: 1, duration: this.drops[i].duration, easing: Easing.linear, useNativeDriver: true }), { iterations: -1, resetBeforeIteration: true });
      this.runs[i] = run;
      run.start();
    }, wait);
  }
  startAll() {
    this.drops.forEach((d, i) => this.fall(i, d.delay));
  }
  /** Bag `i` was taken: gone at once (back above the screen), and a new one falls a moment later. */
  take(i: number) {
    this.runs[i]?.stop();
    this.runs[i] = null;
    this.values[i].setValue(0);
    this.fall(i, RESPAWN_MS + Math.round(Math.random() * 500));
  }
  stopAll() {
    this.timers.forEach((t) => t && clearTimeout(t));
    this.timers = [];
    this.runs.forEach((r) => r?.stop());
    this.runs = [];
  }
}

/** The little show where a bag was taken: the bag lifts and fades, a gold ring opens around it. */
function CollectBurst({ x, y, size, onDone }: { x: number; y: number; size: number; onDone: () => void }) {
  const [t] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start(() => done.current());
    return () => a.stop();
  }, [t]);
  const box = size * 1.6;
  return (
    <View pointerEvents="none" style={[s.burst, { left: x - box / 2, top: y - box / 2, width: box, height: box }]}>
      <Animated.View style={[s.burstRing, { borderRadius: box / 2, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }]} />
      <Animated.Image
        source={ROOM_ICON_ART.envelope}
        style={{ width: size, height: size, opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.7, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] }}
      />
    </View>
  );
}

/** A soft, endless pulse (0 → 1 → 0) for things that should catch the eye; still when reduce motion is on. */
function usePulse(on: boolean, ms = 1100) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, ms, v]);
  return v;
}

/**
 * A bag is falling in the room (from the moment it opens until its draw): the room dims a little and bags keep
 * coming down from the top. A tap on any falling bag takes it: it is gone at once (a small gold flash where it was)
 * and a new one comes down from the top a moment later; the first bag I take joins the draw (the server's rule:
 * one entry each, more taps change nothing). A tap on the top card joins too, or opens the bag's card once I'm in.
 * The card says so and counts down to the draw, with how many have joined. Never blocks the room (only the bags
 * and the card take touches). My own bag can't be taken: a tap on it opens its card. Reduce motion: the card
 * alone. The room shows it while the bag falls; at the draw it goes.
 */
export function LuckyBagRain({ bag, now, width, height, still, onJoin, onOpen }: { bag: Bag; now: number; width: number; height: number; still?: boolean; onJoin: (b: Bag) => void; onOpen: (b: Bag) => void }) {
  const { top } = useSafeAreaInsets();
  const [intro] = useState(() => new Animated.Value(0));
  const [dim] = useState(() => new Animated.Value(0));
  const [drops] = useState(() => makeDrops(still ? 0 : RAIN_DROPS, width));
  const [falls] = useState(() => new Falls(drops));
  const left = Date.parse(bag.closesAt) - now;
  useEffect(() => {
    const show = Animated.parallel([Animated.spring(intro, { toValue: 1, useNativeDriver: true, bounciness: 10, speed: 9 }), Animated.timing(dim, { toValue: 1, duration: 380, useNativeDriver: true })]);
    show.start();
    falls.startAll();
    return () => {
      show.stop();
      falls.stopAll();
    };
  }, [intro, dim, falls]);
  // Bags taken, each shown where it was taken until its flash is over.
  const [bursts, setBursts] = useState<{ key: number; x: number; y: number; size: number }[]>([]);
  const burstKey = useRef(0);
  // The latest bag and callbacks for the bags' touch (the bags themselves are drawn once).
  const latest = useRef({ bag, onJoin, onOpen });
  useEffect(() => {
    latest.current = { bag, onJoin, onOpen };
  });
  const [grabs] = useState(() =>
    drops.map((d, i) => (x?: number, y?: number) => {
      const { bag: b, onJoin: join, onOpen: open } = latest.current;
      if (b.mine) return open(b);
      falls.take(i);
      if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
        const key = ++burstKey.current;
        setBursts((list) => [...list.slice(-5), { key, x, y, size: d.size }]);
      }
      tapHaptic();
      // The first one I take joins the draw (live-room sends it once; again changes nothing on the server).
      if (!b.joined) join(b);
    }),
  );
  // A short bounce on the card when I join.
  const [pop] = useState(() => new Animated.Value(1));
  const wasJoined = useRef(bag.joined);
  useEffect(() => {
    if (bag.joined && !wasJoined.current) Animated.sequence([Animated.timing(pop, { toValue: 1.08, duration: 120, useNativeDriver: true }), Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 14 })]).start();
    wasJoined.current = bag.joined;
  }, [bag.joined, pop]);
  const glow = usePulse(!still && !bag.joined && !bag.mine);

  const tap = () => {
    if (bag.mine || bag.joined) return onOpen(bag);
    onJoin(bag);
  };
  const title = bag.mine ? 'Çantan düşüyor' : bag.joined ? 'Çekilişe katıldın' : `${bag.from.name} Şanslı çanta attı`;
  const sub = bag.mine || bag.joined ? `${bag.entrants} kişi katıldı · çekiliş ${mmss(left)}` : `${bagWhat(bag)} · dokun, çekilişe katıl`;
  const dropLabel = bag.mine ? 'Senin çantan, kartını aç' : bag.joined ? 'Çantayı topla' : 'Çantayı topla, çekilişe katıl';
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.rainDim, { opacity: dim }]} />
      {drops.map((d, i) => (
        <FallingBag key={i} drop={d} fall={falls.values[i]} height={height} label={dropLabel} onGrab={grabs[i]} />
      ))}
      {bursts.map((b) => (
        <CollectBurst key={b.key} x={b.x} y={b.y} size={b.size} onDone={() => setBursts((list) => list.filter((x) => x.key !== b.key))} />
      ))}
      <Animated.View
        style={[
          s.rainCard,
          { top: top + 64, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }) }, { scale: Animated.multiply(pop, intro.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] })) }] },
        ]}
      >
        <Pressable onPress={tap} style={[s.rainInner, bag.joined && s.rainJoined]} accessibilityRole="button" accessibilityLabel={`${title}: ${sub}`}>
          <Animated.View style={{ transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
            <Image source={ROOM_ICON_ART.envelope} style={{ width: 56, height: 56 }} />
          </Animated.View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rainTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={s.rainSub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
          <View style={[s.rainGo, (bag.joined || bag.mine) && s.rainGoDone]}>
            {bag.joined ? <Ionicons name="checkmark" size={16} color="#1B1300" /> : <Text style={s.rainGoText}>{bag.mine ? mmss(left) : 'Katıl'}</Text>}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
/** What a bag's page in the float says now: its countdown, its call to join, or how it stands for me. */
function floatLine(b: Bag, now: number) {
  const wait = Date.parse(b.opensAt) - now;
  if (wait > 0) return mmss(wait);
  if (b.mine) return 'Çantan';
  return b.joined ? 'Katıldın' : 'Katıl!';
}

/**
 * The room's bags, over the Rüzgâr Gülü: one page per bag (the one opening first, first), swiped one by one, each
 * with its countdown and the time it opens; a bag that is falling or about to (10 s) glows and pulses.
 */
export function LuckyBagFloat({ bags, now, bottom, still, onOpen }: { bags: Bag[]; now: number; bottom: number; still?: boolean; onOpen: (b: Bag) => void }) {
  const list = [...bags].sort((x, y) => Date.parse(x.opensAt) - Date.parse(y.opensAt) || x.id - y.id);
  const [page, setPage] = useState(0);
  const hot = list.some((b) => Date.parse(b.opensAt) - now <= 10_000 && !b.mine && !b.joined);
  const pulse = usePulse(!still && hot, 900);
  if (!list.length) return null;
  const at = Math.min(page, list.length - 1);
  return (
    <Animated.View style={[s.float, { bottom }, hot && s.floatHot, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width: FLOAT_W }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / FLOAT_W))}
      >
        {list.map((b) => {
          const wait = Date.parse(b.opensAt) - now;
          return (
            <Pressable
              key={b.id}
              style={s.floatPage}
              onPress={() => onOpen(b)}
              accessibilityRole="button"
              accessibilityLabel={`${b.from.name} Şanslı çanta attı, ${bagWhat(b)}. ${wait > 0 ? `${mmss(wait)} sonra, saat ${clockOf(b.opensAt)} açılır` : b.joined ? 'Çekilişe katıldın' : 'Düşüyor, katılmak için dokun'}`}
            >
              <Image source={ROOM_ICON_ART.envelope} style={{ width: 44, height: 44 }} />
              <Text style={s.floatLine}>{floatLine(b, now)}</Text>
              <Text style={s.floatTime}>{clockOf(b.opensAt)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {list.length > 1 && (
        <>
          <View style={s.badge}>
            <Text style={s.badgeText}>{list.length}</Text>
          </View>
          <View style={s.dots}>
            {list.slice(0, 6).map((b, i) => (
              <View key={b.id} style={[s.dot, i === at && s.dotOn]} />
            ))}
          </View>
        </>
      )}
    </Animated.View>
  );
}
const FLOAT_W = 70;

/** A drawn bag as the card shows it: what I won (null: nothing) and who won what. */
export type BagOutcome = { got: BagGot | null; grabs: BagGrab[]; bagId?: number };

/**
 * A bag up close: who dropped it, what is in it, then by its state: the countdown to its opening; while it falls,
 * Katıl (or "you're in") with the countdown to the draw and how many joined; after the draw, what I won (or that
 * luck passed me by this time) and who won what.
 */
export function LuckyBagCard({ bag: first, now, outcome, onClose, onJoin }: { bag: Bag; now: number; outcome?: BagOutcome | null; onClose: () => void; onJoin: (b: Bag) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  // The draw's result: given by the room (it heard the draw), or read here for a bag drawn before it opened.
  const [fetched, setFetched] = useState<BagOutcome | null>(null);
  const res = outcome ?? (fetched && fetched.bagId === first.id ? fetched : null);
  const bag = first;
  const wait = Date.parse(bag.opensAt) - now;
  const toDraw = Date.parse(bag.drawAt ?? bag.closesAt) - now;
  const drawn = bag.status !== 'open' || !!res;
  // A drawn bag (opened from the float after its draw, or mine): its winners.
  const bagId = bag.id;
  useEffect(() => {
    if (!drawn || res) return;
    let alive = true;
    bagResult(bagId)
      .then((r) => alive && setFetched({ got: r.got, grabs: r.grabs, bagId }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bagId, drawn, res]);
  const gift = giftOf(bag.giftId);
  const join = async () => {
    if (busy || wait > 0) return;
    setBusy(true);
    try {
      await onJoin(bag);
    } finally {
      setBusy(false);
    }
  };
  const grabs = res?.grabs ?? null;
  const got = res?.got ?? null;
  const best = grabs?.length ? grabs.reduce((m, g) => (g.units > m.units ? g : m), grabs[0]) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.scrim, s.center]} onPress={onClose}>
        <Pressable style={[s.card, got && s.cardWon]} onPress={() => {}}>
          <Pressable onPress={onClose} hitSlop={10} style={s.cardClose} accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.75)" />
          </Pressable>
          <View style={s.from}>
            <Avatar uri={bag.from.avatarUrl ?? undefined} name={bag.from.name} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={s.fromName} numberOfLines={1}>
                {bag.mine ? 'Senin çantan' : bag.from.name}
              </Text>
              <Text style={s.fromSub}>
                {bag.kind === 'coins' ? 'Jeton çantası' : 'Hediye çantası'} · {bag.packets} pay{bag.followersOnly ? ' · takipçilere özel' : ''}
              </Text>
            </View>
          </View>

          {got ? (
            <View style={s.prize}>
              <Text style={s.wonTitle}>Kazandın!</Text>
              {got.kind === 'gift' ? <GiftArt giftId={got.giftId ?? undefined} emoji={gift?.emoji ?? '🎁'} size={72} /> : <Icon3D name="coin" size={64} />}
              <Text style={s.prizeValue}>{got.kind === 'gift' ? `${gift?.name ?? 'Hediye'} ×${fmt(got.units)}` : `+${fmt(got.coins)}`}</Text>
              <Text style={s.prizeNote}>{got.kind === 'gift' ? `${fmt(got.coins)} elmas hesabına geçti` : 'Jeton bakiyene eklendi'}</Text>
            </View>
          ) : (
            <View style={s.prize}>
              {bag.kind === 'gift' ? <GiftArt giftId={bag.giftId ?? undefined} emoji={gift?.emoji ?? '🎁'} size={72} /> : <Image source={ROOM_ICON_ART.envelope} style={{ width: 84, height: 84 }} />}
              <Text style={s.prizeValue}>{bagWhat(bag)}</Text>
              <Text style={s.prizeNote}>
                {drawn
                  ? bag.mine
                    ? 'Çekiliş yapıldı'
                    : bag.joined || res
                      ? 'Bu sefer şans senden yana değildi'
                      : 'Çekiliş yapıldı'
                  : wait > 0
                    ? 'Açılınca 30 saniye düşer: dokunan herkes çekilişe katılır, ödülün hepsi dağıtılır'
                    : `${bag.entrants} kişi katıldı · ödülün hepsi katılanlara şansla dağıtılır`}
              </Text>
            </View>
          )}

          {!drawn &&
            (wait > 0 ? (
              <View style={s.wait}>
                <Text style={s.waitLabel}>Açılmasına · saat {clockOf(bag.opensAt)}</Text>
                <Text style={s.waitValue}>{mmss(wait)}</Text>
              </View>
            ) : bag.mine || bag.joined ? (
              <View style={s.wait}>
                <Text style={s.waitLabel}>{bag.joined ? 'Çekilişe katıldın · çekilişe' : 'Çekilişe'}</Text>
                <Text style={s.waitValue}>{mmss(toDraw)}</Text>
              </View>
            ) : (
              <Pressable onPress={join} disabled={busy} style={[s.send, s.openBtn, busy && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Çekilişe katıl">
                <Text style={s.sendText}>{busy ? 'Katılıyor…' : `Katıl · ${mmss(toDraw)}`}</Text>
              </Pressable>
            ))}

          {grabs && (
            <View style={s.list}>
              <Text style={s.listTitle}>{grabs.length ? `Kazananlar · ${grabs.length}` : 'Kimse katılmadı, çanta sahibine döndü'}</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {grabs.map((g) => (
                  <View key={g.user.id} style={s.grab}>
                    <Avatar uri={g.user.avatarUrl ?? undefined} name={g.user.name} size={28} />
                    <Text style={s.grabName} numberOfLines={1}>
                      {g.user.name}
                    </Text>
                    {best === g && grabs.length > 1 && (
                      <View style={s.luckiest}>
                        <Ionicons name="trophy" size={11} color="#1B1300" />
                        <Text style={s.luckiestText}>En şanslı</Text>
                      </View>
                    )}
                    <Text style={s.grabValue}>{bag.kind === 'gift' ? `×${fmt(g.units)}` : fmt(g.coins)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const GOLD = colors.gold;
const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, padding: 3, marginBottom: 6 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segOn: { backgroundColor: GOLD },
  segText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#1B1300' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7, letterSpacing: 0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 64, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  chipOn: { borderColor: GOLD, backgroundColor: 'rgba(246,189,96,0.14)' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: GOLD },
  gift: { width: 84, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', gap: 3 },
  giftName: { color: '#fff', fontSize: 11, fontWeight: '600', maxWidth: 76 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftPrice: { color: GOLD, fontSize: 11, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  switchText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  note: { color: colors.textDim, fontSize: 11, marginTop: 10, lineHeight: 16 },
  total: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  totalLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  totalValue: { color: GOLD, fontSize: 22, fontWeight: '900' },
  wallet: { alignItems: 'flex-end' },
  walletText: { color: colors.textDim, fontSize: 11 },
  walletLink: { color: colors.primaryText, fontSize: 13, fontWeight: '800', marginTop: 2 },
  send: { marginTop: 12, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, boxShadow: '0 6px 18px rgba(246,189,96,0.35)' },
  sendText: { color: '#1B1300', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  // Over the Rüzgâr Gülü (live-room places it): a pager of the room's bags.
  float: { position: 'absolute', right: 6, width: FLOAT_W + 4, paddingVertical: 6, borderRadius: 20, alignItems: 'center', backgroundColor: 'rgba(26,14,4,0.86)', borderWidth: 1.5, borderColor: 'rgba(246,189,96,0.6)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)', zIndex: 31 },
  floatHot: { borderColor: GOLD, borderWidth: 2, boxShadow: '0 0 22px rgba(246,189,96,0.75)' },
  floatPage: { width: FLOAT_W, alignItems: 'center' },
  floatLine: { color: GOLD, fontSize: 13, fontWeight: '900', marginTop: 1 },
  floatTime: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 10, backgroundColor: GOLD },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#140C04' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // The drop show: a warm dark veil, bags falling from above the screen, and the card at the top.
  rainDim: { backgroundColor: 'rgba(6,4,14,0.46)' },
  drop: { position: 'absolute' },
  burst: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  burstRing: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: GOLD, boxShadow: '0 0 14px rgba(246,189,96,0.7)' },
  rainCard: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  rainInner: { width: '88%', maxWidth: 380, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#1A1208', borderWidth: 1.5, borderColor: GOLD, boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 22px rgba(246,189,96,0.35)' },
  rainTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rainSub: { color: GOLD, fontSize: 13, fontWeight: '700' },
  rainGo: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: GOLD },
  rainGoText: { color: '#1B1300', fontSize: 13, fontWeight: '900' },
  rainGoDone: { backgroundColor: '#7BE0A6' },
  rainJoined: { borderColor: '#7BE0A6', boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 22px rgba(123,224,166,0.35)' },
  cardWon: { borderColor: GOLD, borderWidth: 2, boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 40px rgba(246,189,96,0.35)' },
  wonTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.3 },
  card: { width: '100%', maxWidth: 360, borderRadius: 26, padding: 18, backgroundColor: '#1A1208', borderWidth: 1, borderColor: 'rgba(246,189,96,0.4)', boxShadow: '0 20px 50px rgba(0,0,0,0.55)' },
  cardClose: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  from: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 26 },
  fromName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  fromSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 },
  prize: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  prizeValue: { color: GOLD, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  prizeNote: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' },
  wait: { alignItems: 'center', paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(246,189,96,0.1)' },
  waitLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  waitValue: { color: GOLD, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  openBtn: { marginTop: 0 },
  list: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  listTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  grab: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  grabName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  luckiest: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: GOLD },
  luckiestText: { color: '#1B1300', fontSize: 10, fontWeight: '800' },
  grabValue: { color: GOLD, fontSize: 13, fontWeight: '800', minWidth: 48, textAlign: 'right' },
});
