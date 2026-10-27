import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';

import { Avatar, FramedAvatar, VerifiedBadge } from '@/components/ui';
import { GiftArt, giftArtOf, giftSource } from '@/components/GiftArt';
import { cosmeticById } from '@/data/catalog';
import { userById, type Gift } from '@/data/mock';
import type { FeedMsg } from '@/lib/chat-feed';
import { micHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { colors, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

export type ChatMsg = FeedMsg;
export type RoomRole = 'owner' | 'admin' | 'member';
export const ROLE_RANK: Record<RoomRole, number> = { owner: 3, admin: 2, member: 1 };

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
  anchorRef,
  camera,
  teamColor,
  pkPoints,
  silenced,
  avatarSize,
  slotWidth,
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
  /** Receives the avatar view so the room can measure where gifts should land. */
  anchorRef?: (v: HostInstance | null) => void;
  /** Sharing camera in the room (live badge on the seat). */
  camera?: boolean;
  /** Team PK: ring in the team colour around the avatar. */
  teamColor?: string;
  /** PK running: points this person received since the PK started (server value). */
  pkPoints?: number;
  /** I muted this person for myself only. */
  silenced?: boolean;
  /** Layout overrides (team PK arena). */
  avatarSize?: number;
  slotWidth?: number;
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
  const size = avatarSize ?? (host ? 70 : small ? 48 : 56);
  const label = user ? `${index + 1}. mikrofon, ${user.name}${muted ? ', mikrofonu kapalı' : ''}${silenced ? ', senin için sessizde' : ''}${pkPoints !== undefined ? `, ${pkPoints} PK puanı` : ''}` : `${index + 1}. mikrofon, ${locked ? 'kilitli' : 'boş'}`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.seat, slotWidth ? { width: slotWidth } : host ? (compact ? { width: 96 } : styles.hostSeat) : { width: '20%' }]}>
      <View ref={anchorRef} collapsable={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
        {teamColor && user && <View pointerEvents="none" style={[styles.teamRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: teamColor }]} />}
        {camera && user && (
          <View style={styles.camBadge} accessibilityLabel="Kamerası açık">
            <Ionicons name="videocam" size={10} color={semantic.liveInk} />
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
        {silenced && user && (
          <View style={styles.silencedBadge}>
            <Ionicons name="volume-mute" size={10} color="#fff" />
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
      {user && pkPoints !== undefined && <PkPoints value={pkPoints} still={still} />}
    </Pressable>
  );
}

/** Big gifts get a stronger (still short) bump. */
const BIG_PK_GIFT = 1_000;
/**
 * PK points under a seat. When the value grows, the pill bumps once and a small "+N" rises and fades
 * (≈0.5 s, native driver only). Several gifts in a row just restart it, so a burst stays cheap.
 */
export function PkPoints({ value, still }: { value: number; still?: boolean }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null);
  const [v] = useState(() => new Animated.Value(1));
  if (value !== shown) {
    // Derived transition: remember the increase for the "+N" bubble.
    setShown(value);
    setDelta(value > shown ? { n: value - shown, key: (delta?.key ?? 0) + 1 } : null);
  }
  const big = (delta?.n ?? 0) >= BIG_PK_GIFT;
  useEffect(() => {
    if (!delta || still) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: big ? 750 : 500, useNativeDriver: true }).start();
  }, [delta, still, big, v]);
  return (
    <View style={styles.pkWrap}>
      <Animated.View style={[styles.pkPill, big && styles.pkPillBig, { transform: [{ scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, big ? 1.35 : 1.18, 1] }) }] }]}>
        <Text style={styles.pkText} numberOfLines={1}>
          🎁 {value.toLocaleString('tr-TR')}
        </Text>
      </Animated.View>
      {delta && !still && (
        <Animated.Text
          key={delta.key}
          pointerEvents="none"
          style={[styles.pkDelta, big && { color: colors.gold, fontSize: 14 }, { opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }] }]}
        >
          +{delta.n.toLocaleString('tr-TR')}
        </Animated.Text>
      )}
    </View>
  );
}

export type SeatReactionData = { emoji: string; key: number };
export const REACTION_MS = 2600;

/** An emoji that pops over a seated person's avatar, wiggles, then fades (seat reaction). */
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

