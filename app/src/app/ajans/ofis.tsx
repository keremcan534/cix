// One agency's panel on the server's agency network (top or sub agency; the owner, staff, the parent agency, the
// centre or the BD see it with their own rights): summary with the commission split and performance, streamers,
// sub-agencies, performance and tiers, earnings with the commission ledger and payouts, requests and transfers,
// and the team. Every number and every permission comes from server/api/agency.mjs; actions are refused there
// when not allowed. Without a server connection the labelled example data is shown and actions are disabled.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Empty,
  Kpi,
  KpiGrid,
  Line,
  NetState,
  Panel,
  Pill,
  RateSplit,
  SERIES,
  ScoreBar,
  Section,
  StackedColumns,
  Tabs,
  TierLadder,
  diamondsKpi,
  ns,
  statusTone,
  useAsk,
  type Ask,
} from '@/components/agency-net';
import { HubSections, TransferCard, openOffice } from '@/components/agency-net-hub';
import { AssistantsTab } from '@/components/agency-assistants';
import { InviteSheet } from '@/components/agency-invite-sheet';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, DepthCard } from '@/components/fx/surface';
import { ChoiceChips, ListGroup, ListRow } from '@/components/list';
import { Text } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { demoCommissions, demoOverview, demoPayouts, demoPerformance, demoReport, demoRequests, demoStaff, demoStreamers, demoSubs, demoTransfers } from '@/data/agency-net-demo';
import {
  CHANGE_TEXT,
  CRITERIA_TEXT,
  FLAG_TEXT,
  INCOME_TEXT,
  KIND_TEXT,
  LEVEL_TEXT,
  PERM_TEXT,
  SOURCE_TEXT,
  STATUS_TEXT,
  VIEWER_TEXT,
  agencyNet,
  fmtD,
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtScore,
  fmtUsd,
  inviteStreamer,
  runAction,
  useNet,
  usdOf,
  type LedgerRow,
  type Overview,
  type Streamer,
} from '@/lib/agency-net';
import { earningsCsv } from '@/lib/agency-export';
import { shareCsv } from '@/lib/share-file';
import { NoAccess } from '@/components/no-access';
import { showAlert } from '@/lib/alert';
import { liveMode } from '@/lib/live';
import { useApp } from '@/store';
import { colors, fonts, semantic, space } from '@/theme';

type Tab = 'summary' | 'streamers' | 'subs' | 'performance' | 'earnings' | 'requests' | 'team' | 'assistants' | 'more';
type AskFn = (a: Ask) => Promise<{ reason: string; field: string } | null>;
type Ctx = { o: Overview; id: string; name: string; demo: boolean; reload: () => void; ask: AskFn; can: (p: string) => boolean; acting: boolean };

const METHOD_TEXT: Record<string, string> = { code: 'Kod', link: 'Bağlantı', invite: 'Davet', application: 'Başvuru', admin: 'Merkez' };

export default function AgencyOffice() {
  // hub=1: opened as the owner's agency entry (components/agency-net-hub), so the entry's other sections are a tab.
  const params = useLocalSearchParams<{ id?: string; hub?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const hub = params.hub === '1';
  const live = liveMode();
  const { me } = useApp();
  const q = useNet(me.name, () => agencyNet.overview(id), () => demoOverview(id || 'demo-top'), [id]);
  const [tab, setTab] = useState<Tab>('summary');
  const [askNode, ask] = useAsk();
  const o = q.data;
  const can = (p: string) => !!o?.perms.includes(p);
  const tabs: { key: Tab; label: string; perm?: string; badge?: number; hidden?: boolean }[] = [
    { key: 'summary', label: 'Özet' },
    { key: 'streamers', label: 'Yayıncılar', perm: 'streamers.view' },
    { key: 'subs', label: 'Referans ajanslar', perm: 'subagencies.view', hidden: !!o && o.agency.level > 1, badge: o?.counts.pending_subs },
    { key: 'performance', label: 'Performans', perm: 'reports.performance' },
    { key: 'earnings', label: 'Kazanç', perm: 'reports.commission' },
    { key: 'requests', label: 'Talepler', perm: 'streamers.view', badge: o ? o.counts.pending_requests + o.counts.pending_transfers : 0 },
    { key: 'team', label: 'Ekip', perm: 'staff.manage', hidden: !!o && !['owner', 'staff'].includes(o.viewer) },
    // Ajans asistanı: only the owner names assistants and sets their share (server/api/agency-assistants.mjs).
    { key: 'assistants', label: 'Asistanlar', hidden: !o || o.viewer !== 'owner' },
    { key: 'more', label: 'Diğer', hidden: !hub },
  ];
  const shown = tabs.filter((t) => !t.hidden);
  const cur = shown.find((t) => t.key === tab) ?? shown[0];
  const locked = !!cur.perm && !can(cur.perm);
  const ctx: Ctx | null = o ? { o, id: o.agency.id, name: me.name, demo: q.demo, reload: q.reload, ask, can, acting: o.viewer === 'owner' || o.viewer === 'staff' } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.family} />
      <Header title={o?.agency.name ?? 'Ajans'} right={<Pressable onPress={q.reload} hitSlop={10} accessibilityLabel="Yenile"><Ionicons name="refresh" size={22} color="#fff" /></Pressable>} />
      {o && <Tabs value={cur.key} onChange={setTab} options={shown.map((t) => ({ key: t.key, label: t.label, badge: t.badge, locked: !!t.perm && !can(t.perm) }))} />}
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        {/* One state for "nothing to show here" (no agency picked, or the server refused with 403), never demo data. */}
        {live && !id ? (
          <NoAccess title="Ajans seçilmedi" text="Panelini açmak istediğin ajansı Ajans ekranından seç." />
        ) : q.forbidden ? (
          <NoAccess text="Bu ajansın paneli yalnız ajans sahibine, ekibine, üst ajansına ve yetkili merkez personeline açık." />
        ) : (
          <NetState q={q}>
            {() =>
              !ctx ? null : locked ? (
                <Locked perm={cur.perm!} />
              ) : cur.key === 'summary' ? (
                <Summary c={ctx} />
              ) : cur.key === 'streamers' ? (
                <Streamers c={ctx} />
              ) : cur.key === 'subs' ? (
                <Subs c={ctx} />
              ) : cur.key === 'performance' ? (
                <PerformanceTab c={ctx} />
              ) : cur.key === 'earnings' ? (
                <Earnings c={ctx} />
              ) : cur.key === 'requests' ? (
                <Requests c={ctx} />
              ) : cur.key === 'assistants' ? (
                <AssistantsTab agencyId={ctx.id} rate={ctx.o.rate.rate} demo={ctx.demo} name={ctx.name} />
              ) : cur.key === 'more' ? (
                <HubSections />
              ) : (
                <Team c={ctx} />
              )
            }
          </NetState>
        )}
      </ScrollView>
      {askNode}
    </SafeAreaView>
  );
}

