// "Profilimi Kimler Ziyaret Etti": the people who opened my profile in the last 7 days, newest first (a VIP right).
// One sheet for Mesajlar's "Profil ziyaretçilerin" row and the Ben tab's Ziyaretçiler count; a tap on a person opens
// their profile. `useProfileVisitors` gives both screens the same numbers: from the server in a live build (how many
// for everyone, who only with VIP), the sample visitors in the demo.
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, VipBadge } from '@/components/ui';
import { PROFILE_VISITORS } from '@/data/messages-ui';
import { userById } from '@/data/mock';
import { liveMode } from '@/lib/live';
import { useVisitors } from '@/lib/live/visitors';
import { demoVisitorRows, liveVisitorRows, type VisitorRow } from '@/lib/visitor-rows';
import { useApp } from '@/store';
import { SCRIM, makeStyles, useTheme } from '@/theme';

/**
 * My visitors for the screens: `count` how many (null until the server answers), `rows` who (empty without VIP),
 * `unlocked` whether I may see who (VIP: the server decides in a live build).
 */
export function useProfileVisitors(): { count: number | null; rows: VisitorRow[]; unlocked: boolean } {
  const { blocked, vipDays } = useApp();
  const server = useVisitors();
  if (liveMode()) {
    const list = server?.visitors ?? null;
    return { count: server?.count ?? null, rows: list ? liveVisitorRows(list) : [], unlocked: !!list };
  }
  const rows = demoVisitorRows(PROFILE_VISITORS, blocked, userById);
  return { count: rows.length, rows, unlocked: vipDays > 0 };
}

/** `count`: how many came (the server lists only the newest 100 of them); the rows' own number without it. */
export function VisitorsSheet({ visible, rows, count, onClose }: { visible: boolean; rows: VisitorRow[]; count?: number | null; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  // Android draws the modal edge to edge: the last row stays above the navigation bar.
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(34, bottom + 8) }]}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>Profilimi Kimler Ziyaret Etti</Text>
          <VipBadge />
        </View>
        <Text style={s.sub}>Son 7 günde {Math.max(count ?? 0, rows.length)} kişi profilini ziyaret etti</Text>
        <ScrollView>
          {rows.map((v) => (
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
          ))}
        </ScrollView>
        {rows.length === 0 && <Text style={s.empty}>Henüz ziyaretçin yok.</Text>}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, edge }) => ({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 12, paddingBottom: 34, maxHeight: '75%', ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 14 },
  name: { color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  last: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  time: { color: colors.textDim, fontSize: 12 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
}));
