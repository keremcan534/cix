// Home entry to the Anlık Kulüp (lib/club): today's matches already gathered, one tap to meet them. Sits at
// the top of the rooms tab so the first thing a new person sees is people like them, live.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { EdgeLight, PressableScale, Shine, glow } from '@/components/fx/surface';
import { buildClub, setClubHidden } from '@/lib/club';
import { useApp } from '@/store';
import { colors } from '@/theme';

export function ClubHero() {
  const { me, blocked, settings } = useApp();
  const club = useMemo(() => buildClub(me, { exclude: blocked }), [me, blocked]);
  const [pulse] = useState(() => new Animated.Value(0));
  const still = settings.reduceMotion || settings.effectsOff;

  useEffect(() => setClubHidden(blocked), [blocked]);
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  if (!club.members.length) return null;
  return (
    <PressableScale onPress={() => router.push('/kulup')} accessibilityLabel={`Anlık kulübün hazır: ${club.name}, yüzde ${club.average} uyum`} style={{ marginHorizontal: 16 }}>
      <LinearGradient colors={['#0A8F95', '#0B3B4A', '#0B2236']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, glow('rgba(19,217,223,0.35)', 18, 5)]}>
        <EdgeLight strength={0.35} />
        <Shine radius={18} every={5200} />
        <View style={s.avatars}>
          {club.members.slice(0, 3).map((m, i) => (
            <View key={m.user.id} style={[s.avatar, { marginLeft: i ? -12 : 0, zIndex: 5 - i }]}>
              <Image source={{ uri: m.user.avatar }} style={s.img} />
            </View>
          ))}
          <View style={s.live}>
            {!still && <Animated.View style={[s.livePulse, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }]} />}
            <View style={s.liveDot} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.kicker}>ANLIK KULÜBÜN HAZIR</Text>
          {/* Topics only: the kicker already says it is a club, and the full name is too long for one line. */}
          <Text style={s.title} numberOfLines={1}>
            {club.topics.length ? club.topics.join(' & ') : club.name}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            %{club.average} uyum · {club.members.length} kişi çevrimiçi
          </Text>
        </View>
        <View style={s.go}>
          <Ionicons name="arrow-forward" size={18} color={colors.bg} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: 'rgba(19,217,223,0.45)', overflow: 'hidden' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#0B3B4A', overflow: 'hidden', backgroundColor: colors.card },
  img: { width: '100%', height: '100%' },
  live: { position: 'absolute', right: -2, top: -2, width: 12, height: 12, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  livePulse: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green, borderWidth: 2, borderColor: '#0B3B4A' },
  kicker: { color: colors.primaryText, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  go: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryText, alignItems: 'center', justifyContent: 'center' },
});