function Locked({ perm }: { perm: string }) {
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: 36 }}>
      <Ionicons name="lock-closed-outline" size={30} color={colors.textDim} />
      <Text style={ns.title}>Bu bölüm için yetkin yok</Text>
      <Text style={[ns.dim, { textAlign: 'center' }]}>Gerekli yetki: {PERM_TEXT[perm] ?? perm}. Ajans sahibi ekip ayarlarından verebilir.</Text>
    </Panel>
  );
}

// --- Summary ------------------------------------------------------------------------------------------------
function Summary({ c }: { c: Ctx }) {
  const { o } = c;
  const a = o.agency;
  const sub = a.level > 1;
  const p = o.performance;
  const e = o.earnings;
  const share = () => Share.share({ message: `${a.name} ajansına katılmak için kod: ${a.code}` }).catch(() => {});
  return (
    <View style={{ gap: space.xl }}>
      <DepthCard style={st.hero} tint={['#123B4A', '#0E2236']}>
        <View style={st.heroTop}>
          <View style={st.monogram}>
            <Text style={st.monoText}>{a.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.heroName} numberOfLines={2}>
              {a.name}
            </Text>
            <View style={st.pills}>
              <Pill text={LEVEL_TEXT(a.level)} tone="action" />
              <Pill text={STATUS_TEXT[a.status]} tone={statusTone(a.status)} />
              {sub && !!a.tierName && <Pill text={a.tierName} tone="money" icon="trending-up" />}
            </View>
          </View>
        </View>
        <View style={st.heroMeta}>
          <Line label="Sahibi" value={o.owner?.name ?? '—'} />
          {o.parent && <Line label="Üst ajans" value={o.parent.name} />}
          <Line label="Görünümün" value={VIEWER_TEXT[o.viewer]} />
          <Line label="Ajans kodu" value={a.code} strong />
        </View>
        {c.acting && a.status === 'approved' && <Button title="Davet kodunu paylaş" variant="tonal" small icon="share-outline" onPress={share} />}
      </DepthCard>

      {a.status === 'suspended' && <Banner icon="pause-circle-outline" tone="danger" text="Ajans askıda. Yeni üye ve alt ajans alınamaz, ödeme talebi açılamaz; geçmiş kayıtlar ve kazançlar korunur." />}
      {(a.status === 'pending' || a.status === 'draft') && <Banner icon="hourglass-outline" tone="money" text={a.status === 'draft' ? 'Taslak: onaya gönderilmedi.' : 'Başvuru inceleniyor. Onaylanınca panel açılır.'} />}

      {e && (
        <KpiGrid>
          <Kpi label="Bu ay komisyon" icon="diamond-outline" tone="money" {...diamondsKpi(e.month)} />
          <Kpi label="Çekilebilir" icon="wallet-outline" tone="success" {...diamondsKpi(e.balances.available)} />
          <Kpi label="Aktif yayıncı" icon="mic-outline" value={`${o.counts.active} / ${o.counts.streamers}`} sub="son 30 gün" />
          {sub ? <Kpi label="Performans puanı" icon="speedometer-outline" value={p ? fmtScore(p.score) : '—'} sub={p?.rank ? `Genel sıra ${p.rank}` : 'Henüz değerlendirilmedi'} /> : <Kpi label="Alt ajans" icon="git-branch-outline" value={`${o.counts.active_subs} / ${o.counts.subs}`} sub={o.counts.pending_subs ? `${o.counts.pending_subs} onay bekliyor` : `${o.counts.sub_streamers} yayıncı`} />}
        </KpiGrid>
      )}
      {e && (
        <Panel>
          <Text style={ns.title}>Son 30 gün</Text>
          <Line label="Doğrudan komisyon" value={`${fmtD(e.direct30)} elmas`} />
          {!sub && <Line label="Alt ajans farkı" value={`${fmtD(e.difference30)} elmas`} />}
          {e.transition30 > 0 && <Line label="Geçiş komisyonu" value={`${fmtD(e.transition30)} elmas`} />}
          {!!e.assistant30 && <Line label="Asistan payı" value={`${fmtD(e.assistant30)} elmas`} />}
          <Line label="Bugün · bu hafta" value={`${fmtD(e.today)} · ${fmtD(e.week)}`} />
          <Line label="Geçen ay" value={`${fmtD(e.prev_month)} elmas`} />
          <Line label="Bu ay (USD)" value={fmtUsd(e.usd.month)} strong />
        </Panel>
      )}

      <Section title="Komisyon oranı">
        <Panel>
          <View style={ns.rowBetween}>
            <Text style={ns.title}>{fmtPct(o.rate.rate)}</Text>
            {sub && <Text style={ns.dim}>Üst ajans farkı {fmtPct(o.rate.parentShare)}</Text>}
          </View>
          <RateSplit rate={o.rate.rate} parentShare={o.rate.parentShare} poolCap={o.rate.poolCap} ownLabel={sub ? 'Bu alt ajans' : 'Bu ajans (doğrudan)'} />
          {o.rate.upcoming && (
            <View style={st.upcoming}>
              <Ionicons name="calendar-outline" size={16} color={semantic.action} />
              <Text style={[ns.dim, { flex: 1 }]}>
                {fmtDate(o.rate.upcoming.effectiveFrom)} itibarıyla <Text style={{ color: '#fff', fontWeight: '700' }}>{fmtPct(o.rate.upcoming.rate)}</Text>
                {o.rate.upcoming.tier ? ` (${o.tiers.find((t) => t.key === o.rate.upcoming!.tier)?.name ?? o.rate.upcoming.tier})` : ''} · {SOURCE_TEXT[o.rate.upcoming.source] ?? o.rate.upcoming.source}
              </Text>
            </View>
          )}
          {sub && <Text style={st.foot}>Alt ajans oranını yalnızca performans motoru veya merkez belirler; üst ajans puanı, seviyeyi veya oranı değiştiremez. Değişiklikler gelecek dönemden geçerlidir.</Text>}
        </Panel>
      </Section>

      {p && (
        <Section title="Performans">
          <Panel>
            <View style={ns.rowBetween}>
              <View>
                <Text style={st.big}>{fmtScore(p.score)}</Text>
                <Text style={ns.dim}>
                  / 100 · {fmtDate(p.asOf)}
                  {p.rank ? ` · sıra ${p.rank}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Pill text={CHANGE_TEXT[p.change]} tone={p.change === 'up' ? 'success' : p.change === 'down' ? 'danger' : 'neutral'} />
                {sub && p.overtakes && <Pill text="Üst ajansı geçti" tone="money" icon="flash-outline" />}
              </View>
            </View>
            <ScoreBar score={p.score} parentScore={sub ? p.parentScore : null} />
            {p.next && (
              <View style={st.next}>
                <Text style={[ns.title, { fontSize: 15 }]}>
                  Sonraki seviye: {p.next.name} · {fmtPct(p.next.subRate)}
                </Text>
                {p.next.needScore > 0 && <Need text={`${fmtScore(p.next.needScore)} puan daha`} />}
                {p.next.needActive > 0 && <Need text={`${p.next.needActive} aktif yayıncı daha`} />}
                {p.next.needOvertake && <Need text="Üst ajansın puanını geçmek" />}
                <Need text={`${p.next.periodsInRow} dönem üst üste şartları sağlamak`} />
              </View>
            )}
            {p.flags.length > 0 && (
              <View style={st.pills}>
                {p.flags.map((f) => (
                  <Pill key={f} text={FLAG_TEXT[f] ?? f} tone={f === 'overtaken' || f === 'spike' ? 'money' : 'danger'} icon="alert-circle-outline" />
                ))}
              </View>
            )}
          </Panel>
        </Section>
      )}

      {o.notices.length > 0 && (
        <ListGroup label="Bildirimler">
          {o.notices.map((n) => (
            <ListRow key={n.id} icon={n.kind === 'overtake' ? 'flash-outline' : n.kind === 'tier' ? 'trending-up' : 'notifications-outline'} tone={n.kind === 'overtake' ? 'money' : 'action'} title={n.title} subtitle={`${n.body}\n${fmtDateTime(n.createdAt)}`} />
          ))}
        </ListGroup>
      )}

      {o.request && (
        <Section title="Açık talep">
          <TransferCard t={o.request} />
        </Section>
      )}

      <Actions c={c} />
    </View>
  );
}

function Need({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="ellipse-outline" size={10} color={semantic.action} />
      <Text style={ns.dim}>{text}</Text>
    </View>
  );
}

function Banner({ icon, tone, text }: { icon: keyof typeof Ionicons.glyphMap; tone: 'danger' | 'money'; text: string }) {
  const col = tone === 'danger' ? semantic.danger : semantic.money;
  return (
    <View style={[st.banner, { borderColor: `${col}55`, backgroundColor: `${col}14` }]}>
      <Ionicons name={icon} size={20} color={col} />
      <Text style={[ns.dim, { flex: 1, color: '#fff' }]}>{text}</Text>
    </View>
  );
}

function Actions({ c }: { c: Ctx }) {
  const { o, demo, reload, ask, id } = c;
  const a = o.agency;
  const sub = a.level > 1;
  const [subject, setSubject] = useState<'tier' | 'commission' | 'transfer' | 'other'>('tier');
  const independence = async () => {
    const r = await ask({ title: 'Bağımsızlık talebi', message: 'Kararı yalnızca merkez verir. Onaylanırsa üst ajans bundan sonraki gelirinizden pay almaz; merkez sınırlı süreli bir geçiş komisyonu tanımlayabilir. Geçmiş kazançlar değişmez.', confirm: 'Merkeze gönder', place: 'agency.independence' });
    if (r) await runAction(demo, () => agencyNet.independence(id, r.reason), 'Talebin merkeze iletildi.', reload);
  };
  const changeParent = async () => {
    const r = await ask({ title: 'Üst ajans değiştir', message: 'Yeni üst ajansın kodunu yaz. Mevcut üst ajans, yeni üst ajans ve merkez kurallarına göre onaylanır.', field: { label: 'Yeni üst ajans kodu', placeholder: 'Örn. ALK5R3' }, confirm: 'Talep gönder', place: 'agency.change_parent' });
    if (r) await runAction(demo, () => agencyNet.changeParent(id, r.field.toUpperCase(), r.reason), 'Talebin iletildi.', reload);
  };
  const close = async () => {
    const r = await ask({ title: 'Alt ajansı kapat', message: 'Yayıncılar üst ajansa geçer veya ayrılır (merkez kurallarına göre). Geçmiş komisyon kayıtları silinmez.', confirm: 'Kapatma talebi', danger: true, place: 'agency.sub_close' });
    if (r) await runAction(demo, () => agencyNet.closeSub(id, r.reason), 'Kapatma talebi alındı.', reload);
  };
  const appeal = async () => {
    const r = await ask({ title: 'İtiraz', message: 'İtirazın merkeze iletilir ve sonuç bildirim olarak gelir.', reasonLabel: 'Açıklama', min: 10, confirm: 'İtirazı gönder' });
    if (r) await runAction(demo, () => agencyNet.appeal(id, subject, r.reason), 'İtirazın merkeze iletildi.', reload);
  };
  // The parent agency only views a sub-agency (Referans ajans): no actions here.
  if (!c.acting) return null;
  return (
    <Section title="İşlemler">
      <Panel>
        {sub && c.can('transfers.manage') && !o.request && a.status === 'approved' && (
          <>
            <Button title="Bağımsızlık talebi" variant="tonal" icon="flag-outline" onPress={independence} />
            <Button title="Üst ajans değiştir" variant="tonal" icon="swap-horizontal" onPress={changeParent} />
          </>
        )}
        {sub && c.can('transfers.manage') && ['approved', 'suspended'].includes(a.status) && <Button title="Alt ajansı kapat" variant="danger" icon="close-circle-outline" onPress={close} />}
        {c.acting && (
          <View style={{ gap: space.sm }}>
            <Text style={st.label}>İtiraz konusu</Text>
            <ChoiceChips
              value={subject}
              onChange={setSubject}
              options={[
                ['tier', 'Seviye'],
                ['commission', 'Komisyon'],
                ['transfer', 'Transfer'],
                ['other', 'Diğer'],
              ]}
            />
            <Button title="Merkeze itiraz et" variant="ghost" icon="chatbox-ellipses-outline" onPress={appeal} />
          </View>
        )}
      </Panel>
    </Section>
  );
}

// --- Streamers ----------------------------------------------------------------------------------------------
function Streamers({ c }: { c: Ctx }) {
  const subsAllowed = c.o.agency.level === 1 && c.can('subagencies.view');
  const [scope, setScope] = useState<'direct' | 'sub'>('direct');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const q = useNet(c.name, () => agencyNet.streamers(c.id, scope), () => demoStreamers(c.id, scope), [c.id, scope]);
  const [inviting, setInviting] = useState(false);
  const invite = async () => {
    // With a server: pick the streamer from the people it finds by name (sign-up sets no username, and the app
    // shows no profile ID on other people's profiles). The example data keeps the typed field.
    if (!c.demo) return setInviting(true);
    const r = await c.ask({ title: 'Yayıncı davet et', message: 'Yayıncının profilindeki ID numarasını ya da kullanıcı adını yaz. Davet kabul edilince yayıncı ajansına bağlanır; başka bir ajansa bağlıysa transfer kuralları uygulanır.', field: { label: 'Profil ID’si veya kullanıcı adı', placeholder: 'Örn. 104829301457', caps: false }, reasonLabel: 'Davet notu', min: 0, confirm: 'Davet gönder', place: 'agency.invite' });
    if (r) await runAction(c.demo, () => inviteStreamer(c.id, r.field, r.reason || undefined), 'Davet gönderildi.', q.reload);
  };
  // The weekly and monthly earnings as a table: shared as a .csv file (opens in Excel), or its text by mail.
  const title = `${c.o.agency.name} yayıncı kazançları (${fmtDate(new Date().toISOString())})`;
  const send = async (rows: Streamer[], how: 'share' | 'mail') => {
    if (!rows.length) return showAlert('Gönderilecek kayıt yok', 'Bu listede henüz yayıncı yok.');
    const csv = earningsCsv(rows);
    if (how === 'share') return void shareCsv(`yayinci-kazanclari-${new Date().toISOString().slice(0, 10)}.csv`, title, csv);
    const url = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(csv)}`;
    // Very long lists don't fit in a mail link: those go through the share sheet (any mail app is there too).
    if (url.length > 7000) return void Share.share({ title, message: csv }).catch(() => {});
    Linking.openURL(url).catch(() => showAlert('E-posta açılamadı', 'Telefonunda bir e-posta uygulaması bulunamadı. Paylaş ile gönderebilirsin.'));
  };
  return (
    <View style={{ gap: space.lg }}>
      {subsAllowed && (
        <ChoiceChips
          value={scope}
          onChange={setScope}
          options={[
            ['direct', 'Doğrudan yayıncılar'],
            ['sub', 'Referans ajans yayıncıları'],
          ]}
        />
      )}
      {c.acting && c.can('streamers.invite') && scope === 'direct' && c.o.agency.status === 'approved' && <Button title="Yayıncı davet et" icon="person-add-outline" onPress={invite} />}
      {inviting && <InviteSheet agencyId={c.id} onClose={() => setInviting(false)} onSent={q.reload} />}
      <NetState q={q}>
        {(rows) => {
          const total = rows.reduce((x, r) => x + r[period], 0);
          const sorted = [...rows].sort((x, y) => y[period] - x[period]);
          return (
            <View style={{ gap: space.lg }}>
              <ChoiceChips
                value={period}
                onChange={setPeriod}
                options={[
                  ['week', 'Haftalık'],
                  ['month', 'Aylık'],
                ]}
              />
              <KpiGrid>
                <Kpi label="Yayıncı" icon="people-outline" value={String(rows.length)} sub={`${rows.filter((r) => r.active).length} aktif`} />
                <Kpi label={period === 'week' ? 'Bu hafta kazanç' : 'Bu ay kazanç'} icon="diamond-outline" tone="money" {...diamondsKpi(total)} />
              </KpiGrid>
              {c.can('reports.export') && (
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button title="CSV / Excel" variant="tonal" small icon="document-text-outline" onPress={() => void send(rows, 'share')} style={{ flex: 1 }} />
                  <Button title="E-postayla gönder" variant="tonal" small icon="mail-outline" onPress={() => void send(rows, 'mail')} style={{ flex: 1 }} />
                </View>
              )}
              {rows.length === 0 ? (
                <Empty icon="people-outline" text="Henüz yayıncı yok. Davet kodunu paylaşarak başlayabilirsin." />
              ) : (
                <ListGroup footer="Kazanç, yayıncının aldığı hediye elmaslarıdır; ajans komisyonu bu elmaslardan kesilmez. Hafta pazartesi, ay ayın 1’inde başlar (Türkiye saati).">
                  {sorted.map((r) => (
                    <ListRow
                      key={r.id}
                      leading={<Mono name={r.name} active={r.active} />}
                      title={r.name}
                      subtitle={[r.username ? `@${r.username}` : null, scope === 'sub' ? r.agencyName : null, `${fmtDate(r.joinedAt)} · ${METHOD_TEXT[r.method] ?? r.method}`, `${Math.round(r.onlineHours30)} saat yayın`].filter(Boolean).join(' · ')}
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={st.amount}>{fmtD(r[period])}</Text>
                          <Text style={st.small}>{fmtUsd(usdOf(r[period]))}</Text>
                          <Text style={st.small}>{period === 'week' ? `Bu ay ${fmtD(r.month)}` : `Bu hafta ${fmtD(r.week)}`}</Text>
                        </View>
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          );
        }}
      </NetState>
    </View>
  );
}

function Mono({ name, active }: { name: string; active?: boolean }) {
  return (
    <View style={st.mono}>
      <Text style={st.monoSmall}>{name.slice(0, 1).toLocaleUpperCase('tr-TR')}</Text>
      {active !== undefined && <View style={[st.dot, { backgroundColor: active ? semantic.success : colors.border }]} />}
    </View>
  );
}

// --- Referans ajanslar (sub-agencies) ----------------------------------------------------------------------
// Only the centre adds an agency under this one and approves it; this agency sees each one's figures and the
// commission that passes to it, and never manages it (server/api/agency.mjs byCentre).
const PERIODS = [
  ['day', 'Bugün'],
  ['week', 'Bu hafta'],
  ['month', 'Bu ay'],
] as const;

function Subs({ c }: { c: Ctx }) {
  const q = useNet(c.name, () => agencyNet.subagencies(c.id), () => demoSubs(c.id), [c.id]);
  return (
    <View style={{ gap: space.lg }}>
      <Panel>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={semantic.action} />
          <Text style={[st.foot, { flex: 1 }]}>Referans ajansları yalnız yönetim ekler ve onaylar; onaylanan ajans burada görünür. Bu ajansları yönetemezsin: bilgilerini ve sana geçen komisyonu görürsün.</Text>
        </View>
      </Panel>
      <NetState q={q}>
        {(d) => {
          const open = d.subagencies.filter((s) => s.status === 'approved');
          const sum = (p: 'day' | 'week' | 'month') => open.reduce((x, s) => x + s.mine[p], 0);
          return d.subagencies.length === 0 ? (
            <Empty icon="git-branch-outline" text="Henüz referans ajans yok. Yönetim bir ajansı altına eklediğinde burada görünür." />
          ) : (
            <View style={{ gap: space.md }}>
              <KpiGrid>
                <Kpi label="Bugün sana geçen" icon="today-outline" tone="money" {...diamondsKpi(sum('day'))} />
                <Kpi label="Bu hafta" icon="calendar-outline" tone="money" {...diamondsKpi(sum('week'))} />
                <Kpi label="Bu ay" icon="calendar-number-outline" tone="money" {...diamondsKpi(sum('month'))} />
                <Kpi label="Referans ajans" icon="git-branch-outline" value={`${open.length} / ${d.subagencies.length}`} sub={`${open.reduce((x, s) => x + s.streamers, 0)} yayıncı`} />
              </KpiGrid>
              {d.subagencies.map((s) => (
                <Pressable key={s.id} onPress={() => openOffice(s.id)} accessibilityRole="button" accessibilityLabel={`${s.name} bilgilerini aç`}>
                  <DepthCard style={st.sub}>
                    <View style={ns.rowBetween}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={ns.title} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <View style={st.pills}>
                          <Pill text={STATUS_TEXT[s.status]} tone={statusTone(s.status)} />
                          {!!s.tierName && <Pill text={s.tierName} tone="money" />}
                          {s.overtakes && <Pill text="Sizi geçti" tone="money" icon="flash-outline" />}
                          {d.nearPromotion.includes(s.id) && <Pill text="Yükselmeye yakın" tone="action" icon="trending-up" />}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
                    </View>
                    <View style={st.table}>
                      <View style={st.tRow}>
                        <Text style={[st.tHead, st.tFirst]} />
                        {PERIODS.map(([k, label]) => (
                          <Text key={k} style={st.tHead}>
                            {label}
                          </Text>
                        ))}
                      </View>
                      <View style={st.tRow}>
                        <Text style={[st.tLabel, st.tFirst]}>Toplam hediye</Text>
                        {PERIODS.map(([k]) => (
                          <Text key={k} style={st.tCell}>
                            {fmtD(s.gifts[k])}
                          </Text>
                        ))}
                      </View>
                      <View style={st.tRow}>
                        <Text style={[st.tLabel, st.tFirst]}>Sana geçen</Text>
                        {PERIODS.map(([k]) => (
                          <Text key={k} style={[st.tCell, st.tMoney]}>
                            {fmtD(s.mine[k])}
                          </Text>
                        ))}
                      </View>
                    </View>
                    {s.rate !== null && s.parentShare !== null && (
                      <RateSplit rate={s.rate} parentShare={s.parentShare} poolCap={c.o.poolCap} ownLabel="Referans ajans" parentLabel="Senin payın" note={false} />
                    )}
                    <View style={st.grid2}>
                      <Line label="Yayıncı" value={`${s.active} / ${s.streamers}`} />
                      <Line label="Puan" value={s.score === null ? '—' : `${fmtScore(s.score)}${s.rank ? ` · ${s.rank}.` : ''}`} />
                      {s.earned30 !== null && <Line label="Ajansın kazancı (30 gün)" value={`${fmtD(s.earned30)} elmas`} />}
                      {!!s.owner && <Line label="Yönetici" value={s.owner} />}
                    </View>
                    {s.upcoming && (
                      <Text style={st.foot}>
                        {fmtDate(s.upcoming.effectiveFrom)} itibarıyla referans ajansın oranı {fmtPct(s.upcoming.rate)} olacak.
                      </Text>
                    )}
                    {s.pendingWith && <Text style={st.foot}>Yönetimin onayını bekliyor.</Text>}
                  </DepthCard>
                </Pressable>
              ))}
              <Text style={st.foot}>
                Elmas sayıları; gün, hafta (pazartesiden) ve ay Türkiye saatine göre. Referans ajansın oranı performansa göre belirlenir: yüksek performans onun oranını artırır, senin payını azaltır (en az {fmtPct(0.01)}). Toplam havuz {fmtPct(c.o.poolCap)} ile sınırlıdır.
              </Text>
            </View>
          );
        }}
      </NetState>
    </View>
  );
}

// --- Performance --------------------------------------------------------------------------------------------
function PerformanceTab({ c }: { c: Ctx }) {
  const q = useNet(c.name, () => agencyNet.performance(c.id), () => demoPerformance(c.id), [c.id]);
  const sub = c.o.agency.level > 1;
  return (
    <NetState q={q}>
      {(d) => (
        <View style={{ gap: space.xl }}>
          {!d.latest ? (
            <Empty icon="speedometer-outline" text="Henüz performans değerlendirmesi yapılmadı. Merkez dönemlik değerlendirmeyi çalıştırınca burada görünür." />
          ) : (
            <Panel>
              <View style={ns.rowBetween}>
                <View>
                  <Text style={st.big}>{fmtScore(d.latest.score)}</Text>
                  <Text style={ns.dim}>Ağırlıklı puan · {fmtDate(d.latest.asOf)}</Text>
                </View>
                <Pill text={CHANGE_TEXT[d.latest.change]} tone={d.latest.change === 'up' ? 'success' : d.latest.change === 'down' ? 'danger' : 'neutral'} />
              </View>
              <Text style={st.label}>Kriterler (0–100) ve ağırlıkları</Text>
              {Object.entries(d.weights).map(([k, w]) => {
                const v = d.latest!.normalized[k] ?? 0;
                return (
                  <View key={k} style={{ gap: 4 }}>
                    <View style={ns.rowBetween}>
                      <Text style={ns.dim}>
                        {CRITERIA_TEXT[k] ?? k} <Text style={st.small}>· ağırlık %{w}</Text>
                      </Text>
                      <Text style={st.value}>{fmtScore(v)}</Text>
                    </View>
                    <View style={st.track}>
                      <View style={[st.fill, { width: `${Math.min(100, Math.max(0, v))}%` }]} />
                    </View>
                  </View>
                );
              })}
            </Panel>
          )}
          {sub && (
            <Section title="Seviyeler">
              <Panel>
                <TierLadder tiers={d.tiers} current={c.o.agency.tier} score={d.latest?.score ?? null} poolCap={c.o.poolCap} />
              </Panel>
            </Section>
          )}
          {d.subagencies.length > 0 && (
            <ListGroup label="Alt ajans sıralaması">
              {d.subagencies.map((s) => (
                <ListRow key={s.id} leading={<Text style={st.rank}>{s.rank}</Text>} title={s.name} subtitle={`${s.tierName ?? '—'} · ${CHANGE_TEXT[s.change]} · ${s.active} aktif yayıncı`} value={fmtScore(s.score)} onPress={() => openOffice(s.id)} />
              ))}
            </ListGroup>
          )}
          {d.history.length > 0 && (
            <ListGroup label="Geçmiş değerlendirmeler">
              {[...d.history].reverse().map((h) => (
                <ListRow key={h.runId} icon="time-outline" tone="neutral" title={`${fmtDate(h.asOf)} · puan ${fmtScore(h.score)}`} subtitle={`${h.tierName ?? (sub ? '—' : 'Üst ajans')} · ${CHANGE_TEXT[h.change]}${h.rank ? ` · sıra ${h.rank}` : ''} · hacim ${fmtD(h.volume)}`} />
              ))}
            </ListGroup>
          )}
          {d.tierHistory.length > 0 && (
            <ListGroup label="Seviye geçmişi">
              {d.tierHistory.map((t, i) => (
                <ListRow key={i} icon={t.toRate >= (t.fromRate ?? 0) ? 'trending-up' : 'trending-down'} tone={t.toRate >= (t.fromRate ?? 0) ? 'success' : 'danger'} title={`${t.fromName ?? '—'} → ${t.toName ?? t.to}`} subtitle={`${fmtPct(t.fromRate)} → ${fmtPct(t.toRate)} · ${fmtDate(t.effectiveFrom)} itibarıyla · ${SOURCE_TEXT[t.source] ?? t.source}${t.reason ? `\n${t.reason}` : ''}`} />
              ))}
            </ListGroup>
          )}
          {d.rateHistory.length > 0 && (
            <ListGroup label="Oran geçmişi" footer="Oran değişiklikleri geriye dönük uygulanmaz; her komisyon kaydı hesaplandığı andaki oranı saklar.">
              {d.rateHistory.map((r, i) => (
                <ListRow key={i} icon="pricetag-outline" tone="money" title={`${fmtPct(r.rate)}${r.parentFloor !== null ? ` · üst asgari ${fmtPct(r.parentFloor)}` : ''}`} subtitle={`${fmtDate(r.effectiveFrom)} · ${SOURCE_TEXT[r.source] ?? r.source}${r.reason ? ` · ${r.reason}` : ''}`} />
              ))}
            </ListGroup>
          )}
        </View>
      )}
    </NetState>
  );
}

// --- Earnings -----------------------------------------------------------------------------------------------
function Earnings({ c }: { c: Ctx }) {
  const [kind, setKind] = useState<'' | 'direct' | 'difference' | 'transition' | 'assistant'>('');
  // A busy agency has thousands of rows; show a page at a time (totals above always cover every row).
  const [limit, setLimit] = useState(PAGE);
  const led = useNet(c.name, () => agencyNet.commissions(c.id, { kind: kind || undefined }), () => {
    const d = demoCommissions(c.id);
    return kind ? { ...d, rows: d.rows.filter((r) => r.kind === kind) } : d;
  }, [c.id, kind]);
  const rep = useNet(c.name, () => agencyNet.report(c.id, 'week'), () => demoReport(c.id), [c.id]);
  const e = c.o.earnings;
  const exportCsv = async () => {
    if (c.demo) return showAlert('Örnek veri', 'Sunucuya bağlanılamadığı için dışa aktarılamıyor.');
    await runAction(false, async () => {
      const r = await agencyNet.commissionsCsv(c.id);
      await Share.share({ message: r.csv, title: `${c.o.agency.name} komisyon kayıtları` });
    });
  };
  return (
    <View style={{ gap: space.xl }}>
      {e && (
        <KpiGrid>
          <Kpi label="Çekilebilir" icon="wallet-outline" tone="success" {...diamondsKpi(e.balances.available)} />
          <Kpi label="Hesaplanıyor" icon="hourglass-outline" tone="money" {...diamondsKpi(e.balances.calculating)} />
          <Kpi label="Ödemede" icon="paper-plane-outline" {...diamondsKpi(e.balances.in_payout)} />
          <Kpi label="Ödenen" icon="checkmark-done-outline" {...diamondsKpi(e.balances.paid)} />
        </KpiGrid>
      )}
      <Section title="Haftalık komisyon">
        <Panel>
          <NetState q={rep}>{(r) => (r.earnings.length ? <StackedColumns rows={r.earnings.map((x) => ({ label: fmtDate(x.bucket), a: x.direct + x.transition, b: x.difference }))} /> : <Empty icon="bar-chart-outline" text="Bu aralıkta komisyon yok." />)}</NetState>
        </Panel>
      </Section>
      {c.can('payouts.request') && c.acting && <PayoutsPanel c={c} />}
      <Section title="Komisyon kayıtları" right={c.can('reports.export') ? <Button title="CSV" variant="ghost" small icon="download-outline" onPress={exportCsv} /> : undefined}>
        <ChoiceChips
          value={kind}
          onChange={(k) => {
            setKind(k);
            setLimit(PAGE);
          }}
          options={[
            ['', 'Tümü'],
            ['direct', 'Doğrudan'],
            ['difference', 'Fark'],
            ['transition', 'Geçiş'],
            ['assistant', 'Asistan'],
          ]}
        />
        <NetState q={led}>
          {(d) => (
            <View style={{ gap: space.md }}>
              <Panel>
                <Line label="Doğrudan" value={`${fmtD(d.totals.direct)} elmas`} />
                <Line label="Fark" value={`${fmtD(d.totals.difference)} elmas`} />
                {d.totals.transition !== 0 && <Line label="Geçiş" value={`${fmtD(d.totals.transition)} elmas`} />}
                {!!d.totals.assistant && <Line label="Asistan payı" value={`${fmtD(d.totals.assistant)} elmas`} />}
                {d.totals.fees !== 0 && <Line label="Transfer ücretleri" value={`${fmtD(d.totals.fees)} elmas`} />}
                {d.totals.adjustments !== 0 && <Line label="Düzeltmeler" value={`${fmtD(d.totals.adjustments)} elmas`} />}
              </Panel>
              {d.rows.length === 0 ? (
                <Empty icon="receipt-outline" text="Kayıt yok." />
              ) : (
                <ListGroup footer="Kayıtlar değiştirilmez; düzeltme ve iptaller ayrı satır olarak eklenir.">
                  {d.rows.slice(0, limit).map((r) => (
                    <ListRow
                      key={r.id}
                      icon={r.kind === 'difference' ? 'git-branch-outline' : r.kind === 'transition' ? 'swap-horizontal' : r.kind === 'assistant' ? 'ribbon-outline' : r.amount < 0 ? 'return-down-back-outline' : 'diamond-outline'}
                      tone={r.amount < 0 ? 'danger' : r.kind === 'difference' ? 'money' : 'action'}
                      title={`${KIND_TEXT[r.kind] ?? r.kind}${r.streamer ? ` · ${r.streamer.name}` : ''}`}
                      subtitle={`${r.base !== null ? `${fmtD(r.base)} × ${fmtPct(r.rate)}` : fmtPct(r.rate)}${r.sourceAgency && r.kind === 'difference' ? ` · ${r.sourceAgency.name}` : ''} · ${r.statusLabel} · ${fmtDateTime(r.occurredAt ?? r.createdAt)}`}
                      right={
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[st.amount, r.amount < 0 && { color: semantic.danger }]}>
                            {r.amount > 0 ? '+' : ''}
                            {fmtD(r.amount)}
                          </Text>
                          <Text style={st.small}>{fmtUsd(usdOf(r.amount))}</Text>
                        </View>
                      }
                      onPress={() => ledgerDetail(r)}
                    />
                  ))}
                </ListGroup>
              )}
              {d.rows.length > limit && <Button variant="ghost" small icon="chevron-down" title={`Daha fazla göster (${fmtD(d.rows.length - limit)} kayıt daha)`} onPress={() => setLimit((n) => n + PAGE)} />}
            </View>
          )}
        </NetState>
      </Section>
    </View>
  );
}
const PAGE = 20;

function ledgerDetail(r: LedgerRow) {
  const lines = [
    `İşlem: ${r.txn ?? '—'}`,
    r.incomeType ? `Gelir türü: ${INCOME_TEXT[r.incomeType] ?? r.incomeType}` : null,
    r.base !== null ? `Matrah: ${fmtD(r.base)} elmas` : null,
    r.totalRate !== null ? `Toplam ajans oranı: ${fmtPct(r.totalRate)} (sınır ${fmtPct(r.poolCap)})` : null,
    r.subAmount !== null ? `Alt ajans: ${fmtPct(r.subRate)} → ${fmtD(r.subAmount)} elmas` : null,
    r.parentAmount !== null ? `Üst ajans farkı: ${fmtD(r.parentAmount)} elmas` : null,
    r.transitionAmount ? `Geçiş komisyonu: ${fmtD(r.transitionAmount)} elmas` : null,
    `Bu kayıt: ${fmtD(r.amount)} elmas (${fmtUsd(usdOf(r.amount))})`,
    `Dönem: ${r.period} · ${r.statusLabel}`,
    r.ruleVersion ? `Kural sürümü: ${r.ruleVersion}` : null,
    r.calculatedAt ? `Hesaplandı: ${fmtDateTime(r.calculatedAt)}` : null,
    r.note ? `Not: ${r.note}` : null,
  ].filter(Boolean);
  showAlert(KIND_TEXT[r.kind] ?? 'Komisyon kaydı', lines.join('\n'));
}

function PayoutsPanel({ c }: { c: Ctx }) {
  const q = useNet(c.name, () => agencyNet.payouts(c.id), () => demoPayouts(c.id), [c.id]);
  const [currency, setCurrency] = useState('');
  return (
    <Section title="Ödemeler">
      <NetState q={q}>
        {(d) => {
          const cur = currency || d.policy.currencies[0] || 'USD';
          const enough = d.balances.available >= d.policy.min_diamonds;
          return (
            <View style={{ gap: space.md }}>
              <Panel>
                <View style={ns.rowBetween}>
                  <View>
                    <Text style={st.big}>{fmtD(d.balances.available)}</Text>
                    <Text style={ns.dim}>çekilebilir elmas · {fmtUsd(usdOf(d.balances.available))}</Text>
                  </View>
                  <Ionicons name="wallet-outline" size={28} color={semantic.success} />
                </View>
                <ChoiceChips value={cur} onChange={setCurrency} options={d.policy.currencies.map((x) => [x, x] as [string, string])} />
                <Button title="Ödeme talep et" variant="money" icon="cash-outline" disabled={!enough || c.o.agency.status !== 'approved'} onPress={() => runAction(c.demo, () => agencyNet.requestPayout(c.id, cur), 'Ödeme talebin alındı. Merkez onayından sonra ödenir.', () => (q.reload(), c.reload()))} />
                <Text style={st.foot}>
                  En az {fmtD(d.policy.min_diamonds)} elmas ({fmtUsd(usdOf(d.policy.min_diamonds))}). Tutar sunucuda hesaplanır: kazanılmış ve henüz ödenmemiş komisyonların tamamı.
                  {d.policy.two_person ? ' Onaylayan ve ödeyen farklı merkez yetkilileridir.' : ''}
                </Text>
              </Panel>
              {d.payouts.length > 0 && (
                <ListGroup>
                  {d.payouts.map((p) => (
                    <ListRow
                      key={p.id}
                      icon={p.status === 'paid' ? 'checkmark-circle-outline' : p.status === 'rejected' || p.status === 'cancelled' ? 'close-circle-outline' : 'time-outline'}
                      tone={p.status === 'paid' ? 'success' : p.status === 'rejected' || p.status === 'cancelled' ? 'danger' : 'money'}
                      title={`${fmtD(p.amount)} elmas · ${fmtUsd(p.usd)}`}
                      subtitle={`${p.statusLabel} · ${p.currency} · ${fmtDate(p.requestedAt)}${p.paymentRef ? ` · ${p.paymentRef}` : ''}${p.note ? `\n${p.note}` : ''}`}
                      right={p.status === 'pending' ? <Button title="İptal" variant="ghost" small onPress={() => runAction(c.demo, () => agencyNet.cancelPayout(c.id, p.id), 'Talep iptal edildi.', q.reload)} /> : undefined}
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          );
        }}
      </NetState>
    </Section>
  );
}

// --- Requests and transfers ---------------------------------------------------------------------------------
function Requests({ c }: { c: Ctx }) {
  const reqs = useNet(c.name, () => agencyNet.requests(c.id), demoRequests, [c.id]);
  const trs = useNet(c.name, () => agencyNet.transfers(c.id), demoTransfers, [c.id]);
  const [mode, setMode] = useState<'free' | 'paid'>('free');
  const reject = async (requestId: number) => {
    const r = await c.ask({ title: 'İsteği reddet', reasonLabel: 'Not (yayıncıya gösterilir)', min: 0, confirm: 'Reddet', danger: true, place: 'agency.request' });
    if (r) await runAction(c.demo, () => agencyNet.decideRequest(c.id, requestId, false, r.reason || undefined), 'İstek reddedildi.', () => (reqs.reload(), c.reload()));
  };
  const decide = async (transferId: number, approve: boolean, party: string[]) => {
    const r = await c.ask({ title: approve ? 'Transferi onayla' : 'Transferi reddet', reasonLabel: 'Not', min: approve ? 0 : 3, confirm: approve ? 'Onayla' : 'Reddet', danger: !approve, place: 'agency.transfer_decide' });
    if (r) await runAction(c.demo, () => agencyNet.approveTransfer(c.id, transferId, approve, approve && party.includes('from') ? mode : undefined, r.reason || undefined), approve ? 'Onayın kaydedildi.' : 'Talep reddedildi.', () => (trs.reload(), c.reload()));
  };
  return (
    <View style={{ gap: space.xl }}>
      <NetState q={reqs}>
        {(rows) => {
          const open = rows.filter((r) => r.status === 'pending');
          const done = rows.filter((r) => r.status !== 'pending').slice(0, 10);
          return (
            <View style={{ gap: space.lg }}>
              {open.length === 0 ? (
                <Empty icon="mail-open-outline" text="Bekleyen katılım isteği yok." />
              ) : (
                <ListGroup label="Katılım istekleri" footer="Bir yayıncı aynı anda tek ajansa bağlıdır; onay sunucuda tekrar kontrol edilir.">
                  {open.map((r) => (
                    <ListRow
                      key={r.id}
                      leading={<Mono name={r.user.name} />}
                      title={r.user.name}
                      subtitle={`${r.kind === 'invite' ? 'Davet edildi' : 'Katılmak istiyor'} · ${METHOD_TEXT[r.method] ?? r.method} · ${fmtDate(r.createdAt)}${r.note ? `\n${r.note}` : ''}`}
                      right={
                        r.kind === 'join' && c.acting && c.can('streamers.approve') ? (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <Button title="Reddet" variant="ghost" small onPress={() => reject(r.id)} />
                            <Button title="Onayla" variant="tonal" small onPress={() => runAction(c.demo, () => agencyNet.decideRequest(c.id, r.id, true), `${r.user.name} ajansa katıldı.`, () => (reqs.reload(), c.reload()))} />
                          </View>
                        ) : (
                          <Pill text="Bekliyor" tone="money" />
                        )
                      }
                    />
                  ))}
                </ListGroup>
              )}
              {done.length > 0 && (
                <ListGroup label="Sonuçlananlar">
                  {done.map((r) => (
                    <ListRow key={r.id} leading={<Mono name={r.user.name} />} title={r.user.name} subtitle={`${STATUS_TEXT[r.status as keyof typeof STATUS_TEXT] ?? r.status} · ${fmtDate(r.decidedAt)}`} />
                  ))}
                </ListGroup>
              )}
            </View>
          );
        }}
      </NetState>
      <Section title="Transferler">
        <NetState q={trs}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty icon="swap-horizontal" text="Transfer talebi yok." />
            ) : (
              <View style={{ gap: space.md }}>
                {rows.map((t) => {
                  const waiting = (t.myParty ?? []).filter((p) => t.needs.includes(p) && !t.approvals[p]);
                  return (
                    <Panel key={t.id}>
                      <TransferCard t={t} />
                      {t.status === 'pending' && waiting.length > 0 && c.acting && c.can('transfers.manage') && (
                        <View style={{ gap: space.sm }}>
                          {waiting.includes('from') && (
                            <>
                              <Text style={st.label}>Ayrılış türü</Text>
                              <ChoiceChips
                                value={mode}
                                onChange={setMode}
                                options={[
                                  ['free', 'Ücretsiz bırak'],
                                  ['paid', 'Ücretli transfer'],
                                ]}
                              />
                            </>
                          )}
                          <View style={{ flexDirection: 'row', gap: space.sm }}>
                            <Button title="Reddet" variant="ghost" onPress={() => decide(t.id, false, waiting)} style={{ flex: 1 }} />
                            <Button title="Onayla" variant="tonal" onPress={() => decide(t.id, true, waiting)} style={{ flex: 1 }} />
                          </View>
                        </View>
                      )}
                    </Panel>
                  );
                })}
              </View>
            )
          }
        </NetState>
      </Section>
    </View>
  );
}

// --- Team ---------------------------------------------------------------------------------------------------
function Team({ c }: { c: Ctx }) {
  const q = useNet(c.name, () => agencyNet.staff(c.id), demoStaff, [c.id]);
  const people = useNet(c.name, () => agencyNet.streamers(c.id, 'direct'), () => demoStreamers(c.id, 'direct'), [c.id]);
  const [pick, setPick] = useState<string | null>(null);
  return (
    <NetState q={q}>
      {(d) => {
        const role = (rid: number | null) => d.roles.find((r) => r.id === rid);
        const candidates = (people.data ?? []).filter((p) => !d.staff.some((s) => s.user.id === p.id));
        return (
          <View style={{ gap: space.xl }}>
            <Text style={st.foot}>Ekip üyeleri yalnızca bu ajansta, verilen yetkilerle işlem yapabilir. Ödeme onayı ve oran değişikliği hiçbir ajans rolünde yoktur; bunlar merkezdedir.</Text>
            {d.staff.length === 0 ? (
              <Empty icon="people-circle-outline" text="Ekipte kimse yok." />
            ) : (
              d.staff.map((m) => (
                <Panel key={m.user.id}>
                  <View style={ns.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
                      <Mono name={m.user.name} />
                      <View style={{ flex: 1 }}>
                        <Text style={[ns.title, { fontSize: 15 }]}>{m.user.name}</Text>
                        <Text style={ns.dim}>
                          {m.role ?? 'Özel yetkiler'} · {fmtDate(m.since)}
                        </Text>
                      </View>
                    </View>
                    <Button title="Çıkar" variant="ghost" small onPress={() => runAction(c.demo, () => agencyNet.removeStaff(c.id, m.user.id), 'Ekipten çıkarıldı.', q.reload)} />
                  </View>
                  <ChoiceChips value={m.roleId ?? -1} onChange={(rid) => runAction(c.demo, () => agencyNet.setStaff(c.id, m.user.id, rid), 'Rol güncellendi.', q.reload)} options={d.roles.map((r) => [r.id, r.name] as [number, string])} />
                  <View style={st.pills}>
                    {m.perms.map((p) => (
                      <Pill key={p} text={PERM_TEXT[p] ?? p} tone="action" />
                    ))}
                    {m.denied.map((p) => (
                      <Pill key={p} text={`${PERM_TEXT[p] ?? p} kapalı`} tone="danger" />
                    ))}
                  </View>
                </Panel>
              ))
            )}
            {candidates.length > 0 && (
              <Section title="Ekibe ekle">
                <Panel>
                  <Text style={ns.dim}>Ajansındaki yayıncılardan birini seç, sonra rolünü belirle.</Text>
                  <ChoiceChips value={pick ?? ''} onChange={(v) => setPick(v || null)} options={candidates.slice(0, 12).map((p) => [p.id, p.name] as [string, string])} />
                  {pick && (
                    <View style={{ gap: space.sm }}>
                      {d.roles.map((r) => (
                        <ListRow key={r.id} icon="shield-checkmark-outline" title={r.name} subtitle={r.permissions.map((p) => PERM_TEXT[p] ?? p).join(', ')} onPress={() => runAction(c.demo, () => agencyNet.setStaff(c.id, pick, r.id), `${role(r.id)?.name ?? 'Rol'} olarak eklendi.`, () => (setPick(null), q.reload()))} />
                      ))}
                    </View>
                  )}
                </Panel>
              </Section>
            )}
          </View>
        );
      }}
    </NetState>
  );
}

const st = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: 56 },
  hero: { padding: space.xl, gap: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroName: { color: '#fff', fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3 },
  heroMeta: { gap: 6, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  monogram: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(19,217,223,0.14)', borderWidth: 1, borderColor: 'rgba(19,217,223,0.35)' },
  monoText: { color: semantic.action, fontSize: 26, fontFamily: fonts.display },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 14, borderWidth: 1 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.md, borderRadius: 12, backgroundColor: 'rgba(19,217,223,0.08)' },
  foot: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  big: { color: '#fff', fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  next: { gap: 6, padding: space.md, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  amount: { color: '#fff', fontSize: 14, fontFamily: fonts.displayBold, fontVariant: ['tabular-nums'] },
  small: { color: colors.textDim, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  value: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  mono: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  monoSmall: { color: '#fff', fontSize: 15, fontFamily: fonts.displayBold },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.card },
  sub: { padding: space.lg, gap: space.md },
  grid2: { gap: 4 },
  table: { gap: 6, padding: space.md, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tFirst: { flex: 1.3, textAlign: 'left' },
  tHead: { flex: 1, textAlign: 'right', color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
  tLabel: { color: colors.textDim, fontSize: 12.5 },
  tCell: { flex: 1, textAlign: 'right', color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tMoney: { color: semantic.money },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: SERIES.own },
  rank: { width: 28, textAlign: 'center', color: semantic.action, fontSize: 16, fontFamily: fonts.display },
});
