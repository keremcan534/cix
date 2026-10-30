// "İlk adımlar": a short path for new people on the home tab. Every step is something that makes the
// app click (join a room, greet someone, send a first gift); progress comes from real app state, and
// finishing all of them pays a one-time reward. Closable; disappears once the reward is claimed.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { RewardBurst } from '@/components/fx/reward';
import { DepthCard } from '@/components/fx/surface';
import { Icon3D, type Icon3DName } from '@/components/Icon3D';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const REWARD = 300;

type Step = { key: string; icon: Icon3DName; title: string; done: boolean; href: Href };

export function StarterPath() {
  const { me, recentRooms, stats, following, checkedInToday, starter, claimStarter, hideStarter, settings } = useApp();
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  if (starter.hidden || (starter.claimed && !celebrate)) return null;

  const steps: Step[] = [
    { key: 'interests', icon: 'heart', title: 'İlgi alanlarını seç', done: (me.interests?.length ?? 0) >= 2, href: '/kullanici/me' },
    { key: 'room', icon: 'mic', title: 'Bir odaya katıl', done: recentRooms.length > 0, href: '/oda/r1' },
    { key: 'greet', icon: 'chat', title: 'Birine selam ver', done: stats.greetings > 0, href: '/(tabs)/kesfet' },
    { key: 'follow', icon: 'crown', title: 'Birini takip et', done: following.size >= 2, href: '/(tabs)/kesfet' },
    { key: 'gift', icon: 'gift', title: 'İlk hediyeni gönder', done: stats.giftsSent > 0, href: '/oda/r1' },
    { key: 'checkin', icon: 'tasks', title: 'Günlük ödülünü al', done: checkedInToday, href: '/gorevler' },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  const shown = open ? steps : next ? [next] : [];

  return (
    <DepthCard style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>İlk adımlar</Text>
        <Text style={s.count}>
          {doneCount}/{steps.length}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityLabel={open ? 'Adımları gizle' : 'Tüm adımları göster'}>
          <Text style={s.link}>{open ? 'Gizle' : 'Tümü'}</Text>
        </Pressable>
        <Pressable onPress={hideStarter} hitSlop={8} accessibilityLabel="İlk adımlar kartını kapat">
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>

      {shown.map((x) => (
        <Pressable key={x.key} style={s.row} onPress={() => !x.done && router.push(x.href)} disabled={x.done} accessibilityLabel={`${x.title}${x.done ? ', tamamlandı' : ''}`}>
          <Icon3D name={x.icon} size={30} style={x.done ? { opacity: 0.45 } : undefined} />
          <Text style={[s.stepText, x.done && s.stepDone]} numberOfLines={1}>
            {x.title}
          </Text>
          {x.done ? <Ionicons name="checkmark-circle" size={22} color={semantic.success} /> : <Text style={s.go}>Git →</Text>}
        </Pressable>
      ))}

      {!next && !starter.claimed && (
        <Pressable
          style={s.claim}
          onPress={() => {
            claimStarter(REWARD);
            setCelebrate(true);
          }}
          accessibilityLabel={`${REWARD} jeton ödülü al`}
        >
          <Icon3D name="coin" size={22} />
          <Text style={s.claimText}>Hepsi tamam! {REWARD} jetonu al</Text>
        </Pressable>
      )}
      {next && <Text style={s.hint}>Hepsini bitirince 🪙 {REWARD} hediye</Text>}

      <Modal visible={celebrate} transparent animationType="fade" onRequestClose={() => setCelebrate(false)}>
        {celebrate && <RewardBurst reward={{ icon: 'trophy', title: 'İlk adımları tamamladın!', amount: REWARD }} still={settings.reduceMotion} onDone={() => setCelebrate(false)} />}
      </Modal>
    </DepthCard>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  count: { color: semantic.action, fontWeight: '800', fontSize: 13 },
  link: { color: semantic.tonalText, fontWeight: '700', fontSize: 13, marginRight: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: semantic.action, boxShadow: '0 0 8px rgba(19,217,223,0.8)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  stepText: { color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 },
  stepDone: { color: colors.textDim, textDecorationLine: 'line-through' },
  go: { color: semantic.action, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.textDim, fontSize: 12 },
  claim: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: semantic.money, borderRadius: 999, paddingVertical: 11 },
  claimText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 15 },
});
