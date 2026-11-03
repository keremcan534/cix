// One-to-one chat: the message list, the notices (blocked, not allowed, coin price) and the composer
// with all sending rules. Used by the full chat screen and by the in-room messages sheet, so a reply
// sent from inside a room follows exactly the same rules as one sent from the Mesajlar tab.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { EmojiPanel } from '@/components/EmojiPanel';
import { MessageText } from '@/components/ReactionArt';
import { stickerIdOf } from '@/lib/stickers';
import { Avatar } from '@/components/ui';
import { Icon3D } from '@/components/Icon3D';
import { BOT_LINES, DM_PRICE, FOLLOWS_ME, type RoomInviteCard, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { checkInteraction } from '@/lib/interaction';
import { incomingWarning, outgoingWarning, scanMessage } from '@/lib/safety';
import { isLiveUser, liveDm } from '@/lib/live/messages';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';

export function ChatThread({ user, header, compact }: { user: User; /** Rendered above the thread; gets the "typing…" state. */ header: (typing: boolean) => ReactNode; /** Smaller intro, for sheets. */ compact?: boolean }) {
  const { conversations, sendMessage, markRead, following, toggleFollow, blocked, toggleBlock, spendCoins, createTicket, logSafety, me } = useApp();
  const { colors, gradientDeep } = useTheme();
  const styles = useStyles();
  const allowed = checkInteraction('message', user, { blocked, following, myAge: me.age });
  // A real person on the test server: messages are free and go through the server, no demo replies.
  const real = isLiveUser(user.id);
  const mutual = real || (following.has(user.id) && FOLLOWS_ME.has(user.id));
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

  // `sticker` (a sticker token) goes out on its own and leaves the typed draft alone.
  const send = (checked = false, sticker?: string) => {
    const text = sticker ?? draft.trim();
    if (!text || isBlocked) return;
    if (!allowed.ok) return showAlert('Mesaj gönderilemiyor', allowed.reason);
    const warning = checked ? null : outgoingWarning(scanMessage(text));
    if (warning) {
      showAlert('Kişisel bilgi paylaşıyorsun', warning, [
        { text: 'Düzenle', style: 'cancel' },
        { text: 'Yine de gönder', onPress: () => send(true, sticker) },
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
    if (!sticker) setDraft('');
    if (real) return liveDm(user.id, text);
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
                  <MessageText text={item.text} style={[styles.bubbleText, styles.theirsText]} />
                  {item.room && <RoomCard room={item.room} theirs />}
                  <Text style={[styles.time, styles.theirsTime]}>{item.time}</Text>
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
            // Tapping follows; once you follow, it only explains (tapping again must not unfollow).
            <Pressable
              style={styles.paywall}
              onPress={() => toggleFollow(user.id)}
              disabled={following.has(user.id)}
              accessibilityRole="button"
              accessibilityLabel={following.has(user.id) ? undefined : `${user.name} kişisini takip et`}
            >
              <Icon3D name="coin" size={16} />
              <Text style={styles.paywallText}>
                Mesaj başı {DM_PRICE} jeton · {following.has(user.id) ? `${user.name} seni takip etmiyor` : 'Takip et, karşılıklıysa ücretsiz'}
              </Text>
            </Pressable>
          )
        )}
        {emojiOpen && <EmojiPanel onPick={(e) => (stickerIdOf(e) ? send(false, e) : setDraft((d) => d + e))} />}
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

/** Room invite sent from a room's "Paylaş": opens the room. `theirs` sits on the other side's themed bubble. */
function RoomCard({ room, theirs }: { room: RoomInviteCard; theirs?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={() => router.push(`/oda/${room.roomId}`)} style={[styles.roomCard, theirs && styles.roomCardTheirs]} accessibilityRole="button" accessibilityLabel={`${room.title} odasına katıl`}>
      <Photo uri={room.cover} kind="cover" seed={room.roomId} style={styles.roomCover} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.roomTitle, theirs && styles.theirsText]} numberOfLines={1}>
          {room.title}
        </Text>
        <Text style={[styles.roomJoin, theirs && styles.roomJoinTheirs]}>🎙️ Odaya katıl</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theirs ? colors.text : '#fff'} />
    </Pressable>
  );
}

function SafetyNote({ text, onReport }: { text: string; onReport: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
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

const useStyles = makeStyles(({ colors, lift, ink, dark }) => ({
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '88%', backgroundColor: 'rgba(246,189,96,0.12)', borderColor: 'rgba(246,189,96,0.4)', borderWidth: 1, borderRadius: 12, padding: 10 },
  safetyText: { color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
  safetyLink: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  status: { color: colors.textDim, fontSize: 12 },
  intro: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  introName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  // The other side's bubble is a themed card (a white card with a rim and soft shadow in the light scheme); my own
  // bubble stays on the deep turquoise gradient with white text.
  theirs: { alignSelf: 'flex-start', backgroundColor: dark ? colors.cardAlt : colors.card, borderBottomLeftRadius: 4, ...lift },
  bubbleText: { color: '#fff', fontSize: 15 },
  theirsText: { color: colors.text },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  theirsTime: { color: ink(0.6) },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', minWidth: 200 },
  roomCardTheirs: { backgroundColor: dark ? 'rgba(0,0,0,0.25)' : colors.cardAlt },
  roomCover: { width: 44, height: 44, borderRadius: 10 },
  roomTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  roomJoin: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  roomJoinTheirs: { color: ink(0.8) },
  notice: { paddingHorizontal: 16, paddingVertical: 6, color: colors.textDim, textAlign: 'center', fontSize: 12 },
  paywall: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(246,189,96,0.1)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.3)' },
  paywallText: { color: colors.gold, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    // Light: a white pill on the paper needs a rim to read as a field.
    ...(dark ? null : { borderWidth: 1, borderColor: colors.border }),
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
}));
