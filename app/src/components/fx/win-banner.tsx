// Win announcement banner: every win on the platform (lib/broadcast) shows here in every room, one at a
// time, at the top under the room's bar: a short, quiet pill (who, which gift, how much), gone in about three seconds.
// Visual only (pointerEvents none): it never covers controls for long and never touches the mic or seats. A global
// gift (Global hediye) in the same line has a banner of its own, which can be tapped (components/fx/global-gift-banner).
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { NEWS_TTL_MS, shiftWinNews, useWinNews, type WinNews } from '@/lib/broadcast';
import { winNewsHidden } from '@/lib/games';
import { useApp } from '@/store';
import { semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';
import { GlobalGiftBanner } from '@/components/fx/global-gift-banner';
import { globalGiftBlocked } from '@/lib/global-gift-core';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const HOLD_MS = 2600;

export function WinBanner({ top = 96, still }: { top?: number; /** reduce motion: no sweep or sparkle */ still?: boolean }) {
  const queue = useWinNews();
  const { wealthLevel, paidGames, blocked } = useApp();
  const news = queue[0];
  // Oyun Salonu wins are not news for someone who cannot see Oyun Salonu, nor anyone's win for someone who blocked
  // them: skipped, never shown.
  const hidden = !!news && (winNewsHidden(news, wealthLevel, paidGames) || (!!news.uid && blocked.has(news.uid)) || (!!news.global && globalGiftBlocked(news.global, blocked)));
  useEffect(() => {
    if (news && hidden) shiftWinNews(news.id);
  }, [news, hidden]);
  if (!news || hidden) return null;
  if (news.global) return <GlobalGiftBanner key={news.id} news={news} gift={news.global} top={top} still={still} />;
  return <Banner key={news.id} news={news} top={top} still={still} />;
}

function Banner({ news, top, still }: { news: WinNews; top: number; still?: boolean }) {
  const [enter] = useState(() => new Animated.Value(0));
  const id = useRef(news.id);

  useEffect(() => {
    // Announced while this user was outside a room: too old to show now.
    if (Date.now() - news.at > NEWS_TTL_MS) {
      shiftWinNews(id.current);
      return;
    }
    // A soft slide down and fade (owners, 21 Nov 2026: shorter and gentler than the gold pill with its sweep).
    const show = Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: still ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(enter, { toValue: 0, duration: still ? 0 : 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    show.start(({ finished }) => finished && shiftWinNews(id.current));
    return () => show.stop();
  }, [enter, still, news.at]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });
  // "Şanslı › Altın Nal": the gift's name is enough on the short pill.
  const what = news.source.includes('›') ? news.source.split('›').pop()!.trim() : news.source;
  const label = `${news.userName} ${news.source}${news.mult ? ` ×${fmt(news.mult)}` : ''} ile ${fmt(news.amount)} jeton kazandı${news.roomTitle ? `, ${news.roomTitle} odasında` : ''}`;

  return (
    <View pointerEvents="none" style={[s.wrap, { top }]} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <Animated.View style={[s.card, { opacity: enter, transform: [{ translateY }] }]}>
        {news.avatar ? <Photo uri={news.avatar} kind="face" style={s.avatar} /> : <Text style={s.avatarEmoji}>🎉</Text>}
        <Text style={s.line} numberOfLines={1}>
          <Text style={s.title}>{news.userName}</Text>
          {` · ${what}`}
          {news.mult ? <Text style={s.mult}> ×{fmt(news.mult)}</Text> : null}
        </Text>
        <Text style={s.amount}>+{fmt(news.amount)}</Text>
        <Icon3D name="coin" size={13} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 90, paddingHorizontal: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingLeft: 3, paddingRight: 9, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245,215,161,0.45)', backgroundColor: 'rgba(24,16,30,0.72)', maxWidth: 300 },
  avatar: { width: 20, height: 20, borderRadius: 10 },
  avatarEmoji: { fontSize: 14 },
  title: { color: '#FFF7E0', fontWeight: '800' },
  line: { flexShrink: 1, color: 'rgba(255,240,210,0.85)', fontSize: 11.5, fontWeight: '600' },
  mult: { color: semantic.money, fontWeight: '800' },
  amount: { color: semantic.money, fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
});
