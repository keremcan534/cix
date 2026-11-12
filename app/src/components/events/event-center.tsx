// Etkinlik Merkezi: a full screen over the app (no route of its own; components/events/open opens it). Two tabs:
// Etkinlik Alanı (every approved public event: status, type, time and order filters that work together, search) and
// Odamın Etkinlikleri (the events of the rooms I own or help run, by state, and the places I reserved). The owner of
// an open room applies from here. Every list is the server's (server/api/events.mjs); the demo shows sample events.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { EventCard } from '@/components/events/event-card';
import { EventDetailView } from '@/components/events/event-detail';
import { EventFormView } from '@/components/events/event-form';
import { closeEvents, useEventsOpen, type CenterOpen, type CenterTab } from '@/components/events/open';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ROOMS, userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { SORT_OPTIONS, STATUS_OPTIONS, WHEN_OPTIONS, demoEvents, whenText } from '@/lib/events';
import { liveMode } from '@/lib/live';
import { makeStyles, useTheme } from '@/theme';

/** The host: mounted once for the signed-in app, shows the centre while something opened it. */
export function EventCenterHost() {
  const open = useEventsOpen();
  return open ? <EventCenter open={open} /> : null;
}

type Filters = { status: string; cat: string; when: string; sort: string; following: boolean };
const START: Filters = { status: 'all', cat: '', when: '', sort: 'soon', following: false };
const labelOf = (opts: [string, string][], v: string) => opts.find(([k]) => k === v)?.[1] ?? opts[0][1];

