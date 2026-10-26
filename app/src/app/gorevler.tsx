import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoinPill, Header } from '@/components/ui';
import { CHECKIN_REWARDS, TASKS, type TaskKey } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const TASK_INFO: Record<TaskKey, { desc: string; go: () => void }> = {
  roomMinutes: { desc: 'Sohbet odasında belirtilen süre kadar kal', go: () => router.push('/(tabs)') },
  giftsSent: { desc: 'Ödül almak için sohbet odasında hediyeler gönderin', go: () => router.push('/(tabs)') },
  greetings: { desc: 'Keşfet ekranında yeni kişilere selam ver', go: () => router.push('/(tabs)/kesfet') },
  moments: { desc: 'Günlük an paylaş; incelemeyi geçince sayılır', go: () => router.push('/(tabs)/anlar') },
  calls: { desc: 'Bir arkadaşınla görüntülü sohbet et', go: () => router.push('/(tabs)/mesajlar') },
};
// Tomorrow's check-in reward bundle (cards + coins), mirrors the 7-day cycle.
const TOMORROW = (coins: number) => [
  { emoji: '💬', name: 'PM kartı', n: '+2' },
  { emoji: '❤️', name: 'Merhaba kartı', n: '+2' },
  { emoji: '🪙', name: 'Jeton', n: `+${coins}` },
];
const secsToMidnight = () => {
  const d = new Date();
  return Math.max(0, Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime()) / 1000));
};
const hms = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;

export default function TaskCenter() {
  const { coins, checkIn, checkInDay, checkedInToday, stats, claimedTasks, claimTask } = useApp();
  const todayIndex = (checkedInToday ? checkInDay - 1 : checkInDay) % 7;
  const [selected, setSelected] = useState((todayIndex + (checkedInToday ? 1 : 0)) % 7);
  const [left, setLeft] = useState(secsToMidnight);

  useEffect(() => {
    const t = setInterval(() => setLeft(secsToMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const doCheckIn = () => {
    const r = checkIn();
    if (r) {
      showAlert('Check-in tamam 🎉', `${r} jeton hesabına eklendi.`);
      setSelected((todayIndex + 1) % 7);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Görev Merkezi" right={<CoinPill coins={coins} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.checkTitle}>Günlük Check-in</Text>
            <Pressable onPress={doCheckIn} disabled={checkedInToday} style={[styles.checkBtn, checkedInToday && { backgroundColor: '#52525B' }]} accessibilityLabel="Check-in">
              <Text style={{ color: '#fff', fontWeight: '800' }}>{checkedInToday ? 'Bugün tamamlandı' : `Check-in yap +${CHECKIN_REWARDS[todayIndex]}`}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CHECKIN_REWARDS.map((r, i) => {
              const done = i < todayIndex || (i === todayIndex && checkedInToday);
              const big = i === 1 || i === 6;
              return (
                <Pressable key={`d${i}`} onPress={() => setSelected(i)} style={[styles.day, selected === i && styles.daySel]} accessibilityLabel={`Gün ${i + 1}`}>
                  {big && <Text style={styles.large}>Large</Text>}
                  <Text style={{ fontSize: 26 }}>{big ? '🎁' : i === 3 ? '🪙' : '💌'}</Text>
                  {done ? <Ionicons name="checkmark" size={22} color={colors.textDim} /> : <Text style={[styles.dayLabel, selected === i && { color: '#3B2A12' }]}>Gün {i + 1}</Text>}
                  <Text style={[styles.dayCoins, selected === i && { color: '#92400E' }]}>+{r}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.tomorrow}>
            <Text style={styles.tomorrowTitle}>{selected === (todayIndex + (checkedInToday ? 1 : 0)) % 7 ? (checkedInToday ? 'Yarının giriş ödülleri' : 'Bugünün giriş ödülleri') : `Gün ${selected + 1} giriş ödülleri`}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {TOMORROW(CHECKIN_REWARDS[selected]).map((x) => (
                <View key={x.name} style={styles.rewardBox}>
                  <Text style={{ fontSize: 30 }}>{x.emoji}</Text>
                  <Text style={styles.dim} numberOfLines={1}>
                    {x.name}
                  </Text>
                  <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{x.n}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.h1}>Günlük Görevler</Text>
          <Text style={{ color: '#fff', fontWeight: '700' }}>⏰ {hms(left)}</Text>
        </View>
        <View style={[styles.card, { paddingVertical: 4 }]}>
          {TASKS.map((t, i) => {
            const progress = Math.min(stats[t.key], t.goal);
            const complete = progress >= t.goal;
            const claimed = claimedTasks.has(t.id);
            return (
              <View key={t.id} style={[styles.task, i > 0 && styles.sep]}>
                <Text style={styles.taskTitle}>
                  {t.icon} {t.title}
                </Text>
                <Text style={styles.dim}>{TASK_INFO[t.key].desc}</Text>
                <View style={styles.rowBetween}>
                  <Text style={{ color: '#A5F3F5', fontSize: 15 }}>
                    🪙 x{t.reward} <Text style={styles.dim}>({progress}/{t.goal})</Text>
                  </Text>
                  {claimed ? (
                    <View style={[styles.goBtn, { opacity: 0.45 }]}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </View>
                  ) : complete ? (
                    <Pressable style={[styles.goBtn, { backgroundColor: semantic.successFill }]} onPress={() => claimTask(t.id)} accessibilityLabel={`${t.title} ödülünü al`}>
                      <Text style={styles.goText}>Al</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.goBtn} onPress={TASK_INFO[t.key].go} accessibilityLabel={`${t.title} git`}>
                      <Text style={styles.goText}>Git</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/davet')} accessibilityLabel="Ödüllü davet">
          <LinearGradient colors={['#F97316', '#FF6576']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.invite}>
            <Text style={{ fontSize: 34 }}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>Ödüllü Davet</Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Arkadaşlarını davet et, kayıt ve gelir görevlerinden ödül kazan</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
        <Text style={styles.dim}>Görevler her gün 00:00&apos;da sıfırlanır. Ödüller sunucuda doğrulanan etkinliklerden verilir; sahte etkileşim ödül üretmez.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  checkTitle: { color: '#A5F3F5', fontSize: 22, fontWeight: '900' },
  checkBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  day: { width: 64, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.cardAlt },
  daySel: { backgroundColor: '#FDE68A' },
  large: { position: 'absolute', top: 2, color: '#F59E0B', fontSize: 9, fontWeight: '900' },
  dayLabel: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  dayCoins: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  tomorrow: { backgroundColor: 'rgba(19,217,223,0.12)', borderRadius: 16, padding: 14, gap: 12 },
  tomorrowTitle: { color: '#A5F3F5', fontWeight: '800', fontSize: 16 },
  rewardBox: { width: 88, alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 10 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 22 },
  task: { gap: 6, paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  taskTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  goBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
});
