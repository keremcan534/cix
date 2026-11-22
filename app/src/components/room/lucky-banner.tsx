// Şanslı hediyelerin odadaki şeridi (owners' sample videos, 22 Nov 2026; first in Güncelleme 8). Only Şanslı gifts
// have it; every other gift keeps its chat line. The first gift of a send slides a strip in from the left in the
// middle of the screen: the sender's photo and name, "Gönderdi" and whom, the gift, and next to it a big ×count. Every
// later gift of the same person, gift and recipients (the wheel's repeats, other phones' sends) counts on the same
// strip: the number rolls up one by one to the new total and pops on each step, a light sweeps over the strip, and its
// colour climbs with the count (blue, purple, pink, orange, gold). A win puts the best multiplier on the gift ("×500");
// a big one turns the strip gold ("BÜYÜK KAZANÇ"). Once the sends stop (the caller's timer), it streaks off to the
// left. At most three show at once, stacked. Not touchable; a screen reader hears the total when it leaves.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { BIG_MULT, rollMs, tierOf } from '@/lib/lucky-strip';

export { STRIP_HOLD_MS, rollMs } from '@/lib/lucky-strip';

export type LuckyStrip = {
  key: string;
  fromName: string;
  fromAvatar?: string;
  /** "Ayşe", "4 kişi", "Sana". */
  toText: string;
  /** The recipient's photo when there is one recipient. */
  toAvatar?: string;
  giftId: string;
  emoji: string;
  /** Gifts each recipient got so far (the number rolls up to it). */
  count: number;
  /** The best multiplier won (0: none). */
  mult: number;
  /** True once the sends stopped: it streaks off, then the caller drops it. */
  leaving?: boolean;
};

const IN_MS = 280;
const OUT_MS = 260;
/** Steps faster than this don't each pop (a ×250 still rolls by, it just pops at this pace). */
const POP_EVERY_MS = 70;

export function LuckyStrips({ strips, onDone }: { strips: LuckyStrip[]; onDone: (key: string) => void }) {
  // The three newest; older ones wait their turn (the caller drops them after their time).
  const shown = strips.slice(-3);
  return (
    <View pointerEvents="none" style={s.wrap}>
      {shown.map((x) => (
        <Strip key={x.key} strip={x} onDone={onDone} />
      ))}
    </View>
  );
}

function Strip({ strip, onDone }: { strip: LuckyStrip; onDone: (key: string) => void }) {
  const [enter] = useState(() => new Animated.Value(0));
  const [leave] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const [shine] = useState(() => new Animated.Value(0));
  const [badge] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(Math.min(1, strip.count));
  const showing = useRef(shown);
  const lastPop = useRef(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
  }, [enter]);

  // The number rolls from what it shows to the new total, one step at a time.
  useEffect(() => {
    const from = showing.current;
    const to = strip.count;
    if (to <= from) return;
    const ms = rollMs(to - from);
    const bump = () => {
      const now = Date.now();
      if (now - lastPop.current < POP_EVERY_MS) return;
      lastPop.current = now;
      pop.setValue(1.55);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 260, useNativeDriver: true }).start();
      shine.setValue(0);
      Animated.timing(shine, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    };
    const step = (n: number) => {
      if (n === showing.current) return;
      showing.current = n;
      setShown(n);
      bump();
    };
    if (!ms) {
      step(to);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      step(Math.max(from + 1, Math.round(from + (to - from) * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // A newer total takes over from where this one got to.
    };
  }, [strip.count, pop, shine]);

  const won = strip.mult > 1;
  useEffect(() => {
    if (!won) return;
    badge.setValue(0);
    Animated.spring(badge, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
  }, [won, strip.mult, badge]);

  useEffect(() => {
    if (!strip.leaving) return;
    const a = Animated.timing(leave, { toValue: 1, duration: OUT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    a.start(() => {
      AccessibilityInfo.announceForAccessibility?.(`${strip.fromName}, ${strip.toText} ${strip.count} şanslı hediye gönderdi${won ? `, ${strip.mult} kat kazandı` : ''}`);
      done.current(strip.key);
    });
    return () => a.stop();
  }, [strip.leaving, leave, strip.key, strip.fromName, strip.toText, strip.count, strip.mult, won]);

  const big = won && strip.mult >= BIG_MULT;
  const tier = tierOf(strip.count, big);
  return (
    <Animated.View
      style={[
        s.row,
        {
          opacity: Animated.multiply(enter.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), leave.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] })),
          transform: [
            { translateX: Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [-320, 0] }), leave.interpolate({ inputRange: [0, 1], outputRange: [0, -360] })) },
            { scaleX: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
          ],
        },
      ]}
    >
      <View style={s.pill}>
        <LinearGradient colors={tier.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        {/* The light that sweeps over on every step. */}
        <Animated.View
          style={[
            s.shine,
            {
              opacity: shine.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 0.55, 0.3, 0] }),
              transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-60, 250] }) }, { skewX: '-20deg' }],
            },
          ]}
        />
        <Avatar uri={strip.fromAvatar} name={strip.fromName} size={34} />
        <View style={s.texts}>
          <Text style={s.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {strip.fromName}
          </Text>
          {big ? (
            <Text style={s.bigWin} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              BÜYÜK KAZANÇ
            </Text>
          ) : (
            <View style={s.toRow}>
              <Text style={s.to} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                Gönderdi ›
              </Text>
              {strip.toAvatar !== undefined && <Avatar uri={strip.toAvatar} name={strip.toText} size={16} />}
              <Text style={[s.to, { flexShrink: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {strip.toText}
              </Text>
            </View>
          )}
        </View>
        <View style={s.giftSlot} />
      </View>
      {/* The gift sits on the strip's end, a little out of it; a win's multiplier pops on top of it. */}
      <View style={s.gift}>
        <GiftArt giftId={strip.giftId} emoji={strip.emoji} size={44} />
        {won && (
          <Animated.View style={[s.badge, { opacity: badge, transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }]}>
            <Text style={s.badgeText} maxFontSizeMultiplier={1.1}>
              ×{strip.mult.toLocaleString('tr-TR')}
            </Text>
          </Animated.View>
        )}
      </View>
      <Animated.Text style={[s.count, { color: tier.ink, transform: [{ scale: pop }] }]} maxFontSizeMultiplier={1.1}>
        x{shown.toLocaleString('tr-TR')}
      </Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 6, top: '50%', gap: 8, zIndex: 60 },
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: 210,
    paddingLeft: 3,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  shine: { position: 'absolute', top: -10, bottom: -10, width: 36, backgroundColor: '#fff' },
  texts: { flex: 1, minWidth: 0 },
  name: { color: '#fff', fontSize: 13, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 3 },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  to: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 2 },
  bigWin: { color: '#7C2D12', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5 },
  giftSlot: { width: 30 },
  gift: { marginLeft: -40, width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -14, alignSelf: 'center', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: '#3B1D00', borderWidth: 1.5, borderColor: '#FACC15' },
  badgeText: { color: '#FDE047', fontSize: 11, fontWeight: '900' },
  count: {
    marginLeft: 2,
    fontSize: 30,
    fontWeight: '900',
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(40,0,60,0.85)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
});
