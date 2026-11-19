// Back or close on the full room: a sheet that comes down from the top edge, under the room's close button, with two
// large round choices, "Küçült" (the room keeps playing; the mini card brings it
// back) and "Çıkış" (leave it), and under them "Şu an popüler": the four busiest open rooms right now that can be
// entered straight away (lib/room-picks). A room there leaves this one the way a switch does (mic off, voice
// closed, lib/room-session leaveForRoom) and opens that one. Dismissing the sheet changes nothing. The two choices
// are glowing glass orbs (the owner's design): pink Küçült, coral Çıkış, each with its note on a pill. "Odayı herkes
// için kapat" is gone from here (owner's call): a room whose owner and admins have all left rests by itself
// (server/api/room-autoclose.mjs) and opens again when one of them is back.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { PressableScale } from '@/components/fx/surface';
import { Photo } from '@/components/photo';
import { ROOMS, type Room } from '@/data/mock';
import { roomBadge } from '@/data/rooms-ui';
import { tapHaptic } from '@/lib/haptics';
import { isLockedRoom, liveMode, reloadServerRooms, useServerRoomList } from '@/lib/live';
import { roomPassword } from '@/lib/live/room-password';
import { popularRooms } from '@/lib/room-picks';
import { closeLeaveDialog, continueLeave, endRoom, leaveForRoom, useRoomSession } from '@/lib/room-session';
import { useApp } from '@/store';
import { fonts, makeStyles, radius, space, type, useTheme } from '@/theme';

const GAP = 10;
const MAX_W = 560;
/** The two choices' orbs (px). */
const ORB = 96;

export function LeaveSheet() {
  const { leaveDialog, session } = useRoomSession();
  const { blocked, settings } = useApp();
  const { semantic } = useTheme();
  const s = useStyles();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const visible = leaveDialog && !!session;
  const still = settings.reduceMotion;
  // It slides down from the top edge each time it opens; "Animasyonları azalt": it only fades in.
  const [drop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible || still) return;
    drop.setValue(-win.height * 0.7);
    const a = Animated.timing(drop, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, still, drop]);
  const live = liveMode();
  const serverRooms = useServerRoomList();
  // The list as it is now: read it again whenever the sheet opens.
  useEffect(() => {
    if (visible && live) reloadServerRooms();
  }, [visible, live]);
  const current = session?.roomId ?? '';
  const picks = useMemo(
    () => (current ? popularRooms(live ? serverRooms : ROOMS, { current, blocked, needsPassword: (r) => (live ? isLockedRoom(r.id) && !roomPassword(r.id) : !!r.password) }) : []),
    [current, live, serverRooms, blocked],
  );
  // Two to a row inside the popular card: its own padding (space.md each side) comes off the width too.
  const tileW = Math.floor((Math.min(win.width, MAX_W) - space.lg * 2 - space.md * 2 - GAP) / 2);
  // The sheet does not scroll: on a short phone the two rows get lower, so the card ends over the navigation bar (the
  // name, the orbs and the card's own rows take 380 of the height).
  const tileH = Math.max(80, Math.min(Math.round(tileW * 0.74), Math.floor((win.height - insets.top - insets.bottom - 380) / 2)));

  const minimize = () => continueLeave();
  const leave = () => {
    endRoom('left');
    continueLeave();
  };
  const go = (room: Room) => {
    const href = { pathname: '/oda/[id]' as const, params: { id: room.id } };
    // The room screen goes first (as on "Çıkış"), then the picked room opens on top of where it was opened from.
    if (leaveForRoom()) router.push(href);
    else router.replace(href);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeLeaveDialog}>
      {/* No panel behind the room's name and the two orbs (owner's call): they lie on the room itself, each with its own
          glass and glow. Only the popular rooms sit on a card of their own. */}
      <Animated.View style={[s.sheet, { paddingTop: insets.top + space.xs, transform: [{ translateY: drop }] }]} accessibilityViewIsModal>
        {/* The room's name on a glass pill with a glowing live dot. */}
        <View style={s.where}>
          <View style={s.liveDot} />
          <Text style={s.whereText} numberOfLines={1}>
            {session?.title}
          </Text>
        </View>
        <View style={s.actions}>
          <Choice still={still} label="Küçült" note="Oda arkada sürer" onPress={minimize}>
            <Orb icon="contract" fill={['#FF5CBC', '#E0218F', '#93105E']} glow="rgba(255,60,170,0.75)" rim="rgba(255,190,230,0.9)" />
          </Choice>
          <Choice still={still} label="Çıkış" note="Odadan ayrıl" onPress={leave} danger>
            <Orb icon="log-out-outline" fill={['#FF8A72', '#EC3F5C', '#A0143E']} glow="rgba(255,90,100,0.7)" rim="rgba(255,200,190,0.9)" />
          </Choice>
        </View>
        {picks.length > 0 && (
          <View style={s.popular}>
            <View style={s.sectionHead}>
              <Ionicons name="flame" size={16} color={semantic.social} />
              <Text style={s.section} accessibilityRole="header">
                Şu an popüler
              </Text>
            </View>
            <View style={s.grid}>
              {picks.map((r) => (
                <Tile key={r.id} room={r} width={tileW} height={tileH} still={still} onPress={() => go(r)} />
              ))}
            </View>
            <View style={s.handle} />
          </View>
        )}
      </Animated.View>
      <Pressable style={s.scrim} onPress={closeLeaveDialog} accessibilityLabel="Vazgeç, odada kal" />
    </Modal>
  );
}

