// One-to-one chat: the message list, the notices (blocked, not allowed, coin price) and the composer
// with all sending rules. Used by the full chat screen and by the in-room messages sheet, so a reply
// sent from inside a room follows exactly the same rules as one sent from the Mesajlar tab.
// With a real person the server prices each message (1v1, components/one-on-one-bar): free on a mutual follow
// or between two people who aren't streamers; the heart bar and the gift button come from there too. The heart bar
// shows with a paid pair, and with anyone once the heart between us has a level (the demo: its sample hearts).
// Otomatik mesaj (lib/live/auto-chat): under a paid message a streamer received, the diamonds she earns by answering
// in 5 minutes and the time left; under my own paid message what became of its coins; a label on automatic messages and
// quick replies; and a woman streamer's quick-reply button once the other person wrote to her.
// Gifts (lib/dm-gift-fx): a gift's line (the server's `gift`) is drawn as the gift; its animation plays on my screen
// as soon as my gift went, and the other person's on mine once: the newest one when the chat opens, each new one
// while it is open. A tap on the line plays it again. `stage`: where they play (the room's messages sheet passes its
// Modal's own, so the video isn't cut by the sheet); otherwise over this thread's screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { FlatList, Image, Keyboard, Platform, Pressable, View } from 'react-native';
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
import { GiftArt } from '@/components/GiftArt';
import { useGiftStage, type GiftStage } from '@/components/fx/gift-stage';
import { GIFT_FX_OPENING_MS, giftFxToPlay, giftNameOfText, type DmGift } from '@/lib/dm-gift-fx';
import { giftById } from '@/lib/live/catalog-live';
import { giftFxPlayedOf, giftFxSeen, noteGiftFxPlayed } from '@/lib/live/gift-fx-seen';
import { BOT_LINES, DM_PRICE, FOLLOWS_ME, type Conversation, type EventShareCard, type RoomInviteCard, type User } from '@/data/mock';
import { openEvents } from '@/components/events/open';
import { whenText } from '@/lib/events';
import { messageTime } from '@/data/messages-ui';
import { showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { checkInteraction } from '@/lib/interaction';
import { incomingWarning, scanMessage } from '@/lib/safety';
import { messageRefusal, noteSent } from '@/lib/contact-filter';
import { ContactNote } from '@/components/contact-note';
import { newRef, sendDm } from '@/lib/api';
import { HeartBar, heartOf, paidPair, useChatGift, usePair } from '@/components/one-on-one-bar';
import { liveMode, message as errorText, refreshWallet, toServer } from '@/lib/live';
import type { Pair } from '@/lib/live/one-on-one';
import { MESSAGE_REPORT_REASONS, isLiveUser, liveDm, reportDm, syncThread, useLiveThread, type SendResult } from '@/lib/live/messages';
import { sendQuick, serverNowMs, useAutoMe, useThreadExtras } from '@/lib/live/auto-chat';
import { feeLine, rewardLine, sourceLabel } from '@/lib/msg-reward';
import { uploadPhoto } from '@/lib/live/profile';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';
import { MuteBanner, useStopped } from '@/components/sanction-screen';
import { showSanction } from '@/lib/sanctions';

type ChatMessage = Conversation['messages'][number];
/** The server's limit for one message (server/api/messages.mjs). */
const MAX_LENGTH = 1000;
/** 44 dp tall, and apart from each other across the composer's 10 dp gaps. */
const COMPOSER_ICON_SLOP = { top: 10, bottom: 10, left: 5, right: 5 };

export function ChatThread({
  user,
  header,
  compact,
  last,
  onMore,
  avoidKeyboard = true,
  stage: stageProp,
}: {
  user: User;
  /** Rendered above the thread; gets the "typing…" state and, with a real person, the 1v1 pair (null until read). */
  header: (typing: boolean, pair: Pair | null) => ReactNode;
  /** Smaller intro, for sheets. */
  compact?: boolean;
  /** Only the newest `last` messages (the room's sheet); the older ones are a tap away (`onMore`). */
  last?: number;
  onMore?: () => void;
  /** Off when the screen around it already keeps the composer above the keyboard (a bottom sheet rises as a whole). */
  avoidKeyboard?: boolean;
  /** Where gift animations play (components/fx/gift-stage), drawn by the caller; none: over this thread. */
  stage?: GiftStage;
}) {
  const { conversations, sendMessage, setMessageFailed, markMessageSent, importDms, deleteMessage, markRead, following, toggleFollow, blocked, toggleBlock, spendCoins, createTicket, logSafety, me, coins } = useApp();
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
  // A real person: what a message costs is the server's (0 while it is still being read; the server charges anyway).
  const { pair, reload } = usePair(user.id, real);
  const heart = missing ? null : heartOf(user.id, pair);
  const price = real ? (pair?.dmPrice ?? 0) : DM_PRICE;
  const mutual = real ? price === 0 : following.has(user.id) && FOLLOWS_ME.has(user.id);
  const ownStage = useGiftStage();
  const stage = stageProp ?? ownStage;
  // My gift went: its line comes from the server, read at once (the heart moved too).
  const gift = useChatGift(
    user,
    () => {
      reload();
      if (real) void syncThread(user.id, { importDms }).catch(() => {});
    },
    stage,
  );
  const isBlocked = blocked.has(user.id);
  const report = useReport();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const convo = conversations.find((c) => c.userId === user.id);
  const messages = convo?.messages ?? [];
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Body = avoidKeyboard ? KeyboardAvoid : View;
  // The 5-minute rule and quick replies (server/api/message-holds.mjs, auto-chat.mjs): a live chat only.
  const extras = useThreadExtras(user.id);
  const auto = useAutoMe();
  const quick = real && auto?.tools && auto.quick?.on ? auto.quick : null;
  const wroteToMe = messages.some((m) => !m.fromMe);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const pickQuick = async (no: number) => {
    setQuickOpen(false);
    if (quickBusy) return;
    setQuickBusy(true);
    const r = await sendQuick(user.id, no);
    setQuickBusy(false);
    if (!r.ok) return showAlert(r.quota ? 'Hazır cevap hakkın bitti' : 'Gönderilemedi', r.reason);
    void syncThread(user.id, { importDms }).catch(() => {});
    if (r.done) showAlert('Hazır cevap hakkın bitti', r.done);
  };

  useEffect(() => {
    markRead(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, messages.length]);

  // The other person's gifts play once on this phone (lib/dm-gift-fx): on opening only the newest one not played yet,
  // then each new one. Only the server's `gift` on a line counts, never its text.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [user.id]);
  const peer = real ? toServer(user.id) : null;
  useEffect(() => {
    if (!peer || !messages.length) return;
    let alive = true;
    void giftFxSeen().then(() => {
      if (!alive) return;
      const now = Date.now();
      const r = giftFxToPlay(messages, giftFxPlayedOf(peer), now - openedAt.current < GIFT_FX_OPENING_MS, now);
      noteGiftFxPlayed(peer, r.played);
      for (const { gift: gl } of r.play) {
        const g = gl ? giftById(gl.id) : undefined;
        if (g && gl) stage.play(g, user.name, me.name, gl.count);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, messages]);
  /** A tap on a gift's line: its animation again. */
  const replayGift = (m: ChatMessage, gl: DmGift) => {
    const g = giftById(gl.id);
    if (g) stage.play(g, m.fromMe ? me.name : user.name, m.fromMe ? user.name : me.name, gl.count);
  };

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
  const deliver = (text: string, ref: string, event?: number) =>
    liveDm(
      user.id,
      text,
      ref,
      (r: SendResult) => {
        if (r.ok) {
          markMessageSent(user.id, ref, r.message);
          // A paid message: the balance and the heart moved.
          if (price > 0) {
            void refreshWallet().catch(() => {});
            reload();
          }
          return;
        }
        setMessageFailed(user.id, ref, r.reason, r.retry);
        if (r.coins) showAlert('Yetersiz jeton', `Bu sohbette mesaj başı ${price} jeton.`, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') }]);
        // The server refused contact details the app let through (an older rule on this phone): the bubble says
        // why, and the text comes back into an empty input to be changed.
        if (!r.contact) return;
        setRefused(r.reason);
        setDraft((d) => d || text);
      },
      event,
    );
  const retry = (m: ChatMessage) => {
    if (!m.ref || m.noRetry) return;
    const refusal = messageRefusal(thread, m.text, 'dm');
    if (refusal) return setRefused(refusal);
    setMessageFailed(user.id, m.ref, null);
    // A shared event goes again with its event.
    deliver(m.text, m.ref, m.event?.id);
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

  // A photo (live, a real person): opens with the heart level or a mutual follow (the server's pair.photo). It
  // goes to the storage, then as a message; the thread then reads it back from the server (no bubble ahead of it).
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const photoOpen = !!pair?.photo?.open;
  const sendPhoto = async () => {
    if (sendingPhoto || isBlocked || missing) return;
    if (dmMuted) return showSanction(dmMuted);
    if (!allowed.ok) return showAlert('Mesaj gönderilemiyor', allowed.reason);
    if (!photoOpen) return showAlert('Fotoğraf kilitli', pair?.photo?.why ?? 'Bu sohbette fotoğraf henüz açık değil.');
    if (!mutual && coins < price) {
      return showAlert('Yetersiz jeton', `Karşılıklı takip olmadan mesaj başı ${price} jeton.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
    const to = toServer(user.id);
    if (!to) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (picked.canceled || !picked.assets?.[0]) return;
    setSendingPhoto(true);
    try {
      const url = await uploadPhoto('dm', picked.assets[0]);
      await sendDm(to, '', newRef(), url);
      await syncThread(user.id, { importDms });
      reload();
      void refreshWallet().catch(() => {});
    } catch (e) {
      showAlert('Fotoğraf gönderilemedi', errorText(e));
    } finally {
      setSendingPhoto(false);
    }
  };

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
    // Mutual follow chats are free; otherwise each message costs coins (price shown before sending). A real
    // person's message is paid on the server with the message; a balance that clearly can't pay is told here.
    if (!mutual && (real ? coins < price : !spendCoins(DM_PRICE, `Mesaj: ${user.name}`))) {
      showAlert('Yetersiz jeton', `Karşılıklı takip olmadan mesaj başı ${price} jeton.`, [
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
      {header(typing, pair)}
      {heart && (paidPair(pair) || heart.level > 0) && <HeartBar heart={heart} pair={pair} />}
      <Body style={{ flex: 1 }}>
        <FlatList
          data={[...(last && messages.length > last ? messages.slice(-last) : messages)].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          // A touch on the messages closes the emoji panel (as does the back button).
          onTouchStart={emojiOpen ? () => setEmojiOpen(false) : undefined}
          contentContainerStyle={{ padding: compact ? 12 : 16, gap: 8 }}
          ListFooterComponent={
            last && messages.length > last ? (
              <Pressable onPress={onMore} disabled={!onMore} style={styles.more} accessibilityRole="button" accessibilityLabel="Önceki mesajlar: sohbetin tamamını aç">
                <Text style={styles.moreText}>Önceki mesajlar</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            ) : (
            <View style={[styles.intro, compact && { paddingVertical: 12 }]}>
              <Avatar uri={missing ? '' : user.avatar} size={compact ? 52 : 72} ring />
              <Text style={styles.introName}>{missing ? 'Kullanıcı bulunamadı' : user.age > 0 ? `${user.name}, ${user.age}` : user.name}</Text>
              {!missing && !!user.bio && <Text style={styles.status}>{user.bio}</Text>}
            </View>
            )
          }
          renderItem={({ item }) =>
            // They followed me (the server's line, lib/dm-thread): a note in the middle, not a message.
            item.follow ? (
              <View style={styles.followNote} accessible accessibilityLabel={`${user.name} seni takip etti, ${messageTime(item)}`}>
                <Ionicons name="person-add" size={13} color={colors.textDim} />
                <Text style={styles.followNoteText} numberOfLines={2}>
                  {user.name} seni takip etti · {messageTime(item)}
                </Text>
              </View>
            ) : item.fromMe ? (
              <Pressable onLongPress={() => setPicked(item)} delayLongPress={350} style={styles.mine} accessibilityHint="Seçenekler için basılı tut">
                {!!sourceLabel(item.source ?? extras(item.sid)?.source, true) && <Text style={[styles.autoLabel, { alignSelf: 'flex-end' }]}>{sourceLabel(item.source ?? extras(item.sid)?.source, true)}</Text>}
                <LinearGradient colors={gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bubble, styles.mineBubble]}>
                  {!!item.image && <Image source={{ uri: item.image }} style={styles.photo} resizeMode="cover" accessibilityLabel="Fotoğraf" />}
                  {item.gift ? (
                    <GiftLine gift={item.gift} text={item.text} onPlay={() => replayGift(item, item.gift!)} onLongPress={() => setPicked(item)} />
                  ) : (
                    !(item.image && item.text === 'Fotoğraf') && <MessageText text={item.text} style={styles.bubbleText} />
                  )}
                  {item.room && <RoomCard room={item.room} />}
                  {item.event && <EventCard event={item.event} />}
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
                {/* My paid message: its coins only (never what the other one earns). */}
                {!!extras(item.sid)?.fee && <Text style={styles.feeLine}>{feeLine(extras(item.sid)!.fee!)}</Text>}
              </Pressable>
            ) : (
              <View style={{ gap: 6 }}>
                {!!sourceLabel(item.source ?? extras(item.sid)?.source, false) && <Text style={styles.autoLabel}>{sourceLabel(item.source ?? extras(item.sid)?.source, false)}</Text>}
                <Pressable onLongPress={() => setPicked(item)} delayLongPress={350} style={[styles.bubble, styles.theirs]} accessibilityHint="Seçenekler için basılı tut">
                  {!!item.image && <Image source={{ uri: item.image }} style={styles.photo} resizeMode="cover" accessibilityLabel="Fotoğraf" />}
                  {item.gift ? (
                    <GiftLine gift={item.gift} text={item.text} theirs onPlay={() => replayGift(item, item.gift!)} onLongPress={() => setPicked(item)} />
                  ) : (
                    !(item.image && item.text === 'Fotoğraf') && <MessageText text={item.text} style={[styles.bubbleText, styles.theirsText]} />
                  )}
                  {item.room && <RoomCard room={item.room} theirs />}
                  {item.event && <EventCard event={item.event} theirs />}
                  <Text style={[styles.time, styles.theirsTime]}>{messageTime(item)}</Text>
                </Pressable>
                {!!extras(item.sid)?.reward && <RewardNote line={rewardLine(extras(item.sid)!.reward!, serverNowMs())} />}
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
              onPress={() => {
                toggleFollow(user.id);
                // The server's follow lands first; then the price is read again (free once it is mutual).
                if (real) setTimeout(reload, 1500);
              }}
              disabled={following.has(user.id)}
              accessibilityRole="button"
              accessibilityLabel={following.has(user.id) ? undefined : `${user.name} kişisini takip et`}
            >
              <Icon3D name="coin" size={16} />
              <Text style={styles.paywallText}>
                Mesaj başı {price} jeton · {following.has(user.id) ? `${user.name} seni takip etmiyor` : 'Takip et, karşılıklıysa ücretsiz'}
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
        {emojiOpen && <EmojiPanel onPick={(e) => (stickerIdOf(e) ? send(e) : edit((d) => d + e))} onClose={() => setEmojiOpen(false)} />}
        <View style={styles.inputRow}>
          {/* The panel and the keyboard take turns: together they leave no room for the messages on a small phone. */}
          <Pressable
            onPress={() => {
              if (!emojiOpen) Keyboard.dismiss();
              setEmojiOpen(!emojiOpen);
            }}
            accessibilityLabel="Emoji"
            hitSlop={COMPOSER_ICON_SLOP}
            style={styles.composerIcon}>
            <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
          </Pressable>
          {!missing && !isBlocked && (
            <Pressable onPress={gift.open} accessibilityLabel="Hediye gönder" hitSlop={COMPOSER_ICON_SLOP} style={styles.composerIcon}>
              <Ionicons name="gift-outline" size={24} color={colors.pink} />
            </Pressable>
          )}
          {real && !isBlocked && (
            <Pressable
              onPress={() => void sendPhoto()}
              disabled={sendingPhoto}
              style={[styles.composerIcon, { opacity: photoOpen && !sendingPhoto ? 1 : 0.45 }]}
              accessibilityLabel={photoOpen ? 'Fotoğraf gönder' : 'Fotoğraf (kilitli)'}
              accessibilityState={{ disabled: !photoOpen || sendingPhoto, busy: sendingPhoto }}
              hitSlop={COMPOSER_ICON_SLOP}>
              <Ionicons name="image-outline" size={23} color={colors.textDim} />
            </Pressable>
          )}
          {quick && wroteToMe && !isBlocked && !dmMuted && (
            <Pressable
              onPress={() => setQuickOpen(true)}
              disabled={quickBusy}
              style={{ opacity: quick.left > 0 && !quickBusy ? 1 : 0.45 }}
              accessibilityLabel={`Hazır cevap, bugün ${quick.left}/${quick.total} hakkın var`}
              hitSlop={6}>
              <Ionicons name="flash-outline" size={23} color={colors.gold} />
            </Pressable>
          )}
          {/* Wraps up to a few lines; the keyboard's send key sends and the keyboard stays open for the next one.
              Web: Enter sends, Shift+Enter is a new line (lib/enter-sends). */}
          <TextInput
            value={draft}
            onChangeText={edit}
            onFocus={() => setEmojiOpen(false)}
            onSubmitEditing={() => send()}
            onKeyPress={Platform.OS === 'web' ? (e) => onWebEnter(e, () => send()) : undefined}
            submitBehavior="submit"
            multiline
            maxLength={MAX_LENGTH}
            editable={!dmMuted && !missing}
            placeholder={missing ? 'Kullanıcı bulunamadı' : dmMuted ? 'Mesaj gönderemezsin' : 'Mesaj yaz...'}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable onPress={() => send()} accessibilityLabel="Gönder" hitSlop={4}>
            <LinearGradient colors={gradientDeep} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </Body>
      {report.sheet}
      {gift.sheet}
      <ActionSheet visible={!!picked} options={messageOptions} onClose={() => setPicked(null)} />
      {quick && (
        <ActionSheet
          visible={quickOpen}
          title={quick.left > 0 ? `Bugünkü hazır cevap hakkın: ${quick.left}/${quick.total}` : (quick.done ?? 'Bugünkü hazır cevap hakkın bitti')}
          options={quick.left > 0 ? quick.replies.map((r) => ({ label: r.text, icon: 'flash-outline' as const, onPress: () => void pickQuick(r.no) })) : []}
          onClose={() => setQuickOpen(false)}
        />
      )}
      <ActionSheet
        visible={!!reporting}
        title="Bu mesajı neden şikâyet ediyorsun?"
        options={MESSAGE_REPORT_REASONS.map((r) => ({ label: r, onPress: () => reporting && void sendReport(reporting, r) }))}
        onClose={() => setReporting(null)}
      />
      {!stageProp && ownStage.node}
    </>
  );
}

/** A gift's line (the server's `gift`): its picture, who sent it, its name and count; a tap plays it again. */
function GiftLine({ gift, text, theirs, onPlay, onLongPress }: { gift: DmGift; text: string; theirs?: boolean; onPlay: () => void; onLongPress: () => void }) {
  const styles = useStyles();
  const known = giftById(gift.id);
  const name = `${known?.name ?? giftNameOfText(text)}${gift.count > 1 ? ` ×${gift.count}` : ''}`;
  const kind = theirs ? 'Hediye gönderdi' : 'Hediye gönderdin';
  return (
    <Pressable
      onPress={known ? onPlay : undefined}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={styles.giftLine}
      accessibilityRole="button"
      accessibilityLabel={`${kind}: ${name}`}
      accessibilityHint={known ? 'Animasyonu yeniden oynatır' : undefined}
    >
      <GiftArt giftId={gift.id} emoji={known?.emoji ?? '🎁'} size={44} textStyle={styles.giftLineEmoji} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.giftLineKind, theirs && styles.giftLineKindTheirs]}>🎁 {kind}</Text>
        <Text style={[styles.giftLineName, theirs && styles.theirsText]} numberOfLines={2}>
          {name}
        </Text>
      </View>
    </Pressable>
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

/** An event sent from its detail's "Arkadaşına gönder": opens it in Etkinlik Merkezi (which shows its state now). */
function EventCard({ event, theirs }: { event: EventShareCard; theirs?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={() => openEvents({ id: event.id })} style={[styles.roomCard, theirs && styles.roomCardTheirs]} accessibilityRole="button" accessibilityLabel={`${event.title} etkinliğini aç`}>
      <View style={styles.eventIcon}>
        <Ionicons name="calendar" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.roomTitle, theirs && styles.theirsText]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.roomJoin, theirs && styles.roomJoinTheirs]} numberOfLines={1}>
          {event.startsAt ? `${whenText(event.startsAt)} · Etkinliği gör` : 'Etkinliği gör'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theirs ? colors.text : '#fff'} />
    </Pressable>
  );
}

/** Under a paid message a streamer received: the diamonds, the time left or what came of it (lib/msg-reward). */
function RewardNote({ line }: { line: ReturnType<typeof rewardLine> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = line.tone === 'gold' ? colors.gold : line.tone === 'ok' ? '#34D399' : colors.textDim;
  return (
    <View style={[styles.reward, { borderColor: `${color}66` }]} accessibilityLabel={[line.title, line.sub].filter(Boolean).join('. ')}>
      <Text style={[styles.rewardTitle, { color }]}>{line.title}</Text>
      {!!line.sub && <Text style={styles.rewardSub}>{line.sub}</Text>}
    </View>
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
  autoLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  feeLine: { color: colors.textDim, fontSize: 11, alignSelf: 'flex-end', marginTop: 3, textAlign: 'right' },
  reward: { alignSelf: 'flex-start', maxWidth: '88%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(246,189,96,0.08)' },
  rewardTitle: { fontSize: 13, fontWeight: '800' },
  rewardSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '88%', backgroundColor: 'rgba(246,189,96,0.12)', borderColor: 'rgba(246,189,96,0.4)', borderWidth: 1, borderRadius: 12, padding: 10 },
  safetyText: { color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
  safetyLink: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  status: { color: colors.textDim, fontSize: 12 },
  intro: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  more: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 4, borderRadius: 14, backgroundColor: `${colors.primary}17` },
  moreText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  introName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  photo: { width: 190, height: 190, borderRadius: 12, marginTop: 2, marginBottom: 4, backgroundColor: 'rgba(0,0,0,0.2)' },
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
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', minWidth: 190 },
  followNote: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '86%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(127,127,127,0.12)' },
  followNoteText: { color: colors.textDim, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  giftLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, minWidth: 150 },
  giftLineEmoji: { fontSize: 34, lineHeight: 44 },
  giftLineKind: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  giftLineKindTheirs: { color: ink(0.7) },
  giftLineName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roomCardTheirs: { backgroundColor: dark ? 'rgba(0,0,0,0.25)' : colors.cardAlt },
  roomCover: { width: 44, height: 44, borderRadius: 10 },
  eventIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED' },
  roomTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  roomJoin: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  roomJoinTheirs: { color: ink(0.8) },
  notice: { paddingHorizontal: 16, paddingVertical: 6, color: colors.textDim, textAlign: 'center', fontSize: 12 },
  paywall: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(246,189,96,0.1)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.3)' },
  paywallText: { color: colors.gold, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  // The buttons stay at the bottom as the message grows, level with its last line.
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  composerIcon: { marginBottom: 8 },
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
