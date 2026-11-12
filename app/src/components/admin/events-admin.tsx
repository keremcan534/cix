// Yönetim › Etkinlikler: the review queue of event applications (approve, or refuse with the reason the owner
// reads), every event by state with a search, taking one down with a reason, and the event types (add, rename,
// reorder, close, delete an unused one), and the report of every room's events over 7, 30 or 90 days
// (components/events/event-report). The limits (who may apply, length, places, grace, strikes, reminders) are in
// Canlı ayarlar › Etkinlikler. Everything is the server's (server/api/events.mjs, admin role).
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PeriodChips, ReportBody } from '@/components/events/event-report';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { THEMES, whenText } from '@/lib/events';
import { makeStyles, space, useTheme } from '@/theme';

import { Filters, ItemCard, Line, LoadState, Notice, Quote, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad } from './parts';

type View_ = 'review' | 'upcoming' | 'live' | 'ended' | 'rejected' | 'cancelled' | 'all' | 'types' | 'report';
const VIEWS: [View_, string][] = [
  ['review', 'İnceleme'],
  ['upcoming', 'Yaklaşan'],
  ['live', 'Süren'],
  ['ended', 'Biten'],
  ['rejected', 'Reddedilen'],
  ['cancelled', 'İptal'],
  ['all', 'Tümü'],
  ['types', 'Türler'],
  ['report', 'Rapor'],
];
const REJECT_HINTS = ['Kapak görseli uygun değil.', 'Etkinlik adı ya da açıklaması kurallara aykırı.', 'Saat ve süre bilgisi eksik ya da hatalı.', 'Aynı içerikte başka bir etkinlik var.'];

export function EventsAdminSection() {
  const [view, setView] = useState<View_>('review');
  const [q, setQ] = useState('');
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        <Filters value={view} options={VIEWS} onChange={setView} />
        {view !== 'types' && view !== 'report' && (
          <TextInput value={q} onChangeText={setQ} placeholder="Etkinlik, oda ya da düzenleyen ara" placeholderTextColor={colors.textDim} style={s.search} maxLength={40} />
        )}
      </View>
      {view === 'types' ? <TypesView /> : view === 'report' ? <ReportView /> : <ListView status={view} q={q.trim()} />}
    </View>
  );
}

function ListView({ status, q }: { status: string; q: string }) {
  const load = useLoad(() => api.adminEvents(status, q), [status, q]);
  const ctx = useAdmin();
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const reload = () => load.refresh();
  const approve = (e: api.AdminEvent) =>
    confirmThen(ctx, { title: 'Onayla', message: `“${e.title}” Etkinlik Alanı’nda yayınlanır ve oda sahibine bildirilir.`, confirm: 'Onayla' }, () => api.reviewEvent(e.id, true), () => 'Etkinlik onaylandı', reload, setBusy);
  const reject = (e: api.AdminEvent) =>
    ctx.ask({
      kind: 'text',
      title: 'Başvuruyu reddet',
      message: 'Gerekçe oda sahibine gösterilir; düzenleyip yeniden gönderebilir.',
      label: 'Ret gerekçesi',
      suggestions: REJECT_HINTS,
      min: 3,
      max: 300,
      confirm: 'Reddet',
      destructive: true,
      onSubmit: (reason) =>
        api.reviewEvent(e.id, false, reason).then(
          () => {
            ctx.toast('Başvuru reddedildi');
            ctx.changed();
            reload();
          },
          (err: unknown) => showAlert('Reddedilemedi', err instanceof Error ? err.message : undefined),
        ),
    });
  const remove = (e: api.AdminEvent) =>
    ctx.ask({
      kind: 'text',
      title: 'Yayından kaldır',
      message: e.state === 'live' ? 'Etkinlik hemen sona erer; yer ayırtanlara ve oda sahibine bildirilir.' : 'Etkinlik iptal edilir; yer ayırtanlara ve oda sahibine bildirilir.',
      label: 'Gerekçe',
      min: 3,
      max: 300,
      confirm: 'Kaldır',
      destructive: true,
      onSubmit: (reason) =>
        api.removeEvent(e.id, reason).then(
          () => {
            ctx.toast('Etkinlik yayından kaldırıldı');
            reload();
          },
          (err: unknown) => showAlert('Kaldırılamadı', err instanceof Error ? err.message : undefined),
        ),
    });
  return (
    <SectionScroll load={load}>
      <LoadState load={load} empty={(r) => (r.events.length ? null : { icon: 'calendar-clear-outline', title: status === 'review' ? 'İnceleme bekleyen başvuru yok' : 'Bu listede etkinlik yok' })}>
        {(r) => (
          <View style={{ gap: space.md }}>
            {status === 'review' && <Notice text={`İnceleme bekleyen ${r.counts.review} · yaklaşan ${r.counts.upcoming} · şu an süren ${r.counts.live}. Sınırlar ve kurallar: Canlı ayarlar › Etkinlikler.`} />}
            {r.events.map((e) => (
              <ItemCard
                key={e.id}
                title={e.title}
                sub={`${e.category.name} · ${e.room.title} · ${e.host.name}`}
                pill={<StatusPill text={e.stateLabel} tone={e.state === 'review' ? 'action' : e.state === 'rejected' || e.state === 'cancelled' ? 'danger' : 'neutral'} />}
                actions={
                  e.state === 'review' ? (
                    <View style={s.row}>
                      <Button title="Onayla" icon="checkmark" small onPress={() => approve(e)} disabled={busy} />
                      <Button title="Reddet" icon="close" small variant="danger" onPress={() => reject(e)} disabled={busy} />
                    </View>
                  ) : e.state === 'upcoming' || e.state === 'live' ? (
                    <Button title="Yayından kaldır" icon="remove-circle-outline" small variant="ghost" onPress={() => remove(e)} disabled={busy} />
                  ) : undefined
                }
              >
                <Line label="Başlangıç" value={whenText(e.startsAt)} />
                <Line label="Süre" value={`${Math.round((new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / 60_000)} dk`} />
                <Line label="Tema" value={THEMES.find((t) => t.id === e.theme)?.name ?? e.theme} />
                <Line label="Kontenjan" value={e.capacity ? `${e.capacity} kişi` : 'Sınırsız'} />
                <Line label="Yer ayırtan · gelen" value={`${e.reserved} · ${e.came}`} />
                <Line label="Görünürlük" value={e.visibility === 'public' ? 'Herkes' : 'Yalnız odada'} />
                {e.coverUrl ? <Line label="Kapak" value="Yüklendi (uygulamada açın)" /> : null}
                {e.description ? <Quote text={e.description} /> : null}
                {e.rules ? <Quote text={`Kurallar: ${e.rules}`} /> : null}
                {e.rejectReason ? <Quote text={`Ret gerekçesi: ${e.rejectReason}`} /> : null}
              </ItemCard>
            ))}
            {r.more && <Text style={s.dim}>İlk 20 gösteriliyor; aramayla daraltın.</Text>}
          </View>
        )}
      </LoadState>
    </SectionScroll>
  );
}

