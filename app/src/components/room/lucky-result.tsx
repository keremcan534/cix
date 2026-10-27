// Lucky result over the room: the multipliers and rewards the server stored, nothing else.
// One send can go to several people (one draw each); the card shows the best multiplier and the total.
// Purely visual (pointerEvents none): it never touches seats, the mic or the voice connection.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import type { LuckyRecord } from '@/lib/lucky';
import { colors, semantic } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

export function LuckyResult({ records, still, onDone }: { records: LuckyRecord[]; /** effects off / reduce motion */ still?: boolean; onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  const best = records.reduce((a, b) => (b.mult > a.mult ? b : a), records[0]);
  const reward = records.reduce((n, r) => n + r.reward, 0);
  const wins = records.filter((r) => r.reward > 0).length;
  const big = best.mult >= 50;
  // The room re-renders often; keep the latest callback without restarting the animation.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const show = still ? Animated.delay(0) : Animated.spring(v, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true });
    const anim = Animated.sequence([show, Animated.delay(reward ? (big ? 2600 : 1700) : 1100), Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true })]);
    anim.start(({ finished }) => finished && done.current());
    return () => anim.stop();
  }, [v, records, still, big, reward]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]} accessibilityLiveRegion="polite">
      <Animated.View
        style={[s.card, reward ? (big ? s.cardBig : s.cardWin) : s.cardNone, { opacity: v, transform: [{ scale }] }]}
        accessibilityLabel={reward ? `Lucky: en yüksek çarpan ${best.mult}, toplam ${reward} jeton kazandın` : 'Lucky: bu sefer ödül çıkmadı'}
      >
        <Text style={s.emoji}>{best.emoji}</Text>
        {reward ? (
          <>
            <Text style={[s.mult, big && { fontSize: 54 }]}>×{fmt(best.mult)}</Text>
            <View style={s.row}>
              <Icon3D name="coin" size={22} />
              <Text style={s.reward}>+{fmt(reward)}</Text>
            </View>
            <Text style={s.note}>{records.length > 1 ? `${records.length} gönderimden ${wins} kazanç · ödül bakiyene eklendi` : 'Ödül bakiyene eklendi'}</Text>
          </>
        ) : (
          <>
            <Text style={s.none}>Bu sefer ödül çıkmadı</Text>
            <Text style={s.note}>
              {best.giftName} gönderildi{records.length > 1 ? ` · ${records.length} kişi` : ''}
            </Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 80 },
  card: { alignItems: 'center', gap: 4, paddingVertical: 18, paddingHorizontal: 28, borderRadius: 24, borderWidth: 2, minWidth: 200 },
  cardNone: { backgroundColor: 'rgba(22,37,60,0.94)', borderColor: colors.border, paddingVertical: 12 },
  cardWin: { backgroundColor: 'rgba(6,58,40,0.95)', borderColor: semantic.success },
  cardBig: { backgroundColor: 'rgba(66,40,4,0.96)', borderColor: colors.gold },
  emoji: { fontSize: 36 },
  mult: { color: '#fff', fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reward: { color: semantic.money, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  none: { color: colors.text, fontSize: 16, fontWeight: '800' },
  note: { color: colors.textDim, fontSize: 12 },
});
