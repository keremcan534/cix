import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, type HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, FramedAvatar, VerifiedBadge } from '@/components/ui';
import { GiftArt, giftArtOf, giftSource } from '@/components/GiftArt';
import { EmojiText, ReactionArt, StickerArt, isAnimatedSticker, messagePreview, stickersOf } from '@/components/ReactionArt';
import { cosmeticById } from '@/data/catalog';
import { userById, type Gift } from '@/data/mock';
import type { FeedMsg } from '@/lib/chat-feed';
import { stickerIdOf } from '@/lib/stickers';
import { micHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { SCRIM, colors, edge, fonts, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Art } from '@/components/Art';
import { HOST_FRAME_SCALE, SEAT_ART } from '@/components/RoomArt';
import { Gloss, Shine, useSpringPress } from '@/components/fx/surface';
import { Photo } from '@/components/photo';
import { BondBubble, BondChip, BondLink } from '@/components/room/room-bonds';
import type { RoomBond } from '@/data/bonds';
import { nameLine, nameSize } from '@/lib/seat-fit';
import { levelsLive, voiceLevel } from '@/lib/live/voice-level';
import { RollingNumber } from '@/components/fx/rolling-number';
import { BounceBadge } from '@/components/fx/bounce-badge';
import { AssetView } from '@/components/fx/anim-player';
import type { Asset } from '@/data/animations';

export type ChatMsg = FeedMsg;
export type RoomRole = 'owner' | 'admin' | 'member';
export const ROLE_RANK: Record<RoomRole, number> = { owner: 3, admin: 2, member: 1 };

/** The speaking ring's color: pink for women, blue for men, white when the gender isn't known or is hidden. */
export const VOICE_RING = { Kadın: semantic.live, Erkek: '#3D9BFF', none: '#FFFFFF' } as const;
const ringGlow = (c: string) => `0 0 12px ${c}CC`;

export function Seat({
  index,
  userId,
  gender,
  host,
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
  avatarSize,
  slotWidth,
  modMuted,
  invitee,
  similarity,
  bondLink,
  mini,
  enterDelay,
  onPress,
}: {
  index: number;
  userId: string | null;
  /** The seated person's gender, for the speaking ring's color (VOICE_RING). */
  gender?: 'Kadın' | 'Erkek' | null;
  host: boolean;
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
  /** Layout overrides (team PK arena). */
  avatarSize?: number;
  slotWidth?: number;
  /** The mic was switched off by the room's management (red badge), not by its owner (grey badge). */
  modMuted?: boolean;
  /** Empty seat held for a pending mic invite (name of the invited person). */
  invitee?: string;
  /** How much this person has in common with you (lib/similarity), read out with the seat; not on your own seat. */
  similarity?: number;
  /** Lv4 bond with the person on the next seat of the row: a line to their avatar (`gap`: the row's gap). */
  bondLink?: { bond: RoomBond; gap: number } | null;
  /** Küçült: a small avatar (no frame) over the mic's number, in the room's mic strip; nothing else under it. */
  mini?: boolean;
  /** Entering the room the mics come in one after another, like a wave: this seat's wait (ms). */
  enterDelay?: number;
  onPress: () => void;
}) {
  // The ring around a speaker grows and glows with their voice (lib/live/voice-level). The demo's rooms have no
  // voices: while someone "talks" there, the level flickers the way speech does.
  const level = userId ? voiceLevel(userId) : voiceLevel('');
  useEffect(() => {
    if (!speaking || still || levelsLive()) return;
    const steps = [0.55, 0.2, 0.85, 0.35, 0.7, 0.15, 0.95, 0.4];
    const talk = Animated.loop(Animated.sequence(steps.map((toValue, i) => Animated.timing(level, { toValue, duration: 110 + (i % 3) * 45, useNativeDriver: true }))));
    talk.start();
    return () => {
      talk.stop();
      level.setValue(0);
    };
  }, [speaking, still, level]);
  // The wave on entering, and the face sinking a little under the finger.
  const [appear] = useState(() => new Animated.Value(enterDelay === undefined || still ? 1 : 0));
  useEffect(() => {
    if (enterDelay === undefined || still) return;
    Animated.timing(appear, { toValue: 1, delay: enterDelay, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [appear, enterDelay, still]);
  const press = useSpringPress(0.9);

  const user = userId ? userById(userId) : null;
  // The room's word wins (its looks, null: hidden); else what this phone knows of them.
  const g = gender !== undefined ? gender : user?.showGender === false ? null : user?.gender;
  const ring = g ? VOICE_RING[g] : VOICE_RING.none;
  const size = avatarSize ?? (host ? 60 : 48);
  // Small faces: a smaller icon and no badge by the name. The name grows a little with the face (lib/seat-fit, which
  // sizes the stage by the same numbers) and may be as wide as the seat's slot.
  const small = size < 46;
  const name = { fontSize: nameSize(size), lineHeight: nameLine(size), maxWidth: slotWidth ? slotWidth - 6 : 64 };
  // An empty or locked seat is its picture (a pending invite keeps the gold bubble); the host's own photo sits in the
  // gold host frame unless they wear a VIP or shop frame.
  const seatArt = user ? undefined : locked ? SEAT_ART.locked : invitee ? undefined : SEAT_ART.empty;
  const hostFrame = host && !mini ? SEAT_ART.hostFrame : undefined;
  const frameSize = Math.round(size * HOST_FRAME_SCALE);
  const muteText = modMuted ? ', yönetim tarafından susturuldu' : muted ? ', mikrofonu kapalı' : '';
  const label = user
    ? `${index + 1}. mikrofon, ${user.name}${similarity !== undefined ? `, sana yüzde ${similarity} benzer` : ''}${muteText}${pkPoints !== undefined ? `, ${pkPoints} PK puanı` : ''}`
    : `${index + 1}. mikrofon, ${locked ? 'kilitli' : invitee ? `${invitee} için davet bekliyor` : 'boş'}`;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.seat, slotWidth ? { width: slotWidth } : host ? (compact ? { width: 96 } : styles.hostSeat) : { width: '20%' }]}
    >
      <Animated.View
        style={[
          styles.seatBody,
          { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
        ]}
      >
        <Animated.View ref={anchorRef} collapsable={false} style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: press.scale }] }, speaking && { boxShadow: `0 0 18px ${ring}A6` }]}>
          {speaking && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { width: size, height: size, borderRadius: size / 2, borderColor: ring, boxShadow: ringGlow(ring) },
                still
                  ? { opacity: 0.85, transform: [{ scale: 1.08 }] }
                  : { opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.38] }) }] },
              ]}
            />
          )}
          {user && !mini && (vipLevel > 0 || frameId) ? (
            <FramedAvatar uri={user.avatar} size={size} vipLevel={vipLevel} frameId={frameId} />
          ) : user ? (
            <>
              <Photo uri={user.avatar} kind="face" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: speaking ? ring : 'transparent' }} />
              {hostFrame !== undefined && (
                <Image
                  source={hostFrame}
                  style={{ position: 'absolute', width: frameSize, height: frameSize, left: (size - frameSize) / 2, top: (size - frameSize) / 2 }}
                  accessibilityIgnoresInvertColors
                />
              )}
            </>
          ) : seatArt !== undefined ? (
            <View style={{ width: size, height: size }}>
              <Image source={seatArt} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
              {!locked && (
                // The "+" on the seat's dark front, under its gold band.
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: size * 0.36, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="add" size={mini ? 12 : Math.round(Math.max(13, Math.min(24, size * 0.28)))} color="rgba(255,255,255,0.85)" />
                </View>
              )}
            </View>
          ) : (
            // A glass bubble lit from above instead of a dashed outline; gold while a mic invite is pending.
            <LinearGradient
              colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.02)']}
              style={[styles.emptySeat, { width: size, height: size, borderRadius: size / 2 }, invitee && !locked ? styles.invitedSeat : null]}
            >
              <Ionicons name={locked ? 'lock-closed' : invitee ? 'hourglass-outline' : 'add'} size={mini ? 13 : Math.round(Math.max(15, Math.min(28, size * 0.32)))} color={invitee && !locked ? colors.gold : 'rgba(255,255,255,0.42)'} />
            </LinearGradient>
          )}
          {teamColor && user && <View pointerEvents="none" style={[styles.teamRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: teamColor }]} />}
          {camera && user && (
            <View style={styles.camBadge} accessibilityLabel="Kamerası açık">
              <Ionicons name="videocam" size={10} color={semantic.liveInk} />
            </View>
          )}
          {(muted || modMuted) && (
            <View style={[styles.mutedBadge, !modMuted && styles.selfMutedBadge]}>
              <Ionicons name={modMuted ? 'mic-off' : 'mic-off-outline'} size={10} color="#fff" />
            </View>
          )}
          {role === 'admin' && (
            <View style={styles.roleBadge} accessibilityLabel="Oda yöneticisi">
              <Ionicons name="shield-checkmark" size={10} color={semantic.actionInk} />
            </View>
          )}
          {reaction && user && <SeatReaction key={reaction.key} emoji={reaction.emoji} art={reaction.art} pre={reaction.pre} badge={reaction.badge} badgeAt={reaction.badgeAt} ms={reaction.ms} size={size} still={still} />}
        </Animated.View>
        {mini ? (
          // Küçült: only the mic's number (the host's crown), so the strip stays one short line per row.
          <View style={styles.miniLabel}>{host ? <Icon3D name="crown" size={11} /> : <Text style={styles.miniNum}>{index + 1}</Text>}</View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {host && <Icon3D name="crown" size={14} />}
            <Text style={[styles.seatName, name, !user && { color: colors.textDim, fontWeight: '500' }]} numberOfLines={1}>
              {user ? user.name : invitee && !locked ? 'Davet' : `${index + 1}`}
            </Text>
            {user?.verified && !small && <VerifiedBadge size={11} />}
          </View>
        )}
        {user && pkPoints !== undefined && !mini && <PkPoints value={pkPoints} still={still} />}
      </Animated.View>
      {user && bondLink && !mini && <BondLink bond={bondLink.bond} size={size} gap={bondLink.gap} />}
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
          🎁 <RollingNumber value={value} duration={500} />
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

