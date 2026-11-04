// Yönetim › Yaptırımlar: find a person (name, username, phone, e-mail, account id, #sanction or #device id) and
// open their sanctions; sanctions waiting for a second person's approval; the appeals queue; the policy steps
// and who may do what. Each part shows only for staff whose permissions (meta.perms) allow it; the server
// checks every call again.
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { ChoiceChips } from '@/components/list';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { ago, fmtDate } from '@/lib/admin-format';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import { APPEAL_LABEL, OUTCOME_LABEL, appealOutcomes, durationOptions, fmtLength, has, lengthOf, stateOf, STATE_LABEL, type AppealOutcome, type SanctionMeta } from '@/lib/sanction-format';
import { makeStyles, space } from '@/theme';

import { Filters, ItemCard, Line, LoadState, Notice, Overlay, Quote, SectionScroll, StatusPill, useAdmin, useLoad } from './parts';
import { ApproveButtons, DurationPicker, Field, SanctionCard } from './sanction-parts';
import { SearchBox, SearchResults, useUserSearch } from './sanction-search';
import { PermissionsView, PoliciesView } from './sanction-settings';

type View_ = 'ara' | 'onay' | 'itiraz' | 'kademe' | 'yetki';

export function SanctionsSection({ meta, onMeta }: { meta: SanctionMeta; onMeta: () => void }) {
  const views: [View_, string][] = [
    ['ara', 'Kişi ara'],
    ...(has(meta.perms, 'sanction.approve') ? [['onay', 'Onay bekleyen'] as [View_, string]] : []),
    ...(has(meta.perms, 'sanction.appeal') ? [['itiraz', 'İtirazlar'] as [View_, string]] : []),
    ...(has(meta.perms, 'sanction.policy') ? [['kademe', 'Ceza kademeleri'] as [View_, string]] : []),
    ...(has(meta.perms, 'sanction.permissions') ? [['yetki', 'Yetkiler'] as [View_, string]] : []),
  ];
  const [view, setView] = useState<View_>('ara');
  const nav = views.length > 1 ? <Filters value={view} options={views} onChange={setView} /> : null;
  if (view === 'onay') return <PendingView meta={meta} nav={nav} />;
  if (view === 'itiraz') return <AppealsView meta={meta} nav={nav} />;
  if (view === 'kademe') return <PoliciesView meta={meta} nav={nav} onSaved={onMeta} />;
  if (view === 'yetki') return <PermissionsView meta={meta} nav={nav} />;
  return <SearchView nav={nav} />;
}

function SearchView({ nav }: { nav: ReactNode }) {
  const ctx = useAdmin();
  const search = useUserSearch();
  return (
    <SectionScroll load={search.load}>
      {nav}
      <SearchBox search={search} title="Kişi bul" hint="Bir kişiye tıkla: süren yaptırımları, geçmişi, cihazları, itirazları ve işlem kaydı açılır." />
      <SearchResults search={search} onPick={(u) => ctx.openSanctions(u.id, u.name)} />
    </SectionScroll>
  );
}

