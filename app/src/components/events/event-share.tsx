// Etkinlik Merkezi: sharing one event (§ 13). "Diğer uygulamalarla paylaş" opens the phone's share sheet with a short
// line and the links that open the event (lib/links: similarclub://?etkinlik=ID, and the web build), and "Arkadaşına
// gönder" sends it as a direct message to someone I follow or write to, the way a room is shared (components/room/
// community ShareRoomSheet). The message carries the event (server/api/messages.mjs): newer apps draw its card, older
// ones show the words. The demo keeps the message on this phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Avatar } from '@/components/ui';
import { USERS, isServerId, userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { eventMessageText, eventPath, eventShareText } from '@/lib/events';
import { shareLink } from '@/lib/links';
import { liveMode } from '@/lib/live';
import { liveDm } from '@/lib/live/messages';
import { useApp } from '@/store';
import { SCRIM, makeStyles, useTheme } from '@/theme';

export function EventShareSheet({ e, onClose }: { e: api.EventItem; onClose: () => void }) {
  const { following, conversations, blocked, sendMessage, markMessageSent, setMessageFailed } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const live = liveMode();
  const [query, setQuery] = useState('');
  // Sent during this opening.
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  // Live: the real people I follow or write to (never sample people); the demo: its own.
  const friends = live
    ? [...new Set([...following, ...conversations.map((c) => c.userId)])].filter((uid) => isServerId(uid) && !blocked.has(uid)).map(userById)
    : USERS.filter((u) => (following.has(u.id) || conversations.some((c) => c.userId === u.id)) && !blocked.has(u.id));
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const list = friends.filter((u) => !q || u.name.toLocaleLowerCase('tr-TR').includes(q));

  const send = (uid: string) => {
    const text = eventMessageText(e);
    const card = { id: e.id, title: e.title, startsAt: e.startsAt };
    setSent((s) => new Set(s).add(uid));
    if (!live) return sendMessage(uid, text, true, undefined, undefined, card);
    // My chat shows the card at once; the server keeps the message with its event.
    const ref = api.newRef();
    sendMessage(uid, text, true, undefined, ref, card);
    liveDm(
      uid,
      text,
      ref,
      (r) => {
        if (r.ok) return markMessageSent(uid, ref, r.message);
        setMessageFailed(uid, ref, r.reason, r.retry);
        setSent((s) => new Set([...s].filter((x) => x !== uid)));
        showAlert('Gönderilemedi', r.reason);
      },
      e.id,
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>Paylaş</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <Pressable onPress={() => shareLink(eventShareText(e), eventPath(e.id))} style={styles.external} accessibilityRole="button">
          <Ionicons name="share-social-outline" size={20} color={colors.primaryText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Diğer uygulamalarla paylaş</Text>
            <Text style={styles.dim}>Bağlantı etkinliği uygulamada açar.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
        <Text style={styles.label}>Arkadaşına gönder</Text>
        {friends.length > 4 && <TextInput value={query} onChangeText={setQuery} placeholder="Arkadaş ara" placeholderTextColor={colors.textDim} style={styles.input} maxLength={40} />}
        {friends.length === 0 && <Text style={styles.dim}>Takip ettiğin ya da mesajlaştığın kişiler burada görünür.</Text>}
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
          {list.map((u) => (
            <View key={u.id} style={styles.row}>
              <Avatar uri={u.avatar || undefined} name={u.name} size={36} />
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {u.name}
              </Text>
              {sent.has(u.id) ? (
                <Text style={styles.sent}>Gönderildi</Text>
              ) : (
                <Pressable onPress={() => send(u.id)} style={styles.small} accessibilityRole="button" accessibilityLabel={`${u.name} kişisine etkinliği gönder`}>
                  <Text style={styles.smallText}>Gönder</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, edge }) => ({
  // No veil over the screen behind (theme SCRIM): the sheet stands out by its own edge.
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10, ...edge.sheet },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  external: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  name: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
  sent: { color: semantic.success, fontSize: 12.5, fontWeight: '700' },
  small: { backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  smallText: { color: semantic.actionInk, fontWeight: '700', fontSize: 12.5 },
}));
