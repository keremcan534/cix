// Win announcement banner: every win on the platform (lib/broadcast) shows here in every room, one at a
// time, near the top centre: a glowing gold card with a light sweep and twinkling sparkles.
// Visual only (pointerEvents none): it never covers controls for long and never touches the mic or seats.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { NEWS_TTL_MS, shiftWinNews, useWinNews, type WinNews } from '@/lib/broadcast';
import { colors, semantic } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const HOLD_MS = 3400;

export function WinBanner({ top = 96, still }: { top?: number; /** reduce motion: no sweep or sparkle */ still?: boolean }) {
  const queue = useWinNews();
  const news = queue[0];
  if (!news) return null;
  return <Banner key={news.id} news={news} top={top} still={still} />;
}

function Banner({ news, top, still }: { news: WinNews; top: number; still?: boolean }) {
  const [enter] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(320);
  const id = useRef(news.id);

  useEffect(() => {
    // Announced while this user was outside a room: too old to show now.
    if (Date.now() - news.at > NEWS_TTL_MS) {
      shiftWinNews(id.current);
      return;
    }
    const show = Animated.sequence([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(enter, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const shine = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    const sparkle = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    );
    show.start(({ finished }) => finished && shiftWinNews(id.current));
    if (!still) {
      shine.start();
      sparkle.start();
    }
    return () => {
      show.stop();
      shine.stop();
      sparkle.stop();
    };
  }, [enter, sweep, twinkle, still, news.at]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, width + 80] });
  const sparkleScale = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] });
  const label = `${news.userName} ${news.source}${news.mult ? ` ×${fmt(news.mult)}` : ''} ile ${fmt(news.amount)} jeton kazandı${news.roomTitle ? `, ${news.roomTitle} odasında` : ''}`;

  return (
    <View pointerEvents="none" style={[s.wrap, { top }]} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <Animated.View style={{ opacity: enter, transform: [{ translateY }, { scale }] }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LinearGradient colors={['#4A2A00', '#7A4A00', '#5B1F4F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
          {!still && <Animated.View style={[s.sweep, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]} />}
          {news.avatar ? <Image source={{ uri: news.avatar }} style={s.avatar} /> : <Text style={s.avatarEmoji}>🎉</Text>}
          <View style={{ flexShrink: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {news.userName} kazandı!
            </Text>
            <Text style={s.line} numberOfLines={1}>
              {news.source}
              {news.mult ? <Text style={s.mult}> ×{fmt(news.mult)}</Text> : null}
              {news.wins ? ` · ${news.wins} kazanç` : ''}
            </Text>
            {!!news.roomTitle && (
              <Text style={s.room} numberOfLines={1}>
                {news.roomTitle}
              </Text>
            )}
          </View>
          <View style={s.amountBox}>
            <Text style={s.amount}>+{fmt(news.amount)}</Text>
            <Text style={s.coin}>jeton</Text>
          </View>
        </LinearGradient>
        <Animated.Text style={[s.sparkle, { left: -8, top: -10, transform: [{ scale: sparkleScale }] }]}>✨</Animated.Text>
        <Animated.Text style={[s.sparkle, { right: -6, bottom: -10, transform: [{ scale: sparkleScale }] }]}>✨</Animated.Text>
        <Animated.Text style={[s.sparkle, s.small, { right: 40, top: -12, opacity: twinkle }]}>⭐</Animated.Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 90, paddingHorizontal: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 10, paddingRight: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.gold, overflow: 'hidden', maxWidth: 380, shadowColor: colors.gold, shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  sweep: { position: 'absolute', top: -20, bottom: -20, width: 36, backgroundColor: 'rgba(255,240,200,0.28)' },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.gold },
  avatarEmoji: { fontSize: 30 },
  title: { color: '#FFF7E0', fontWeight: '900', fontSize: 15 },
  line: { color: 'rgba(255,240,210,0.92)', fontSize: 12, fontWeight: '700' },
  mult: { color: semantic.money, fontWeight: '900' },
  room: { color: 'rgba(255,240,210,0.7)', fontSize: 11 },
  amountBox: { alignItems: 'flex-end', marginLeft: 4 },
  amount: { color: semantic.money, fontWeight: '900', fontSize: 18, fontVariant: ['tabular-nums'] },
  coin: { color: 'rgba(255,240,210,0.8)', fontSize: 10, fontWeight: '700' },
  sparkle: { position: 'absolute', fontSize: 20 },
  small: { fontSize: 13 },
});