// --- Pending approvals -------------------------------------------------------------------------------------
function PendingView({ meta, nav }: { meta: SanctionMeta; nav: ReactNode }) {
  const ctx = useAdmin();
  const load = useLoad(admin.pendingSanctions);
  return (
    <SectionScroll load={load}>
      {nav}
      <LoadState
        load={load}
        empty={(d) =>
          d.length
            ? null
            : { icon: 'checkmark-done-outline', title: 'Onay bekleyen yaptırım yok', text: 'Ağır yaptırımlar (ömür boyu ban, cihaz banı) ve onaylı kademeler burada ikinci bir yetkiliyi bekler.' }
        }
      >
        {(d) => (
          <>
            <Notice text="Onaylanan yaptırım hemen başlar ve süresi onay anından sayılır. Kendi önerdiğin yaptırımı başka bir yetkili onaylamalı." />
            {d.map((x) => (
              <SanctionCard key={x.id} x={x} ctx={ctx} perms={meta.perms} onChanged={load.reload} userName="" extra={<ApproveButtons x={x} ctx={ctx} onDone={load.reload} />} />
            ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

// --- Appeals -----------------------------------------------------------------------------------------------
const APPEAL_FILTERS: ['open' | 'decided', string][] = [
  ['open', 'Açık'],
  ['decided', 'Karara bağlanan'],
];

function AppealsView({ meta, nav }: { meta: SanctionMeta; nav: ReactNode }) {
  const ctx = useAdmin();
  const [filter, setFilter] = useState<'open' | 'decided'>('open');
  const load = useLoad(() => admin.appeals(filter), [filter]);
  const outcomes = appealOutcomes(meta.perms);
  return (
    <SectionScroll load={load}>
      {nav}
      <Filters value={filter} options={APPEAL_FILTERS} onChange={setFilter} />
      <LoadState
        load={load}
        empty={(d) =>
          d.length
            ? null
            : filter === 'open'
              ? { icon: 'chatbox-ellipses-outline', title: 'Açık itiraz yok', text: 'Kişiler süren bir yaptırıma itiraz edince burada görünür.' }
              : { icon: 'file-tray-outline', title: 'Karara bağlanan itiraz yok' }
        }
      >
        {(d) => (
          <>
            {filter === 'open' && !has(meta.perms, 'sanction.appeal_decide') && (
              <Notice tone="neutral" text="Süre azaltma ve kaldırma için itiraz karar yetkisi gerekir. Sen “yaptırım yerinde” diyebilir veya ek incelemeye alabilirsin." />
            )}
            {d.map((a) => {
              const [label, tone] = APPEAL_LABEL[a.status];
              const x = a.sanction;
              const [sl] = STATE_LABEL[stateOf(x)];
              return (
                <ItemCard key={a.id} title={`İtiraz #${a.id}`} sub={`${a.userName ?? 'Kullanıcı'} · ${ago(a.createdAt)}`} pill={<StatusPill text={label} tone={tone} />}>
                  <Line label="Kişi" value={a.userName ?? a.userId} onPress={() => ctx.openSanctions(a.userId, a.userName ?? 'Kullanıcı')} />
                  <Line label="Yaptırım" value={`${x.label} · #${x.id}`} />
                  <Line label="Kategori" value={x.reason} />
                  <Line label="Süre" value={`${fmtLength(x.type, lengthOf(x))}${x.endAt ? ` · ${fmtDate(x.endAt)} bitiş` : ''}`} />
                  <Line label="Durum" value={sl} />
                  <Line label="Tarih" value={fmtDate(a.createdAt)} />
                  <Quote text={a.text} />
                  {!!a.reviewedBy && <Line label="İnceleyen" value={a.reviewedBy} />}
                  {!!a.decidedAt && <Line label="Karar tarihi" value={fmtDate(a.decidedAt)} />}
                  {!!a.note && <Line label="Karar notu" value={a.note} />}
                  {(a.status === 'open' || a.status === 'needs_review') && outcomes.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
                      <Button title="Karar ver" icon="hammer-outline" variant="tonal" small onPress={() => ctx.present(<DecideSheet appeal={a} meta={meta} onDone={load.reload} />)} />
                    </View>
                  )}
                </ItemCard>
              );
            })}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function DecideSheet({ appeal, meta, onDone }: { appeal: admin.StaffAppeal; meta: SanctionMeta; onDone: () => void }) {
  const ctx = useAdmin();
  const s = useStyles();
  const outcomes = appealOutcomes(meta.perms);
  const [outcome, setOutcome] = useState<AppealOutcome>(outcomes[0]);
  const [minutes, setMinutes] = useState<number | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const x = appeal.sanction;
  const now = lengthOf(x);
  // Shorter lengths only: the presets of this type below the current one (any of them for a permanent one).
  const shorter = durationOptions(x.type, {
    ...meta,
    perms: [...meta.perms, 'sanction.mute', 'sanction.ban', 'sanction.ban_permanent', 'sanction.device_ban', 'sanction.device_ban_permanent'],
  }).filter((o) => o.minutes !== null && (now === null || o.minutes < now));
  const tooLong = outcome === 'reduced' && minutes !== undefined && minutes !== null && now !== null && minutes >= now;
  const ok = note.trim().length >= 3 && (outcome !== 'reduced' || (typeof minutes === 'number' && !tooLong));
  const close = () => ctx.present(null);
  const submit = () => {
    setBusy(true);
    setError(null);
    admin
      .decideAppeal(appeal.id, outcome, note.trim(), outcome === 'reduced' ? (minutes ?? undefined) : undefined)
      .then(() => {
        ctx.toast(`İtiraz #${appeal.id}: ${OUTCOME_LABEL[outcome].toLocaleLowerCase('tr-TR')}`);
        ctx.changed();
        onDone();
        close();
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Overlay onClose={close} label={`İtiraz #${appeal.id} kararı`}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.md }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>
          <Text style={s.sheetTitle}>İtiraz #{appeal.id}</Text>
          <Text style={s.hint}>
            {appeal.userName ?? 'Kullanıcı'} · {x.label} · {fmtLength(x.type, now)}
          </Text>
        </View>
        <Quote text={appeal.text} />
        <View style={{ gap: space.sm }}>
          <Text style={s.blockTitle}>Karar</Text>
          <ChoiceChips
            value={outcome}
            options={outcomes.map((o): [AppealOutcome, string] => [o, OUTCOME_LABEL[o]])}
            onChange={(o) => {
              setOutcome(o);
              setError(null);
            }}
          />
          {outcome === 'upheld' && <Text style={s.hint}>Yaptırım olduğu gibi sürer, itiraz kapanır.</Text>}
          {outcome === 'lifted' && <Text style={s.hint}>Yaptırım hemen kaldırılır; bu ihlal ceza kademesinde sayılmaz.</Text>}
          {outcome === 'needs_review' && <Text style={s.hint}>İtiraz açık kalır ve “ek inceleme” olarak işaretlenir.</Text>}
        </View>
        {outcome === 'reduced' && (
          <View style={{ gap: space.sm }}>
            <Text style={s.blockTitle}>Yeni toplam süre</Text>
            <Text style={s.hint}>Yaptırımın başladığı andan ({fmtDate(x.startAt)}) itibaren sayılır ve şimdikinden kısa olmalı.</Text>
            <DurationPicker type={x.type} options={shorter} value={minutes} onChange={setMinutes} />
            {tooLong && <Text style={s.error}>Yeni süre şimdikinden ({fmtLength(x.type, now)}) kısa olmalı</Text>}
          </View>
        )}
        <Field label="Karar gerekçesi" value={note} onChange={setNote} placeholder="Kişiye ve işlem kaydına yazılır" max={500} multiline />
        {!!error && <Notice tone="danger" icon="alert-circle-outline" text={error} />}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Vazgeç" variant="ghost" onPress={close} style={{ flex: 1 }} />
          <Button title={busy ? 'Kaydediliyor…' : 'Kararı kaydet'} variant={outcome === 'lifted' ? 'danger' : 'tonal'} onPress={submit} disabled={busy || !ok} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Overlay>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  error: { color: semantic.danger, fontSize: 12, fontWeight: '600' },
}));
