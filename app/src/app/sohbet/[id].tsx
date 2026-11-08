import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { useReport } from '@/components/report-sheet';
import { Text } from '@/components/text';
import { ChatThread } from '@/components/chat-thread';
import { CallButtons } from '@/components/one-on-one-bar';
import { Avatar, VerifiedBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { makeStyles, useTheme } from '@/theme';
import { goBack } from '@/lib/nav';
import { callsAvailable, liveCalls, liveMode, loadProfile } from '@/lib/live';
import { isLiveUser } from '@/lib/live/messages';
import { useApp } from '@/store';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = userById(id);
  const { colors } = useTheme();
  const styles = useStyles();
  const { blocked, toggleBlock, deleteConversation, createTicket, logSafety } = useApp();
  const report = useReport();
  const [menuOpen, setMenuOpen] = useState(false);
  // A live build only knows real people: a sample id (an old link) shows no sample name or photo.
  const missing = liveMode() && !isLiveUser(id);
  // A real person opened from a link or a notice is known only by id (or name) until the profile loads; the
  // screen draws again once it has (name, photo, age, city).
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (!isLiveUser(id)) return;
    let alive = true;
    loadProfile(id)
      .then(() => alive && setLoaded((n) => n + 1))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const isBlocked = blocked.has(user.id);
  const menu: SheetOption[] = [
    ...(missing
      ? []
      : [
          { label: 'Profili gör', icon: 'person-outline' as const, onPress: () => router.push(`/kullanici/${user.id}`) },
          {
            label: 'Şikâyet et',
            icon: 'flag-outline' as const,
            onPress: () =>
              report.start({ type: 'user', id: user.id, name: user.name, onBlock: isBlocked ? undefined : () => toggleBlock(user.id) }, () => {
                const no = createTicket('Şikâyet', `${user.name} (${user.id}) · Sohbetten şikâyet`);
                logSafety('Şikâyet etti', user.id, `Sohbet · #${no}`);
                showAlert('Bildirildi', `Talep #${no}. Moderasyon ekibi inceleyecek.`);
              }),
          },
          {
            label: isBlocked ? 'Engeli kaldır' : 'Engelle',
            icon: 'ban-outline' as const,
            destructive: !isBlocked,
            onPress: () =>
              isBlocked
                ? toggleBlock(user.id)
                : showAlert(`${user.name} engellensin mi?`, 'Sana mesaj gönderemez. Engeli istediğin zaman kaldırabilirsin.', [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Engelle', style: 'destructive', onPress: () => toggleBlock(user.id) },
                  ]),
          },
        ]),
    {
      label: 'Sohbeti sil',
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        showAlert('Sohbet silinsin mi?', 'Mesajlar yalnızca bu telefondan silinir. Yeni bir mesaj gelirse sohbet yeniden açılır.', [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: () => {
              deleteConversation(user.id);
              goBack();
            },
          },
        ]),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatThread
        user={user}
        header={(typing, pair) => (
          <View style={styles.header}>
            <Pressable onPress={() => goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Geri">
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/kullanici/${user.id}`)}
              disabled={missing}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel={missing ? 'Kullanıcı bulunamadı' : `${user.name} profilini aç`}
            >
              <Avatar uri={missing ? '' : user.avatar} size={38} online={!missing && user.online} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name}>{missing ? 'Kullanıcı bulunamadı' : user.name}</Text>
                  {!missing && user.verified && <VerifiedBadge />}
                </View>
                {!missing && <Text style={styles.status}>{typing ? 'yazıyor...' : user.online ? 'Çevrimiçi' : user.city}</Text>}
              </View>
            </Pressable>
            {!callsAvailable() ? (
              liveCalls() && pair && !isBlocked && <CallButtons userId={user.id} pair={pair} />
            ) : (
              <>
                <Pressable onPress={() => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'sesli' } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sesli ara">
                  <Ionicons name="call-outline" size={22} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'goruntulu' } })}
                  hitSlop={8}
                  style={{ marginLeft: 14 }}
                  accessibilityRole="button"
                  accessibilityLabel="Görüntülü ara"
                >
                  <Ionicons name="videocam-outline" size={24} color={colors.text} />
                </Pressable>
              </>
            )}
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={{ marginLeft: 6 }} accessibilityRole="button" accessibilityLabel="Sohbet seçenekleri">
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </Pressable>
          </View>
        )}
      />
      <ActionSheet visible={menuOpen} options={menu} onClose={() => setMenuOpen(false)} />
      {report.sheet}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  status: { color: colors.textDim, fontSize: 12 },
}));