function EventCenter({ open }: { open: NonNullable<CenterOpen> }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const live = liveMode();
  const [tab, setTab] = useState<CenterTab>(open.tab ?? 'all');
  const [detail, setDetail] = useState<number | null>(open.id ?? null);
  const [form, setForm] = useState<{ edit?: api.EventDetail; room?: string } | null>(open.create ? { room: open.room } : null);
  const [filters, setFilters] = useState<Filters>(START);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState<null | 'status' | 'cat' | 'when' | 'sort'>(null);
  const [meta, setMeta] = useState<api.EventMeta | null>(null);
  const [list, setList] = useState<api.EventItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [mine, setMine] = useState<{ events: api.EventItem[]; reserved: api.EventItem[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);
  // Demo: sample events, my places kept on this screen.
  const [demoMine, setDemoMine] = useState<Set<number>>(new Set());
  const demo = useMemo(() => (live ? [] : demoEvents(ROOMS, (id) => ({ name: userById(id).name, avatar: userById(id).avatar }))), [live]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // The search waits for a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadMeta = useCallback(() => {
    if (!live) return;
    api.eventMeta().then(setMeta, () => {});
  }, [live]);
  useEffect(loadMeta, [loadMeta]);

  // A pull to refresh or a change elsewhere reads the open tab again.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    let on = true;
    const n = ++seq.current;
    busy.current = true;
    const read =
      tab === 'all'
        ? api.eventList({ ...filters, q: query }).then((r) => {
            if (!on || n !== seq.current) return;
            setList(r.events);
            setMore(r.more);
            setFailed(false);
          })
        : api.eventsMine().then((m) => {
            if (!on) return;
            setMine(m);
            setFailed(false);
          });
    read
      .catch(() => on && setFailed(true))
      .finally(() => {
        if (n === seq.current) busy.current = false;
        if (on) setRefreshing(false);
      });
    return () => {
      on = false;
    };
  }, [live, tab, filters, query, tick]);
  /** The next page of Etkinlik Alanı. */
  const loadMore = () => {
    if (!live || busy.current || !more) return;
    const n = ++seq.current;
    busy.current = true;
    api
      .eventList({ ...filters, q: query, skip: list?.length ?? 0 })
      .then((r) => {
        if (n !== seq.current) return;
        setList((old) => [...(old ?? []), ...r.events.filter((e) => !old?.some((o) => o.id === e.id))]);
        setMore(r.more);
      })
      .catch(() => {})
      .finally(() => {
        if (n === seq.current) busy.current = false;
      });
  };
  const loadMine = () => setTick((t) => t + 1);

  const shown = useMemo(() => {
    if (live) return list;
    const needle = query.toLocaleLowerCase('tr-TR');
    return demo
      .map((e) => (demoMine.has(e.id) ? { ...e, mine: 'confirmed' as const, reserved: e.reserved + 1 } : e))
      .filter((e) => (filters.status === 'all' || e.state === filters.status) && (!filters.cat || e.category.id === filters.cat))
      .filter((e) => (filters.when === 'now' ? e.state === 'live' : true))
      .filter((e) => !needle || `${e.title} ${e.room.title} ${e.host.name} ${e.category.name}`.toLocaleLowerCase('tr-TR').includes(needle));
  }, [live, list, demo, demoMine, filters, query]);

  const categories = live ? (meta?.categories ?? []) : [...new Map(demo.map((e) => [e.category.id, { id: e.category.id, name: e.category.name, icon: e.category.icon, theme: e.theme }])).values()];
  const catOptions: [string, string][] = [['', 'Tüm Etkinlikler'], ...categories.map((c) => [c.id, c.name] as [string, string])];
  const canCreate = live && (meta?.rooms.length ?? 0) > 0;
  const changed = filters.status !== START.status || filters.cat || filters.when || filters.sort !== START.sort || filters.following;

  const create = () => {
    if (!live) return showAlert('Etkinlik oluştur', 'Etkinlik başvurusu sunucu bağlantısıyla yapılır.');
    if (meta?.blockedUntil) return showAlert('Başvuru şu an kapalı', `Zamanında başlatılmayan etkinlikler nedeniyle ${new Date(meta.blockedUntil).toLocaleDateString('tr-TR')} tarihine kadar yeni başvuru yapamazsın.`);
    if (!meta?.rooms.length) return showAlert('Önce odanı aç', 'Etkinlik başvurusunu açık bir odası olan oda sahibi yapar.');
    setForm({ room: meta.rooms[0].id });
  };
  const goRoom = (room: string) => {
    closeEvents();
    router.push(`/oda/${room}`);
  };
  const refresh = () => {
    setTick((t) => t + 1);
    loadMeta();
  };

  const filterChip = (key: 'status' | 'cat' | 'when' | 'sort', text: string, active: boolean) => (
    <Pressable key={key} onPress={() => setPicker(key)} style={[styles.chip, active && styles.chipOn]} accessibilityRole="button">
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
        {text}
      </Text>
      <Ionicons name="chevron-down" size={14} color={active ? semantic.actionInk : colors.textDim} />
    </Pressable>
  );

  const header = (
    <View style={{ gap: 12, paddingBottom: 6 }}>
      <View style={styles.search}>
        <Ionicons name="search" size={17} color={colors.textDim} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Etkinlik, oda, düzenleyen veya tür ara"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
          returnKeyType="search"
          maxLength={40}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Aramayı temizle">
            <Ionicons name="close-circle" size={17} color={colors.textDim} />
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
        {filterChip('status', labelOf(STATUS_OPTIONS, filters.status), filters.status !== 'all')}
        {filterChip('cat', labelOf(catOptions, filters.cat), !!filters.cat)}
        {filterChip('when', filters.when ? labelOf(WHEN_OPTIONS, filters.when) : 'Zaman', !!filters.when)}
        {filterChip('sort', labelOf(SORT_OPTIONS, filters.sort), filters.sort !== 'soon')}
        {live && (
          <Pressable onPress={() => setFilters((f) => ({ ...f, following: !f.following }))} style={[styles.chip, filters.following && styles.chipOn]} accessibilityRole="switch" aria-checked={filters.following}>
            <Ionicons name={filters.following ? 'heart' : 'heart-outline'} size={14} color={filters.following ? semantic.actionInk : colors.textDim} />
            <Text style={[styles.chipText, filters.following && styles.chipTextOn]}>Takip ettiğim odalar</Text>
          </Pressable>
        )}
        {changed ? (
          <Pressable onPress={() => setFilters(START)} style={styles.clear} accessibilityRole="button">
            <Text style={styles.clearText}>Temizle</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );

  const empty =
    live && list === null && !failed ? (
      <ActivityIndicator color={colors.primaryText} style={{ marginTop: 40 }} />
    ) : failed ? (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Etkinlikler yüklenemedi</Text>
        <Text style={styles.emptyText}>İnternetini kontrol edip tekrar dene.</Text>
        <Button title="Tekrar dene" icon="refresh" small variant="tonal" onPress={refresh} />
      </View>
    ) : (
      <View style={styles.emptyBox}>
        <Ionicons name="calendar-clear-outline" size={40} color={colors.textDim} />
        <Text style={styles.emptyTitle}>{query ? 'Aramana uyan etkinlik yok' : changed ? 'Bu filtrelere uyan etkinlik yok' : 'Şu an yayında etkinlik yok'}</Text>
        <Text style={styles.emptyText}>{query ? 'Başka bir kelimeyle ara ya da filtreleri temizle.' : 'Yeni etkinlikler onaylandıkça burada görünür.'}</Text>
      </View>
    );

  return (
    <Modal visible animationType="slide" onRequestClose={closeEvents} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable onPress={closeEvents} hitSlop={10} accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.heading}>Etkinlikler</Text>
          <Pressable onPress={() => showAlert('Etkinlik Merkezi', HELP)} hitSlop={10} accessibilityLabel="Nasıl çalışır" style={styles.back}>
            <Ionicons name="help-circle-outline" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.segment} accessibilityRole="tablist">
          {(
            [
              ['all', 'Etkinlik Alanı'],
              ['mine', 'Odamın Etkinlikleri'],
            ] as const
          ).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.seg, tab === k && styles.segOn]} accessibilityRole="tab" aria-selected={tab === k}>
              <Text style={[styles.segText, tab === k && styles.segTextOn]} numberOfLines={1} adjustsFontSizeToFit>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'all' ? (
          <FlatList
            data={shown ?? []}
            keyExtractor={(e) => String(e.id)}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 110 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              live ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    refresh();
                  }}
                  tintColor={colors.primaryText}
                />
              ) : undefined
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => <EventCard e={item} now={now} onPress={() => setDetail(item.id)} />}
            ListFooterComponent={live && more ? <ActivityIndicator color={colors.primaryText} style={{ marginVertical: 12 }} /> : undefined}
          />
        ) : (
          <MineTab live={live} mine={mine} demoReserved={demo.filter((e) => demoMine.has(e.id))} hasRoom={canCreate} failed={failed} onRetry={refresh} onOpen={setDetail} now={now} onOpenRoom={() => goRoom('yeni')} />
        )}

        {(canCreate || !live) && (
          <View style={[styles.fabWrap, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
            <Button title="Etkinlik Oluştur" icon="add" onPress={create} style={styles.fab} />
          </View>
        )}
      </View>

      <ActionSheet
        visible={picker !== null}
        title={picker === 'status' ? 'Durum' : picker === 'cat' ? 'Etkinlik türü' : picker === 'when' ? 'Zaman' : 'Sırala'}
        onClose={() => setPicker(null)}
        options={(picker === 'status' ? STATUS_OPTIONS : picker === 'cat' ? catOptions : picker === 'when' ? WHEN_OPTIONS : SORT_OPTIONS).map(([k, label]) => {
          const key = picker === 'status' ? 'status' : picker === 'cat' ? 'cat' : picker === 'when' ? 'when' : 'sort';
          const on = filters[key] === k;
          return { label: on ? `${label}  ✓` : label, onPress: () => setFilters((f) => ({ ...f, [key]: k })) };
        })}
      />

      {detail !== null && (
        <EventDetailView
          id={detail}
          demo={live ? null : (shown ?? []).find((e) => e.id === detail) ?? demo.find((e) => e.id === detail) ?? null}
          onDemoReserve={(id, on) => setDemoMine((s) => (on ? new Set([...s, id]) : new Set([...s].filter((x) => x !== id))))}
          onClose={() => setDetail(null)}
          onChanged={refresh}
          onEdit={(e) => setForm({ edit: e })}
          onRoom={goRoom}
        />
      )}
      {form && meta && (
        <EventFormView
          meta={meta}
          room={form.room}
          edit={form.edit}
          onClose={() => setForm(null)}
          onSaved={(e) => {
            setForm(null);
            setTab('mine');
            loadMine();
            setDetail(e.id);
            showAlert(e.state === 'draft' ? 'Taslak kaydedildi' : 'Başvurun alındı', e.state === 'draft' ? 'Hazır olunca incelemeye gönderebilirsin.' : 'Yönetim inceledikten sonra Etkinlik Alanı’nda yayınlanır. Sonucu Similar Ekibi mesajlarında görürsün.');
          }}
        />
      )}
    </Modal>
  );
}