export function ChatLine({ msg, bubbleId, onRetry }: { msg: ChatMsg; bubbleId?: string; onRetry?: (msg: ChatMsg) => void }) {
  if (msg.bot) {
    return (
      <View style={styles.botMsg}>
        <Text style={styles.botTag}>🤖 BOT</Text>
        <Text style={styles.botText}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.kind === 'gift' || msg.gift) {
    const g = msg.gift;
    const to = g ? (g.toIds.length > 1 ? `${g.toIds.length} kişiye` : userById(g.toIds[0]).name) : '';
    return (
      <View style={styles.giftMsg} accessibilityLabel={g ? `Hediye: ${userById(g.fromId).name}, ${to} ${g.name} ${g.count} adet` : msg.text}>
        {g ? (
          <>
            <Avatar uri={userById(g.fromId).avatar} size={22} />
            <Text style={styles.giftText}>
              <Text style={styles.giftName}>{userById(g.fromId).name}</Text>
              <Text style={{ color: colors.textDim }}> → </Text>
              <Text style={styles.giftName}>{to}</Text>
              {giftArtOf(g.giftId) ? `  ${g.name}` : `  ${g.emoji} ${g.name}`}
              {`${g.count > 1 ? ` ×${g.count}` : ''}${g.lucky ? ' · Lucky' : ''}`}
            </Text>
            {giftArtOf(g.giftId) && <GiftArt giftId={g.giftId} emoji={g.emoji} size={24} />}
          </>
        ) : (
          <Text style={styles.giftText}>{msg.text}</Text>
        )}
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
  const line = bubble?.color ? (
    <LinearGradient colors={bubble.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatLine}>
      {content}
    </LinearGradient>
  ) : (
    <View style={[styles.chatLine, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>{content}</View>
  );
  if (msg.status !== 'failed') return line;
  return (
    <View style={{ alignSelf: 'flex-start', gap: 3, maxWidth: '85%' }}>
      <View style={{ opacity: 0.6 }}>{line}</View>
      <Pressable onPress={() => onRetry?.(msg)} accessibilityRole="button" accessibilityLabel="Mesaj gönderilemedi, tekrar dene" hitSlop={6}>
        <Text style={styles.failed}>⚠️ Gönderilemedi · tekrar dene</Text>
      </Pressable>
    </View>
  );
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

/** `held`: the user turned the mic on but no audio goes out right now (permission, call, connection…). */
export type MicState = 'on' | 'off' | 'hand' | 'queued' | 'held';
const MIC_LOOK: Record<MicState, { icon: keyof typeof Ionicons.glyphMap; caption: string; bg: string; edge: string; fg: string; a11y: string }> = {
  on: { icon: 'mic', caption: 'AÇIK', bg: semantic.live, edge: semantic.liveEdge, fg: semantic.liveInk, a11y: 'Mikrofon açık, kapatmak için dokun' },
  off: { icon: 'mic-off', caption: 'KAPALI', bg: colors.cardAlt, edge: '#18112E', fg: '#FCA5A5', a11y: 'Mikrofon kapalı, açmak için dokun' },
  hand: { icon: 'hand-left', caption: 'EL KALDIR', bg: colors.primary, edge: semantic.actionEdge, fg: '#fff', a11y: 'El kaldır, konuşmak iste' },
  queued: { icon: 'hourglass', caption: 'SIRADA', bg: semantic.tonal, edge: 'transparent', fg: semantic.tonalText, a11y: 'Konuşmacı sırasındasın' },
  held: { icon: 'mic-outline', caption: 'DURAKLADI', bg: 'rgba(246,189,96,0.2)', edge: semantic.moneyEdge, fg: colors.gold, a11y: 'Mikrofonun açık ama şu an ses gitmiyor; kapatmak için dokun' },
};

/** The biggest control in the room: state is shown by color, icon and caption together, never by color alone. */
export function MicBtn({ state, queuePos, caption: captionOverride, hint, onPress }: { state: MicState; queuePos?: number; caption?: string; hint?: string; onPress: () => void }) {
  const look = MIC_LOOK[state];
  const caption = captionOverride ?? (state === 'queued' && queuePos !== undefined ? `SIRA ${queuePos + 1}` : look.caption);
  return (
    <Pressable
      onPress={() => {
        micHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={hint ?? look.a11y}
      accessibilityState={{ checked: state === 'on' || state === 'held' }}
      aria-checked={state === 'on' || state === 'held'}
      style={{ alignItems: 'center', gap: 2 }}
    >
      {({ pressed }) => (
        <>
          <View style={{ borderRadius: 28, backgroundColor: look.edge, paddingBottom: pressed ? 0 : 4, marginTop: pressed ? 4 : 0 }}>
            <View style={[styles.micRound, { backgroundColor: look.bg }]}>
              <Ionicons name={look.icon} size={26} color={look.fg} />
            </View>
          </View>
          <Text style={[styles.micCaption, state === 'on' && { color: semantic.live }, state === 'held' && { color: colors.gold }]}>{caption}</Text>
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

  const motion = {
    opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.6] }) },
      { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [120, 0, -80] }) },
    ],
  };
  const art = giftArtOf(gift.id);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {art ? (
        <Animated.Image source={giftSource(art, 200)} style={[{ width: 200, height: 200 }, motion]} resizeMode="contain" />
      ) : (
        <Animated.Text style={[{ fontSize: 140 }, motion]}>{gift.emoji}</Animated.Text>
      )}
    </View>
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
  teamRing: { position: 'absolute', borderWidth: 3 },
  camBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: semantic.live, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.bg },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  roleBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: colors.bg, borderRadius: 10, padding: 2 },
  silencedBadge: { position: 'absolute', right: 0, top: 0, backgroundColor: colors.cardAlt, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
  pkWrap: { alignItems: 'center', marginTop: -1 },
  pkPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(246,189,96,0.18)', borderColor: 'rgba(246,189,96,0.55)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 76 },
  pkPillBig: { backgroundColor: 'rgba(246,189,96,0.3)' },
  pkText: { color: colors.gold, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pkDelta: { position: 'absolute', top: -14, color: '#FDE7C2', fontWeight: '900', fontSize: 12 },
  giftMsg: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(246,189,96,0.16)', borderColor: 'rgba(246,189,96,0.35)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, maxWidth: '90%' },
  giftText: { color: '#FDE7C2', fontSize: 13, flexShrink: 1 },
  giftName: { color: '#fff', fontWeight: '800' },
  failed: { color: '#FF9AA1', fontSize: 12, fontWeight: '700' },
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
  sheet: roomStyles.sheet,
  sheetTitle: roomStyles.sheetTitle,
});
