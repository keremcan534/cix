// Etkinlik Merkezi: one event. What it is, when and where, its rules, and what I can do now: reserve a place (or
// give it back) before it starts, join its room while it runs, go to the organiser's room after. The room's owner
// and Süper Yönetici also start and end it, see who reserved and came, and the owner edits or cancels it. Every
// action is the server's answer (server/api/events.mjs); the demo keeps a place on this screen only.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCover, StatePill } from '@/components/events/event-card';
import { Text } from '@/components/text';
import { Avatar, Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { elapsedText, lookOf, placesText, spanText, whenText } from '@/lib/events';
import { makeStyles, useTheme } from '@/theme';

type Props = {
  id: number;
  /** The demo's event (no server), else null. */
  demo: api.EventItem | null;
  onDemoReserve: (id: number, on: boolean) => void;
  onClose: () => void;
  /** Something changed on the server: the lists read again. */
  onChanged: () => void;
  onEdit: (e: api.EventDetail) => void;
  onRoom: (room: string) => void;
};

const demoDetail = (e: api.EventItem): api.EventDetail => ({
  ...e,
  rules: 'Saygılı ol, kimseyi rahatsız etme. Mikrofon sırası düzenleyende.',
  rejectReason: null,
  cancelReason: null,
  rank: 0,
  can: { edit: false, cancel: false, start: false, end: false, reserve: e.state === 'upcoming' && e.mine !== 'confirmed', people: false },
  startFrom: e.startsAt,
  startUntil: e.startsAt,
});

const ACTION_LABEL: Record<string, string> = {
  draft: 'Taslak kaydedildi',
  apply: 'Başvuru gönderildi',
  edit: 'Düzenlendi',
  approve: 'Onaylandı',
  reject: 'Reddedildi',
  cancel: 'İptal edildi',
  remove: 'Yayından kaldırıldı',
  start: 'Başladı',
  end: 'Bitti',
  not_started: 'Zamanında başlatılmadı',
};

export function EventDetailView({ id, demo, onDemoReserve, onClose, onChanged, onEdit, onRoom }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [e, setE] = useState<api.EventDetail | null>(demo ? demoDetail(demo) : null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (demo) return;
    api.eventOne(id).then(
      (x) => {
        setE(x);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [id, demo]);
  useEffect(load, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /** One action on the server; the event comes back as it is now. */
  const act = async (what: string, fn: () => Promise<api.EventDetail>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setE(await fn());
      onChanged();
      if (done) showAlert(done);
    } catch (err) {
      showAlert(what, err instanceof Error ? err.message : 'Bir sorun oldu, tekrar dene.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const reserve = () => {
    if (!e) return;
    if (demo) {
      onDemoReserve(e.id, true);
      setE({ ...e, mine: 'confirmed', reserved: e.reserved + 1, can: { ...e.can, reserve: false } });
      return;
    }
    act('Yer ayırtılamadı', () => api.reserveEvent(e.id), 'Yerin ayrıldı. Etkinlik başladığında odasına girebilirsin.');
  };
  const unreserve = () => {
    if (!e) return;
    showAlert('Yerini iptal et', 'Ayırttığın yer boşalır; kontenjan dolarsa yeniden alamayabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: () => {
          if (demo) {
            onDemoReserve(e.id, false);
            setE({ ...e, mine: 'cancelled', reserved: Math.max(0, e.reserved - 1), can: { ...e.can, reserve: true } });
            return;
          }
          act('Yer iptal edilemedi', () => api.unreserveEvent(e.id));
        },
      },
    ]);
  };
  const cancel = () => {
    if (!e) return;
    showAlert('Etkinliği iptal et', e.reserved ? `Yer ayırtan ${e.reserved} kişiye iptal bildirilir. Bu geri alınamaz.` : 'Bu geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal et', style: 'destructive', onPress: () => act('İptal edilemedi', () => api.cancelEvent(e.id)) },
    ]);
  };
  const end = () => {
    if (!e) return;
    showAlert('Etkinliği bitir', 'Etkinlik sona erer ve oda normal görünümüne döner.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Bitir', style: 'destructive', onPress: () => act('Bitirilemedi', () => api.endEvent(e.id)) },
    ]);
  };

  const look = lookOf(e?.theme ?? 'sade');
  const start = e ? new Date(e.startsAt).getTime() : 0;
  const full = !!e && e.capacity !== null && e.reserved >= e.capacity && e.mine !== 'confirmed';

  let primary: React.ReactNode = null;
  if (e) {
    if (e.state === 'live') primary = <Button title="Etkinliğe Katıl" icon="enter-outline" onPress={() => onRoom(e.room.id)} />;
    else if (e.state === 'ended') primary = <Button title="Düzenleyicinin Odasına Git" icon="home-outline" variant="tonal" onPress={() => onRoom(e.room.id)} disabled={e.room.closed} />;
    else if (e.state === 'upcoming' && e.mine === 'confirmed') primary = <Button title="Yerimi iptal et" icon="close-circle-outline" variant="ghost" onPress={unreserve} disabled={busy} />;
    else if (e.state === 'upcoming' && e.reservation) primary = <Button title={full ? 'Kontenjan doldu' : 'Yer Ayırt'} icon="bookmark-outline" onPress={reserve} disabled={busy || full || !e.can.reserve} />;
    else if (e.state === 'upcoming') primary = <Button title="Odaya Git" icon="home-outline" variant="tonal" onPress={() => onRoom(e.room.id)} />;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {!e ? (
          <View style={[styles.center, { paddingTop: insets.top }]}>
            {failed ? (
              <>
                <Text style={styles.title}>Etkinlik açılamadı</Text>
                <Text style={styles.dim}>Kaldırılmış ya da sana kapalı olabilir.</Text>
                <Button title="Geri dön" small variant="tonal" onPress={onClose} />
              </>
            ) : (
              <ActivityIndicator color={colors.primaryText} />
            )}
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
              <View>
                <EventCover e={e} height={240 + insets.top} radius={0} />
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Geri" style={[styles.back, { top: insets.top + 8 }]}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </Pressable>
                <View style={[styles.pillPos, { top: insets.top + 14 }]}>
                  <StatePill e={e} />
                </View>
              </View>
              <View style={styles.body}>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: `${look.colors[0]}33` }]}>
                    <Ionicons name={look.icon} size={13} color={colors.text} />
                    <Text style={styles.tagText}>{e.category.name}</Text>
                  </View>
                  {e.visibility === 'room' && (
                    <View style={styles.tag}>
                      <Ionicons name="lock-closed-outline" size={12} color={colors.text} />
                      <Text style={styles.tagText}>Yalnız odada</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.title}>{e.title}</Text>

                {e.state === 'live' && e.startedAt && (
                  <View style={styles.liveBox}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>Devam ediyor · {elapsedText(now - new Date(e.startedAt).getTime())}</Text>
                  </View>
                )}
                {e.state === 'rejected' && e.rejectReason && <Notice icon="alert-circle" tone="danger" title="Başvuru reddedildi" text={`${e.rejectReason} Düzenleyip yeniden gönderebilirsin.`} />}
                {e.state === 'review' && <Notice icon="hourglass-outline" title="İncelemede" text="Yönetim inceledikten sonra yayınlanır; sonucu Similar Ekibi mesajlarında görürsün." />}
                {e.state === 'draft' && <Notice icon="document-outline" title="Taslak" text="Henüz gönderilmedi. Düzenleyip incelemeye gönderebilirsin." />}
                {e.state === 'cancelled' && <Notice icon="close-circle" tone="danger" title="Etkinlik iptal edildi" text={e.cancelReason ?? 'Düzenleyen etkinliği iptal etti.'} />}
                {e.state === 'ended' && e.endReason === 'not_started' && <Notice icon="alert-circle-outline" tone="danger" title="Başlatılmadı" text="Etkinlik zamanında başlatılmadığı için sona erdi." />}

                <View style={styles.grid}>
                  <Info icon="calendar-outline" label="Başlangıç" value={whenText(e.startsAt, now)} />
                  <Info icon="hourglass-outline" label="Süre" value={spanText(new Date(e.endsAt).getTime() - start)} />
                  <Info icon="people-outline" label="Katılım" value={placesText(e)} />
                  <Info
                    icon="timer-outline"
                    label={e.state === 'upcoming' ? 'Kalan süre' : 'Bitiş'}
                    value={e.state === 'upcoming' ? (start > now ? spanText(start - now) : 'Başlamak üzere') : whenText(e.endedAt ?? e.endsAt, now)}
                  />
                </View>

                <Pressable onPress={() => onRoom(e.room.id)} style={styles.hostRow} accessibilityRole="button" disabled={e.room.closed}>
                  <Avatar uri={e.host.avatarUrl ?? undefined} name={e.host.name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hostName} numberOfLines={1}>
                      {e.host.name}
                    </Text>
                    <Text style={styles.dim} numberOfLines={1}>
                      Düzenleyen · {e.room.title}
                      {e.room.closed ? ' (kapalı)' : ''}
                    </Text>
                  </View>
                  {!e.room.closed && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
                </Pressable>

                {e.description ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Açıklama</Text>
                    <Text style={styles.text}>{e.description}</Text>
                  </View>
                ) : null}
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Etkinlik kuralları</Text>
                  <Text style={styles.text}>{e.rules || 'Etkinlik sırasında SimilarClub topluluk kuralları geçerlidir.'}</Text>
                  {e.rules ? <Text style={[styles.dim, { marginTop: 6 }]}>SimilarClub topluluk kuralları da geçerlidir.</Text> : null}
                </View>

                {(e.can.start || e.can.end || e.can.edit || e.can.cancel || e.can.people) && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Yönetim</Text>
                    {e.rank >= 2 && e.state === 'upcoming' && !e.can.start && (
                      <Text style={styles.dim}>
                        Başlatma {whenText(e.startFrom, now)} ile {whenText(e.startUntil, now)} arasında açık. Önce odanı aç; zamanı gelince odada biri varsa etkinlik kendiliğinden de başlar.
                      </Text>
                    )}
                    <View style={styles.actions}>
                      {e.can.start && <Button title="Etkinliği Başlat" icon="play" small onPress={() => act('Başlatılamadı', () => api.startEvent(e.id), 'Etkinlik başladı.')} disabled={busy} />}
                      {e.can.end && <Button title="Etkinliği Bitir" icon="stop" small variant="danger" onPress={end} disabled={busy} />}
                      {e.can.edit && <Button title="Düzenle" icon="create-outline" small variant="tonal" onPress={() => onEdit(e)} disabled={busy} />}
                      {e.can.people && <Button title="Katılımcılar" icon="people-outline" small variant="tonal" onPress={() => setPeople(true)} />}
                      {e.can.cancel && <Button title="İptal et" icon="close-circle-outline" small variant="ghost" onPress={cancel} disabled={busy} />}
                    </View>
                    {e.can.edit && e.state === 'upcoming' && <Text style={styles.dim}>Onaylanmış bir etkinliği düzenlersen değişiklik yeniden incelemeye gider.</Text>}
                  </View>
                )}

                {e.history && e.history.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>İşlem geçmişi</Text>
                    {e.history.map((h, i) => (
                      <Text key={i} style={styles.dim}>
                        {whenText(h.at, now)} · {ACTION_LABEL[h.action] ?? h.action} · {h.by}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
            {primary && <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>{primary}</View>}
          </>
        )}
      </View>
      {people && e && <PeopleSheet id={e.id} onClose={() => setPeople(false)} />}
    </Modal>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={17} color={colors.primaryText} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Notice({ icon, title, text, tone }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; tone?: 'danger' }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const c = tone === 'danger' ? semantic.danger : colors.primaryText;
  return (
    <View style={[styles.notice, { borderColor: `${c}55` }]}>
      <Ionicons name={icon} size={18} color={c} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.noticeTitle, { color: c }]}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const RES_LABEL: Record<string, string> = { confirmed: 'Yer ayırttı', cancelled: 'Vazgeçti', attended: 'Katıldı', missed: 'Katılmadı', waiting: 'Bekliyor' };

function PeopleSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.eventPeople>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.eventPeople(id).then(setData, () => setFailed(true));
  }, [id]);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.blockTitle}>Katılımcılar</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        {!data ? (
          failed ? <Text style={styles.dim}>Yüklenemedi.</Text> : <ActivityIndicator color={colors.primaryText} />
        ) : (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6 }}>
            <Text style={styles.dim}>
              {data.reservations.filter((r) => r.status !== 'cancelled').length} yer ayırtma · {data.participants.length} katılımcı
            </Text>
            {data.reservations.map((r) => (
              <View key={`r${r.user.id}`} style={styles.person}>
                <Avatar uri={r.user.avatarUrl ?? undefined} name={r.user.name} size={32} />
                <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                  {r.user.name}
                </Text>
                <Text style={styles.dim}>{RES_LABEL[r.status] ?? r.status}</Text>
              </View>
            ))}
            {data.participants
              .filter((p) => !data.reservations.some((r) => r.user.id === p.user.id))
              .map((p) => (
                <View key={`p${p.user.id}`} style={styles.person}>
                  <Avatar uri={p.user.avatarUrl ?? undefined} name={p.user.name} size={32} />
                  <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                    {p.user.name}
                  </Text>
                  <Text style={styles.dim}>Katıldı</Text>
                </View>
              ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  back: { position: 'absolute', left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,12,30,0.45)', alignItems: 'center', justifyContent: 'center' },
  pillPos: { position: 'absolute', right: 14 },
  body: { padding: 16, gap: 14, marginTop: -18, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.bg },
  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.cardAlt },
  tagText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  liveBox: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(19,217,223,0.14)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.live },
  liveText: { color: colors.primaryText, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  info: { width: '48%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border },
  infoLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  infoValue: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  hostName: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  block: { gap: 8, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  blockTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: colors.card },
  noticeTitle: { fontSize: 14, fontWeight: '800' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
}));
