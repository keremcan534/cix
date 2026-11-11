// Etkinlik Merkezi inside a server room: the banner of the running event (its clock) or the next one (and, for the
// owner and Süper Yönetici, its start), the theme's tint and light effect over the stage while it runs, and the
// room's Etkinlikler sheet. Everything is the server's (server/api/events.mjs GET /api/events/room); the room reads
// it again whenever the server says the room changed (an event started or ended).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openEvents } from '@/components/events/open';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { elapsedText, lookOf, spanText, whenText } from '@/lib/events';
import { useSettings } from '@/store';
import { makeStyles, useTheme } from '@/theme';

export type RoomEvents = { running: api.EventItem | null; upcoming: api.EventItem[]; recent: api.EventItem[] };

/** Ten minutes before its start the organiser may start it (server/api/event-rules.mjs EARLY_START_MINUTES). */
const EARLY_MS = 10 * 60_000;

/** The banner under the room's header: the running event, else the next one within a day. */
export function EventRoomBanner({ data, rank, onChanged }: { data: RoomEvents | null; rank: number; onChanged: () => void }) {
  const styles = useStyles();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const running = data?.running ?? null;
  const next = !running ? (data?.upcoming.find((e) => new Date(e.startsAt).getTime() - now < 86_400_000) ?? null) : null;
  const e = running ?? next;
  useEffect(() => {
    if (!e) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [e]);
  if (!e) return null;
  const look = lookOf(e.theme);
  const start = new Date(e.startsAt).getTime();
  const mayStart = !running && rank >= 2 && now >= start - EARLY_MS;
  const begin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.startEvent(e.id);
      onChanged();
    } catch (err) {
      showAlert('Başlatılamadı', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={() => openEvents({ id: e.id })} accessibilityRole="button" accessibilityLabel={`${running ? 'Süren etkinlik' : 'Yaklaşan etkinlik'}: ${e.title}`}>
      <LinearGradient colors={[`${look.colors[0]}E6`, `${look.colors[1]}E6`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
        <Ionicons name={look.icon} size={18} color="#fff" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker} numberOfLines={1}>
            {running ? `CANLI ETKİNLİK · ${elapsedText(now - new Date(running.startedAt ?? running.startsAt).getTime())}` : start > now ? `YAKLAŞAN · ${spanText(start - now)} sonra` : 'BAŞLAMAK ÜZERE'}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {e.title}
          </Text>
        </View>
        {mayStart ? (
          <Pressable onPress={begin} style={styles.start} disabled={busy} accessibilityRole="button" accessibilityLabel="Etkinliği başlat">
            <Ionicons name="play" size={13} color="#111" />
            <Text style={styles.startText}>{busy ? '…' : 'Başlat'}</Text>
          </Pressable>
        ) : running ? (
          <View style={styles.count}>
            <Ionicons name="people" size={12} color="#fff" />
            <Text style={styles.countText}>{running.came}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** While an event runs: the theme's colours over the top of the stage, and its light effect (off with "Efektleri
 *  kapat" or "Animasyonları azalt"). Never takes a touch. */
export function EventThemeLayer({ event }: { event: api.EventItem | null }) {
  const { effectsOff, reduceMotion } = useSettings();
  if (!event) return null;
  const look = lookOf(event.theme);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[`${look.colors[0]}59`, `${look.colors[1]}26`, 'transparent']} locations={[0, 0.35, 0.7]} style={StyleSheet.absoluteFill} />
      {!effectsOff && !reduceMotion && look.fx !== 'none' && <Drift fx={look.fx} />}
    </View>
  );
}

const FX_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { confetti: 'sparkles', hearts: 'heart', notes: 'musical-note', stars: 'star' };
const FX_COLORS: Record<string, string[]> = {
  confetti: ['#F472B6', '#FBBF24', '#60A5FA', '#34D399'],
  hearts: ['#FB7185', '#F472B6', '#FDA4AF'],
  notes: ['#C4B5FD', '#F0ABFC', '#FFFFFF'],
  stars: ['#FDE68A', '#FFFFFF', '#FBBF24'],
};
/** A few signs rising slowly up the screen, on a loop (the native driver: no work on the JS thread). */
function Drift({ fx }: { fx: string }) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: ((i * 37) % 100) / 100, size: 14 + ((i * 7) % 12), delay: i * 900, dur: 9000 + ((i * 1300) % 5000), color: FX_COLORS[fx][i % FX_COLORS[fx].length] })), [fx]);
  return (
    <>
      {items.map((it, i) => (
        <Rise key={i} {...it} width={width} height={height} icon={FX_ICON[fx]} />
      ))}
    </>
  );
}
function Rise({ x, size, delay, dur, color, width, height, icon }: { x: number; size: number; delay: number; dur: number; color: string; width: number; height: number; icon: keyof typeof Ionicons.glyphMap }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' })]));
    a.start();
    return () => a.stop();
  }, [v, delay, dur]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [height * 0.95, height * 0.15] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.75, 0.5, 0] });
  const translateX = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, -6] });
  return (
    <Animated.View style={{ position: 'absolute', left: x * (width - 40) + 10, top: 0, opacity, transform: [{ translateY }, { translateX }] }}>
      <Ionicons name={icon} size={size} color={color} />
    </Animated.View>
  );
}

