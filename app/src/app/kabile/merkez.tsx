import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, Card, GradientButton, Header, StateIcon } from '@/components/ui';
import {
  CHEST_MIN_CONTRIBUTION,
  KABILE_CHESTS,
  KABILE_ROUTES,
  KABILE_TASKS,
  chestRewardText,
  contribLevel,
  ensureFresh,
  findKabile,
  fmt,
  fmtK,
  kabile,
  kabileMemberIds,
  kabileMeta,
  taskProgress,
  treasuryLevel,
  useKabileProgress,
  type KabileProgress,
  type KabileTask,
} from '@/data/kabile';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Counters = { roomMinutes: number; giftsSent: number; spentTotal: number };
const CHECKIN = KABILE_TASKS.find((t) => t.source === 'checkIn') ?? KABILE_TASKS[0];

export default function KabileMerkez() {
  const { familyId, me, stats, spentTotal, addCoins } = useApp();
  const p = useKabileProgress();
  useFocusEffect(useCallback(() => ensureFresh(), []));
  const family = findKabile(familyId);

  if (!family)
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Görev Merkezi" />
        <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
          <Text style={styles.title}>Görevler kabile üyelerine açıktır</Text>
          <GradientButton title="Kabile bul" onPress={() => router.replace(KABILE_ROUTES.profile)} />
        </View>
      </SafeAreaView>
    );

  const meta = kabileMeta(family.id);
  const counters: Counters = { roomMinutes: stats.roomMinutes, giftsSent: stats.giftsSent, spentTotal };
  const treasure = meta.treasure + p.addedTreasure;
  const tl = treasuryLevel(treasure);
  const weekly = meta.weeklyPower + p.addedPower;
  const totalPower = meta.power + p.addedPower;
  const contrib = contribLevel(p.myPower);
  const members = kabileMemberIds(family).filter((id) => id !== 'me');
  const newest = members[members.length - 1] ?? family.leaderId;
  const checkedIn = p.claimed.includes('k-checkin');

  const go = (t: KabileTask) => {
    switch (t.source) {
      case 'chatMsgs':
      case 'chatGiftCoins':
        return router.push(KABILE_ROUTES.sohbet);
      case 'roomMinutes':
        kabile.startMeasuring('roomMinutes', stats.roomMinutes);
        return router.push(`/oda/${meta.roomId}`);
      case 'roomGiftCoins':
        kabile.startMeasuring('roomGiftCoins', spentTotal);
        return router.push(`/oda/${meta.roomId}`);
      case 'giftsSent':
        kabile.startMeasuring('giftsSent', stats.giftsSent);
        return router.push(`/kullanici/${newest}`);
      case 'cpGiftCoins':
        return router.push(KABILE_ROUTES.iliski);
      case 'checkIn':
        return claim(t);
    }
  };

  const claim = (t: KabileTask) => {
    const prog = taskProgress(t, p, counters);
    if (t.kind === 'count') {
      if (!prog.claimable || !kabile.claimCount(t)) return;
      return showAlert(t.source === 'checkIn' ? 'Yoklama alındı' : 'Ödül alındı', `⚔ +${t.power} Güç Puanı · 🔮 +${t.treasure} Hazine`);
    }
    const n = kabile.claimSteps(t, prog.steps);
    if (n) showAlert('Ödül alındı', `⚔ +${t.power * n} Güç Puanı · 🔮 +${t.treasure * n} Hazine`);
  };

  const openChest = (id: string) => {
    const c = KABILE_CHESTS.find((x) => x.id === id);
    if (!c) return;
    if (p.chests.includes(id)) return showAlert(`${c.name} alındı`, `İçerik: ${chestRewardText(c.reward)}`);
    if (weekly < c.need) return showAlert(c.name, `Kabile haftalık savaş gücü ⚔ ${fmt(c.need)} olunca açılır.\n\nİçerik (sabit): ${chestRewardText(c.reward)}`);
    if (p.myPower < CHEST_MIN_CONTRIBUTION) return showAlert('Önce katkı yap', `Sandık almak için bu hafta en az ⚔ ${CHEST_MIN_CONTRIBUTION} güç puanı katkın olmalı. Aşağıdaki günlük görevlerden birini tamamla.`);
    const r = kabile.claimChest(id);
    if (!r) return;
    addCoins(r.coins, `Kabile sandığı: ${c.name}`);
    showAlert(`${c.name} açıldı 🎉`, `Kazandın: ${chestRewardText(r)}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Görev Merkezi"
        right={
          <Pressable style={[styles.pill, checkedIn && { opacity: 0.6 }]} onPress={() => !checkedIn && claim(CHECKIN)} accessibilityLabel="Kabile yoklaması">
            <Text style={styles.pillText}>{checkedIn ? 'Yoklama alındı' : 'Yoklama ver'}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Pressable onPress={() => router.push(KABILE_ROUTES.kasa)}>
          <LinearGradient colors={['#0B3B4A', '#831843']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.treasury}>
            <View style={styles.treasureBadge}>
              <Text style={styles.treasureLabel}>Kabile Hazinesi</Text>
              <Text style={styles.treasureValue}>🔮 {fmt(treasure)}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.small}>
                {tl.next ? `Seviye ${tl.lvl + 1} altın sandığının kilidini açmak için 🔮 ${fmt(tl.next - treasure)} hazine puanı daha kazanın` : 'Hazine en yüksek seviyede'}
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${tl.next ? Math.min(100, Math.round((treasure / tl.next) * 100)) : 100}%` }]} />
              </View>
              <Text style={styles.small}>Toplam ⚔ {fmt(totalPower)}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <StateIcon name="shield-checkmark-outline" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#A5F3F5', fontWeight: '600' }}>Kabile haftalık savaş gücü</Text>
              <Text style={styles.bigPower}>⚔ {fmtK(weekly)}</Text>
            </View>
            <View style={styles.mineBox}>
              <Text style={styles.dim}>Katkım</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>⚔ {fmt(p.myPower)}</Text>
            </View>
          </View>
          <View style={styles.chests}>
            {KABILE_CHESTS.map((c) => {
              const claimed = p.chests.includes(c.id);
              const ready = weekly >= c.need;
              return (
                <Pressable key={c.id} style={styles.chest} onPress={() => openChest(c.id)} accessibilityLabel={`${c.name}: ${chestRewardText(c.reward)}`}>
                  <View style={[styles.dot, ready && { backgroundColor: colors.primary }]} />
                  <Text style={{ fontSize: 30 }}>{c.emoji}</Text>
                  <Text style={styles.chestNeed}>⚔ {fmtK(c.need)}</Text>
                  <Text style={styles.chestReward} numberOfLines={2}>
                    {chestRewardText(c.reward)}
                  </Text>
                  <View style={[styles.alBtn, !ready && { backgroundColor: colors.cardAlt }, claimed && { backgroundColor: colors.border }]}>
                    <Text style={styles.btnText}>{claimed ? 'Alındı' : ready ? 'Al' : '🔒'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.dim}>Sandık içerikleri sabittir; rastgele ödül yoktur. Her sandık haftada bir kez alınır ve en az ⚔ {CHEST_MIN_CONTRIBUTION} kişisel katkı gerekir.</Text>
        </Card>

        <Card style={[styles.row, { gap: 10 }]}>
          <Avatar uri={me.avatar} size={40} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.row}>
              <Text style={styles.lvChip}>Lv.{contrib.cur.lv}</Text>
              <Text style={{ color: colors.green, fontWeight: '700' }}>{contrib.cur.name}</Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { backgroundColor: colors.green, width: `${contrib.next ? Math.round(((p.myPower - contrib.cur.min) / (contrib.next.min - contrib.cur.min)) * 100) : 100}%` }]} />
            </View>
            <Text style={styles.dim}>{contrib.next ? `Lv.${contrib.next.lv} ${contrib.next.name} için ⚔ ${contrib.next.min - p.myPower} katkı daha` : 'En yüksek katkı seviyesi'}</Text>
          </View>
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={styles.title}>Günlük Görev</Text>
          <Text style={styles.dim}>Görevler her gün saat 0:00&apos;da yenilenir (UTC+3)</Text>
          {KABILE_TASKS.map((t) => (
            <TaskRow key={t.id} task={t} p={p} counters={counters} onGo={() => go(t)} onClaim={() => claim(t)} meAvatar={me.avatar} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({ task, p, counters, onGo, onClaim, meAvatar }: { task: KabileTask; p: KabileProgress; counters: Counters; onGo: () => void; onClaim: () => void; meAvatar: string }) {
  const prog = taskProgress(task, p, counters);
  const measured = task.source === 'roomMinutes' || task.source === 'giftsSent' || task.source === 'roomGiftCoins';
  const waiting = measured && p.baselines[task.source] === undefined;
  const mineDone = prog.claimed || prog.steps > 0;
  const label = prog.claimed ? 'Tamamlandı' : task.source === 'checkIn' ? 'Yoklama ver' : prog.claimable ? (task.kind === 'rate' ? `Al +${prog.newSteps * task.power}` : 'Al') : 'Git';
  return (
    <View style={styles.task}>
      <View style={styles.row}>
        <View style={styles.taskIcon}>
          <Text style={{ fontSize: 24 }}>{task.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {task.kind === 'count' ? (
            <Text style={styles.reward}>
              ⚔+{task.power} 🔮+{task.treasure}
              <Text style={styles.dim}>
                {'  '}
                {task.source === 'checkIn' ? '' : `${prog.value}/${task.goal}${task.source === 'roomMinutes' ? ' dk' : ''}`}
              </Text>
            </Text>
          ) : (
            <Text style={styles.rateText}>
              Her {task.per} 🪙 için +{task.power} Güç Puanı ({fmt(prog.value)} 🪙 / Sınırsız)
            </Text>
          )}
          {waiting && !prog.claimed && <Text style={styles.hint}>“Git”e dokunduktan sonraki etkinliğin sayılır (demo).</Text>}
        </View>
        <Pressable
          disabled={prog.claimed}
          onPress={prog.claimable ? onClaim : onGo}
          style={[styles.taskBtn, prog.claimable && { backgroundColor: colors.primary }, prog.claimed && { backgroundColor: colors.border }]}
          accessibilityLabel={`${task.title}: ${label}`}>
          <Text style={styles.btnText}>{label}</Text>
        </Pressable>
      </View>
      <View style={styles.doneRow}>
        <Text style={styles.dim}>Tamamlandı:</Text>
        {mineDone && <Avatar uri={meAvatar} size={22} />}
        {task.doneBy.map((id) => (
          <Avatar key={id} uri={userById(id).avatar} size={22} />
        ))}
        <Text style={styles.doneCount}>{task.doneCount + Number(mineDone)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '800', fontSize: 17 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  small: { color: '#fff', fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  treasury: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  treasureBadge: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.gold },
  treasureLabel: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  treasureValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  bar: { height: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
  bigPower: { color: '#fff', fontSize: 26, fontWeight: '900' },
  mineBox: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  chests: { flexDirection: 'row', gap: 8 },
  chest: { flex: 1, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  chestNeed: { color: '#A5F3F5', fontSize: 12, fontWeight: '800' },
  chestReward: { color: colors.textDim, fontSize: 11, textAlign: 'center', minHeight: 26 },
  alBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, minWidth: 54, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  lvChip: { color: '#fff', fontWeight: '800', fontSize: 12, backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  task: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12, gap: 8, marginTop: 6 },
  taskIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(19,217,223,0.2)', alignItems: 'center', justifyContent: 'center' },
  taskTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  reward: { color: '#A5F3F5', fontWeight: '700', fontSize: 13 },
  rateText: { color: '#A5F3F5', fontSize: 12, lineHeight: 17 },
  hint: { color: colors.textDim, fontSize: 12, fontStyle: 'italic' },
  taskBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 74, alignItems: 'center' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  doneCount: { color: colors.textDim, fontWeight: '800', fontSize: 12, marginLeft: 4 },
});
