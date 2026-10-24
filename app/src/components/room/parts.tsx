import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, CoinPill, FramedAvatar, GradientButton, VerifiedBadge } from '@/components/ui';
import { cosmeticById } from '@/data/catalog';
import { GIFTS, userById, type Gift, type Room, type User } from '@/data/mock';
import { colors } from '@/theme';

export type ChatMsg = { id: string; userId?: string; text: string; system?: boolean; bot?: boolean };
export type RoomRole = 'owner' | 'admin' | 'member';
export const ROLE_RANK: Record<RoomRole, number> = { owner: 3, admin: 2, member: 1 };
export type Pk = { opponent: Room; ours: number; theirs: number; left: number; phase: 'inviting' | 'countdown' | 'live' | 'done'; result?: 'win' | 'lose' | 'draw'; mvp?: string };

export function Seat({
  index,
  userId,
  host,
  small,
  vipLevel,
  frameId,
  speaking,
  muted,
  role,
  locked,
  onPress,
}: {
  index: number;
  userId: string | null;
  host: boolean;
  small: boolean;
  vipLevel: number;
  frameId?: string;
  speaking: boolean;
  muted: boolean;
  role?: RoomRole;
  locked?: boolean;
  onPress: () => void;
}) {
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
  const size = host ? 70 : small ? 48 : 56;

  return (
    <Pressable onPress={onPress} style={[styles.seat, host ? styles.hostSeat : { width: '20%' }]}>
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
        {user && (vipLevel > 0 || frameId) ? (
          <FramedAvatar uri={user.avatar} size={size} vipLevel={vipLevel} frameId={frameId} />
        ) : user ? (
          <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: speaking ? colors.pink : 'transparent' }} />
        ) : (
          <View style={[styles.emptySeat, { width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name={locked ? 'lock-closed' : 'add'} size={small ? 18 : 22} color={colors.textDim} />
          </View>
        )}
        {muted && (
          <View style={styles.mutedBadge}>
            <Ionicons name="mic-off" size={10} color="#fff" />
          </View>
        )}
        {role === 'admin' && (
          <View style={styles.roleBadge}>
            <Text style={{ fontSize: 9 }}>🛡️</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {host && <Text style={{ fontSize: 11 }}>👑</Text>}
        <Text style={[styles.seatName, small && { fontSize: 11 }]} numberOfLines={1}>
          {user ? user.name : `${index + 1}`}
        </Text>
        {user?.verified && !small && <VerifiedBadge size={11} />}
      </View>
    </Pressable>
  );
}

export function ChatLine({ msg, bubbleId }: { msg: ChatMsg; bubbleId?: string }) {
  if (msg.bot) {
    return (
      <View style={styles.botMsg}>
        <Text style={styles.botTag}>🤖 BOT</Text>
        <Text style={styles.botText}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.system) {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  const u = userById(msg.userId!);
  const bubble = msg.userId === 'me' ? cosmeticById(bubbleId) : undefined;
  const content = (
    <Text style={styles.chatText}>
      <Text style={{ color: msg.userId === 'me' ? colors.gold : '#C4B5FD', fontWeight: '700' }}>{u.name}: </Text>
      {msg.text}
    </Text>
  );
  if (bubble?.color) {
    return (
      <LinearGradient colors={bubble.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatLine}>
        {content}
      </LinearGradient>
    );
  }
  return <View style={[styles.chatLine, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>{content}</View>;
}

export function RoundBtn({
  icon,
  onPress,
  active,
  gift,
  label,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  gift?: boolean;
  label: string;
  badge?: number;
}) {
  const inner = gift ? (
    <LinearGradient colors={['#F59E0B', '#EC4899']} style={styles.round}>
      <Ionicons name={icon} size={20} color="#fff" />
    </LinearGradient>
  ) : (
    <View style={[styles.round, { backgroundColor: active ? colors.primary : colors.cardAlt }]}>
      <Ionicons name={icon} size={20} color="#fff" />
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityLabel={label}>
      {inner}
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function GiftSheet({
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
  onSend: (g: Gift, to: string[], count: number) => void;
}) {
  const [selected, setSelected] = useState<Gift>(GIFTS[0]);
  const [count, setCount] = useState(1);
  const [picked, setPicked] = useState<string[]>(() => {
    const first = initialTo && recipients.includes(initialTo) ? initialTo : recipients[0];
    return first ? [first] : [];
  });
  const targets = picked.filter((id) => recipients.includes(id));
  const allSelected = recipients.length > 0 && targets.length === recipients.length;
  const total = selected.price * count * targets.length;
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[styles.sheetTitle, { flex: 1, marginBottom: 0 }]}>Kime? ({targets.length})</Text>
          {recipients.length > 1 && (
            <Pressable onPress={() => setPicked(allSelected ? recipients.slice(0, 1) : recipients)} hitSlop={8}>
              <Text style={{ color: colors.pink, fontWeight: '800' }}>{allSelected ? 'Seçimi kaldır' : 'Hepsini seç'}</Text>
            </Pressable>
          )}
        </View>
        {recipients.length === 0 ? (
          <Text style={{ color: colors.textDim, marginBottom: 12 }}>Koltukta kimse yok.</Text>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {recipients.map((id) => (
              <Pressable key={id} onPress={() => togglePick(id)} style={{ opacity: targets.includes(id) ? 1 : 0.45 }}>
                <Avatar uri={userById(id).avatar} size={40} ring={targets.includes(id)} />
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
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {[1, 5, 10, 99].map((n) => (
            <Pressable key={n} onPress={() => setCount(n)} style={[styles.countChip, count === n && { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>x{n}</Text>
            </Pressable>
          ))}
        </View>
        {/* Price confirmation before spending (spec §7.2). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <View>
            <CoinPill
              coins={coins}
              onPress={() => {
                onClose();
                router.push('/cuzdan');
              }}
            />
            <Text style={{ color: total > coins ? colors.red : colors.textDim, fontSize: 12, marginTop: 4 }}>
              {targets.length} alıcı × {count} × {selected.price} = 🪙 {total.toLocaleString('tr-TR')}
            </Text>
          </View>
          <GradientButton title="Gönder" icon="send" onPress={() => targets.length && onSend(selected, targets, count)} />
        </View>
      </View>
    </Modal>
  );
}

export function GiftAnimation({ gift, onDone }: { gift: Gift; onDone: () => void }) {
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

export function PkBar({ pk, roomTitle }: { pk: Pk; roomTitle: string }) {
  const ratio = pk.ours + pk.theirs === 0 ? 0.5 : pk.ours / (pk.ours + pk.theirs);
  const status =
    pk.phase === 'inviting'
      ? '📨 Davet gönderildi...'
      : pk.phase === 'countdown'
        ? `⏳ ${pk.left}`
        : pk.phase === 'live'
          ? `⚔️ ${pk.left}s`
          : pk.result === 'win'
            ? '🏆 KAZANDIN'
            : pk.result === 'lose'
              ? 'KAYBETTİN'
              : 'BERABERE';
  return (
    <View style={styles.pk}>
      <View style={styles.pkTop}>
        <Text style={styles.pkName} numberOfLines={1}>
          {roomTitle}
        </Text>
        <Text style={styles.pkTimer}>{status}</Text>
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
      {pk.phase === 'done' && pk.mvp && <Text style={styles.pkMvp}>⭐ MVP destekçi: {userById(pk.mvp).name}</Text>}
    </View>
  );
}

export function ListenersModal({
  visible,
  onClose,
  users,
  canInvite,
  onInvite,
  total,
  invisibleMe,
}: {
  visible: boolean;
  onClose: () => void;
  users: User[];
  canInvite: boolean;
  onInvite: (id: string) => void;
  total: number;
  invisibleMe: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '60%' }]}>
        <Text style={styles.sheetTitle}>Dinleyiciler ({total})</Text>
        {invisibleMe && <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 6 }}>👻 Gizli girişte: listede görünmüyorsun (moderasyon kayıtlarında görünürsün).</Text>}
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.listenerRow}>
              <Avatar uri={item.avatar} size={40} online={item.online} />
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  onClose();
                  router.push(`/kullanici/${item.id}`);
                }}
              >
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

export function EntryBanner({ text, color }: { text: string; color: readonly [string, string] }) {
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
      <LinearGradient colors={color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.entryInner}>
        <Text style={styles.entryText}>{text}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export const roomStyles = StyleSheet.create({
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
});

const styles = StyleSheet.create({
  seat: { alignItems: 'center', gap: 4 },
  hostSeat: { width: '100%' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: colors.pink },
  emptySeat: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  roleBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: colors.bg, borderRadius: 10, padding: 2 },
  seatName: { color: '#fff', fontSize: 12, maxWidth: 64 },
  systemMsg: { alignSelf: 'flex-start', backgroundColor: 'rgba(139,92,246,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  systemText: { color: '#DDD6FE', fontSize: 12 },
  botMsg: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '90%' },
  botTag: { color: colors.green, fontSize: 10, fontWeight: '900' },
  botText: { color: '#BBF7D0', fontSize: 12, flexShrink: 1 },
  chatLine: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '85%' },
  chatText: { color: '#fff', fontSize: 14 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pk: { marginHorizontal: 12, marginTop: 4, gap: 6 },
  pkTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pkName: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '600' },
  pkTimer: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  pkTrack: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  pkScore: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pkMvp: { color: colors.gold, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  listenerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  entry: { position: 'absolute', top: 110, left: 12, right: 12 },
  entryInner: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  entryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  sheet: roomStyles.sheet,
  sheetTitle: roomStyles.sheetTitle,
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  giftSelected: { borderColor: colors.pink, backgroundColor: 'rgba(236,72,153,0.12)' },
  giftName: { color: '#fff', fontSize: 12, marginTop: 4 },
  giftPrice: { color: colors.gold, fontSize: 11, marginTop: 2 },
  countChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
