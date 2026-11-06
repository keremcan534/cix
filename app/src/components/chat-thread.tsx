// One-to-one chat: the message list, the notices (blocked, not allowed, coin price) and the composer
// with all sending rules. Used by the full chat screen and by the in-room messages sheet, so a reply
// sent from inside a room follows exactly the same rules as one sent from the Mesajlar tab.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Platform, Pressable, View } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { onWebEnter } from '@/lib/enter-sends';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { useReport } from '@/components/report-sheet';
import { Text, TextInput } from '@/components/text';
import { EmojiPanel } from '@/components/EmojiPanel';
import { MessageText } from '@/components/ReactionArt';
import { stickerIdOf } from '@/lib/stickers';
import { Avatar } from '@/components/ui';
import { Icon3D } from '@/components/Icon3D';
import { BOT_LINES, DM_PRICE, FOLLOWS_ME, type Conversation, type RoomInviteCard, type User } from '@/data/mock';
import { messageTime } from '@/data/messages-ui';
import { showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { checkInteraction } from '@/lib/interaction';
import { incomingWarning, scanMessage } from '@/lib/safety';
import { messageRefusal, noteSent } from '@/lib/contact-filter';
import { ContactNote } from '@/components/contact-note';
import { newRef } from '@/lib/api';
import { liveMode, message as errorText } from '@/lib/live';
import { MESSAGE_REPORT_REASONS, isLiveUser, liveDm, reportDm, useLiveThread, type SendResult } from '@/lib/live/messages';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';
import { MuteBanner, useStopped } from '@/components/sanction-screen';
import { showSanction } from '@/lib/sanctions';

type ChatMessage = Conversation['messages'][number];
/** The server's limit for one message (server/api/messages.mjs). */
const MAX_LENGTH = 1000;

export function ChatThread({
  user,
  header,
  compact,
  avoidKeyboard = true,
}: {
  user: User;
  /** Rendered above the thread; gets the "typing…" state. */
  header: (typing: boolean) => ReactNode;
  /** Smaller intro, for sheets. */
  compact?: boolean;
  /** Off when the screen around it already keeps the composer above the keyboard (a bottom sheet rises as a whole). */
  avoidKeyboard?: boolean;
}) {
  const { conversations, sendMessage, setMessageFailed, markMessageSent, importDms, deleteMessage, markRead, following, toggleFollow, blocked, toggleBlock, spendCoins, createTicket, logSafety, me } = useApp();
  const { colors, gradientDeep } = useTheme();
  const styles = useStyles();
  const allowed = checkInteraction('message', user, { blocked, following, myAge: me.age });
  // A real person on the test server: messages are free and go through the server, no demo replies.
  const real = isLiveUser(user.id);
  // A live build only chats with real people: a sample person (a demo id in an old link or notice) isn't there,
  // and nothing is sent or charged for them.
  const missing = liveMode() && !real;
  // An open chat with a real person reads its thread every few seconds (both sides, the server's times).
  useLiveThread(user.id, { importDms });
  const [picked, setPicked] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  // Muted for DMs by the server (lib/sanctions): the composer stays closed until it ends.
  const dmStopped = useStopped('dm');
  const dmMuted = real ? dmStopped : null;
  const mutual = real || (following.has(user.id) && FOLLOWS_ME.has(user.id));
  const isBlocked = blocked.has(user.id);
  const report = useReport();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const convo = conversations.find((c) => c.userId === user.id);
  const messages = convo?.messages ?? [];
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Body = avoidKeyboard ? KeyboardAvoid : View;

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

  // Demo: everything I sent before the other person's latest message counts as read. A chat with a real person
  // shows the server's read receipt (two blue ticks once they read it, one tick until then).
  const lastTheirs = real ? -1 : messages.map((m) => m.fromMe).lastIndexOf(false);
  // Why the text in the input did not go out (contact details, lib/contact-filter); cleared when it is edited.
  const [refused, setRefused] = useState<string | null>(null);
  const edit = (next: string | ((d: string) => string)) => {
    setDraft(next);
    setRefused(null);
  };
  const thread = `dm:${user.id}`;
  const deliver = (text: string, ref: string) =>
    liveDm(user.id, text, ref, (r: SendResult) => {
      if (r.ok) return markMessageSent(user.id, ref, r.message);
      setMessageFailed(user.id, ref, r.reason, r.retry);
      // The server refused contact details the app let through (an older rule on this phone): the bubble says
      // why, and the text comes back into an empty input to be changed.
      if (!r.contact) return;
      setRefused(r.reason);
      setDraft((d) => d || text);
    });
  const retry = (m: ChatMessage) => {
    if (!m.ref || m.noRetry) return;
    const refusal = messageRefusal(thread, m.text, 'dm');
    if (refusal) return setRefused(refusal);
    setMessageFailed(user.id, m.ref, null);
    deliver(m.text, m.ref);
  };

  // Long press on a bubble: copy, report (the other person's message), delete on this phone.
  const reportMessage = (m: ChatMessage) => {
    if (real && m.sid !== undefined) {
      // The options sheet is still closing: one sheet at a time.
      setTimeout(() => setReporting(m), 300);
      return;
    }
    // A message the server doesn't know by id (the demo, or kept from an older version): the person is reported
    // with the message attached; the demo files a support ticket.
    report.start({ type: 'user', id: user.id, name: user.name, note: `Mesaj: ${m.text}`, onBlock: isBlocked ? undefined : () => toggleBlock(user.id) }, () => {
      const no = createTicket('Şikâyet', `${user.name} (${user.id}) · Mesaj: "${m.text}"`);
      logSafety('Şikâyet etti', user.id, `Mesaj · #${no}`);
      showAlert('Bildirildi', `Talep #${no}. Moderasyon ekibi mesajı inceleyecek.`);
    });
  };
  const sendReport = async (m: ChatMessage, reason: string) => {
    if (m.sid === undefined) return;
    try {
      await reportDm(m.sid, reason, m.text);
    } catch (e) {
      showAlert('Şikâyet gönderilemedi', `${errorText(e)}\n\nBiraz sonra tekrar deneyebilirsin.`);
      return;
    }
    logSafety('Şikâyet etti', user.id, reason);
    showAlert(
      'Teşekkürler',
      'Şikâyetin ekibimize ulaştı. İnceleyip gereğini yapacağız; kimliğin karşı tarafla paylaşılmaz.',
      isBlocked
        ? undefined
        : [
            { text: 'Tamam', style: 'cancel' },
            { text: `${user.name} kişisini engelle`, style: 'destructive', onPress: () => toggleBlock(user.id) },
          ],
    );
  };
  const messageOptions: SheetOption[] = picked
    ? [
        { label: 'Kopyala', icon: 'copy-outline', onPress: () => void copyText(picked.text, 'Mesaj') },
        ...(picked.fromMe ? [] : [{ label: 'Şikâyet et', icon: 'flag-outline' as const, onPress: () => reportMessage(picked) }]),
        {
          label: 'Sil',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            showAlert('Mesaj silinsin mi?', real ? 'Yalnızca bu telefondan silinir; karşı taraf görmeye devam eder.' : 'Mesaj bu sohbetten silinir.', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Sil', style: 'destructive', onPress: () => deleteMessage(user.id, picked.id) },
            ]),
        },
      ]
    : [];

  // `sticker` (a sticker token) goes out on its own and leaves the typed draft alone.
  const send = (sticker?: string) => {
    const text = sticker ?? draft.trim();
    if (!text || isBlocked) return;
    if (missing) return showAlert('Kullanıcı bulunamadı', 'Bu kişiye mesaj gönderilemiyor.');
    if (text.length > MAX_LENGTH) return showAlert('Mesaj çok uzun', `Bir mesaj en fazla ${MAX_LENGTH} karakter olabilir.`);
    if (dmMuted) return showSanction(dmMuted);
    if (!allowed.ok) return showAlert('Mesaj gönderilemiyor', allowed.reason);
    // No phone numbers, IBANs, e-mails, links or social media accounts (lib/contact-filter): refused before any
    // coin is spent or a bubble is added, and the text stays in the input. Stickers are catalogue tokens.
    const refusal = sticker ? null : messageRefusal(thread, text, 'dm');
    if (refusal) return setRefused(refusal);
    // Mutual follow chats are free; otherwise each message costs coins (price shown before sending).
    if (!mutual && !spendCoins(DM_PRICE, `Mesaj: ${user.name}`)) {
      showAlert('Yetersiz jeton', `Karşılıklı takip olmadan mesaj başı ${DM_PRICE} jeton.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    const ref = real ? newRef() : undefined;
    sendMessage(user.id, text, true, undefined, ref);
    noteSent(thread, text);
    setEmojiOpen(false);
    if (!sticker) setDraft('');
    if (ref) return deliver(text, ref);
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
      <Body style={{ flex: 1 }}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: compact ? 12 : 16, gap: 8 }}
          ListFooterComponent={
            <View style={[styles.intro, compact && { paddingVertical: 12 }]}>
              <Avatar uri={missing ? '' : user.avatar} size={compact ? 52 : 72} ring />
              <Text style={styles.introName}>{missing ? 'Kullanıcı bulunamadı' : user.age > 0 ? `${user.name}, ${user.age}` : user.name}</Text>
              {!missing && !!user.bio && <Text style={styles.status}>{user.bio}</Text>}
            </View>
          }
          renderItem={({ item }) =>
            item.fromMe ? (
              <Pressable onLongPress={() => setPicked(item)} delayLongPress={350} style={styles.mine} accessibilityHint="Seçenekler için basılı tut">
                <LinearGradient colors={gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bubble, styles.mineBubble]}>
                  <MessageText text={item.text} style={styles.bubbleText} />
                  {item.room && <RoomCard room={item.room} />}
                  <Text style={styles.time}>
                    {messageTime(item)}{' '}
                    {item.failed ? (
                      <Text style={{ color: '#FECACA' }}>!</Text>
                    ) : real ? (
                      <Text style={{ color: item.read ? '#7DD3FC' : 'rgba(255,255,255,0.7)' }} accessibilityLabel={item.read ? 'Okundu' : 'Gönderildi'}>
                        {item.read ? '✓✓' : '✓'}
                      </Text>
                    ) : (
                      <Text style={{ color: messages.indexOf(item) < lastTheirs ? '#7DD3FC' : 'rgba(255,255,255,0.7)' }}>✓✓</Text>
                    )}
                  </Text>
                  {/* Why it didn't go (the server's words); "tekrar dene" only when a retry can help. */}
                  {item.failed && <Text style={[styles.time, styles.failed]}>{`Gönderilemedi · ${item.failed}`}</Text>}
                  {item.failed && !item.noRetry && (
                    <Pressable onPress={() => retry(item)} accessibilityRole="button" accessibilityLabel="Mesajı tekrar gönder" hitSlop={8}>
                      <Text style={[styles.time, styles.failed, { textDecorationLine: 'underline' }]}>Tekrar dene</Text>
                    </Pressable>
                  )}
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={{ gap: 6 }}>
                <Pressable onLongPress={() => setPicked(item)} delayLongPress={350} style={[styles.bubble, styles.theirs]} accessibilityHint="Seçenekler için basılı tut">
                  <MessageText text={item.text} style={[styles.bubbleText, styles.theirsText]} />
                  {item.room && <RoomCard room={item.room} theirs />}
                  <Text style={[styles.time, styles.theirsTime]}>{messageTime(item)}</Text>
                </Pressable>
                <SafetyNote
                  text={item.text}
                  onReport={() =>
                    // Live mode: a reason, then the moderators' queue (the message goes with it as the note).
                    report.start({ type: 'user', id: user.id, name: user.name, note: `Mesaj: ${item.text}`, onBlock: isBlocked ? undefined : () => toggleBlock(user.id) }, () => {
                      const no = createTicket('Şikâyet', `${user.name} (${user.id}) · Şüpheli mesaj: "${item.text}"`);
                      logSafety('Şikâyet etti', user.id, `Şüpheli mesaj · #${no}`);
                      showAlert('Bildirildi', `Talep #${no}. Moderasyon ekibi mesajı inceleyecek.`, [
                        { text: 'Tamam', style: 'cancel' },
                        { text: `${user.name} kişisini engelle`, style: 'destructive', onPress: () => !isBlocked && toggleBlock(user.id) },
                      ]);
                    })
                  }
                />
              </View>
            )
          }
        />
        {missing ? (
          <Text style={styles.notice}>Kullanıcı bulunamadı; bu kişiye mesaj gönderilemiyor.</Text>
        ) : isBlocked ? (
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
        {dmMuted && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            <MuteBanner s={dmMuted} text="Mesaj gönderme kısıtlı" />
          </View>
        )}
        <ContactNote text={refused} />
        {emojiOpen && <EmojiPanel onPick={(e) => (stickerIdOf(e) ? send(e) : edit((d) => d + e))} />}
        <View style={styles.inputRow}>
          <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel="Emoji" hitSlop={6}>
            <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
          </Pressable>
          {/* Wraps up to a few lines; the keyboard's send key sends and the keyboard stays open for the next one.
              Web: Enter sends, Shift+Enter is a new line (lib/enter-sends). */}
          <TextInput
            value={draft}
            onChangeText={edit}
            onSubmitEditing={() => send()}
            onKeyPress={Platform.OS === 'web' ? (e) => onWebEnter(e, () => send()) : undefined}
            submitBehavior="submit"
            multiline
            maxLength={MAX_LENGTH}
            editable={!dmMuted && !missing}
            placeholder={missing ? 'Kullanıcı bulunamadı' : dmMuted ? 'Mesaj gönderemezsin' : 'Mesaj yaz...'}
            placeholderTextColor={colors.textDim}
            maxLength={1000}
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable onPress={() => send()} accessibilityLabel="Gönder">
            <LinearGradient colors={gradientDeep} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </Body>
      {report.sheet}
      <ActionSheet visible={!!picked} options={messageOptions} onClose={() => setPicked(null)} />
      <ActionSheet
        visible={!!reporting}
        title="Bu mesajı neden şikâyet ediyorsun?"
        options={MESSAGE_REPORT_REASONS.map((r) => ({ label: r, onPress: () => reporting && void sendReport(reporting, r) }))}
        onClose={() => setReporting(null)}
      />
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
  // My bubble sits in a pressable row (long press): the row aligns right and the bubble inside keeps the width limit.
  mine: { alignSelf: 'flex-end', maxWidth: '78%' },
  mineBubble: { maxWidth: '100%', borderBottomRightRadius: 4 },
  failed: { color: '#FECACA', fontWeight: '700' },
  // The other side's bubble is a themed card (a white card with a rim and soft shadow in the light scheme); my own
  // bubble stays on the deep turquoise gradient with white text.
  theirs: { alignSelf: 'flex-start', backgroundColor: dark ? colors.cardAlt : colors.card, borderBottomLeftRadius: 4, ...lift },
  bubbleText: { color: '#fff', fontSize: 15 },
  theirsText: { color: colors.text },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  refusedText: { color: '#FECACA', fontWeight: '700', alignSelf: 'stretch', textAlign: 'right', lineHeight: 15 },
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontSize: 15,
    // Light: a white pill on the paper needs a rim to read as a field.
    ...(dark ? null : { borderWidth: 1, borderColor: colors.border }),
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
}));
