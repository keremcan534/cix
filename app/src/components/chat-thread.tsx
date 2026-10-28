// One-to-one chat: the message list, the notices (blocked, not allowed, coin price) and the composer
// with all sending rules. Used by the full chat screen and by the in-room messages sheet, so a reply
// sent from inside a room follows exactly the same rules as one sent from the Mesajlar tab.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmojiPanel } from '@/components/EmojiPanel';
import { MessageText } from '@/components/ReactionArt';
import { Avatar } from '@/components/ui';
import { BOT_LINES, DM_PRICE, FOLLOWS_ME, type RoomInviteCard, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { checkInteraction } from '@/lib/interaction';
import { incomingWarning, outgoingWarning, scanMessage } from '@/lib/safety';
import { useApp } from '@/store';
import { colors, gradientDeep } from '@/theme';

export function ChatThread({ user, header, compact }: { user: User; /** Rendered above the thread; gets the "typing…" state. */ header: (typing: boolean) => ReactNode; /** Smaller intro, for sheets. */ compact?: boolean }) {
  const { conversations, sendMessage, markRead, following, toggleFollow, blocked, toggleBlock, spendCoins, createTicket, logSafety, me } = useApp();
  const allowed = checkInteraction('message', user, { blocked, following, myAge: me.age });
  const mutual = following.has(user.id) && FOLLOWS_ME.has(user.id);
  const isBlocked = blocked.has(user.id);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const convo = conversations.find((c) => c.userId === user.id);
  const messages = convo?.messages ?? [];
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    markRead(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, messages.length]);

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  // Index of the other person's latest message: everything I sent before it counts as read.
  const lastTheirs = messages.map((m) => m.fromMe).lastIndexOf(false);

  const send = (checked = false) => {
    const text = draft.trim();
    if (!text || isBlocked) return;
    if (!allowed.ok) return showAlert('Mesaj gönderilemiyor', allowed.reason);
    const warning = checked ? null : outgoingWarning(scanMessage(text));
    if (warning) {
      showAlert('Kişisel bilgi paylaşıyorsun', warning, [
        { text: 'Düzenle', style: 'cancel' },
        { text: 'Yine de gönder', onPress: () => send(true) },
      ]);
      return;
    }
    // Mutual follow chats are free; otherwise each message costs coins (price shown before sending).
    if (!mutual && !spendCoins(DM_PRICE, `Mesaj: ${user.name}`)) {
      showAlert('Yetersiz jeton', `Karşılıklı takip olmadan mesaj başı ${DM_PRICE} jeton.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    sendMessage(user.id, text);
    setEmojiOpen(false);
    setDraft('');
    // Fake reply so the prototype feels real.
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      setTyping(false);
      sendMessage(user.id, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)], false);
    }, 1500);
  };

  return (
    <>
      {header(typing)}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: compact ? 12 : 16, gap: 8 }}
          ListFooterComponent={
            <View style={[styles.intro, compact && { paddingVertical: 12 }]}>
              <Avatar uri={user.avatar} size={compact ? 52 : 72} ring />
              <Text style={styles.introName}>
                {user.name}, {user.age}
              </Text>
              <Text style={styles.status}>{user.bio}</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.fromMe ? (
              <LinearGradient colors={gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bubble, styles.mine]}>
                <MessageText text={item.text} style={styles.bubbleText} />
                {item.room && <RoomCard room={item.room} />}
                <Text style={styles.time}>
                  {item.time}{' '}
                  <Text style={{ color: messages.indexOf(item) < lastTheirs ? '#7DD3FC' : 'rgba(255,255,255,0.7)' }}>✓✓</Text>
                </Text>
              </LinearGradient>
            ) : (
              <View style={{ gap: 6 }}>
                <View style={[styles.bubble, styles.theirs]}>
                  <MessageText text={item.text} style={styles.bubbleText} />
                  {item.room && <RoomCard room={item.room} />}
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                <SafetyNote
                  text={item.text}
                  onReport={() => {
                    const no = createTicket('Şikâyet', `${user.name} (${user.id}) · Şüpheli mesaj: "${item.text}"`);
                    logSafety('Şikâyet etti', user.id, `Şüpheli mesaj · #${no}`);
                    showAlert('Bildirildi', `Talep #${no}. Moderasyon ekibi mesajı inceleyecek.`, [
                      { text: 'Tamam', style: 'cancel' },
                      { text: `${user.name} kişisini engelle`, style: 'destructive', onPress: () => !isBlocked && toggleBlock(user.id) },
                    ]);
                  }}
                />
              </View>
            )
          }
        />
        {isBlocked ? (
          <Text style={styles.notice}>Bu kullanıcıyı engelledin; mesaj gönderemezsin.</Text>
        ) : !allowed.ok ? (
          <Text style={[styles.notice, { color: colors.gold, textAlign: 'center' }]}>{allowed.reason}</Text>
        ) : (
          !mutual && (
            <Pressable style={styles.notice} onPress={() => toggleFollow(user.id)}>
              <Text style={{ color: colors.gold, fontSize: 12, textAlign: 'center' }}>
                Karşılıklı takip değilsiniz · mesaj başı 🪙 {DM_PRICE}. {following.has(user.id) ? `${user.name} seni takip etmiyor.` : 'Takip et → karşılıklıysa ücretsiz.'}
              </Text>
            </Pressable>
          )
        )}
        {emojiOpen && <EmojiPanel onPick={(e) => setDraft((d) => d + e)} />}
        <View style={styles.inputRow}>
          <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel="Emoji" hitSlop={6}>
            <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => send()}
            placeholder="Mesaj yaz..."
            placeholderTextColor={colors.textDim}
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable onPress={() => send()} accessibilityLabel="Gönder">
            <LinearGradient colors={gradientDeep} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

/** Room invite sent from a room's "Paylaş": opens the room. */
function RoomCard({ room }: { room: RoomInviteCard }) {
  return (
    <Pressable onPress={() => router.push(`/oda/${room.roomId}`)} style={styles.roomCard} accessibilityRole="button" accessibilityLabel={`${room.title} odasına katıl`}>
      <Image source={{ uri: room.cover }} style={styles.roomCover} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.roomTitle} numberOfLines={1}>
          {room.title}
        </Text>
        <Text style={styles.roomJoin}>🎙️ Odaya katıl</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </Pressable>
  );
}

function SafetyNote({ text, onReport }: { text: string; onReport: () => void }) {
  const warning = incomingWarning(scanMessage(text));
  if (!warning) return null;
  return (
    <View style={styles.safety} accessibilityRole="alert">
      <Ionicons name="shield-half" size={18} color={colors.gold} />
      <Text style={styles.safetyText}>{warning}</Text>
      <Pressable onPress={onReport} hitSlop={6} accessibilityLabel="Şüpheli mesajı bildir">
        <Text style={styles.safetyLink}>Bildir</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '88%', backgroundColor: 'rgba(246,189,96,0.12)', borderColor: 'rgba(246,189,96,0.4)', borderWidth: 1, borderRadius: 12, padding: 10 },
  safetyText: { color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
  safetyLink: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  status: { color: colors.textDim, fontSize: 12 },
  intro: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  introName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.cardAlt, borderBottomLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 15 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', minWidth: 200 },
  roomCover: { width: 44, height: 44, borderRadius: 10 },
  roomTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  roomJoin: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  notice: { paddingHorizontal: 16, paddingVertical: 6, color: colors.textDim, textAlign: 'center', fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