/**
 * `pre`: pictures that flash by before `emoji` settles (the die tumbling, Taş Kağıt Makas shuffling its hands). `badge`:
 * a short result under the picture (the dice's number, the hand's name), shown `badgeAt` ms in. `ms`: how long it all
 * stays. `art`: a Hareketli item's picture (lib/animations), drawn instead of `emoji` (then its name).
 */
export type SeatReactionData = { emoji: string; key: number; art?: Asset; pre?: string[]; badge?: string; badgeAt?: number; ms?: number };
/** The pop-in and three beats of a seat reaction; anything longer is held on the avatar before it fades. */
const BEAT_MS = 2600;
/** How long a seat reaction stays: the beats plus two seconds held on the avatar (the owner asked for 2 s more). */
export const REACTION_MS = BEAT_MS + 2000;
/** A Hamle with a result (lib/room-moves) stays long enough to be read. */
export const RESULT_MS = 6400;
const SHUFFLE_STEP_MS = 170;

/**
 * An emoji over a seated person's avatar (seat reaction): it pops in, beats a few times, then fades. A sticker or a
 * Hareketli picture covers the photo and stays on it; an animated sticker (the Emoji tab) plays over and over instead
 * of beating. A plain emoji is smaller and rises as it goes.
 */
export function SeatReaction({ emoji, art, size, still, pre, badge, badgeAt = 0, ms = REACTION_MS }: { emoji: string; size: number; still?: boolean } & Pick<SeatReactionData, 'art' | 'pre' | 'badge' | 'badgeAt' | 'ms'>) {
  // The shuffle before the result: one picture after another, then `emoji` (reduced motion shows the result at once).
  const shuffle = still ? 0 : (pre?.length ?? 0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= shuffle) return;
    const t = setTimeout(() => setStep((n) => n + 1), SHUFFLE_STEP_MS);
    return () => clearTimeout(t);
  }, [step, shuffle]);
  const shown = step < shuffle ? pre![step] : emoji;
  const [badgeOn, setBadgeOn] = useState(false);
  useEffect(() => {
    if (!badge) return;
    const t = setTimeout(() => setBadgeOn(true), still ? 0 : Math.max(badgeAt, shuffle * SHUFFLE_STEP_MS));
    return () => clearTimeout(t);
  }, [badge, badgeAt, shuffle, still]);
  // The result decides how it moves (a shuffle's pictures only flash by).
  const id = art ? null : stickerIdOf(emoji);
  const cover = !!art || !!id;
  const moving = !!id && isAnimatedSticker(id);
  const [v] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) {
      Animated.sequence([Animated.delay(ms - 400), Animated.timing(v, { toValue: 2, duration: 300, useNativeDriver: true })]).start();
      return;
    }
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      // An animation moves by itself: it just stays; a picture or a plain emoji beats three times.
      moving
        ? Animated.delay(ms - 900)
        : Animated.sequence([
            Animated.loop(
              Animated.sequence([
                Animated.timing(v, { toValue: 1.15, duration: 220, useNativeDriver: true }),
                Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }),
              ]),
              { iterations: 3 },
            ),
            Animated.delay(Math.max(0, ms - BEAT_MS)),
          ]),
      Animated.delay(250),
      Animated.timing(v, { toValue: 2, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [v, still, moving, ms]);
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
          { scale: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: [0.2, 1, 1.12, cover ? 1.06 : 1.3] }) },
          { rotate: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: ['-20deg', '0deg', '8deg', '0deg'] }) },
          { translateY: v.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: [size * 0.3, 0, -2, cover ? 0 : -size * 0.35] }) },
        ],
      }}
    >
      {art ? (
        <AssetView asset={art} size={size * 1.12} />
      ) : (
        // A new picture is a new player (each step of a shuffle, then the result), so the result always draws and plays.
        <ReactionArt key={shown} emoji={shown} size={size * (cover ? 1.12 : 0.95)} play={still ? 'still' : 'loop'} />
      )}
      {badge && badgeOn && (
        <View style={[styles.resultBadge, { bottom: -size * 0.06 }]} accessibilityLabel={`Sonuç: ${badge}`}>
          <Text style={[styles.resultText, { fontSize: Math.round(Math.max(11, Math.min(18, size * 0.26))) }]} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export function ChatLine({
  msg,
  bubbleId,
  bubbleOf,
  bond,
  onRetry,
  mentionsMe,
  mentionNames,
  myName,
  onPerson,
}: {
  msg: ChatMsg;
  bubbleId?: string;
  /** Someone else's bubble (a server room: their shop look), by their user id. */
  bubbleOf?: (userId: string) => string | undefined;
  /** Lv10 bond: the special bubble (a bubble I equipped wins). */
  bond?: RoomBond | null;
  onRetry?: (msg: ChatMsg) => void;
  /** The line names me (@bahset): its bubble gets a gold ring and the line a "senden bahsetti" tag. */
  mentionsMe?: boolean;
  /** The room's names: each "@Name" of one of them is drawn in color, mine (`myName`) in gold. */
  mentionNames?: readonly string[];
  myName?: string;
  /** A tap on the writer's photo or name (their person card). */
  onPerson?: (uid: string) => void;
}) {
  if (msg.bot) {
    return (
      <View style={styles.botMsg}>
        <Art name="oda-oda-botu" size={18} />
        <Text style={styles.botTag}>BOT</Text>
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
              {`${g.count > 1 ? ` ×${g.count}` : ''}${g.lucky ? ' · Şanslı' : ''}`}
            </Text>
            {giftArtOf(g.giftId) && <GiftArt giftId={g.giftId} emoji={g.emoji} size={24} />}
          </>
        ) : (
          <Text style={styles.giftText}>{msg.text}</Text>
        )}
      </View>
    );
  }
  if (msg.system && msg.notice) {
    return (
      <View style={styles.noticeMsg} accessibilityRole="text" accessibilityLabel={`Sistem bildirimi: ${msg.text}`}>
        <View style={styles.noticeHead}>
          <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
          <Text style={styles.noticeTag}>SimilarClub</Text>
        </View>
        <Text style={styles.noticeText}>{msg.text}</Text>
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
  const bubble = msg.userId === 'me' ? cosmeticById(bubbleId) : msg.userId && !msg.system && !msg.bot && bubbleOf ? cosmeticById(bubbleOf(msg.userId)) : undefined;
  const nameColor = msg.userId === 'me' ? colors.gold : '#FFC2DC';
  const stickers = stickersOf(msg.text);
  // Avatar, name above, text in its own bubble: who said what reads at a glance, like a group chat.
  const body = stickers ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {stickers.map((id, i) => (
        <StickerArt key={i} id={id} size={34} play="once" />
      ))}
    </View>
  ) : (
    <EmojiText text={messagePreview(msg.text)} style={styles.chatText} mentions={mentionNames} me={myName} />
  );
  const bubbleView = stickers ? (
    body
  ) : bubble?.color ? (
    <LinearGradient colors={bubble.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatBubble}>
      {body}
    </LinearGradient>
  ) : bond ? (
    <BondBubble bond={bond}>{body}</BondBubble>
  ) : (
    <View style={[styles.chatBubble, styles.chatGlass]}>{body}</View>
  );
  const who = msg.userId !== 'me' && onPerson ? () => onPerson(msg.userId!) : undefined;
  const line = (
    <View style={styles.chatLine} accessibilityLabel={`${u.name}${mentionsMe ? ', senden bahsetti' : ''}: ${messagePreview(msg.text)}`}>
      <Pressable onPress={who} disabled={!who} hitSlop={4} accessibilityRole={who ? 'button' : undefined} accessibilityLabel={who ? `${u.name} kişi kartı` : undefined}>
        <Avatar uri={u.avatar} size={28} />
      </Pressable>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={who} disabled={!who}>
          <Text style={[styles.chatName, { color: nameColor }]} numberOfLines={1}>
            {u.name}
          </Text>
          {u.vip && <Text style={styles.chatVip}>VIP</Text>}
          {bond && <BondChip bond={bond} />}
          {mentionsMe && <Text style={styles.chatMentionTag}>senden bahsetti</Text>}
        </Pressable>
        {mentionsMe ? <View style={styles.chatMention}>{bubbleView}</View> : bubbleView}
      </View>
    </View>
  );
  if (msg.status !== 'failed') return line;
  return (
    <View style={{ alignSelf: 'flex-start', gap: 3, maxWidth: '85%' }}>
      <View style={{ opacity: 0.6 }}>{line}</View>
      <Pressable onPress={() => onRetry?.(msg)} accessibilityRole="button" accessibilityLabel="Mesaj gönderilemedi, tekrar dene" hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 36 }}>
        <Ionicons name="alert-circle" size={13} color="#FF9AA1" />
        <Text style={styles.failed}>Gönderilemedi · tekrar dene</Text>
      </Pressable>
    </View>
  );
}

