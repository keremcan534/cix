// Global hediye's banner (lib/live/global-gift, server/api/global-gifts.mjs): a global gift sent in any room of my
// country shows here, in the room I am in, in the banner line of the wins (lib/broadcast, components/fx/win-banner):
// who sent what to whom and in which room. A tap goes to that room (the room screen asks before leaving this one and
// checks bans and the room's own rules); a locked or password room is only named, a tap closes the banner. No video:
// only the room it was sent in plays the gift's video.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { NEWS_TTL_MS, shiftWinNews, type WinNews } from '@/lib/broadcast';
import { globalGiftText, receiverText, type GlobalGift } from '@/lib/global-gift-core';
import { getSession } from '@/lib/room-session';
import { colors } from '@/theme';

/** Longer than a win's: it can be tapped, and it says more. */
const HOLD_MS = 4500;

export function GlobalGiftBanner({ news, gift: g, top, still }: { news: WinNews; gift: GlobalGift; top: number; still?: boolean }) {
  const [enter] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(320);
  const id = useRef(news.id);
  const here = !!g.room && getSession().session?.roomId === g.room.id;
  const goable = !!g.room && !g.room.locked && !here;

  useEffect(() => {
    // Announced while I was outside a room: too old to show now.
    if (Date.now() - news.at > NEWS_TTL_MS) {
      shiftWinNews(id.current);
      return;
    }
    const show = Animated.sequence([
      Animated.spring(enter, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(enter, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const shine = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    show.start(({ finished }) => finished && shiftWinNews(id.current));
    if (!still) shine.start();
    return () => {
      show.stop();
      shine.stop();
    };
  }, [enter, sweep, still, news.at]);

  const tap = () => {
    shiftWinNews(id.current);
    if (goable && g.room) router.push({ pathname: '/oda/[id]', params: { id: g.room.id } });
  };
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, width + 80] });
  // The lock first: a long title would cut it off.
  const where = g.room ? (g.room.locked ? `🔒 Kilitli oda · ${g.room.title}` : here ? `Bu oda · ${g.room.title}` : g.room.title) : null;
  const label = `Global hediye: ${globalGiftText(g)}${g.room ? `, ${g.room.title} odasında` : ''}${goable ? '. Odaya gitmek için dokun' : g.room?.locked ? '. Oda kilitli' : ''}`;

  return (
    <View pointerEvents="box-none" style={[s.wrap, { top }]}>
      <Animated.View style={[s.shadow, { opacity: enter, transform: [{ translateY }, { scale }] }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={label} accessibilityLiveRegion="polite">
          <LinearGradient colors={['#1B1F6B', '#4B2A9E', '#7A1F7A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
            {!still && <Animated.View style={[s.sweep, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]} />}
            {g.from.avatar ? <Photo uri={g.from.avatar} kind="face" style={s.avatar} /> : <View style={[s.avatar, s.noFace]}><Ionicons name="person" size={18} color="#E9E4FF" /></View>}
            <View style={s.body}>
              <View style={s.tagRow}>
                <View style={s.tag}>
                  <Ionicons name="globe" size={10} color="#1A1014" />
                  <Text style={s.tagText}>GLOBAL</Text>
                </View>
                {where && (
                  <Text style={s.where} numberOfLines={1}>
                    {where}
                  </Text>
                )}
              </View>
              <Text style={s.who} numberOfLines={1}>
                {g.from.name} → {receiverText(g)}
              </Text>
              <Text style={s.what} numberOfLines={1}>
                {g.gift.name}
                {g.count > 1 ? ` ×${g.count.toLocaleString('tr-TR')}` : ''} gönderdi
              </Text>
            </View>
            <GiftArt giftId={g.gift.id} emoji={g.gift.emoji} size={40} textStyle={s.art} />
            {goable && <Ionicons name="chevron-forward" size={16} color="#E9E4FF" />}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 91, paddingHorizontal: 12 },
  shadow: { maxWidth: 380, width: '100%', borderRadius: 18, shadowColor: '#8B7BFF', shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 9 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingLeft: 7, paddingRight: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.gold, overflow: 'hidden' },
  sweep: { position: 'absolute', top: -24, bottom: -24, width: 34, backgroundColor: 'rgba(230,225,255,0.18)' },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.gold },
  noFace: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  body: { flex: 1, minWidth: 0, gap: 1 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, height: 15, borderRadius: 5, backgroundColor: colors.gold },
  tagText: { color: '#1A1014', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  where: { flexShrink: 1, color: 'rgba(233,228,255,0.85)', fontSize: 11, fontWeight: '700' },
  who: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  what: { color: '#FDE68A', fontSize: 12, fontWeight: '800' },
  art: { fontSize: 28, lineHeight: 34 },
});
