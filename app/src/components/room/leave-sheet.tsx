// Back or close on the full room: a sheet that comes down from the top edge, under the room's close button, with two
// large round choices, "Küçült" (the room keeps playing; the mini card brings it
// back) and "Çıkış" (leave it), and under them "Şu an popüler": the four busiest open rooms right now that can be
// entered straight away (lib/room-picks). A room there leaves this one the way a switch does (mic off, voice
// closed, lib/room-session leaveForRoom) and opens that one. The owner of a server room can also close it for
// everyone. Dismissing the sheet changes nothing.
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
import { showAlert } from '@/lib/alert';
import { tapHaptic } from '@/lib/haptics';
import { closeServerRoom, isLockedRoom, isMyServerRoom, liveMode, message as errorText, reloadServerRooms, useServerRoomList } from '@/lib/live';
import { roomPassword } from '@/lib/live/room-password';
import { popularRooms } from '@/lib/room-picks';
import { closeLeaveDialog, continueLeave, endRoom, leaveForRoom, useRoomSession } from '@/lib/room-session';
import { useApp } from '@/store';
import { fonts, makeStyles, radius, space, type, useTheme } from '@/theme';

const GAP = 10;
const MAX_W = 560;

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
  const tileW = Math.floor((Math.min(win.width, MAX_W) - space.lg * 2 - GAP) / 2);
  const mine = !!session && isMyServerRoom(session.roomId);

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
  const closeForAll = () => {
    if (!session) return;
    const id = session.roomId;
    showAlert('Odayı kapat', 'Odan listelerden kalkacak ve artık kimse giremeyecek. Daha sonra yeni bir oda açabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kapat',
        style: 'destructive',
        onPress: () =>
          closeServerRoom(id)
            .then(() => {
              endRoom('left');
              continueLeave();
            })
            .catch((e) => showAlert('Oda kapatılamadı', errorText(e))),
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeLeaveDialog}>
      <Animated.View style={[s.sheet, { paddingTop: insets.top + space.xs, transform: [{ translateY: drop }] }]} accessibilityViewIsModal>
        <LinearGradient colors={['rgba(22,37,60,0)', 'rgba(255,95,162,0.12)']} style={s.glow} pointerEvents="none" />
        <View style={s.where}>
          <View style={s.liveDot} />
          <Text style={s.whereText} numberOfLines={1}>
            {session?.title}
          </Text>
        </View>
        <View style={s.actions}>
          <Choice still={still} label="Küçült" note="Oda arkada sürer" onPress={minimize}>
            <LinearGradient colors={['#FF7AB3', '#F0468E']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[s.circle, s.stayCircle]}>
              <Ionicons name="contract" size={30} color={semantic.actionInk} />
            </LinearGradient>
          </Choice>
          <Choice still={still} label="Çıkış" note="Odadan ayrıl" onPress={leave} danger>
            <View style={[s.circle, s.exitCircle]}>
              <Ionicons name="log-out-outline" size={30} color={semantic.danger} />
            </View>
          </Choice>
        </View>
        {mine && (
          <Pressable onPress={closeForAll} style={s.closeAll} accessibilityRole="button" accessibilityLabel="Odayı herkes için kapat. Odan listelerden kalkar ve artık kimse giremez." hitSlop={6}>
            <Ionicons name="power" size={14} color={semantic.danger} />
            <Text style={s.closeAllText}>Odayı herkes için kapat</Text>
          </Pressable>
        )}
        {picks.length > 0 && (
          <>
            <View style={s.sectionHead}>
              <Ionicons name="flame" size={16} color={semantic.social} />
              <Text style={s.section} accessibilityRole="header">
                Şu an popüler
              </Text>
            </View>
            <View style={s.grid}>
              {picks.map((r) => (
                <Tile key={r.id} room={r} width={tileW} still={still} onPress={() => go(r)} />
              ))}
            </View>
          </>
        )}
        <View style={s.handle} />
      </Animated.View>
      <Pressable style={s.scrim} onPress={closeLeaveDialog} accessibilityLabel="Vazgeç, odada kal" />
    </Modal>
  );
}

/** One of the two round choices: springs under the finger, or just dims with "Animasyonları azalt". */
function Choice({ still, label, note, danger, onPress, children }: { still: boolean; label: string; note: string; danger?: boolean; onPress: () => void; children: ReactNode }) {
  const s = useStyles();
  const body = (
    <View style={s.choice}>
      {children}
      <Text style={[s.choiceLabel, danger && s.choiceLabelExit]}>{label}</Text>
      <Text style={s.choiceNote}>{note}</Text>
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
function Tile({ room, width, still, onPress }: { room: Room; width: number; still: boolean; onPress: () => void }) {
  const s = useStyles();
  const badge = roomBadge(room);
  const body = (
    <View style={[s.tile, { width, height: Math.round(width * 0.74) }]}>
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
  sheet: {
    width: '100%',
    maxWidth: MAX_W,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    overflow: 'hidden',
    ...edge.sheet,
  },
  glow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 180 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ink(0.18), marginTop: space.lg },
  where: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.md, paddingHorizontal: space.xl },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.live },
  whereText: { color: colors.textDim, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 56, marginTop: space.lg },
  choice: { alignItems: 'center', width: 104 },
  circle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  stayCircle: { boxShadow: '0 8px 22px rgba(255,95,162,0.35)' },
  exitCircle: { backgroundColor: 'rgba(255,122,130,0.12)', borderWidth: 1.5, borderColor: semantic.danger },
  choiceLabel: { color: colors.text, fontFamily: fonts.display, fontSize: type.bodyL, marginTop: space.sm },
  choiceLabelExit: { color: semantic.danger },
  choiceNote: { color: colors.textDim, fontSize: type.caption, marginTop: 2, textAlign: 'center' },
  closeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 6, marginTop: space.md, paddingVertical: space.xs, paddingHorizontal: space.md },
  closeAllText: { color: semantic.danger, fontWeight: '700', fontSize: 13 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xl, marginBottom: space.md },
  section: { color: colors.text, fontFamily: fonts.displayBold, fontSize: type.bodyL },
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
