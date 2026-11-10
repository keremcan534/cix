import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { CoinPill, Header } from '@/components/ui';
import { CHECKIN_REWARDS, TASKS, type TaskKey } from '@/data/economy';
import { RewardBurst, type Reward } from '@/components/fx/reward';
import { GiftArt } from '@/components/GiftArt';
import { GIFTS } from '@/data/mock';
import { liveMode, message, oneOnOneOpen } from '@/lib/live';
import { useBackpack } from '@/lib/live/backpack';
import { claimLiveCallTask, useLiveCallTask } from '@/lib/live/call-log';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { fonts, makeStyles, useTheme } from '@/theme';
import { Icon3D, type Icon3DName } from '@/components/Icon3D';
import { Art } from '@/components/Art';

// Only the streak's top reward wears the BÜYÜK ribbon.
const BIGGEST_CHECKIN = Math.max(...CHECKIN_REWARDS);

const TASK_INFO: Record<TaskKey, { desc: string; go: () => void }> = {
  roomMinutes: { desc: 'Sohbet odasında belirtilen süre kadar kal', go: () => router.push('/(tabs)') },
  giftsSent: { desc: 'Ödül almak için sohbet odasında hediyeler gönderin', go: () => router.push('/(tabs)') },
  greetings: { desc: 'Keşfet ekranında yeni kişilere selam ver', go: () => router.push('/(tabs)/kesfet') },
  moments: { desc: 'Günlük an paylaş; incelemeyi geçince sayılır', go: () => router.push('/(tabs)/anlar') },
  // Live: the server counts a video call that stayed on at least a minute (server/api/call-log.mjs).
  calls: { desc: liveMode() ? 'Bir arkadaşınla en az bir dakika görüntülü sohbet et' : 'Bir arkadaşınla görüntülü sohbet et', go: () => router.push('/(tabs)/mesajlar') },
};
// Tomorrow's check-in reward bundle (cards + coins), mirrors the 7-day cycle.
const TOMORROW = (coins: number): { icon: Icon3DName; name: string; n: string }[] => [
  { icon: 'chat', name: 'Mesaj kartı', n: '+2' },
  { icon: 'heart', name: 'Merhaba kartı', n: '+2' },
  { icon: 'coin', name: 'Jeton', n: `+${coins}` },
];
const secsToMidnight = () => {
  const d = new Date();
  return Math.max(0, Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime()) / 1000));
};
// Only the rows a user can actually do are listed: the call task needs calls in this build (the demo's, or the
// server's with LiveKit). In a live build the server counts that task and pays its reward (lib/live/call-log).
const shownTask = (key: TaskKey) => (key === 'calls' ? oneOnOneOpen() : true);
const pad = (n: number) => String(n).padStart(2, '0');
const hms = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

