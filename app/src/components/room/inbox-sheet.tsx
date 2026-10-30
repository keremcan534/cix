// Messages inside the room: the conversation list and a reply thread in a sheet, so a user can answer
// a DM without leaving the room (the room keeps playing behind it). Same rules as the Mesajlar tab:
// blocked people are hidden and every reply goes through ChatThread.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { ChatThread } from '@/components/chat-thread';
import { messagePreview } from '@/components/ReactionArt';
import { Avatar, VerifiedBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

/** Unread DMs from people I have not blocked: the badge on the room's messages button. */
export function useInboxUnread() {
  const { conversations, blocked } = useApp();
  return conversations.reduce((n, c) => (blocked.has(c.userId) ? n : n + c.unread), 0);
}

export function InboxSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { conversations, blocked } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const convs = conversations.filter((c) => !blocked.has(c.userId));
  const close = () => {
    setOpenId(null);
    onClose();
  };
  const user = openId ? userById(openId) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => (openId ? setOpenId(null) : close())}>
      <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Kapat" />
      <View style={s.sheet}>
        <View style={s.handle} />
        {user ? (
          <ChatThread
            key={user.id}
            user={user}
            compact
            header={(typing) => (
              <View style={s.head}>
                <Pressable onPress={() => setOpenId(null)} hitSlop={10} accessibilityLabel="Mesajlara dön">
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </Pressable>
                <Avatar uri={user.avatar} size={34} online={user.online} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={s.name} numberOfLines={1}>
                      {user.name}
                    </Text>
                    {user.verified && <VerifiedBadge />}
                  </View>
                  <Text style={s.dim}>{typing ? 'yazıyor...' : user.online ? 'Çevrimiçi' : user.city}</Text>
                </View>
                <Pressable onPress={close} hitSlop={10} accessibilityLabel="Kapat">
                  <Ionicons name="close" size={24} color={colors.textDim} />
                </Pressable>
              </View>
            )}
          />
        ) : (
          <>
            <View style={s.head}>
              <Text style={[s.name, { flex: 1, fontSize: 17 }]}>Mesajlar</Text>
              <Pressable
                onPress={() => {
                  close();
                  router.push('/mesajlar');
                }}
                hitSlop={8}
                accessibilityLabel="Tüm mesajlar"
              >
                <Text style={s.link}>Tümü</Text>
              </Pressable>
              <Pressable onPress={close} hitSlop={10} accessibilityLabel="Kapat">
                <Ionicons name="close" size={24} color={colors.textDim} />
              </Pressable>
            </View>
            <Text style={[s.dim, { paddingHorizontal: 16 }]}>Odadan çıkmadan cevap ver; oda arkada devam eder.</Text>
            <FlatList
              data={convs}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              ListEmptyComponent={<Text style={[s.dim, { textAlign: 'center', paddingTop: 40 }]}>Henüz mesajın yok.</Text>}
              renderItem={({ item }) => {
                const u = userById(item.userId);
                const last = item.messages[item.messages.length - 1];
                return (
                  <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]} onPress={() => setOpenId(u.id)} accessibilityLabel={`${u.name} ile sohbet`}>
                    <View>
                      <Avatar uri={u.avatar} size={46} online={u.online} />
                      {item.unread > 0 && (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>
                          {u.name}
                        </Text>
                        {last && <Text style={s.time}>{last.time}</Text>}
                      </View>
                      <Text style={[s.dim, item.unread > 0 && { color: '#fff' }]} numberOfLines={1}>
                        {last ? `${last.fromMe ? 'Sen: ' : ''}${messagePreview(last.text)}` : 'Sohbete başla'}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.55)' },
  sheet: {
    height: '78%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 12 },
  link: { color: semantic.action, fontWeight: '700', fontSize: 14, marginRight: 6 },
  time: { color: colors.textDim, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  badge: { position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: semantic.social, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