/** A glowing glass orb: its colour from the top light down, a halo round it, a rim of light and a gloss on top. */
function Orb({ icon, fill, glow, rim }: { icon: keyof typeof Ionicons.glyphMap; fill: readonly [string, string, string]; glow: string; rim: string }) {
  const s = useStyles();
  return (
    <View style={[s.orbHalo, { boxShadow: `0 0 34px ${glow}` }]}>
      <LinearGradient colors={fill} start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }} style={[s.orb, { borderColor: rim }]}>
        <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={s.gloss} pointerEvents="none" />
        <Ionicons name={icon} size={Math.round(ORB * 0.4)} color="#fff" style={s.orbIcon} />
      </LinearGradient>
    </View>
  );
}

/** One of the two round choices: springs under the finger, or just dims with "Animasyonları azalt". */
function Choice({ still, label, note, danger, onPress, children }: { still: boolean; label: string; note: string; danger?: boolean; onPress: () => void; children: ReactNode }) {
  const s = useStyles();
  const body = (
    <View style={s.choice}>
      {children}
      <Text style={[s.choiceLabel, danger && s.choiceLabelExit]}>{label}</Text>
      <View style={s.notePill}>
        <Text style={s.choiceNote} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {note}
        </Text>
      </View>
    </View>
  );
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: `${label}. ${note}` };
  if (still)
    return (
      <Pressable
        onPress={() => {
          tapHaptic();
          onPress();
        }}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
        {...a11y}
      >
        {body}
      </Pressable>
    );
  return (
    <PressableScale onPress={onPress} to={0.92} {...a11y}>
      {body}
    </PressableScale>
  );
}

/** A popular room: its cover, how many are in it, its agency or family, its name. */
function Tile({ room, width, height, still, onPress }: { room: Room; width: number; height: number; still: boolean; onPress: () => void }) {
  const s = useStyles();
  const badge = roomBadge(room);
  const body = (
    <View style={[s.tile, { width, height }]}>
      <Photo uri={room.cover} kind="cover" seed={room.id} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(4,10,20,0.35)', 'rgba(4,10,20,0)', 'rgba(4,10,20,0.9)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={s.count}>
        <View style={s.countDot} />
        <Text style={s.countText}>{room.listeners.toLocaleString('tr-TR')}</Text>
      </View>
      <View style={s.tileFoot}>
        {badge && (
          <LinearGradient colors={badge.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.badge}>
            {badge.icon ? <Ionicons name={badge.icon} size={10} color="#fff" /> : <Text style={s.badgeEmoji}>{badge.emoji}</Text>}
            <Text style={s.badgeText} numberOfLines={1}>
              {badge.label}
            </Text>
          </LinearGradient>
        )}
        <Text style={s.tileTitle} numberOfLines={1}>
          {room.title}
        </Text>
      </View>
    </View>
  );
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: `${room.title}, ${room.listeners} kişi. Bu odaya geç` };
  if (still)
    return (
      <Pressable
        onPress={() => {
          tapHaptic();
          onPress();
        }}
        style={({ pressed }) => pressed && { opacity: 0.8 }}
        {...a11y}
      >
        {body}
      </Pressable>
    );
  return (
    <PressableScale onPress={onPress} to={0.97} {...a11y}>
      {body}
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, edge }) => ({
  scrim: { flex: 1 },
  // No background: the room shows round the name and the orbs (each has its own glass and glow).
  sheet: {
    width: '100%',
    maxWidth: MAX_W,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  // The popular rooms on a night-dark card of their own, under the orbs.
  popular: { marginTop: space.lg, backgroundColor: '#12060F', borderRadius: radius.xl, padding: space.md, paddingBottom: space.sm, ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: space.md },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '86%',
    gap: 10,
    marginTop: space.md,
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(70,14,52,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,92,180,0.85)',
    boxShadow: '0 0 16px rgba(255,60,170,0.45)',
  },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF4FB0', boxShadow: '0 0 10px rgba(255,79,176,0.95)' },
  whereText: { color: '#FFE3F2', fontFamily: fonts.display, fontSize: 19, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: space.xl },
  choice: { alignItems: 'center', width: 140 },
  orbHalo: { width: ORB, height: ORB, borderRadius: ORB / 2 },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 5, left: ORB * 0.16, width: ORB * 0.68, height: ORB * 0.42, borderRadius: ORB },
  orbIcon: { textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  choiceLabel: { color: '#FFF1F8', fontFamily: fonts.display, fontSize: 26, marginTop: space.md, textShadowColor: 'rgba(255,60,170,0.9)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  choiceLabelExit: { color: '#FF9AAA', textShadowColor: 'rgba(255,70,90,0.9)' },
  notePill: { marginTop: space.sm, maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(90,18,66,0.82)', borderWidth: 1.5, borderColor: 'rgba(255,120,190,0.6)' },
  choiceNote: { color: '#FFE3F2', fontSize: 13, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.md },
  section: { color: '#FFFFFF', fontFamily: fonts.displayBold, fontSize: type.bodyL },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: ink(0.08) },
  count: { position: 'absolute', top: space.sm, left: space.sm, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(4,10,20,0.55)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  countDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.live },
  countText: { color: '#fff', fontWeight: '800', fontSize: 11, fontVariant: ['tabular-nums'] },
  tileFoot: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, gap: 5 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeEmoji: { fontSize: 10 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 10, flexShrink: 1 },
  tileTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
}));