/** Every round button in the room's bottom bar (menu, messages, mic, room sound, gift) is this big. */
export const BAR_BTN = 44;

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
  const press = useSpringPress(0.88);
  return (
    <Pressable
      onPress={() => {
        if (gift) pressHaptic();
        else tapHaptic();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Animated.View style={{ transform: [{ scale: press.scale }] }}>
        {gift ? (
          <View style={[styles.round, styles.giftRound]}>
            <Icon3D name="gift" size={30} />
            <Shine radius={BAR_BTN / 2} every={3600} />
          </View>
        ) : (
          <View style={[styles.round, styles.glassRound]}>
            <Ionicons name={icon} size={22} color="#fff" />
          </View>
        )}
      </Animated.View>
      <BounceBadge count={badge ?? 0} style={styles.badge} textStyle={styles.badgeText} />
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

/**
 * The mic, as big as the bar's other buttons. Its state shows by color and icon; the states that need words (the
 * queue, a held mic and why) also carry a short tag on the circle's lower edge, so the bar keeps one height.
 */
export function MicBtn({ state, queuePos, caption: captionOverride, hint, onPress }: { state: MicState; queuePos?: number; caption?: string; hint?: string; onPress: () => void }) {
  const look = MIC_LOOK[state];
  const press = useSpringPress(0.88);
  const caption = captionOverride ?? (state === 'queued' && queuePos !== undefined ? `SIRA ${queuePos + 1}` : state === 'queued' || state === 'held' ? look.caption : null);
  return (
    <Pressable
      onPress={() => {
        micHaptic();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={hint ?? look.a11y}
      accessibilityState={{ checked: state === 'on' || state === 'held' }}
      aria-checked={state === 'on' || state === 'held'}
    >
      <Animated.View style={{ transform: [{ scale: press.scale }] }}>
        <View style={[styles.round, { backgroundColor: look.bg, borderWidth: 1, borderColor: look.edge === 'transparent' ? 'rgba(255,255,255,0.12)' : look.edge }, state === 'on' && styles.micGlowOn, state === 'hand' && styles.micGlowHand]}>
          <Gloss strength={0.32} />
          <Ionicons name={look.icon} size={22} color={look.fg} />
        </View>
        {caption && (
          <View style={styles.tagWrap} pointerEvents="none">
            <Text style={[styles.tag, state === 'on' && { color: semantic.live }, state === 'held' && { color: colors.gold }]} numberOfLines={1}>
              {caption}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/** "Oda sesi", next to the mic: the room goes quiet on this phone only; my own mic keeps going out. */
export function RoomSoundBtn({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      accessibilityRole="switch"
      accessibilityLabel={muted ? 'Oda sesi kapalı, açmak için dokun' : 'Oda sesi açık, kapatmak için dokun'}
      accessibilityState={{ checked: !muted }}
      aria-checked={!muted}
      hitSlop={6}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <View style={[styles.round, styles.glassRound, muted && styles.soundRoundOff]}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={muted ? '#FCA5A5' : '#fff'} />
      </View>
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

/** Bottom padding for a bottom sheet in a Modal. Android modals draw edge to edge, so a fixed padding leaves the
 *  last button under the navigation bar; this keeps it above the bar and never below `min`. */
export function useSheetBottom(min = 34) {
  const { bottom } = useSafeAreaInsets();
  return Math.max(min, bottom + 8);
}

/** A room sheet over the stage: `scrim` is the clear tap-outside-to-close area above it (no grey veil: SCRIM), the
 *  sheet itself stands out by its lit top edge and shadow (edge.sheet). */
export const roomStyles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, ...edge.sheet },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
});

const styles = StyleSheet.create({
  seat: { alignItems: 'center', gap: 4 },
  seatBody: { alignSelf: 'stretch', alignItems: 'center', gap: 4 },
  hostSeat: { width: '100%' },
  ring: { position: 'absolute', borderWidth: 4 },
  emptySeat: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderTopColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 -6px 12px rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.25)',
  },
  teamRing: { position: 'absolute', borderWidth: 3 },
  camBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: semantic.live, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.bg },
  // A Hamle's result under its picture: the dice's number, the hand's name.
  resultBadge: { position: 'absolute', alignSelf: 'center', minWidth: 26, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.gold, borderWidth: 2, borderColor: '#1B1405', alignItems: 'center' },
  resultText: { color: '#1B1405', fontFamily: fonts.displayBold },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  selfMutedBadge: { backgroundColor: '#475569' },
  invitedSeat: { borderColor: colors.gold, backgroundColor: 'rgba(246,189,96,0.12)' },
  roleBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: semantic.action, borderRadius: 10, padding: 3, borderWidth: 1.5, borderColor: colors.bg },
  pkWrap: { alignItems: 'center', marginTop: -1 },
  pkPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(246,189,96,0.18)', borderColor: 'rgba(246,189,96,0.55)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 76 },
  pkPillBig: { backgroundColor: 'rgba(246,189,96,0.3)' },
  pkText: { color: colors.gold, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pkDelta: { position: 'absolute', top: -14, color: '#FDE7C2', fontWeight: '900', fontSize: 12 },
  giftMsg: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(246,189,96,0.16)', borderColor: 'rgba(246,189,96,0.35)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, maxWidth: '90%' },
  giftText: { color: '#FDE7C2', fontSize: 13, flexShrink: 1 },
  giftName: { color: '#fff', fontWeight: '800' },
  failed: { color: '#FF9AA1', fontSize: 12, fontWeight: '700' },
  seatName: { color: '#fff', fontSize: 12, fontWeight: '600', maxWidth: 64 },
  miniLabel: { height: 14, alignItems: 'center', justifyContent: 'center' },
  miniNum: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700' },
  // Room events stay in the background of the conversation: no box shouting over people's messages.
  systemMsg: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '92%' },
  systemText: { color: '#B9C7DE', fontSize: 12 },
  // The community rules on entering a room: SimilarClub's own notice, set apart from people's lines and room notes.
  noticeMsg: { alignSelf: 'stretch', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: 'rgba(246,189,96,0.08)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.35)' },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  noticeTag: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  noticeText: { color: '#DCE4F2', fontSize: 12, lineHeight: 17 },
  botMsg: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '90%' },
  botTag: { color: colors.green, fontSize: 11, fontWeight: '900' },
  botText: { color: '#BBF7D0', fontSize: 12, flexShrink: 1 },
  chatLine: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-start', gap: 8, maxWidth: '88%' },
  chatName: { fontSize: 12, fontWeight: '800', maxWidth: 160 },
  chatVip: { color: colors.bg, backgroundColor: colors.gold, fontSize: 9, fontWeight: '900', borderRadius: 4, paddingHorizontal: 4, overflow: 'hidden' },
  chatBubble: { alignSelf: 'flex-start', borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 11, paddingVertical: 7 },
  chatMention: { alignSelf: 'flex-start', borderRadius: 16, borderTopLeftRadius: 6, borderWidth: 1.5, borderColor: colors.gold, padding: 1, boxShadow: `0 0 12px ${colors.gold}55` },
  chatMentionTag: { color: '#1B1405', backgroundColor: colors.gold, fontFamily: fonts.displayBold, fontSize: 10, lineHeight: 14, paddingHorizontal: 6, borderRadius: 7, overflow: 'hidden' },
  chatText: { color: '#fff', fontSize: 14, lineHeight: 19 },
  // Dark glass: keeps white text readable over the stage, with a lit top edge.
  chatGlass: { backgroundColor: 'rgba(12,22,40,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.16)' },
  round: { width: BAR_BTN, height: BAR_BTN, borderRadius: BAR_BTN / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  giftRound: { backgroundColor: 'rgba(246,189,96,0.16)', borderWidth: 2, borderColor: semantic.money, overflow: 'hidden', boxShadow: '0 0 16px rgba(246,189,96,0.45)' },
  glassRound: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.28)' },
  soundRoundOff: { backgroundColor: 'rgba(252,165,165,0.14)', borderColor: 'rgba(252,165,165,0.45)' },
  micGlowOn: { boxShadow: '0 4px 16px rgba(255,95,162,0.6)' },
  micGlowHand: { boxShadow: '0 4px 16px rgba(8,122,128,0.7)' },
  tagWrap: { position: 'absolute', left: -14, right: -14, bottom: -7, alignItems: 'center' },
  tag: { color: '#fff', fontSize: 8, lineHeight: 12, fontWeight: '800', letterSpacing: 0.3, paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(12,8,20,0.92)' },
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
