// Etkinlik Merkezi raporu (§ 14): the events of the last 7, 30 or 90 days, counted by the server
// (server/api/events.mjs report): applications and their outcome, places, the people who came, the attendance rate,
// the average per event, the categories most people came to, how events ended, and the latest starts and ends.
// ReportBody draws one report; EventReportSheet is the room owner's (Odamın Etkinlikleri, only the rooms they own);
// Yönetim › Etkinlikler › Rapor shows every room's (components/admin/events-admin).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import * as api from '@/lib/api';
import { REPORT_DAYS, endRows, recordText, reportTiles, whenText } from '@/lib/events';
import { makeStyles, useTheme } from '@/theme';

/** 7 gün · 30 gün · 90 gün. */
export function PeriodChips({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {REPORT_DAYS.map((d) => (
        <Pressable key={d} onPress={() => onChange(d)} style={[styles.chip, value === d && styles.chipOn]} accessibilityRole="tab" aria-selected={value === d}>
          <Text style={[styles.chipText, value === d && styles.chipTextOn]}>{d} gün</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ReportBody({ r }: { r: api.EventReport }) {
  const styles = useStyles();
  const ends = endRows(r);
  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.dim}>Son {r.days} günde başvurusu yapılan ya da başlangıç saati gelen etkinlikler. Taslaklar sayılmaz.</Text>
      <View style={styles.grid}>
        {reportTiles(r).map(([label, value]) => (
          <View key={label} style={styles.tile}>
            <Text style={styles.tileValue}>{value}</Text>
            <Text style={styles.tileLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.dim}>Katılım oranı: biten etkinliklerde yer ayırtıp gelenlerin payı. Ortalama: başlayan etkinlik başına katılımcı.</Text>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>En çok katılım alan türler</Text>
        {r.categories.length ? (
          r.categories.map((c) => (
            <View key={c.id} style={styles.line}>
              <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.dim}>
                {c.events} etkinlik · {c.participants} katılımcı
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.dim}>Bu dönemde etkinlik yok.</Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Nasıl bitti</Text>
        {ends.length ? (
          ends.map(([label, n]) => (
            <View key={label} style={styles.line}>
              <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
              <Text style={styles.dim}>{n}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.dim}>Bu dönemde biten etkinlik yok.</Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Başlangıç ve bitiş kayıtları</Text>
        {r.records.length ? (
          r.records.map((x, i) => (
            <View key={i} style={{ gap: 1 }}>
              <Text style={styles.text} numberOfLines={1}>
                {x.event.title} · {x.room}
              </Text>
              <Text style={styles.dim}>
                {recordText(x)} · {x.by} · {whenText(x.at)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.dim}>Kayıt yok.</Text>
        )}
      </View>
    </View>
  );
}

/** The room owner's report: the rooms they own, or one of them. */
export function EventReportSheet({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState(30);
  const [room, setRoom] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.eventReport>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    api.eventReport(days, room ?? undefined).then(
      (x) => {
        if (!on) return;
        setData(x);
        setFailed(false);
      },
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, [days, room, tick]);
  const rooms = data?.rooms ?? [];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.heading}>Etkinlik raporu</Text>
          <View style={styles.back} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <PeriodChips value={days} onChange={setDays} />
          {rooms.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: null, title: 'Tüm odalarım' }, ...rooms].map((x) => (
                <Pressable key={x.id ?? 'all'} onPress={() => setRoom(x.id)} style={[styles.chip, room === x.id && styles.chipOn]}>
                  <Text style={[styles.chipText, room === x.id && styles.chipTextOn]} numberOfLines={1}>
                    {x.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {failed ? (
            <View style={styles.center}>
              <Text style={styles.text}>Rapor yüklenemedi.</Text>
              <Button
                title="Tekrar dene"
                icon="refresh"
                small
                variant="tonal"
                onPress={() => {
                  setFailed(false);
                  setTick((t) => t + 1);
                }}
              />
            </View>
          ) : !data ? (
            <ActivityIndicator color={colors.primaryText} style={{ marginTop: 30 }} />
          ) : (
            <ReportBody r={data.report} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '800' },
  center: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, maxWidth: 200 },
  chipOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: semantic.actionInk },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.border },
  tileValue: { color: colors.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  block: { gap: 8, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  blockTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { color: colors.text, fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
}));
