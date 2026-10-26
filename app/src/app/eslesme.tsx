import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton, Header, VerifiedBadge } from '@/components/ui';
import { callPrice } from '@/data/economy';
import { USERS, type User } from '@/data/mock';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

type Mode = 'sesli' | 'goruntulu';
const FILTERS = ['Herkes', 'Kadın', 'Erkek'] as const;

export default function MatchScreen() {
  const { blocked, me } = useApp();
  const [mode, setMode] = useState<Mode>('goruntulu');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Herkes');
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<User | null>(null);
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!searching) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    spin.setValue(0);
    loop.start();
    const t = setTimeout(() => {
      const pool = USERS.filter((u) => u.online && !blocked.has(u.id) && (filter === 'Herkes' || u.gender === filter));
      setMatch(pool[Math.floor(Math.random() * pool.length)] ?? USERS[0]);
      setSearching(false);
    }, 2800);
    return () => {
      loop.stop();
      clearTimeout(t);
    };
  }, [searching, spin, filter, blocked]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Rastgele Eşleş" />

      <View style={styles.segment}>
        {(['goruntulu', 'sesli'] as const).map((m) => (
          <Pressable key={m} style={[styles.segBtn, mode === m && styles.segActive]} onPress={() => setMode(m)}>
            <Ionicons name={m === 'goruntulu' ? 'videocam' : 'call'} size={16} color="#fff" />
            <Text style={styles.segText}>{m === 'goruntulu' ? 'Görüntülü' : 'Sesli'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && { borderColor: colors.primaryText }]}>
            <Text style={[styles.chipText, filter === f && { color: '#fff' }]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.center}>
        {match ? (
          <View style={styles.matchCard}>
            <Image source={{ uri: match.avatar.replace('200', '600') }} style={styles.matchPhoto} />
            <LinearGradient colors={['transparent', 'rgba(8,15,30,0.95)']} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
            <View style={styles.matchInfo}>
              <Text style={styles.matchTitle}>Eşleştin! 🎉</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.matchName}>
                  {match.name}, {match.age}
                </Text>
                {match.verified && <VerifiedBadge size={18} />}
              </View>
              <Text style={styles.dim}>
                {match.city} · {match.bio}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 260, height: 260 }}>
            {searching &&
              [0, 1, 2].map((i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.radar,
                    {
                      opacity: spin.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                      transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.5 + i * 0.25, 1.3 + i * 0.25] }) }],
                    },
                  ]}
                />
              ))}
            <LinearGradient colors={gradient} style={styles.meRing}>
              <Image source={{ uri: me.avatar }} style={styles.meAvatar} />
            </LinearGradient>
            <Text style={[styles.dim, { position: 'absolute', bottom: -10 }]}>{searching ? 'Senin için biri aranıyor...' : `${USERS.filter((u) => u.online).length * 1_287} kişi çevrimiçi`}</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 20, gap: 12 }}>
        {match ? (
          <>
            <GradientButton
              title={`${mode === 'goruntulu' ? 'Görüntülü' : 'Sesli'} ara · 🪙 ${mode === 'goruntulu' ? callPrice(match) : callPrice(match) / 2}/dk`}
              icon={mode === 'goruntulu' ? 'videocam' : 'call'}
              onPress={() => router.replace({ pathname: '/arama/[id]', params: { id: match.id, mode } })}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={styles.secondary} onPress={() => router.push(`/sohbet/${match.id}`)}>
                <Text style={styles.secondaryText}>💬 Mesaj at</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => { setMatch(null); setSearching(true); }}>
                <Text style={styles.secondaryText}>⏭️ Sonraki</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <GradientButton title={searching ? 'Aranıyor...' : 'Eşleşmeyi başlat'} icon="flash" onPress={() => !searching && setSearching(true)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  chipText: { color: colors.textDim, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  radar: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 2, borderColor: colors.pink },
  meRing: { width: 120, height: 120, borderRadius: 60, padding: 4 },
  meAvatar: { flex: 1, borderRadius: 60, borderWidth: 3, borderColor: colors.bg },
  dim: { color: colors.textDim, fontSize: 13 },
  matchCard: { width: '82%', aspectRatio: 0.78, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.card },
  matchPhoto: { width: '100%', height: '100%' },
  matchInfo: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 4 },
  matchTitle: { color: colors.pink, fontWeight: '800', fontSize: 14 },
  matchName: { color: '#fff', fontSize: 26, fontWeight: '800' },
  secondary: { flex: 1, backgroundColor: colors.card, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#fff', fontWeight: '700' },
});
