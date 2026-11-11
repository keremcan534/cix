// The last results of a game as a row of small chips, newest first: what a wheel, a board or a rocket did lately,
// read at a glance. The newest one pops in. Shows only what this screen saw; it is no record (Geçmiş is).
import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useSettings } from '@/store';

export type TrailItem = { key: string; label: string; /** win: paid me; hot: a rare, high result; else plain. */ tone?: 'win' | 'hot' };
/** Keeps a trail short: the newest first, at most `max`. */
export const pushTrail = (trail: TrailItem[], item: TrailItem, max = 14) => [item, ...trail].slice(0, max);

export function ResultTrail({ items, empty = 'Sonuçlar burada görünür' }: { items: TrailItem[]; empty?: string }) {
  return (
    <View style={s.row} accessibilityLabel={items.length ? `Son sonuçlar: ${items.map((i) => i.label).join(', ')}` : empty}>
      <Text style={s.head}>SON</Text>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
          {items.map((it, i) => (
            <Chip key={it.key} item={it} fresh={i === 0} />
          ))}
        </ScrollView>
      ) : (
        <Text style={s.empty} numberOfLines={1}>
          {empty}
        </Text>
      )}
    </View>
  );
}

function Chip({ item, fresh }: { item: TrailItem; fresh: boolean }) {
  const { reduceMotion } = useSettings();
  const [v] = useState(() => new Animated.Value(fresh && !reduceMotion ? 0 : 1));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[s.chip, item.tone === 'win' && s.win, item.tone === 'hot' && s.hot, fresh && s.fresh, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
      <Text style={[s.text, item.tone === 'win' && { color: '#BBF7D0' }, item.tone === 'hot' && { color: '#FDE68A' }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.32)', borderRadius: 999, paddingLeft: 12, paddingRight: 6, height: 34 },
  head: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  empty: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  chip: { minWidth: 34, height: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  win: { backgroundColor: 'rgba(34,197,94,0.28)' },
  hot: { backgroundColor: 'rgba(245,158,11,0.3)' },
  fresh: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  text: { color: '#fff', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
