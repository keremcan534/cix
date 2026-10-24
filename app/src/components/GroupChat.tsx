import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmojiPanel } from '@/components/EmojiPanel';
import { Avatar } from '@/components/ui';
import { userById, type User } from '@/data/mock';
import type { GroupMsg } from '@/store';
import { colors } from '@/theme';

/** Members-only group chat with online/offline lists (agency and family chats). */
export function GroupChat({
  members,
  messages,
  onSend,
  pinned,
  lastActive,
}: {
  members: User[];
  messages: GroupMsg[];
  onSend: (text: string) => void;
  pinned?: string;
  lastActive: (u: User) => string;
}) {
  const [tab, setTab] = useState<'chat' | 'members'>('chat');
  const [draft, setDraft] = useState('');
  const [emoji, setEmoji] = useState(false);
  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);

  const send = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
    setEmoji(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.segment}>
        {(
          [
            ['chat', '💬 Sohbet'],
            ['members', `👥 Üyeler (${online.length} çevrimiçi)`],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
            <Text style={styles.segText}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'members' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }}>
          <Text style={styles.section}>Çevrimiçi ({online.length})</Text>
          {online.map((u) => (
            <MemberRow key={u.id} u={u} note="Çevrimiçi" />
          ))}
          <Text style={[styles.section, { marginTop: 10 }]}>Çevrimdışı ({offline.length})</Text>
          {offline.map((u) => (
            <MemberRow key={u.id} u={u} note={`Son aktif: ${lastActive(u)}`} />
          ))}
          <Text style={styles.dim}>Son aktif zamanı, kullanıcının gizlilik tercihine göre gösterilir.</Text>
        </ScrollView>
      ) : (
        <>
          {pinned && (
            <View style={styles.pinned}>
              <Ionicons name="pin" size={14} color={colors.gold} />
              <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>{pinned}</Text>
            </View>
          )}
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => {
              const u = userById(item.userId);
              const mine = item.userId === 'me';
              return (
                <View style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
                  <Pressable onPress={() => !mine && router.push(`/kullanici/${u.id}`)}>
                    <Avatar uri={u.avatar} size={30} />
                  </Pressable>
                  <View style={[styles.bubble, mine && { backgroundColor: colors.primary }]}>
                    {!mine && (
                      <Pressable onPress={() => router.push(`/kullanici/${u.id}`)}>
                        <Text style={styles.name}>{u.name}</Text>
                      </Pressable>
                    )}
                    <Text style={{ color: '#fff' }}>{item.text}</Text>
                    <Text style={styles.time}>{item.time}</Text>
                  </View>
                </View>
              );
            }}
          />
          {emoji && <EmojiPanel onPick={(e) => setDraft((d) => d + e)} />}
          <View style={styles.inputRow}>
            <Pressable onPress={() => setEmoji((v) => !v)} accessibilityLabel="Emoji">
              <Ionicons name={emoji ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
            </Pressable>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} placeholder="Gruba yaz..." placeholderTextColor={colors.textDim} style={styles.input} returnKeyType="send" />
            <Pressable onPress={send} style={styles.send} accessibilityLabel="Gönder">
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function MemberRow({ u, note }: { u: User; note: string }) {
  return (
    <Pressable style={styles.member} onPress={() => router.push(`/kullanici/${u.id}`)}>
      <Avatar uri={u.avatar} size={38} online={u.online} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{u.name}</Text>
        <Text style={styles.dim}>{note}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 4 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  section: { color: colors.textDim, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  dim: { color: colors.textDim, fontSize: 12 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 6, backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: 10, padding: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '75%', gap: 2 },
  name: { color: '#C4B5FD', fontWeight: '700', fontSize: 12 },
  time: { color: 'rgba(255,255,255,0.55)', fontSize: 10, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minWidth: 0, backgroundColor: colors.card, color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  send: { backgroundColor: colors.pink, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