/** The room's Etkinlikler sheet: running, coming and the last week's, and for the owner the way to apply. */
export function RoomEventsSheet({ visible, onClose, data, roomId, isOwner }: { visible: boolean; onClose: () => void; data: RoomEvents | null; roomId: string; isOwner: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // Mounted only while open (live-room), so the times are as of opening.
  const [now] = useState(Date.now);
  const open = (id: number) => {
    onClose();
    openEvents({ id });
  };
  const row = (e: api.EventItem) => {
    const look = lookOf(e.theme);
    return (
      <Pressable key={e.id} onPress={() => open(e.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <LinearGradient colors={look.colors} style={styles.rowIcon}>
          <Ionicons name={look.icon} size={18} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {e.title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {e.state === 'live' ? 'Devam ediyor' : e.state === 'ended' ? `Bitti · ${whenText(e.endedAt ?? e.endsAt, now)}` : whenText(e.startsAt, now)} · {e.category.name}
          </Text>
        </View>
        {e.mine === 'confirmed' && <Ionicons name="bookmark" size={16} color={colors.green} accessibilityLabel="Yerin ayrıldı" />}
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </Pressable>
    );
  };
  const empty = !data || (!data.running && !data.upcoming.length && !data.recent.length);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.head}>
          <Text style={styles.heading}>Oda etkinlikleri</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
          {data?.running && row(data.running)}
          {!!data?.upcoming.length && <Text style={styles.section}>Yaklaşan</Text>}
          {data?.upcoming.map(row)}
          {!!data?.recent.length && <Text style={styles.section}>Son bir hafta</Text>}
          {data?.recent.map(row)}
          {empty && <Text style={styles.dim}>{data ? 'Bu odanın planlanmış etkinliği yok.' : 'Yükleniyor…'}</Text>}
        </ScrollView>
        <View style={{ gap: 8 }}>
          {isOwner && (
            <Button
              title="Etkinlik oluştur"
              icon="add"
              onPress={() => {
                onClose();
                openEvents({ create: true, room: roomId, tab: 'mine' });
              }}
            />
          )}
          <Button
            title="Tüm etkinlikler"
            icon="calendar-outline"
            variant="tonal"
            small
            onPress={() => {
              onClose();
              openEvents();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, fontVariant: ['tabular-nums'] },
  title: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  start: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  startText: { color: '#111', fontSize: 12.5, fontWeight: '800' },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  countText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  section: { color: colors.textDim, fontSize: 12.5, fontWeight: '800', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12.5 },
  dim: { color: colors.textDim, fontSize: 13.5, textAlign: 'center', paddingVertical: 16 },
}));
