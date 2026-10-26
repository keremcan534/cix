import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, FramedAvatar, VerifiedBadge } from '@/components/ui';
import { cosmeticById } from '@/data/catalog';
import { userById, type Gift, type Room, type User } from '@/data/mock';
import { micHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { colors, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

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
  compact,
  reaction,
  still,
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
  /** Host seat sharing the top row (e.g. with the boss seat). */
  compact?: boolean;
  /** Emoji reaction playing over the avatar; a new `key` restarts the animation. */
  reaction?: SeatReactionData;
  /** Reduce motion: show the reaction without bouncing. */
  still?: boolean;
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
    <Pressable onPress={onPress} style={[styles.seat, host ? (compact ? { width: 96 } : styles.hostSeat) : { width: '20%' }]}>
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
          <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: speaking ? semantic.live : 'transparent' }} />
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
        {reaction && user && <SeatReaction key={reaction.key} emoji={reaction.emoji} size={size} still={still} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {host && <Text style={{ fontSize: 12 }}>👑</Text>}
        <Text style={[styles.seatName, small && { fontSize: 12 }]} numberOfLines={1}>
          {user ? user.name : `${index + 1}`}
        </Text>
        {user?.verified && !small && <VerifiedBadge size={11} />}
      </View>
    </Pressable>
  );
}

export type SeatReactionData = { emoji: string; key: number };
export const REACTION_MS = 2600;

/** An emoji that pops over a seated person's avatar, wiggles, then fades (Timo-style seat emoji). */
function SeatReaction({ emoji, size, still }: { emoji: string; size: number; still?: boolean }) {
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) {
      Animated.sequence([Animated.delay(REACTION_MS - 400), Animated.timing(v, { toValue: 2, duration: 300, useNativeDriver: true })]).start();
      return;
    }
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1.15, duration: 220, useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ),
      Animated.delay(250),
      Animated.timing(v, { toValue: 2, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [v, still]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`Emoji: ${emoji}`}
      style={{
        position: 'absolute',
        width: size * 1.2,
        height: size * 1.2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: v.interpolate({ inputRange: [0, 0.2, 1, 1.15, 1.7, 2], outputRange: [0, 1, 1, 1, 1, 0] }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: [0.2, 1, 1.12, 1.3] }) },
          { rotate: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: ['-20deg', '0deg', '8deg', '0deg'] }) },
          { translateY: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: [size * 0.3, 0, -2, -size * 0.35] }) },
        ],
      }}
    >
      <Text style={{ fontSize: size * 0.82, lineHeight: size * 1.05 }}>{emoji}</Text>
    </Animated.View>
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
      <Text style={{ color: msg.userId === 'me' ? colors.gold : '#A5F3F5', fontWeight: '700' }}>{u.name}: </Text>
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
  gift,
  label,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Gold "money" button: gold is reserved for spending coins. */
  gift?: boolean;
  label: string;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={() => {
        if (gift) pressHaptic();
        else tapHaptic();
        onPress();
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}
    >
      {gift ? (
        <View style={[styles.round, styles.giftRound]}>
          <Icon3D name="gift" size={34} />
        </View>
      ) : (
        <View style={[styles.round, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name={icon} size={22} color="#fff" />
        </View>
      )}
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export type MicState = 'on' | 'off' | 'hand' | 'queued';
const MIC_LOOK: Record<MicState, { icon: keyof typeof Ionicons.glyphMap; caption: string; bg: string; edge: string; fg: string; a11y: string }> = {
  on: { icon: 'mic', caption: 'AÇIK', bg: semantic.live, edge: semantic.liveEdge, fg: semantic.liveInk, a11y: 'Mikrofon açık, kapatmak için dokun' },
  off: { icon: 'mic-off', caption: 'KAPALI', bg: colors.cardAlt, edge: '#18112E', fg: '#FCA5A5', a11y: 'Mikrofon kapalı, açmak için dokun' },
  hand: { icon: 'hand-left', caption: 'EL KALDIR', bg: colors.primary, edge: semantic.actionEdge, fg: '#fff', a11y: 'El kaldır, konuşmak iste' },
  queued: { icon: 'hourglass', caption: 'SIRADA', bg: semantic.tonal, edge: 'transparent', fg: semantic.tonalText, a11y: 'Konuşmacı sırasındasın' },
};

/** The biggest control in the room: state is shown by color, icon and caption together, never by color alone. */
export function MicBtn({ state, queuePos, onPress }: { state: MicState; queuePos?: number; onPress: () => void }) {
  const look = MIC_LOOK[state];
  const caption = state === 'queued' && queuePos !== undefined ? `SIRA ${queuePos + 1}` : look.caption;
  return (
    <Pressable
      onPress={() => {
        micHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={look.a11y}
      accessibilityState={{ checked: state === 'on' }}
      style={{ alignItems: 'center', gap: 2 }}
    >
      {({ pressed }) => (
        <>
          <View style={{ borderRadius: 28, backgroundColor: look.edge, paddingBottom: pressed ? 0 : 4, marginTop: pressed ? 4 : 0 }}>
            <View style={[styles.micRound, { backgroundColor: look.bg }]}>
              <Ionicons name={look.icon} size={26} color={look.fg} />
            </View>
          </View>
          <Text style={[styles.micCaption, state === 'on' && { color: semantic.live }]}>{caption}</Text>
        </>
      )}
    </Pressable>
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
        <LinearGradient colors={['#FF6576', '#F43F5E']} style={{ flex: Math.max(ratio, 0.04), justifyContent: 'center', paddingLeft: 8 }}>
          <Text style={styles.pkScore}>{pk.ours}</Text>
        </LinearGradient>
        <LinearGradient colors={['#3B82F6', '#0E7C9A']} style={{ flex: Math.max(1 - ratio, 0.04), justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
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

export const roomStyles = StyleSheet.create({
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
});

const styles = StyleSheet.create({
  seat: { alignItems: 'center', gap: 4 },
  hostSeat: { width: '100%' },
  ring: { position: 'absolute', borderWidth: 4, borderColor: semantic.live },
  emptySeat: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  roleBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: colors.bg, borderRadius: 10, padding: 2 },
  seatName: { color: '#fff', fontSize: 12, maxWidth: 64 },
  systemMsg: { alignSelf: 'flex-start', backgroundColor: 'rgba(19,217,223,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  systemText: { color: '#CFFAFE', fontSize: 12 },
  botMsg: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '90%' },
  botTag: { color: colors.green, fontSize: 11, fontWeight: '900' },
  botText: { color: '#BBF7D0', fontSize: 12, flexShrink: 1 },
  chatLine: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '85%' },
  chatText: { color: '#fff', fontSize: 14 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  giftRound: { backgroundColor: colors.cardAlt, borderWidth: 2, borderColor: semantic.money },
  micRound: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  micCaption: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pk: { marginHorizontal: 12, marginTop: 4, gap: 6 },
  pkTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pkName: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  pkTimer: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  pkTrack: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  pkScore: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pkMvp: { color: colors.gold, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  listenerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  sheet: roomStyles.sheet,
  sheetTitle: roomStyles.sheetTitle,
});
