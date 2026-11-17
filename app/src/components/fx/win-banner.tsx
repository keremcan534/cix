// Win announcement banner: every win on the platform (lib/broadcast) shows here in every room, one at a
// time, near the top centre: a slim gold pill with a light sweep, one line, gone in under three seconds.
// Visual only (pointerEvents none): it never covers controls for long and never touches the mic or seats.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { NEWS_TTL_MS, shiftWinNews, useWinNews, type WinNews } from '@/lib/broadcast';
import { winNewsHidden } from '@/lib/games';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const HOLD_MS = 2600;

export function WinBanner({ top = 96, still }: { top?: number; /** reduce motion: no sweep or sparkle */ still?: boolean }) {
  const queue = useWinNews();
  const { wealthLevel, paidGames, blocked } = useApp();
  const news = queue[0];
  // Oyun Salonu wins are not news for someone who cannot see Oyun Salonu, nor anyone's win for someone who blocked
  // them: skipped, never shown.
  const hidden = !!news && (winNewsHidden(news, wealthLevel, paidGames) || (!!news.uid && blocked.has(news.uid)));
  useEffect(() => {
    if (news && hidden) shiftWinNews(news.id);
  }, [news, hidden]);
  if (!news || hidden) return null;
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
        {/* One slim line (who, from what, how much): the news without covering the mics under it. */}
        <LinearGradient colors={['#4A2A00', '#7A4A00', '#5B1F4F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
          {!still && <Animated.View style={[s.sweep, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]} />}
          {news.avatar ? <Photo uri={news.avatar} kind="face" style={s.avatar} /> : <Text style={s.avatarEmoji}>🎉</Text>}
          <Text style={s.line} numberOfLines={1}>
            <Text style={s.title}>{news.userName} kazandı</Text>
            {` · ${news.source}`}
            {news.mult ? <Text style={s.mult}> ×{fmt(news.mult)}</Text> : null}
          </Text>
          <Text style={s.amount}>+{fmt(news.amount)}</Text>
          <Icon3D name="coin" size={16} />
        </LinearGradient>
        <Animated.Text style={[s.sparkle, { left: -6, top: -9, transform: [{ scale: sparkleScale }] }]}>✨</Animated.Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 90, paddingHorizontal: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.gold, overflow: 'hidden', maxWidth: 360, shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  sweep: { position: 'absolute', top: -20, bottom: -20, width: 30, backgroundColor: 'rgba(255,240,200,0.24)' },
  avatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.gold },
  avatarEmoji: { fontSize: 18 },
  title: { color: '#FFF7E0', fontWeight: '900' },
  line: { flexShrink: 1, color: 'rgba(255,240,210,0.92)', fontSize: 12, fontWeight: '700' },
  mult: { color: semantic.money, fontWeight: '900' },
  amount: { color: semantic.money, fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
  sparkle: { position: 'absolute', fontSize: 14 },
});
