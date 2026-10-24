import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Avatar, CoinPill, FramedAvatar, GradientButton, VerifiedBadge } from '@/components/ui';
import { INCOMING_GIFT_POOL, vipTier } from '@/data/economy';
import { BOT_LINES, GIFTS, ME, ROOMS, USERS, roomById, userById, type Gift, type Room } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type ChatMsg = { id: string; userId?: string; text: string; system?: boolean };
type Pk = { opponent: Room; ours: number; theirs: number; left: number; result?: 'win' | 'lose' | 'draw' };

const NEW_ROOM: Room = {
  id: 'yeni',
  title: 'Benim Odam 🎙️',
  category: 'Sohbet',
  cover: 'https://picsum.photos/seed/myroom/600/400',
  hostId: 'me',
  listeners: 1,
  seatUserIds: ['me', null, null, null, null, null, null, null, null],
  tags: ['Yeni'],
};

const PK_SECONDS = 60;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const msgId = () => String(Date.now() + Math.random());

export default function VoiceRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const room = id === 'yeni' ? NEW_ROOM : roomById(id);
  const amHost = room.hostId === 'me';
  const { coins, spendCoins, receiveDiamonds, bump, vipLevel, blocked } = useApp();

  const [seats, setSeats] = useState<(string | null)[]>(room.seatUserIds);
  const [micOn, setMicOn] = useState(amHost);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [kicked, setKicked] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [entry, setEntry] = useState<string | null>(() => {
    const tier = vipTier(vipLevel);
    return tier && tier.level >= 2 ? `${tier.emoji} ${tier.name} ${ME.name} odaya katıldı!` : null;
  });
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 'w', system: true, text: 'Odaya hoş geldin! Saygılı ol, iyi eğlenceler 💜' },
    ...(entry ? [{ id: 'vip', system: true, text: entry }] : []),
  ]);
  const [draft, setDraft] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const [giftFx, setGiftFx] = useState<Gift | null>(null);
  const [listeners, setListeners] = useState(room.listeners);
  const [listOpen, setListOpen] = useState(false);
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[] } | null>(null);
  const [pk, setPk] = useState<Pk | null>(null);

  const mySeat = seats.indexOf('me');
  const amSeated = mySeat >= 0;
  const seatedOthers = useMemo(() => seats.filter((s): s is string => !!s && s !== 'me'), [seats]);
  const audience = USERS.filter((u) => !seats.includes(u.id) && !kicked.has(u.id) && !blocked.has(u.id));
  const addMsg = (msg: Omit<ChatMsg, 'id'>) => setMessages((m) => [...m.slice(-60), { ...msg, id: msgId() }]);

  // Hide the VIP entry banner after it has played.
  useEffect(() => {
    if (!entry) return;
    const t = setTimeout(() => setEntry(null), 3500);
    return () => clearTimeout(t);
  }, [entry]);

  // Count minutes spent in a room for daily tasks.
  useEffect(() => {
    const t = setInterval(() => bump('roomMinutes'), 60_000);
    return () => clearInterval(t);
  }, [bump]);

  // Fake "who is talking" so the room feels alive.
  useEffect(() => {
    const t = setInterval(() => {
      const next = new Set<string>();
      seatedOthers.forEach((uid) => !mutedUsers.has(uid) && Math.random() < 0.35 && next.add(uid));
      if (amSeated && micOn && Math.random() < 0.5) next.add('me');
      setSpeaking(next);
    }, 900);
    return () => clearInterval(t);
  }, [seatedOthers, amSeated, micOn, mutedUsers]);

  // Fake chat & join activity.
  useEffect(() => {
    const t = setInterval(() => {
      const u = pick(USERS);
      if (kicked.has(u.id) || blocked.has(u.id)) return;
      const joined = Math.random() < 0.3;
      if (joined) setListeners((n) => n + 1);
      addMsg(joined ? { system: true, text: `${u.name} odaya katıldı` } : { userId: u.id, text: pick(BOT_LINES) });
    }, 3500);
    return () => clearInterval(t);
  }, [kicked, blocked]);

  // When hosting, listeners send gifts -> host earns diamonds.
  useEffect(() => {
    if (!amHost) return;
    const t = setInterval(() => {
      const from = pick(USERS);
      const price = pick(INCOMING_GIFT_POOL);
      const gift = GIFTS.find((g) => g.price === price) ?? GIFTS[0];
      receiveDiamonds(gift.price, 'Hediye', from.id);
      if (gift.price >= 50) setGiftFx(gift);
      addMsg({ system: true, text: `🎁 ${from.name} sana ${gift.emoji} ${gift.name} gönderdi! (+${gift.price} 💎)` });
      setPk((p) => (p && !p.result ? { ...p, ours: p.ours + gift.price } : p));
    }, 6000);
    return () => clearInterval(t);
    // receiveDiamonds is recreated every render; re-subscribing would reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amHost]);

  // PK countdown & opponent score.
  const pkRunning = !!pk && !pk.result;
  useEffect(() => {
    if (!pkRunning) return;
    const t = setInterval(() => {
      setPk((p) => {
        if (!p || p.result) return p;
        const left = p.left - 1;
        const theirs = p.theirs + (Math.random() < 0.5 ? pick(INCOMING_GIFT_POOL) : 0);
        const ours = p.ours + (Math.random() < 0.3 ? pick(INCOMING_GIFT_POOL) : 0);
        if (left > 0) return { ...p, left, theirs, ours };
        return { ...p, left: 0, theirs, ours, result: ours > theirs ? 'win' : ours < theirs ? 'lose' : 'draw' };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pkRunning]);

  // Keep the PK result on screen for a few seconds, then close the bar.
  useEffect(() => {
    if (!pk?.result) return;
    const t = setTimeout(() => setPk(null), 5000);
    return () => clearTimeout(t);
  }, [pk?.result]);

  const startPk = () => {
    const opponent = pick(ROOMS.filter((r) => r.id !== room.id));
    setPk({ opponent, ours: 0, theirs: 0, left: PK_SECONDS });
    addMsg({ system: true, text: `⚔️ PK başladı: ${room.title} vs ${opponent.title}! Hediye göndererek destek ol.` });
  };

  const placeOnSeat = (userId: string) => {
    const free = seats.findIndex((s, i) => i > 0 && s === null);
    if (free < 0) return showAlert('Boş koltuk yok');
    setSeats((s) => s.map((x, i) => (i === free ? userId : x)));
    addMsg({ system: true, text: `${userById(userId).name} ${free + 1}. koltuğa davet edildi ve oturdu` });
  };

  const removeFromSeat = (userId: string) => setSeats((s) => s.map((x) => (x === userId ? null : x)));

  const onSeatPress = (index: number) => {
    const uid = seats[index];
    if (uid === 'me') {
      if (amHost) return;
      showAlert('Koltuktan in', 'Dinleyici olarak devam etmek ister misin?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İn', onPress: () => removeFromSeat('me') },
      ]);
      return;
    }
    if (uid) {
      const u = userById(uid);
      const options: SheetOption[] = [
        { label: '👤 Profili gör', onPress: () => router.push(`/kullanici/${uid}`) },
        { label: '🎁 Hediye gönder', onPress: () => { setGiftTo(uid); setGiftOpen(true); } },
        { label: '💬 Mesaj gönder', onPress: () => router.push(`/sohbet/${uid}`) },
      ];
      if (amHost) {
        const muted = mutedUsers.has(uid);
        options.push(
          { label: muted ? '🔊 Sesini aç' : '🔇 Sustur', onPress: () => setMutedUsers((m) => { const n = new Set(m); if (muted) n.delete(uid); else n.add(uid); return n; }) },
          { label: '⬇️ Koltuktan indir', onPress: () => { removeFromSeat(uid); addMsg({ system: true, text: `${u.name} koltuktan indirildi` }); } },
          { label: '🚫 Odadan at', destructive: true, onPress: () => { removeFromSeat(uid); setKicked((k) => new Set(k).add(uid)); addMsg({ system: true, text: `${u.name} odadan atıldı` }); } },
        );
      }
      setSheet({ title: u.name, options });
      return;
    }
    if (index === 0) return;
    setSeats((s) => s.map((x, i) => (i === index ? 'me' : x === 'me' ? null : x)));
    setMicOn(true);
    addMsg({ system: true, text: `${ME.name} ${index + 1}. koltuğa geçti` });
  };

  const send = () => {
    if (!draft.trim()) return;
    addMsg({ userId: 'me', text: draft.trim() });
    setDraft('');
  };

  const sendGift = (gift: Gift, toId: string) => {
    setGiftOpen(false);
    if (!spendCoins(gift.price)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    bump('giftsSent');
    setGiftFx(gift);
    setPk((p) => (p && !p.result ? { ...p, ours: p.ours + gift.price } : p));
    addMsg({ system: true, text: `🎁 ${ME.name}, ${userById(toId).name} kişisine ${gift.emoji} ${gift.name} gönderdi!` });
  };

  const moreMenu = () =>
    setSheet({
      title: room.title,
      options: [
        { label: '🎰 Şans çarkı', onPress: () => router.push('/cark') },
        ...(amHost && !pk ? [{ label: '⚔️ PK başlat', onPress: startPk }] : []),
        { label: '👥 Dinleyiciler', onPress: () => setListOpen(true) },
        { label: '🏆 Sıralama', onPress: () => router.push('/siralama') },
        { label: '🚩 Odayı şikayet et', onPress: () => showAlert('Teşekkürler', 'Şikayetin moderasyon ekibine iletildi.') },
      ],
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: room.cover }} style={StyleSheet.absoluteFill} blurRadius={25} />
      <LinearGradient colors={['rgba(18,11,36,0.55)', 'rgba(18,11,36,0.97)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Avatar uri={userById(room.hostId).avatar} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {room.title}
              </Text>
              <Pressable onPress={() => setListOpen(true)}>
                <Text style={styles.sub}>
                  ID {room.id.toUpperCase()} · 👥 {listeners} {amHost ? '· Sen yöneticisin' : ''}
                </Text>
              </Pressable>
            </View>
            <CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Odadan çık">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {pk && <PkBar pk={pk} roomTitle={room.title} />}

          <View style={styles.seatGrid}>
            {seats.map((uid, i) => (
              <Seat
                key={i}
                index={i}
                userId={uid}
                host={i === 0}
                vipLevel={uid === 'me' ? vipLevel : 0}
                speaking={!!uid && speaking.has(uid)}
                muted={uid === 'me' ? !micOn : !!uid && mutedUsers.has(uid)}
                onPress={() => onSeatPress(i)}
              />
            ))}
          </View>

          <FlatList
            style={{ flex: 1, marginHorizontal: 12 }}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatLine msg={item} />}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          />

          <View style={styles.bottom}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="Bir şey söyle..."
              placeholderTextColor={colors.textDim}
              style={styles.input}
              returnKeyType="send"
            />
            {amSeated && <RoundBtn label="Mikrofon" icon={micOn ? 'mic' : 'mic-off'} active={micOn} onPress={() => setMicOn((m) => !m)} />}
            <RoundBtn label="Menü" icon="grid" onPress={moreMenu} />
            <RoundBtn label="Hediye" icon="gift" gift onPress={() => { setGiftTo(null); setGiftOpen(true); }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <GiftSheet
        key={giftOpen ? `open-${giftTo}` : 'closed'}
        visible={giftOpen}
        onClose={() => setGiftOpen(false)}
        recipients={amHost ? seatedOthers : seats.filter((s): s is string => !!s && s !== 'me')}
        initialTo={giftTo}
        coins={coins}
        onSend={sendGift}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <ListenersModal
        visible={listOpen}
        onClose={() => setListOpen(false)}
        users={audience}
        canInvite={amHost}
        onInvite={(uid) => placeOnSeat(uid)}
        total={listeners}
      />
      {giftFx && <GiftAnimation gift={giftFx} onDone={() => setGiftFx(null)} />}
      {entry && <EntryBanner text={entry} level={vipLevel} />}
    </View>
  );
}

function PkBar({ pk, roomTitle }: { pk: Pk; roomTitle: string }) {
  const total = pk.ours + pk.theirs || 1;
  const ratio = pk.ours + pk.theirs === 0 ? 0.5 : pk.ours / total;
  return (
    <View style={styles.pk}>
      <View style={styles.pkTop}>
        <Text style={styles.pkName} numberOfLines={1}>
          {roomTitle}
        </Text>
        <Text style={styles.pkTimer}>{pk.result ? (pk.result === 'win' ? '🏆 KAZANDIN' : pk.result === 'lose' ? 'KAYBETTİN' : 'BERABERE') : `⚔️ ${pk.left}s`}</Text>
        <Text style={[styles.pkName, { textAlign: 'right' }]} numberOfLines={1}>
          {pk.opponent.title}
        </Text>
      </View>
      <View style={styles.pkTrack}>
        <LinearGradient colors={['#EC4899', '#F43F5E']} style={{ flex: Math.max(ratio, 0.04), justifyContent: 'center', paddingLeft: 8 }}>
          <Text style={styles.pkScore}>{pk.ours}</Text>
        </LinearGradient>
        <LinearGradient colors={['#3B82F6', '#6366F1']} style={{ flex: Math.max(1 - ratio, 0.04), justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={styles.pkScore}>{pk.theirs}</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

function ListenersModal({ visible, onClose, users, canInvite, onInvite, total }: { visible: boolean; onClose: () => void; users: typeof USERS; canInvite: boolean; onInvite: (id: string) => void; total: number }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '60%' }]}>
        <Text style={styles.sheetTitle}>Dinleyiciler ({total})</Text>
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.listenerRow}>
              <Avatar uri={item.avatar} size={40} online={item.online} />
              <Pressable style={{ flex: 1 }} onPress={() => { onClose(); router.push(`/kullanici/${item.id}`); }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>{item.city}</Text>
              </Pressable>
              {canInvite && (
                <Pressable style={styles.inviteBtn} onPress={() => onInvite(item.id)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Koltuğa davet</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

function EntryBanner({ text, level }: { text: string; level: number }) {
  const tier = vipTier(level)!;
  const [x] = useState(() => new Animated.Value(-400));
  useEffect(() => {
    Animated.sequence([
      Animated.spring(x, { toValue: 0, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(x, { toValue: 500, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [x]);
  return (
    <Animated.View pointerEvents="none" style={[styles.entry, { transform: [{ translateX: x }] }]}>
      <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.entryInner}>
        <Text style={styles.entryText}>✨ {text}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

function Seat({ index, userId, host, vipLevel, speaking, muted, onPress }: { index: number; userId: string | null; host: boolean; vipLevel: number; speaking: boolean; muted: boolean; onPress: () => void }) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!speaking) {
      pulse.setValue(0);
      return;
    }
    const anim = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [speaking, pulse]);

  const user = userId ? userById(userId) : null;
  const size = host ? 72 : 58;

  return (
    <Pressable onPress={onPress} style={[styles.seat, host && styles.hostSeat]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {speaking && (
          <Animated.View
            style={[
              styles.ring,
              { width: size, height: size, borderRadius: size / 2 },
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }] },
            ]}
          />
        )}
        {user && vipLevel > 0 ? (
          <FramedAvatar uri={user.avatar} size={size} vipLevel={vipLevel} />
        ) : user ? (
          <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: speaking ? colors.pink : 'transparent' }} />
        ) : (
          <View style={[styles.emptySeat, { width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name="add" size={22} color={colors.textDim} />
          </View>
        )}
        {muted && (
          <View style={styles.mutedBadge}>
            <Ionicons name="mic-off" size={11} color="#fff" />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {host && <Text style={{ fontSize: 11 }}>👑</Text>}
        <Text style={styles.seatName} numberOfLines={1}>
          {user ? user.name : `${index + 1}`}
        </Text>
        {user?.verified && <VerifiedBadge size={11} />}
      </View>
    </Pressable>
  );
}

function ChatLine({ msg }: { msg: ChatMsg }) {
  if (msg.system) {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  const u = userById(msg.userId!);
  return (
    <View style={styles.chatLine}>
      <Text style={styles.chatText}>
        <Text style={{ color: msg.userId === 'me' ? colors.gold : '#C4B5FD', fontWeight: '700' }}>{u.name}: </Text>
        {msg.text}
      </Text>
    </View>
  );
}

function RoundBtn({ icon, onPress, active, gift, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; gift?: boolean; label: string }) {
  if (gift) {
    return (
      <Pressable onPress={onPress} accessibilityLabel={label}>
        <LinearGradient colors={['#F59E0B', '#EC4899']} style={styles.round}>
          <Ionicons name={icon} size={20} color="#fff" />
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={[styles.round, { backgroundColor: active ? colors.primary : colors.cardAlt }]}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

function GiftSheet({
  visible,
  onClose,
  recipients,
  initialTo,
  coins,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  recipients: string[];
  initialTo?: string | null;
  coins: number;
  onSend: (g: Gift, to: string) => void;
}) {
  const [selected, setSelected] = useState<Gift>(GIFTS[0]);
  const [to, setTo] = useState<string | null>(initialTo ?? null);
  const target = to && recipients.includes(to) ? to : recipients[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Kime?</Text>
        {recipients.length === 0 ? (
          <Text style={{ color: colors.textDim, marginBottom: 12 }}>Koltukta kimse yok.</Text>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {recipients.map((id) => (
              <Pressable key={id} onPress={() => setTo(id)} style={{ opacity: id === target ? 1 : 0.45 }}>
                <Avatar uri={userById(id).avatar} size={40} ring={id === target} />
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.giftGrid}>
          {GIFTS.map((g) => (
            <Pressable key={g.id} onPress={() => setSelected(g)} style={[styles.giftCell, selected.id === g.id && styles.giftSelected]}>
              <Text style={{ fontSize: 34 }}>{g.emoji}</Text>
              <Text style={styles.giftName}>{g.name}</Text>
              <Text style={styles.giftPrice}>🪙 {g.price}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <CoinPill coins={coins} onPress={() => { onClose(); router.push('/cuzdan'); }} />
          <GradientButton title="Gönder" icon="send" onPress={() => target && onSend(selected, target)} />
        </View>
      </View>
    </Modal>
  );
}

function GiftAnimation({ gift, onDone }: { gift: Gift; onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.delay(900),
      Animated.timing(v, { toValue: 2, duration: 400, useNativeDriver: true }),
    ]).start(() => done.current());
  }, [v]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Text
        style={{
          fontSize: 140,
          opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.6] }) },
            { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [120, 0, -80] }) },
          ],
        }}
      >
        {gift.emoji}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 12 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 10, rowGap: 14 },
  seat: { width: '25%', alignItems: 'center', gap: 6 },
  hostSeat: { width: '100%' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: colors.pink },
  emptySeat: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  seatName: { color: '#fff', fontSize: 12, maxWidth: 70 },
  systemMsg: { alignSelf: 'flex-start', backgroundColor: 'rgba(139,92,246,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  systemText: { color: '#DDD6FE', fontSize: 12 },
  chatLine: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '85%' },
  chatText: { color: '#fff', fontSize: 14 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, minWidth: 0, backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pk: { marginHorizontal: 12, marginTop: 4, gap: 6 },
  pkTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pkName: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '600' },
  pkTimer: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  pkTrack: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  pkScore: { color: '#fff', fontWeight: '800', fontSize: 12 },
  listenerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  entry: { position: 'absolute', top: 110, left: 12, right: 12 },
  entryInner: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  entryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  giftSelected: { borderColor: colors.pink, backgroundColor: 'rgba(236,72,153,0.12)' },
  giftName: { color: '#fff', fontSize: 12, marginTop: 4 },
  giftPrice: { color: colors.gold, fontSize: 11, marginTop: 2 },
});
