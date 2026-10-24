import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Share, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, CoinPill, GradientButton, Header } from '@/components/ui';
import { CHECKIN_REWARDS, INVITE_REWARD, TASKS } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

export default function TasksScreen() {
  const { coins, checkIn, checkInDay, checkedInToday, stats, claimedTasks, claimTask, inviteCode } = useApp();
  // Position inside the current 7-day cycle; once today is claimed the highlighted day is the one just taken.
  const todayIndex = (checkedInToday ? checkInDay - 1 : checkInDay) % 7;

  const invite = async () => {
    try {
      await Share.share({ message: `Vibe Club'a katıl, sesli odalarda tanışalım! Davet kodum: ${inviteCode} 🎙️` });
    } catch {
      showAlert('Davet kodun', inviteCode);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Görevler & Ödüller" right={<CoinPill coins={coins} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 12 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>Günlük giriş ödülü</Text>
            <Text style={styles.dim}>{checkInDay} gün seri 🔥</Text>
          </View>
          <View style={styles.days}>
            {CHECKIN_REWARDS.map((r, i) => {
              const done = i < todayIndex || (i === todayIndex && checkedInToday);
              const isToday = i === todayIndex;
              return (
                <View key={i} style={[styles.day, isToday && !checkedInToday && styles.dayToday, done && styles.dayDone, i === 6 && { flexBasis: '100%' }]}>
                  <Text style={styles.dayLabel}>{i === 6 ? '7. gün · Büyük ödül' : `${i + 1}. gün`}</Text>
                  <Text style={{ fontSize: i === 6 ? 26 : 20 }}>{done ? '✅' : i === 6 ? '🎁' : '🪙'}</Text>
                  <Text style={styles.dayReward}>+{r}</Text>
                </View>
              );
            })}
          </View>
          <GradientButton
            title={checkedInToday ? 'Bugünkü ödül alındı' : `Ödülü al (+${CHECKIN_REWARDS[todayIndex]})`}
            icon={checkedInToday ? 'checkmark' : 'gift'}
            style={{ opacity: checkedInToday ? 0.5 : 1 }}
            onPress={() => {
              const r = checkIn();
              if (r) showAlert('Tebrikler! 🎉', `${r} jeton hesabına eklendi.`);
            }}
          />
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={[styles.title, { marginBottom: 8 }]}>Günlük görevler</Text>
          {TASKS.map((t) => {
            const progress = Math.min(stats[t.key], t.goal);
            const complete = progress >= t.goal;
            const claimed = claimedTasks.has(t.id);
            return (
              <View key={t.id} style={styles.task}>
                <Text style={{ fontSize: 26 }}>{t.icon}</Text>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{t.title}</Text>
                  <View style={styles.track}>
                    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${(progress / t.goal) * 100}%` }]} />
                  </View>
                  <Text style={styles.dim}>
                    {progress}/{t.goal} · 🪙 +{t.reward}
                  </Text>
                </View>
                {claimed ? (
                  <Ionicons name="checkmark-circle" size={28} color={colors.green} />
                ) : (
                  <Pressable disabled={!complete} onPress={() => claimTask(t.id)} style={[styles.claim, !complete && { opacity: 0.35 }]}>
                    <Text style={styles.claimText}>Al</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </Card>

        <LinearGradient colors={['#F59E0B', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.invite}>
          <Text style={{ fontSize: 36 }}>🤝</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.inviteTitle}>Arkadaşını davet et</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Her kayıt olan arkadaşın için 🪙 {INVITE_REWARD} kazan</Text>
            <Text style={styles.code}>Kodun: {inviteCode}</Text>
          </View>
          <Pressable style={styles.shareBtn} onPress={invite}>
            <Ionicons name="share-social" size={20} color="#EC4899" />
          </Pressable>
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 12 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { flexBasis: '22%', flexGrow: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.cardAlt, borderWidth: 2, borderColor: 'transparent' },
  dayToday: { borderColor: colors.pink },
  dayDone: { opacity: 0.55 },
  dayLabel: { color: colors.textDim, fontSize: 11 },
  dayReward: { color: colors.gold, fontWeight: '800' },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 6 },
  claim: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  claimText: { color: '#fff', fontWeight: '700' },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
  inviteTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  code: { color: '#fff', fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  shareBtn: { backgroundColor: '#fff', borderRadius: 999, padding: 10 },
});
