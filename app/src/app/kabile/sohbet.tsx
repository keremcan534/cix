import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { GroupChat, type QuickAction } from '@/components/GroupChat';
import { GradientButton } from '@/components/ui';
import { CHAT_GIFT_IDS, KABILE_ROUTES, findKabile, kabile, kabileMemberIds, kabileMeta } from '@/data/kabile';
import { GIFTS, userById, type Gift } from '@/data/mock';
import { presenceOf } from '@/data/presence';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { useApp, type GroupMsg } from '@/store';
import { colors } from '@/theme';

const LAST_ACTIVE = ['5 dk önce', '40 dk önce', 'Dün 21:15', '2 gün önce', '6 gün önce'];
const CHAT_GIFTS = CHAT_GIFT_IDS.map((id) => GIFTS.find((g) => g.id === id)).filter((g): g is Gift => !!g);

const QUICK: QuickAction[] = [
  { key: 'iliski', label: 'İlişki Meydanı', emoji: '💞', onPress: () => router.push(KABILE_ROUTES.iliski) },
  { key: 'merkez', label: 'Kabile Merkezi', emoji: '🎯', tag: 'ücretsiz', onPress: () => router.push(KABILE_ROUTES.merkez) },
  { key: 'kasa', label: 'Kabile Kasası', emoji: '💰', onPress: () => router.push(KABILE_ROUTES.kasa) },
];

export default function KabileChat() {
  const { familyId, me, familyChat, sendFamilyMessage, familyMuted, setFamilyMuted, spendCoins } = useApp();
  const [menu, setMenu] = useState(false);
  const [gifts, setGifts] = useState(false);
  const family = findKabile(familyId);

  if (!family)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.locked}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
          <Text style={styles.title}>Kabile sohbetine sadece kabile üyeleri erişebilir</Text>
          <GradientButton title="Kabile bul" onPress={() => router.replace(KABILE_ROUTES.profile)} />
        </View>
      </SafeAreaView>
    );

  const meta = kabileMeta(family.id);
  const members = kabileMemberIds(family).map((id) => (id === 'me' ? me : userById(id)));
  const onlineShown = members.filter((u) => u.online || presenceOf(u.id)).length;
  const online = Math.max(meta.online, onlineShown);
  // Local system message shown on top of the stored chat (the store is not modified).
  const welcome: GroupMsg = {
    id: 'kabile-welcome',
    userId: 'system',
    text: `Hoş geldin @${me.name}! Kabilemize katıldığın için mutluyuz. Bu sıcak kabile ailemize hoş geldin. Günlük görevlerini tamamlamayı unutma~`,
    time: '',
    system: true,
    actionLabel: 'Tamamlamaya git',
    actionHref: '/kabile/merkez',
  };

  const send = (text: string) => {
    sendFamilyMessage(text);
    kabile.trackChatMessage();
  };

  const sendGift = (g: Gift) => {
    if (!spendCoins(g.price, `Kabile sohbeti hediyesi: ${g.name}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    kabile.trackChatGift(g.price);
    sendFamilyMessage(`🎁 Kabileye ${g.emoji} ${g.name} gönderdi (${g.price} 🪙)`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(KABILE_ROUTES.profile)} accessibilityLabel="Kabile profili">
          <Text style={styles.headerTitle} numberOfLines={1}>
            {family.emoji} {family.name}({family.members})
          </Text>
          <Text style={styles.headerSub}>
            📶 {online} kişi çevrimiçi{familyMuted ? ' · 🔕' : ''}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push(KABILE_ROUTES.kasa)} style={styles.iconBtn} accessibilityLabel="Kabile Kasası">
          <Text style={{ fontSize: 20 }}>💰</Text>
        </Pressable>
        <Pressable onPress={() => setMenu(true)} style={styles.iconBtn} accessibilityLabel="Menü">
          <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
        </Pressable>
      </View>
      <GroupChat
        members={members}
        messages={[welcome, ...familyChat]}
        onSend={send}
        pinned={`Kabile Duyurusu: ${meta.announcement}`}
        roomId={meta.roomId}
        lastActive={(u) => LAST_ACTIVE[Number(u.id.slice(1)) % LAST_ACTIVE.length] ?? LAST_ACTIVE[0]}
        quickActions={QUICK}
        onGift={() => setGifts(true)}
      />
      <ActionSheet
        visible={menu}
        title={family.name}
        onClose={() => setMenu(false)}
        options={[
          { label: familyMuted ? '🔔 Bildirimleri aç' : '🔕 Sohbeti sessize al', onPress: () => setFamilyMuted(!familyMuted) },
          { label: '🏰 Kabile profili', onPress: () => router.push(KABILE_ROUTES.profile) },
          { label: '🎯 Görev Merkezi', onPress: () => router.push(KABILE_ROUTES.merkez) },
          { label: '💰 Kabile Kasası', onPress: () => router.push(KABILE_ROUTES.kasa) },
          { label: '💞 İlişki Meydanı', onPress: () => router.push(KABILE_ROUTES.iliski) },
        ]}
      />
      <ActionSheet
        visible={gifts}
        title="Kabile sohbetine hediye · her 400 🪙 için +2 Güç Puanı"
        onClose={() => setGifts(false)}
        options={CHAT_GIFTS.map((g) => ({ label: `${g.emoji} ${g.name} · ${g.price} 🪙`, onPress: () => sendGift(g) }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: '#A5F3F5', fontSize: 12, fontWeight: '600', marginTop: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  locked: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
});