const HELP =
  'Etkinlik Alanı’nda onaylanmış etkinlikleri bulur, başlamadan yerini ayırtırsın. Başlayan etkinliğe odasına girerek katılırsın.\n\nOda sahibiysen “Etkinlik Oluştur” ile başvurursun; yönetim onaylayınca etkinliğin yayınlanır. Zamanı gelince odanı aç ve etkinliği başlat. Başlangıç saatinden sonra başlatılmayan etkinlik sona erer ve tekrarı başvuru hakkını bir süre kısıtlar. Etkinlik sırasında oda kapanırsa etkinlik de biter.';

const SECTIONS: [api.EventState, string][] = [
  ['live', 'Devam ediyor'],
  ['review', 'İncelemede'],
  ['upcoming', 'Yaklaşan'],
  ['draft', 'Taslaklar'],
  ['rejected', 'Reddedilenler'],
  ['ended', 'Tamamlananlar'],
  ['cancelled', 'İptal edilenler'],
];

function MineTab({
  live,
  mine,
  demoReserved,
  hasRoom,
  failed,
  onRetry,
  onOpen,
  now,
  onOpenRoom,
}: {
  live: boolean;
  mine: { events: api.EventItem[]; reserved: api.EventItem[] } | null;
  demoReserved: api.EventItem[];
  hasRoom: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpen: (id: number) => void;
  now: number;
  onOpenRoom: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  if (live && !mine) {
    return failed ? (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Yüklenemedi</Text>
        <Button title="Tekrar dene" icon="refresh" small variant="tonal" onPress={onRetry} />
      </View>
    ) : (
      <ActivityIndicator color={colors.primaryText} style={{ marginTop: 40 }} />
    );
  }
  const events = live ? (mine?.events ?? []) : [];
  const reserved = (live ? (mine?.reserved ?? []) : demoReserved).filter((e) => e.mine === 'confirmed' || e.state === 'live');
  const past = live ? (mine?.reserved ?? []).filter((e) => !reserved.includes(e)).slice(0, 10) : [];
  const row = (e: api.EventItem) => (
    <Pressable key={e.id} onPress={() => onOpen(e.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {e.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {e.room.title} · {whenText(e.startsAt, now)}
        </Text>
      </View>
      <View style={[styles.badge, e.state === 'live' && { backgroundColor: 'rgba(19,217,223,0.18)' }, (e.state === 'rejected' || e.state === 'cancelled') && { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
        <Text style={styles.badgeText} numberOfLines={1}>
          {e.mine === 'attended' ? 'Katıldın' : e.mine === 'missed' ? 'Katılmadın' : e.stateLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 110 }}>
      <View style={{ gap: 8 }}>
        <Text style={styles.section}>Yer ayırttıklarım</Text>
        {reserved.length ? reserved.map(row) : <Text style={styles.dim}>Yer ayırttığın yaklaşan etkinlik yok.</Text>}
      </View>
      {live &&
        (events.length ? (
          SECTIONS.map(([state, title]) => {
            const xs = events.filter((e) => e.state === state);
            return xs.length ? (
              <View key={state} style={{ gap: 8 }}>
                <Text style={styles.section}>
                  {title} · {xs.length}
                </Text>
                {xs.map(row)}
              </View>
            ) : null;
          })
        ) : (
          <View style={styles.emptyBox}>
            <Ionicons name="sparkles-outline" size={36} color={colors.textDim} />
            <Text style={styles.emptyTitle}>{hasRoom ? 'Odanın henüz etkinliği yok' : 'Etkinlik düzenlemek için bir oda aç'}</Text>
            <Text style={styles.emptyText}>{hasRoom ? '“Etkinlik Oluştur” ile ilk başvurunu yap; onaylanınca herkes görür.' : 'Açık odası olan oda sahipleri etkinlik başvurusu yapabilir.'}</Text>
            {!hasRoom && <Button title="Oda aç" icon="add" small variant="tonal" onPress={onOpenRoom} />}
          </View>
        ))}
      {past.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>Geçmiş ayırtmalarım</Text>
          {past.map(row)}
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '800' },
  segment: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.cardAlt, borderRadius: 999, padding: 4 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  segOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { color: colors.textDim, fontSize: 15, fontWeight: '700' },
  segTextOn: { color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, maxWidth: 220 },
  chipOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: semantic.actionInk },
  clear: { paddingHorizontal: 10, justifyContent: 'center' },
  clearText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: { minWidth: 230 },
  section: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12.5 },
  badge: { backgroundColor: colors.cardAlt, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, maxWidth: 120 },
  badgeText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
}));