/** Every room's events over a period. */
function ReportView() {
  const [days, setDays] = useState(30);
  const load = useLoad(() => api.adminEventReport(days), [days]);
  return (
    <SectionScroll load={load}>
      <View style={{ gap: space.md }}>
        <PeriodChips value={days} onChange={setDays} />
        <LoadState load={load}>{(r) => <ReportBody r={r} />}</LoadState>
      </View>
    </SectionScroll>
  );
}

function TypesView() {
  const load = useLoad(api.adminEventCategories);
  const ctx = useAdmin();
  const s = useStyles();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('sade');
  const save = (c: Partial<api.AdminEventCategory> & { name: string }, done: string) =>
    api.saveEventCategory(c).then(
      () => {
        ctx.toast(done);
        load.refresh();
      },
      (err: unknown) => showAlert('Kaydedilemedi', err instanceof Error ? err.message : undefined),
    );
  return (
    <SectionScroll load={load}>
      <LoadState load={load}>
        {(cats) => (
          <View style={{ gap: space.md }}>
            <Notice text="Türler Etkinlik Alanı’nın filtresinde ve başvuru formunda görünür. Kullanılmış bir tür silinemez; kapatılırsa yeni başvuruda seçilemez, eski etkinlikler kalır." />
            <ItemCard title="Yeni tür">
              <TextInput value={name} onChangeText={setName} placeholder="Örn. Şiir Gecesi" placeholderTextColor={colors.textDim} style={s.search} maxLength={24} />
              <Text style={s.dim}>Varsayılan tema</Text>
              <View style={s.wrap}>
                {THEMES.map((t) => (
                  <Pressable key={t.id} onPress={() => setTheme(t.id)} style={[s.chip, theme === t.id && s.chipOn]}>
                    <Text style={[s.chipText, theme === t.id && s.chipTextOn]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Button
                title="Ekle"
                icon="add"
                small
                disabled={name.trim().length < 2}
                onPress={() =>
                  save({ name: name.trim(), theme, sort: (cats.at(-1)?.sort ?? 0) + 10, icon: 'sparkles' }, 'Tür eklendi').then(() => {
                    setName('');
                  })
                }
              />
            </ItemCard>
            {cats.map((c, i) => (
              <ItemCard
                key={c.id}
                title={c.name}
                sub={`${THEMES.find((t) => t.id === c.theme)?.name ?? c.theme} teması · ${c.used ?? 0} etkinlik`}
                pill={<StatusPill text={c.active ? 'Açık' : 'Kapalı'} tone={c.active ? 'success' : 'neutral'} />}
                actions={
                  <View style={s.row}>
                    <Button title={c.active ? 'Kapat' : 'Aç'} small variant="tonal" onPress={() => save({ ...c, active: !c.active }, c.active ? 'Tür kapatıldı' : 'Tür açıldı')} />
                    {i > 0 && <Button title="Yukarı" icon="arrow-up" small variant="ghost" onPress={() => save({ ...c, sort: cats[i - 1].sort - 1 }, 'Sıra değişti')} />}
                    {!c.used && (
                      <Button
                        title="Sil"
                        icon="trash-outline"
                        small
                        variant="danger"
                        onPress={() =>
                          confirmThen(ctx, { title: 'Türü sil', message: `“${c.name}” silinsin mi?`, confirm: 'Sil', destructive: true }, () => api.removeEventCategory(c.id), () => 'Tür silindi', () => load.refresh())
                        }
                      />
                    )}
                  </View>
                }
              />
            ))}
          </View>
        )}
      </LoadState>
    </SectionScroll>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  top: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  search: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt },
  chipOn: { backgroundColor: semantic.action },
  chipText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  chipTextOn: { color: semantic.actionInk },
  dim: { color: colors.textDim, fontSize: 12.5, textAlign: 'center' },
}));