export default function TaskCenter() {
  const { coins, checkIn, checkInDay, checkedInToday, stats, claimedTasks, claimTask, settings } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const [reward, setReward] = useState<Reward | null>(null);
  const todayIndex = (checkedInToday ? checkInDay - 1 : checkInDay) % 7;
  const [selected, setSelected] = useState((todayIndex + (checkedInToday ? 1 : 0)) % 7);
  const [left, setLeft] = useState(secsToMidnight);
  const liveCallTask = useLiveCallTask(liveMode() && oneOnOneOpen());
  // Live: the gift the call task also puts in Çantam (Canlı ayarlar may set none).
  const bagSource = useBackpack(liveMode() && oneOnOneOpen())?.sources.find((x) => x.key === 'call_task');
  const bagGift = bagSource ? GIFTS.find((g) => g.id === bagSource.giftId) : undefined;

  useEffect(() => {
    const t = setInterval(() => setLeft(secsToMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const doCheckIn = () => {
    const r = checkIn();
    if (r) {
      setReward({ icon: 'gift', title: `Giriş ödülü alındı · ${checkInDay + 1}. gün`, amount: r });
      setSelected((todayIndex + 1) % 7);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Görev Merkezi" right={<CoinPill coins={coins} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.checkTitle}>Günlük giriş</Text>
              <Text style={styles.dim}>7 gün üst üste gel, büyük ödülü kap</Text>
            </View>
            <Pressable onPress={doCheckIn} disabled={checkedInToday} style={[styles.checkBtn, checkedInToday && styles.checkBtnDone]} accessibilityLabel="Günlük giriş ödülünü al">
              {checkedInToday ? <Ionicons name="checkmark" size={16} color={colors.textDim} /> : <Icon3D name="coin" size={16} />}
              <Text style={[styles.checkBtnText, checkedInToday && { color: colors.textDim }]}>{checkedInToday ? 'Alındı' : `+${CHECKIN_REWARDS[todayIndex]} al`}</Text>
            </Pressable>
          </View>
          {/* Top padding leaves room for the BÜYÜK ribbon, which sits above its tile. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
            {CHECKIN_REWARDS.map((r, i) => {
              const done = i < todayIndex || (i === todayIndex && checkedInToday);
              const big = r === BIGGEST_CHECKIN;
              return (
                <Pressable key={`d${i}`} onPress={() => setSelected(i)} style={[styles.day, done && styles.dayDone, selected === i && styles.daySel]} accessibilityLabel={`Gün ${i + 1}${done ? ', alındı' : ''}`}>
                  {big && <Text style={styles.large}>BÜYÜK</Text>}
                  <Icon3D name={big ? 'gift' : i === 3 ? 'coin' : 'envelope'} size={32} style={done ? { opacity: 0.5 } : undefined} />
                  {done ? <Ionicons name="checkmark-circle" size={18} color={semantic.successText} /> : <Text style={[styles.dayLabel, selected === i && { color: colors.text }]}>Gün {i + 1}</Text>}
                  <Text style={styles.dayCoins}>+{r}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.tomorrow}>
            <Text style={styles.tomorrowTitle}>{selected === (todayIndex + (checkedInToday ? 1 : 0)) % 7 ? (checkedInToday ? 'Yarının giriş ödülleri' : 'Bugünün giriş ödülleri') : `Gün ${selected + 1} giriş ödülleri`}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {TOMORROW(CHECKIN_REWARDS[selected]).map((x) => (
                <View key={x.name} style={styles.rewardBox}>
                  <Icon3D name={x.icon} size={34} />
                  <Text style={[styles.dim, { textAlign: 'center' }]} numberOfLines={2}>
                    {x.name}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{x.n}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.h1}>Günlük görevler</Text>
          <View style={styles.timer} accessibilityLabel={`Görevlerin yenilenmesine ${hms(left)}`}>
            <Ionicons name="time-outline" size={14} color={colors.textDim} />
            <Text style={styles.timerText}>{hms(left)}</Text>
          </View>
        </View>
        <View style={[styles.card, { paddingVertical: 4 }]}>
          {TASKS.filter((t) => shownTask(t.key)).map((t, i) => {
            // Live: the call task as the server counts it (nothing done until it has answered).
            const server = liveMode() && t.key === 'calls';
            const goal = server ? (liveCallTask?.goal ?? t.goal) : t.goal;
            const reward = server ? (liveCallTask?.reward ?? t.reward) : t.reward;
            const progress = server ? Math.min(liveCallTask?.done ?? 0, goal) : Math.min(stats[t.key], t.goal);
            const complete = progress >= goal;
            const claimed = server ? !!liveCallTask?.claimed : claimedTasks.has(t.id);
            const claim = () => {
              if (!server) {
                claimTask(t.id);
                return setReward({ icon: 'tasks', title: `${t.title} tamamlandı`, amount: t.reward });
              }
              void claimLiveCallTask()
                .then((r) => {
                  const g = r.gift ? GIFTS.find((x) => x.id === r.gift?.giftId) : undefined;
                  if (r.paid) setReward({ icon: 'tasks', title: `${t.title} tamamlandı${g && r.gift ? ` · çantana ${g.name} ×${r.gift.count}` : ''}`, amount: r.task.reward });
                })
                .catch((e) => showAlert('Ödül alınamadı', message(e)));
            };
            return (
              <View key={t.id} style={[styles.task, i > 0 && styles.sep]}>
                {t.art ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Art name={t.art} size={26} />
                    <Text style={[styles.taskTitle, { flexShrink: 1 }]}>{t.title}</Text>
                  </View>
                ) : (
                  <Text style={styles.taskTitle}>
                    {t.icon} {t.title}
                  </Text>
                )}
                <Text style={styles.dim}>{TASK_INFO[t.key].desc}</Text>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon3D name="coin" size={16} />
                      <Text style={styles.taskReward}>{reward}</Text>
                      {server && bagSource && bagGift && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityLabel={`ve çantana ${bagSource.count} ${bagGift.name}`}>
                          <Text style={styles.taskReward}> + </Text>
                          <GiftArt giftId={bagGift.id} emoji={bagGift.emoji} size={16} textStyle={{ fontSize: 13 }} />
                          <Text style={styles.taskReward}>×{bagSource.count}</Text>
                        </View>
                      )}
                      <Text style={[styles.dim, { marginLeft: 'auto' }]}>
                        {progress}/{goal}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${(progress / goal) * 100}%` }, complete && { backgroundColor: semantic.success }]} />
                    </View>
                  </View>
                  {claimed ? (
                    <View style={[styles.goBtn, { opacity: 0.45 }]}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </View>
                  ) : complete ? (
                    <Pressable style={[styles.goBtn, { backgroundColor: semantic.successFill }]} onPress={claim} accessibilityLabel={`${t.title} ödülünü al`}>
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

        {/* Davet has no server referral yet (it shows ComingSoon in a live build), so the banner is demo only. */}
        {!liveMode() && (
          <Pressable onPress={() => router.push('/davet')} accessibilityLabel="Ödüllü davet">
            <LinearGradient colors={[semantic.socialFill, '#6E2440']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.invite}>
              <Icon3D name="envelope" size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Ödüllü davet</Text>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Arkadaşlarını davet et, kayıt ve gelir görevlerinden ödül kazan</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}
        <Text style={styles.dim}>Görevler her gün 00:00&apos;da sıfırlanır. Ödüller sunucuda doğrulanan etkinliklerden verilir; sahte etkileşim ödül üretmez.</Text>
      </ScrollView>
      {reward && <RewardBurst reward={reward} still={settings.reduceMotion} onDone={() => setReward(null)} />}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 14, ...lift },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  checkTitle: { color: colors.text, fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3 },
  checkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  checkBtnDone: { backgroundColor: colors.cardAlt },
  checkBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  day: { width: 64, alignItems: 'center', gap: 4, paddingTop: 12, paddingBottom: 10, borderRadius: 14, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: 'transparent' },
  dayDone: { backgroundColor: dark ? 'rgba(31,48,80,0.5)' : 'rgba(233,239,247,0.5)' },
  daySel: { borderColor: colors.gold, backgroundColor: 'rgba(246,189,96,0.14)' },
  large: { position: 'absolute', top: -7, backgroundColor: semantic.money, color: semantic.moneyInk, fontSize: 9, fontWeight: '800', letterSpacing: 0.4, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  dayLabel: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  dayCoins: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  tomorrow: { backgroundColor: dark ? 'rgba(19,217,223,0.12)' : 'rgba(0,140,148,0.07)', borderRadius: 16, padding: 14, gap: 12 },
  tomorrowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rewardBox: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4 },
  h1: { color: colors.text, fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, ...lift },
  timerText: { color: colors.text, fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  taskReward: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: semantic.action },
  task: { gap: 6, paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  taskTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  goBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8, minWidth: 76, alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
}));
