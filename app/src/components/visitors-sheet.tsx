// "Profilimi Kimler Ziyaret Etti": the people who opened my profile in the last 7 days, newest first. Open to
// everyone; who they were is a VIP right (the Abonelik's "Profiline bakanları gör"). Without it each visit shows
// blurred, with when it was and how many times, and the sheet asks to subscribe. A blurred row has nothing behind it
// to uncover: the server sends no one's id, name or photo without the right (server/api/social.mjs), and the demo
// drops them the same way.
// One sheet for Mesajlar's "Profil ziyaretçilerin" row and the Ben tab's Ziyaretçiler count; a tap on a person opens
// their profile. `useProfileVisitors` gives both screens the same numbers: from the server in a live build, the
// sample visitors in the demo.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, Button, VipBadge } from '@/components/ui';
import { PROFILE_VISITORS } from '@/data/messages-ui';
import { userById } from '@/data/mock';
import { liveMode } from '@/lib/live';
import { useVisitors } from '@/lib/live/visitors';
import { demoVisitorRows, hiddenVisitorRows, hideVisitorRows, liveVisitorRows, type VisitorRow } from '@/lib/visitor-rows';
import { useApp } from '@/store';
import { SCRIM, makeStyles, useTheme } from '@/theme';

/**
 * My visitors for the screens: `count` how many (null until the server answers), `rows` the visits (blurred ones,
 * `hidden`, without VIP), `unlocked` whether I may see who (VIP: the server decides in a live build; the demo
 * follows its own Abonelik).
 */
export function useProfileVisitors(): { count: number | null; rows: VisitorRow[]; unlocked: boolean } {
  const { blocked, vipDays } = useApp();
  const server = useVisitors();
  if (liveMode()) {
    const list = server?.visitors ?? null;
    return { count: server?.count ?? null, rows: list ? liveVisitorRows(list) : hiddenVisitorRows(server?.hidden ?? []), unlocked: !!list };
  }
  const rows = demoVisitorRows(PROFILE_VISITORS, blocked, userById);
  const unlocked = vipDays > 0;
  return { count: rows.length, rows: unlocked ? rows : hideVisitorRows(rows), unlocked };
}

/** Where "Abone ol" leads: the Abonelik tab of VIP. */
const openSubscription = () => router.push({ pathname: '/vip', params: { tab: 'vip' } });

/**
 * `count`: how many came (the server lists only the newest 100 of them); the rows' own number without it.
 * `unlocked` false: the rows are blurred and the sheet offers the Abonelik.
 */
export function VisitorsSheet({ visible, rows, count, unlocked = true, onClose }: { visible: boolean; rows: VisitorRow[]; count?: number | null; unlocked?: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  // Android draws the modal edge to edge: the last row stays above the navigation bar.
  const { bottom } = useSafeAreaInsets();
  const total = Math.max(count ?? 0, rows.length);
  const subscribe = () => {
    onClose();
    openSubscription();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(34, bottom + 8) }]}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>Profilimi Kimler Ziyaret Etti</Text>
          <VipBadge />
        </View>
        <Text style={s.sub}>Son 7 günde {total} kişi profilini ziyaret etti</Text>
        {!unlocked && total > 0 && (
          <View style={s.offer}>
            <View style={s.offerIcon}>
              <Ionicons name="eye-off" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.offerTitle}>Kimlerin baktığını gör</Text>
              <Text style={s.offerText}>Ziyaretçilerin bulanık görünür. Kim olduklarını abonelikle görebilirsin.</Text>
            </View>
            <Button title="Abone ol" small onPress={subscribe} />
          </View>
        )}
        <ScrollView>
          {rows.map((v, i) =>
            v.hidden ? (
              <HiddenRow key={v.id} row={v} index={i} onPress={subscribe} />
            ) : (
              <Pressable
                key={v.id}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}
                onPress={() => {
                  onClose();
                  router.push(`/kullanici/${v.id}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${v.name}, ${v.visits} kez ziyaret etti, ${v.when}. Profilini aç`}
              >
                <Avatar uri={v.avatar} name={v.name} size={44} online={v.online} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {v.name}
                  </Text>
                  <Text style={s.last} numberOfLines={1}>
                    {v.visits} kez ziyaret etti{v.place ? ` · ${v.place}` : ''}
                  </Text>
                </View>
                <Text style={s.time}>{v.when}</Text>
              </Pressable>
            ),
          )}
        </ScrollView>
        {total === 0 && <Text style={s.empty}>Henüz ziyaretçin yok.</Text>}
      </View>
    </Modal>
  );
}

/** Soft colors for a blurred face, one pair per row in turn (nothing about the visitor: they aren't known here). */
const BLUR_FACES: readonly [string, string, string][] = [
  ['#FF8A97', '#B57BFF', '#5EC8D8'],
  ['#5EC8D8', '#7C8BFF', '#F6BD60'],
  ['#F6BD60', '#FF8A97', '#9B7BFF'],
  ['#7BD88F', '#5EC8D8', '#B57BFF'],
];
/** The blurred name's widths, in turn, so the rows don't look stamped out. */
const NAME_W = [118, 92, 136, 104];

/** A visit without who made it: a blurred face and name, how many times and when. A tap offers the Abonelik. */
function HiddenRow({ row, index, onPress }: { row: VisitorRow; index: number; onPress: () => void }) {
  const { colors, ink } = useTheme();
  const s = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Gizli ziyaretçi, ${row.visits} kez ziyaret etti, ${row.when}. Kim olduğunu görmek için abone ol`}
    >
      <View>
        <LinearGradient colors={BLUR_FACES[index % BLUR_FACES.length]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.blurFace}>
          <View style={[StyleSheet.absoluteFill, s.frost]} />
          <Ionicons name="person" size={26} color="rgba(255,255,255,0.55)" />
        </LinearGradient>
        <View style={s.lock}>
          <Ionicons name="lock-closed" size={10} color={colors.text} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <LinearGradient
          colors={[ink(0.04), ink(0.26), ink(0.14), ink(0.24), ink(0.04)]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[s.blurName, { width: NAME_W[index % NAME_W.length] }]}
        />
        <Text style={s.last} numberOfLines={1}>
          {row.visits} kez ziyaret etti
        </Text>
      </View>
      <Text style={s.time}>{row.when}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, edge, ink }) => ({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 12, paddingBottom: 34, maxHeight: '75%', ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 4, marginBottom: 8, padding: 12, borderRadius: 16, backgroundColor: ink(0.06), borderWidth: 1, borderColor: 'rgba(246,189,96,0.35)' },
  offerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,189,96,0.14)' },
  offerTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  offerText: { color: colors.textDim, fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 14 },
  name: { color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  last: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  time: { color: colors.textDim, fontSize: 12 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  blurFace: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  frost: { backgroundColor: 'rgba(255,255,255,0.18)' },
  lock: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  blurName: { height: 12, borderRadius: 6 },
}));
