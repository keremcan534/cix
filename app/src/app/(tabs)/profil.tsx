import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, VerifiedBadge } from '@/components/ui';
import { ME } from '@/data/mock';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const MENU: { icon: IconName; label: string; onPress?: () => void }[] = [
  { icon: 'wallet-outline', label: 'Cüzdan', onPress: () => router.push('/cuzdan') },
  { icon: 'diamond-outline', label: 'VIP Üyelik' },
  { icon: 'shield-checkmark-outline', label: 'Kimlik Doğrulama' },
  { icon: 'people-outline', label: 'Arkadaşını Davet Et' },
  { icon: 'settings-outline', label: 'Ayarlar' },
  { icon: 'help-circle-outline', label: 'Yardım & Destek' },
];

export default function ProfileScreen() {
  const { coins, following } = useApp();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.top}>
          <Avatar uri={ME.avatar} size={88} ring />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>{ME.name}</Text>
            <VerifiedBadge size={18} />
            <View style={styles.level}>
              <Text style={styles.levelText}>Lv.7</Text>
            </View>
          </View>
          <Text style={styles.bio}>{ME.bio}</Text>
          <Text style={styles.id}>ID: 10284731 · {ME.city}</Text>
        </View>

        <View style={styles.stats}>
          <Stat n={following.size} label="Takip" />
          <Stat n={128} label="Takipçi" />
          <Stat n={34} label="Ziyaretçi" />
          <Stat n={coins} label="Jeton" />
        </View>

        <Pressable onPress={() => {}} style={{ marginHorizontal: 16 }}>
          <LinearGradient colors={['#F59E0B', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.vip}>
            <Text style={{ fontSize: 28 }}>👑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.vipTitle}>VIP ol</Text>
              <Text style={styles.vipSub}>Özel rozet, giriş efekti ve sınırsız selam</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        <View style={styles.menu}>
          {MENU.map((m) => (
            <Pressable key={m.label} style={styles.menuRow} onPress={m.onPress}>
              <LinearGradient colors={gradient} style={styles.menuIcon}>
                <Ionicons name={m.icon} size={18} color="#fff" />
              </LinearGradient>
              <Text style={styles.menuLabel}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statN}>{n.toLocaleString('tr-TR')}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  level: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  levelText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bio: { color: colors.textDim, fontSize: 14 },
  id: { color: colors.textDim, fontSize: 12 },
  stats: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 14, marginBottom: 16 },
  statN: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statL: { color: colors.textDim, fontSize: 12 },
  vip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  vipTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  vipSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  menu: { margin: 16, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  menuIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: '#fff', fontSize: 15, flex: 1 },
});
