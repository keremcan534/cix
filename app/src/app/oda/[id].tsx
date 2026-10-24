import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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

import { Avatar, CoinPill, GradientButton, VerifiedBadge } from '@/components/ui';
import { BOT_LINES, GIFTS, ME, USERS, roomById, userById, type Gift, type Room } from '@/data/mock';
import { useApp } from '@/store';
import { colors } from '@/theme';

type ChatMsg = { id: string; userId?: string; text: string; system?: boolean };

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

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export default function VoiceRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const room = id === 'yeni' ? NEW_ROOM : roomById(id);
  const { coins, spendCoins } = useApp();

  const [seats, setSeats] = useState<(string | null)[]>(room.seatUserIds);
  const [micOn, setMicOn] = useState(room.hostId === 'me');
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'w', system: true, text: 'Odaya hoş geldin! Saygılı ol, iyi eğlenceler 💜' },
  ]);
  const [draft, setDraft] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftFx, setGiftFx] = useState<Gift | null>(null);
  const [listeners, setListeners] = useState(room.listeners);

  const mySeat = seats.indexOf('me');
  const amSeated = mySeat >= 0;
  const seatedOthers = useMemo(() => seats.filter((s): s is string => !!s && s !== 'me'), [seats]);

  // Fake "who is talking" so the room feels alive.
  useEffect(() => {
    const t = setInterval(() => {
      const next = new Set<string>();
      seatedOthers.forEach((uid) => Math.random() < 0.35 && next.add(uid));
      if (amSeated && micOn && Math.random() < 0.5) next.add('me');
      setSpeaking(next);
    }, 900);
    return () => clearInterval(t);
  }, [seatedOthers, amSeated, micOn]);

  // Fake chat & join activity.
  useEffect(() => {
    const t = setInterval(() => {
      const u = pick(USERS);
      const joined = Math.random() < 0.3;
      if (joined) setListeners((n) => n + 1);
      setMessages((m) => [
        ...m.slice(-40),
        joined
          ? { id: String(Date.now()), system: true, text: `${u.name} odaya katıldı` }
          : { id: String(Date.now()), userId: u.id, text: pick(BOT_LINES) },
      ]);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const addMsg = (msg: Omit<ChatMsg, 'id'>) => setMessages((m) => [...m, { ...msg, id: String(Date.now() + Math.random()) }]);

  const onSeatPress = (index: number) => {
    const uid = seats[index];
    if (uid === 'me') {
      Alert.alert('Koltuktan in', 'Dinleyici olarak devam etmek ister misin?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İn', onPress: () => setSeats((s) => s.map((x) => (x === 'me' ? null : x))) },
      ]);
      return;
    }
    if (uid) {
      router.push(`/sohbet/${uid}`);
      return;
    }
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
    if (!spendCoins(gift.price)) {
      setGiftOpen(false);
      Alert.alert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    setGiftOpen(false);
    setGiftFx(gift);
    addMsg({ system: true, text: `🎁 ${ME.name}, ${userById(toId).name} kişisine ${gift.emoji} ${gift.name} gönderdi!` });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: room.cover }} style={StyleSheet.absoluteFill} blurRadius={25} />
      <LinearGradient colors={['rgba(18,11,36,0.55)', 'rgba(18,11,36,0.97)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.header}>
            <Avatar uri={userById(room.hostId).avatar} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {room.title}
              </Text>
              <Text style={styles.sub}>
                ID {room.id.toUpperCase()} · 👥 {listeners}
              </Text>
            </View>
            <CoinPill coins={coins} />
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {/* Seats */}
          <View style={styles.seatGrid}>
            {seats.map((uid, i) => (
              <Seat key={i} index={i} userId={uid} host={i === 0} speaking={!!uid && speaking.has(uid)} muted={uid === 'me' && !micOn} onPress={() => onSeatPress(i)} />
            ))}
          </View>

          {/* Chat */}
          <FlatList
            style={{ flex: 1, marginHorizontal: 12 }}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatLine msg={item} />}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          />

          {/* Bottom bar */}
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
            {amSeated && (
              <RoundBtn icon={micOn ? 'mic' : 'mic-off'} active={micOn} onPress={() => setMicOn((m) => !m)} />
            )}
            <RoundBtn icon="gift" gift onPress={() => setGiftOpen(true)} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <GiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} recipients={seats.filter((s): s is string => !!s && s !== 'me')} coins={coins} onSend={sendGift} />
      {giftFx && <GiftAnimation gift={giftFx} onDone={() => setGiftFx(null)} />}
    </View>
  );
}

function Seat({ index, userId, host, speaking, muted, onPress }: { index: number; userId: string | null; host: boolean; speaking: boolean; muted: boolean; onPress: () => void }) {
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
        {user ? (
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

function RoundBtn({ icon, onPress, active, gift }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; gift?: boolean }) {
  if (gift) {
    return (
      <Pressable onPress={onPress}>
        <LinearGradient colors={['#F59E0B', '#EC4899']} style={styles.round}>
          <Ionicons name={icon} size={20} color="#fff" />
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.round, { backgroundColor: active ? colors.primary : colors.cardAlt }]}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

function GiftSheet({
  visible,
  onClose,
  recipients,
  coins,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  recipients: string[];
  coins: number;
  onSend: (g: Gift, to: string) => void;
}) {
  const [selected, setSelected] = useState<Gift>(GIFTS[0]);
  const [to, setTo] = useState<string | null>(null);
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
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  giftSelected: { borderColor: colors.pink, backgroundColor: 'rgba(236,72,153,0.12)' },
  giftName: { color: '#fff', fontSize: 12, marginTop: 4 },
  giftPrice: { color: colors.gold, fontSize: 11, marginTop: 2 },
});
