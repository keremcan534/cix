import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Art, type ArtName } from '@/components/Art';
import { EmojiPanel } from '@/components/EmojiPanel';
import { MessageText } from '@/components/ReactionArt';
import { stickerIdOf } from '@/lib/stickers';
import { Avatar } from '@/components/ui';
import { roomById, userById, type User } from '@/data/mock';
import { followRoute, presenceLabel, presenceOf } from '@/data/presence';
import type { GroupMsg } from '@/store';
import { colors } from '@/theme';

export type QuickAction = { key: string; label: string; emoji: string; art?: ArtName; tag?: string; onPress: () => void };

/** Open the room a member is in (asks for the password if locked) and announce whom we followed. */
export const goToMember = (u: User) => {
  const p = presenceOf(u.id);
  if (p?.kind === 'room') router.push(followRoute(p.roomId, u.id));
  else router.push(`/kullanici/${u.id}`);
};

/** Members-only group chat (agency and family/tribe chats) with live presence of members. */
export function GroupChat({
  members,
  messages,
  onSend,
  pinned,
  lastActive,
  roomId,
  quickActions,
  onGift,
}: {
  members: User[];
  messages: GroupMsg[];
  onSend: (text: string) => void;
  pinned?: string;
  lastActive: (u: User) => string;
  /** The group's own room, pinned under the announcement. */
  roomId?: string;
  quickActions?: QuickAction[];
  onGift?: () => void;
}) {
  const [tab, setTab] = useState<'chat' | 'members'>('chat');
  const [draft, setDraft] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [pinOpen, setPinOpen] = useState(true);
  // In-room members first, then online, then the rest.
  const ranked = [...members].sort((a, b) => Number(presenceOf(b.id)?.kind === 'room') - Number(presenceOf(a.id)?.kind === 'room') || Number(b.online) - Number(a.online));
  const online = ranked.filter((m) => m.online || presenceOf(m.id));
  const offline = ranked.filter((m) => !m.online && !presenceOf(m.id));
  const room = roomId ? roomById(roomId) : null;

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
            <MemberRow key={u.id} u={u} note={presenceLabel(presenceOf(u.id), u.online)} />
          ))}
          <Text style={[styles.section, { marginTop: 10 }]}>Çevrimdışı ({offline.length})</Text>
          {offline.map((u) => (
            <MemberRow key={u.id} u={u} note={`Son aktif: ${lastActive(u)}`} />
          ))}
          <Text style={styles.dim}>Hangi odada olduğu ve son aktif zamanı, kullanıcının gizlilik tercihine göre gösterilir. Odadaki üyeye dokunarak yanına gidebilirsin.</Text>
        </ScrollView>
      ) : (
        <>
          {pinOpen && (pinned || room) && (
            <View style={styles.pinBox}>
              {pinned && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>📣</Text>
                  <Text style={{ color: '#fff', fontSize: 13, flex: 1 }} numberOfLines={2}>
                    {pinned}
                  </Text>
                  <Pressable onPress={() => setPinOpen(false)} hitSlop={8} accessibilityLabel="Duyuruyu gizle">
                    <Ionicons name="close" size={16} color={colors.textDim} />
                  </Pressable>
                </View>
              )}
              {room && (
                <Pressable style={styles.roomCard} onPress={() => router.push(`/oda/${room.id}`)} accessibilityLabel="Grup odası">
                  <Image source={{ uri: room.cover }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>
                      {room.password ? '🔒 ' : ''}
                      {room.title}
                    </Text>
                    <Text style={styles.dim}>🎙️ {room.listeners} kişi · {userById(room.hostId).name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                </Pressable>
              )}
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={{ flexGrow: 0, flexShrink: 0 }}>
            {online.map((u) => {
              const p = presenceOf(u.id);
              return (
                <Pressable key={u.id} style={{ alignItems: 'center', width: 64 }} onPress={() => goToMember(u)} accessibilityLabel={`${u.name} ${presenceLabel(p, u.online)}`}>
                  <Avatar uri={u.avatar} size={44} />
                  <Text style={[styles.chip, p?.kind === 'room' ? styles.chipParty : p?.kind === 'call' ? styles.chipBusy : null]} numberOfLines={1}>
                    {p?.kind === 'room' ? '🎉 Partide' : p?.kind === 'call' ? '📞 Görüşmede' : '💬 Çevrimiçi'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => <Message item={item} />}
          />
          {quickActions && quickActions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 6 }} style={{ flexGrow: 0, flexShrink: 0 }}>
              {quickActions.map((a) => (
                <Pressable key={a.key} style={styles.quick} onPress={a.onPress} accessibilityLabel={a.label}>
                  {a.tag && <Text style={styles.quickTag}>{a.tag}</Text>}
                  {a.art ? <Art name={a.art} size={19} /> : <Text style={{ fontSize: 15 }}>{a.emoji}</Text>}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{a.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {emoji && (
            <EmojiPanel
              onPick={(e) => {
                // A sticker goes out on its own; an emoji is typed into the draft.
                if (!stickerIdOf(e)) return setDraft((d) => d + e);
                onSend(e);
                setEmoji(false);
              }}
            />
          )}
          <View style={styles.inputRow}>
            <Pressable onPress={() => setEmoji((v) => !v)} accessibilityLabel="Emoji">
              <Ionicons name={emoji ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
            </Pressable>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} placeholder="Mesaj yaz…" placeholderTextColor={colors.textDim} style={styles.input} returnKeyType="send" />
            {onGift && (
              <Pressable onPress={onGift} accessibilityLabel="Hediye">
                <Text style={{ fontSize: 24 }}>🎁</Text>
              </Pressable>
            )}
            <Pressable onPress={send} style={styles.send} accessibilityLabel="Gönder">
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Message({ item }: { item: GroupMsg }) {
  if (item.system)
    return (
      <View style={styles.system}>
        <Text style={styles.systemText}>{item.text}</Text>
        {item.actionLabel && item.actionHref && (
          <Pressable onPress={() => router.push(item.actionHref as Href)}>
            <Text style={{ color: '#A5F3F5', fontWeight: '800', marginTop: 4 }}>{item.actionLabel}</Text>
          </Pressable>
        )}
      </View>
    );
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
        <MessageText text={item.text} style={{ color: '#fff' }} />
        <Text style={styles.time}>{item.time}</Text>
      </View>
    </View>
  );
}

function MemberRow({ u, note }: { u: User; note: string }) {
  const p = presenceOf(u.id);
  return (
    <Pressable style={styles.member} onPress={() => router.push(`/kullanici/${u.id}`)}>
      <Avatar uri={u.avatar} size={38} online={u.online} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{u.name}</Text>
        <Text style={[styles.dim, p?.kind === 'room' && { color: colors.gold }]}>
          {p?.kind === 'room' && p.locked ? '🔒 ' : ''}
          {note}
        </Text>
      </View>
      {p?.kind === 'room' ? (
        <Pressable style={styles.goBtn} onPress={() => goToMember(u)} accessibilityLabel={`${u.name} odasına git`}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Git</Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      )}
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
  pinBox: { marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(19,217,223,0.15)', borderRadius: 12, padding: 10, gap: 8 },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: 'rgba(19,217,223,0.5)' },
  strip: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { marginTop: -8, fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: '#16A34A', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', maxWidth: 64 },
  chipParty: { backgroundColor: '#0FB8BE' },
  chipBusy: { backgroundColor: '#F59E0B' },
  system: { alignSelf: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 12, maxWidth: '90%', alignItems: 'center' },
  systemText: { color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '75%', gap: 2 },
  name: { color: '#A5F3F5', fontWeight: '700', fontSize: 12 },
  time: { color: 'rgba(255,255,255,0.55)', fontSize: 11, alignSelf: 'flex-end' },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  quickTag: { position: 'absolute', top: -9, right: 8, color: colors.gold, fontSize: 11, fontWeight: '800', fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minWidth: 0, backgroundColor: colors.card, color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  send: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  goBtn: { backgroundColor: '#0FB8BE', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
});
