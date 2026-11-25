// The centre's agency-network management (Spec 1 §10, Spec 2 §11): the organisation tree, approvals (agencies,
// transfers with transition commission, payouts with separated duties), performance runs with manual tier and rate
// decisions, the commission rules with their history and a simulator, and the audit log. Everything comes from the
// server (centerNet in lib/agency-net); every decision carries a written reason and never applies to past earnings.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenterActions } from '@/components/admin/agency-center-actions';
import { Empty, Kpi, KpiGrid, Line, NetState, Panel, Pill, Section, SERIES, Tabs, diamondsKpi, ns, statusTone, useAsk, type Ask } from '@/components/agency-net';
import { Backdrop } from '@/components/fx/surface';
import { SCENES } from '@/components/fx/scenes';
import { ChoiceChips, ListGroup, ListRow } from '@/components/list';
import { NoAccess } from '@/components/no-access';
import { Text, TextInput } from '@/components/text';
import { liveRules } from '@/lib/live/catalog-live';
import { Button, Header } from '@/components/ui';
import { demoAdminList, demoAdminOverview, demoAdminPayouts, demoAdminSettings, demoAdminTransfers, demoAudit, demoTree } from '@/data/agency-net-demo';
import {
  FLAG_TEXT,
  INCOME_TEXT,
  LEVEL_TEXT,
  PARTY_TEXT,
  SOURCE_TEXT,
  STATUS_TEXT,
  TRANSFER_STATUS,
  TRANSFER_TEXT,
  centerNet,
  fmtD,
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtScore,
  fmtUsd,
  runAction,
  useNet,
  usdOf,
  type AdminAgency,
  type AdminPayout,
  type Loaded,
  type Tier,
  type Transfer,
  type TreeNode,
} from '@/lib/agency-net';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, fonts, radius, semantic, space } from '@/theme';

type TabKey = 'genel' | 'onay' | 'perf' | 'kural' | 'denetim';
type AskFn = (a: Ask) => Promise<{ reason: string; field: string } | null>;

/** Some admin responses name a person or agency as a plain string, others as { id, name }: show either. */
/** "2" or "2,5" (percent) → 0.02 / 0.025; NaN when it is not a number. */
const pctIn = (s: string) => {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(v) ? Math.round(v * 100) / 1e4 : NaN;
};
const openOffice = (id: string) => router.push({ pathname: '/ajans/ofis', params: { id } } as unknown as Href);

export default function CenterPanel() {
  const { me } = useApp();
  const [tab, setTab] = useState<TabKey>('genel');
  const [askNode, ask] = useAsk();
  const ov = useNet(me.name, () => centerNet.overview(), demoAdminOverview);
  const waiting = ov.data ? ov.data.pending + ov.data.transfers_waiting + ov.data.payouts_open_count : 0;

  return (
    <SafeAreaView style={st.safe}>
      <Backdrop scene={SCENES.family} strength={0.45} />
      <Header title="Ajans Merkezi" />
      {/* A 403 means this account is not centre staff with agency rights: say so instead of five tabs of errors. */}
      {ov.forbidden ? (
        <View style={st.scroll}>
          <NoAccess text="Ajans Merkezi yalnız ajans yönetimi yetkisi olan merkez personeline açık." />
        </View>
      ) : (
        <>
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            options={[
              { key: 'genel', label: 'Genel' },
              { key: 'onay', label: 'Onaylar', badge: waiting },
              { key: 'kural', label: 'Kurallar' },
              { key: 'denetim', label: 'Denetim' },
            ]}
          />
          {tab === 'genel' && <GeneralTab name={me.name} ov={ov} ask={ask} />}
          {tab === 'onay' && <ApprovalsTab name={me.name} ask={ask} after={ov.reload} />}
          {tab === 'kural' && <RulesTab name={me.name} ask={ask} />}
          {tab === 'denetim' && <AuditTab name={me.name} />}
        </>
      )}
      {askNode}
    </SafeAreaView>
  );
}

function Scroll({ q, children }: { q: Loaded<unknown>; children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={st.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.loading && !!q.data} onRefresh={q.reload} tintColor={colors.primaryText} />}
    >
      {children}
    </ScrollView>
  );
}

// --- Genel: KPIs and the organisation tree ---------------------------------------------------------------------
function GeneralTab({ name, ov, ask }: { name: string; ov: Loaded<ReturnType<typeof demoAdminOverview>>; ask: AskFn }) {
  const tree = useNet(name, () => centerNet.tree(), demoTree);
  const reload = () => {
    tree.reload();
    ov.reload();
  };
  // When the server is unreachable both calls fail the same way: show one error with one retry, not two.
  const bothFailed = !!ov.error && !!tree.error;
  return (
    <Scroll q={tree}>
      {!tree.demo && tree.data && <CenterActions nodes={tree.data.nodes} demo={tree.demo} after={reload} />}
      {!bothFailed && (
      <NetState q={ov}>
        {(o) => (
          <Section title="Son 30 gün">
            <KpiGrid>
              <Kpi icon="business-outline" label="Üst ajans" value={fmtD(o.tops)} sub={`${fmtD(o.subs)} alt ajans`} />
              <Kpi icon="people-outline" label="Bağlı yayıncı" value={fmtD(o.streamers)} sub={`${fmtD(o.suspended)} ajans askıda`} />
              <Kpi icon="diamond-outline" tone="money" label="Komisyon matrahı" {...diamondsKpi(o.base30)} />
              <Kpi icon="pie-chart-outline" tone="money" label="Ajans komisyonu" {...diamondsKpi(o.commission30)} />
              <Kpi icon="wallet-outline" tone="money" label="Açık ödemeler" value={fmtD(o.payouts_open)} sub={`elmas · ${fmtD(o.payouts_open_count)} talep · ${fmtUsd(usdOf(o.payouts_open))}`} />
              <Kpi icon="hourglass-outline" tone={o.pending ? 'social' : 'action'} label="Onay bekleyen ajans" value={fmtD(o.pending)} />
              <Kpi icon="swap-horizontal-outline" tone={o.transfers_waiting ? 'social' : 'action'} label="Bekleyen transfer" value={fmtD(o.transfers_waiting)} />
              <Kpi icon="chatbox-ellipses-outline" label="Açık itiraz" value={fmtD(o.appeals_open)} />
              <Kpi
                icon="calculator-outline"
                tone={o.calc_pending ? 'danger' : 'success'}
                label="Hesaplanacak gelir"
                value={fmtD(o.calc_pending)}
                sub={o.calc_pending ? 'Komisyon işi bekliyor' : 'Hepsi hesaplandı'}
              />
            </KpiGrid>
            <Text style={st.foot}>Komisyon havuzu sınırı {fmtPct(o.poolCap)}. Tutarlar sunucuda hesaplanır; {liveRules().diamondsPerUsd.toLocaleString('tr-TR')} elmas = 1 USD.</Text>
          </Section>
        )}
      </NetState>
      )}
      <NetState q={bothFailed ? { ...tree, reload } : tree}>
        {(t) => {
          const ids = new Set(t.nodes.map((n) => n.id));
          const roots = t.nodes.filter((n) => !n.parentId || !ids.has(n.parentId));
          const kids = (id: string) => t.nodes.filter((n) => n.parentId === id);
          return (
            <Section title="Organizasyon ağacı" right={<Text style={st.dimSmall}>{fmtD(t.nodes.length)} ajans</Text>}>
              {roots.length === 0 && <Empty icon="git-network-outline" text="Henüz ajans yok." />}
              {roots.map((r) => (
                <View key={r.id} style={{ gap: 6 }}>
                  <NodeCard n={r} demo={tree.demo} ask={ask} after={reload} />
                  {kids(r.id).map((c) => (
                    <View key={c.id} style={st.branch}>
                      <View style={st.branchLine} />
                      <View style={{ flex: 1 }}>
                        <NodeCard n={c} sub demo={tree.demo} ask={ask} after={reload} />
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={st.foot}>Bir ajansa dokununca panelini merkez görünümünde açarsın. Üst ajans oranı en fazla {fmtPct(t.topRate)}.</Text>
            </Section>
          );
        }}
      </NetState>
    </Scroll>
  );
}

function NodeCard({ n, sub, demo, ask, after }: { n: TreeNode; sub?: boolean; demo: boolean; ask: AskFn; after: () => void }) {
  const [open, setOpen] = useState(false);
  const setStatus = async (status: 'suspended' | 'approved' | 'closed') => {
    const title = {
      suspended: `${n.name} askıya alınsın mı?`,
      approved: `${n.name} yeniden etkinleştirilsin mi?`,
      closed: `${n.name} kapatılsın mı?`,
    }[status];
    const message = {
      suspended: 'Askıdaki ajans yeni yayıncı ve alt ajans alamaz. Geçmiş kayıtları ve kazançları korunur.',
      approved: 'Ajans yeniden aktif olur.',
      closed: 'Kapatma kalıcıdır. Geçmiş kayıtlar silinmez; bağlı yayıncılar için transfer gerekir.',
    }[status];
    const r = await ask({
      title,
      message,
      confirm: status === 'approved' ? 'Etkinleştir' : status === 'closed' ? 'Kapat' : 'Askıya al',
      danger: status !== 'approved',
    });
    if (r) await runAction(demo, () => centerNet.setStatus(n.id, status, r.reason), 'Ajans durumu güncellendi.', after);
  };
  const owner = n.owner;
  const go = () => openOffice(n.id);
  // The card opens the agency's panel; the "…" button sits beside (not inside) that pressable so the web build
  // doesn't nest one <button> in another.
  return (
    <Panel style={[st.node, sub && st.nodeSub]}>
      <View style={st.nodeHead}>
        <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`${n.name} panelini aç`} style={st.nodeHeadMain}>
          <View
            style={[
              st.nodeIcon,
              {
                backgroundColor: sub ? 'rgba(10,159,165,0.16)' : 'rgba(194,127,28,0.18)',
              },
            ]}
          >
            <Ionicons name={sub ? 'git-branch-outline' : 'business'} size={16} color={sub ? SERIES.own : semantic.money} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.nodeName} numberOfLines={1}>
              {n.name}
            </Text>
            <Text style={st.dimSmall} numberOfLines={1}>
              {n.code} · {LEVEL_TEXT(n.level)}
              {owner ? ` · ${owner}` : ''}
            </Text>
          </View>
          <Pill text={STATUS_TEXT[n.status] ?? n.status} tone={statusTone(n.status)} />
        </Pressable>
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ajans işlemleri" style={st.more}>
          <Ionicons name={open ? 'close' : 'ellipsis-horizontal'} size={16} color={colors.textDim} />
        </Pressable>
      </View>
      <Pressable onPress={go} accessible={false} style={{ gap: 10 }}>
        <View style={st.nodeStats}>
          <Stat label={sub ? 'Oran · üst farkı' : 'Oran'} value={n.rate === null ? '—' : sub && n.parentShare !== null ? `${fmtPct(n.rate)} · ${fmtPct(n.parentShare)}` : fmtPct(n.rate)} />
          <Stat label="Yayıncı" value={fmtD(n.streamers)} />
          <Stat label="30g hacim" value={fmtD(n.volume30)} />
          <Stat label="Puan" value={n.score === null ? '—' : `${fmtScore(n.score)}${n.rank ? ` · #${n.rank}` : ''}`} />
        </View>
        {(!!n.tierName || n.overtakes || n.flags.length > 0 || (n.status === 'approved' && !!n.activity)) && (
          <View style={st.pills}>
            {n.status === 'approved' && !!n.activity && <Pill text={n.activity === 'active' ? 'Aktif ajans' : 'Aday ajans'} tone={n.activity === 'active' ? 'success' : 'money'} icon={n.activity === 'active' ? 'checkmark-circle-outline' : 'hourglass-outline'} />}
            {!!n.tierName && <Pill text={n.tierName} tone="action" icon="podium-outline" />}
            {n.overtakes && <Pill text="Üst ajansı geçti" tone="money" icon="trending-up" />}
            {n.flags.map((f) => (
              <Pill key={f} text={FLAG_TEXT[f] ?? f} tone={f === 'review' || f === 'decline' ? 'danger' : 'neutral'} icon="flag-outline" />
            ))}
          </View>
        )}
        {n.upcoming && (
          <View style={st.upcoming}>
            <Ionicons name="calendar-outline" size={14} color={semantic.action} />
            <Text style={st.upcomingText}>
              {fmtDate(n.upcoming.effectiveFrom)} itibarıyla oran {fmtPct(n.upcoming.rate)} · {SOURCE_TEXT[n.upcoming.source] ?? n.upcoming.source}
            </Text>
          </View>
        )}
      </Pressable>
      {open && (
        <View style={st.actions}>
          {n.status === 'approved' && <Button small variant="tonal" icon="pause-circle-outline" title="Askıya al" onPress={() => setStatus('suspended')} />}
          {n.status === 'suspended' && <Button small variant="tonal" icon="play-circle-outline" title="Etkinleştir" onPress={() => setStatus('approved')} />}
          {(n.status === 'approved' || n.status === 'suspended') && <Button small variant="danger" icon="close-circle-outline" title="Kapat" onPress={() => setStatus('closed')} />}
          <Button small variant="ghost" icon="open-outline" title="Paneli aç" onPress={go} />
        </View>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// --- Onaylar: agency applications, transfers, payouts ----------------------------------------------------------
function ApprovalsTab({ name, ask, after }: { name: string; ask: AskFn; after: () => void }) {
  const q = useNet(
    name,
    async () => {
      const [apps, transfers, payouts] = await Promise.all([centerNet.list({ status: 'pending' }), centerNet.transfers('pending'), centerNet.payouts()]);
      return { apps, transfers, payouts };
    },
    () => ({
      apps: demoAdminList(),
      transfers: demoAdminTransfers(),
      payouts: demoAdminPayouts(),
    }),
  );
  const done = () => {
    q.reload();
    after();
  };
  return (
    <Scroll q={q}>
      <NetState q={q}>
        {(d) => {
          const open = d.payouts.filter((p) => p.status === 'pending' || p.status === 'ready');
          const closed = d.payouts.filter((p) => p.status !== 'pending' && p.status !== 'ready').slice(0, 10);
          return (
            <>
              <Section title="Ajans başvuruları" right={<Text style={st.dimSmall}>{d.apps.length}</Text>}>
                {d.apps.length === 0 ? (
                  <Empty icon="checkmark-done-outline" text="Bekleyen ajans başvurusu yok." />
                ) : (
                  d.apps.map((a) => <AppCard key={a.id} a={a} demo={q.demo} ask={ask} after={done} />)
                )}
              </Section>
              <Section title="Transfer ve bağımsızlık talepleri" right={<Text style={st.dimSmall}>{d.transfers.length}</Text>}>
                {d.transfers.length === 0 ? (
                  <Empty icon="swap-horizontal-outline" text="Bekleyen transfer yok." />
                ) : (
                  d.transfers.map((t) => <TransferCard key={t.id} t={t} demo={q.demo} ask={ask} after={done} />)
                )}
              </Section>
              <Section title="Ödeme talepleri" right={<Text style={st.dimSmall}>{open.length} açık</Text>}>
                {open.length === 0 ? <Empty icon="wallet-outline" text="Bekleyen ödeme talebi yok." /> : open.map((p) => <PayoutCard key={p.id} p={p} demo={q.demo} ask={ask} after={done} />)}
                <Text style={st.foot}>
                  İki kişili kural: bir ödemeyi onaylayan kişi aynı ödemeyi “ödendi” olarak işaretleyemez; sunucu bunu reddeder. Ödenen talepler bakiyeden düşer ve geri alınamaz.
                </Text>
                {closed.length > 0 && (
                  <ListGroup label="Son sonuçlananlar">
                    {closed.map((p) => (
                      <ListRow
                        key={p.id}
                        icon="receipt-outline"
                        tone={p.status === 'paid' ? 'success' : 'neutral'}
                        title={`${p.agency.name} · ${fmtD(p.amount)} elmas`}
                        subtitle={`${p.statusLabel} · ${fmtDateTime(p.paidAt ?? p.approvedAt ?? p.requestedAt)}${p.paymentRef ? ` · ${p.paymentRef}` : ''}`}
                        value={fmtUsd(p.usd)}
                      />
                    ))}
                  </ListGroup>
                )}
              </Section>
            </>
          );
        }}
      </NetState>
    </Scroll>
  );
}

function AppCard({ a, demo, ask, after }: { a: AdminAgency; demo: boolean; ask: AskFn; after: () => void }) {
  const decide = async (approve: boolean) => {
    const r = await ask(
      approve
        ? {
            title: `${a.name} onaylansın mı?`,
            message: 'Ajans aktif olur, kodu yayıncı ve alt ajans kabul etmeye başlar.',
            confirm: 'Onayla',
            min: 0,
            placeholder: 'İsteğe bağlı not',
          }
        : {
            title: `${a.name} reddedilsin mi?`,
            message: 'Gerekçe başvurana bildirilir.',
            confirm: 'Reddet',
            danger: true,
          },
    );
    if (r) await runAction(demo, () => centerNet.decide(a.id, approve, r.reason), approve ? 'Ajans onaylandı.' : 'Başvuru reddedildi.', after);
  };
  const contact = a.contact;
  return (
    <Panel>
      <View style={ns.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={ns.title}>{a.name}</Text>
          <Text style={st.dimSmall}>
            {a.code} · {LEVEL_TEXT(a.level)}
            {a.parent ? ` · üst: ${a.parent.name}` : ''}
          </Text>
        </View>
        <Pill text={STATUS_TEXT[a.status] ?? a.status} tone={statusTone(a.status)} />
      </View>
      <View style={{ gap: 2 }}>
        <Line label="Başvuran" value={a.owner?.name ?? '—'} />
        {!!contact?.name && contact.name !== a.owner?.name && <Line label="Yetkili" value={contact.name} />}
        {!!(contact?.phone || contact?.email) && <Line label="İletişim" value={[contact.phone, contact.email].filter(Boolean).join(' · ')} />}
        <Line label="Bölge" value={[a.region, a.country].filter(Boolean).join(', ') || '—'} />
        <Line label="Beklenen yayıncı" value={a.expectedStreamers ? fmtD(a.expectedStreamers) : '—'} />
        {!!a.tierName && <Line label="Başlangıç seviyesi" value={a.tierName} />}
        <Line label="Başvuru" value={fmtDateTime(a.createdAt)} />
      </View>
      {!!a.description && <Text style={ns.dim}>{a.description}</Text>}
      <View style={st.actions}>
        <Button small variant="danger" icon="close" title="Reddet" onPress={() => decide(false)} style={{ flex: 1 }} />
        <Button small icon="checkmark" title="Onayla" onPress={() => decide(true)} style={{ flex: 1 }} />
      </View>
    </Panel>
  );
}

function TransferCard({ t, demo, ask, after }: { t: Transfer; demo: boolean; ask: AskFn; after: () => void }) {
  const [withTransition, setWithTransition] = useState(false);
  const [rate, setRate] = useState('2');
  const centerTurn = t.needs.includes('center') && !t.approvals.center;
  const independence = t.kind === 'independence';
  const reject = async () => {
    const r = await ask({
      title: 'Talep reddedilsin mi?',
      message: 'Gerekçe ilgili ajanslara ve yayıncıya bildirilir.',
      confirm: 'Reddet',
      danger: true,
    });
    if (r) await runAction(demo, () => centerNet.decideTransfer(t.id, false, r.reason), 'Talep reddedildi.', after);
  };
  const approve = async () => {
    let transition: { rate: number; days: number; scope: 'existing' | 'all' } | undefined;
    if (independence && withTransition) {
      const v = pctIn(rate);
      if (!(v > 0) || v > 0.4) return showAlert('Geçersiz oran', 'Geçiş komisyonu için 0 ile 40 arasında bir yüzde gir (ör. 2).');
      transition = { rate: v, days: 180, scope: 'existing' };
    }
    const r = await ask({
      title: independence ? 'Bağımsızlık onaylansın mı?' : 'Transfer onaylansın mı?',
      message: independence
        ? `${t.agency?.name ?? 'Alt ajans'} üst ajans olur; oranı bir sonraki dönemden geçerli değişir.${transition ? ` Eski üst ajansa 180 gün boyunca mevcut yayıncılardan ${fmtPct(transition.rate)} geçiş komisyonu yazılır (bağımsız ajansın payından; toplam havuz aşılmaz).` : ' Geçiş komisyonu yok.'} Geçmiş kazançlar değişmez.`
        : 'Diğer tarafların onayları tamamsa transfer hemen yürürlüğe girer. Geçmiş kazançlar değişmez.',
      confirm: 'Onayla',
      min: 0,
      placeholder: 'İsteğe bağlı not',
    });
    if (r) await runAction(demo, () => centerNet.decideTransfer(t.id, true, r.reason, transition), 'Merkez onayı kaydedildi.', after);
  };
  return (
    <Panel>
      <View style={ns.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={ns.title}>{TRANSFER_TEXT[t.kind] ?? t.kind}</Text>
          <Text style={st.dimSmall}>
            #{t.id} · {fmtDateTime(t.createdAt)}
          </Text>
        </View>
        <Pill text={TRANSFER_STATUS[t.status] ?? t.status} tone={statusTone(t.status)} />
      </View>
      <View style={st.route}>
        <View style={st.routeEnd}>
          <Text style={st.statLabel}>{t.streamer ? 'Yayıncı' : 'Ajans'}</Text>
          <Text style={st.routeName} numberOfLines={1}>
            {t.streamer?.name ?? t.agency?.name ?? '—'}
          </Text>
        </View>
      </View>
      <View style={st.route}>
        <View style={st.routeEnd}>
          <Text style={st.statLabel}>Mevcut</Text>
          <Text style={st.routeName} numberOfLines={1}>
            {t.from?.name ?? '—'}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.textDim} />
        <View style={[st.routeEnd, { alignItems: 'flex-end' }]}>
          <Text style={st.statLabel}>Yeni</Text>
          <Text style={st.routeName} numberOfLines={1}>
            {t.to?.name ?? (independence ? 'Bağımsız üst ajans' : t.kind === 'streamer_leave' ? 'Ajanssız' : '—')}
          </Text>
        </View>
      </View>
      <View style={st.pills}>
        {t.needs.map((p) => {
          const ok = !!t.approvals[p];
          return <Pill key={p} text={`${PARTY_TEXT[p] ?? p}: ${ok ? 'onayladı' : 'bekliyor'}`} tone={ok ? 'success' : 'money'} icon={ok ? 'checkmark-circle' : 'time-outline'} />;
        })}
      </View>
      <View style={{ gap: 2 }}>
        <Line label="Transfer ücreti" value={t.fee > 0 ? `${fmtD(t.fee)} elmas · ${fmtUsd(usdOf(t.fee))}` : t.feeRule && t.feeRule.base < t.feeRule.threshold ? 'Ücretsiz (eşik altı)' : t.mode === 'free' ? 'Ücretsiz (ajans tercihi)' : 'Ücretsiz'} />
        {!!t.feeRule && <Text style={st.foot}>{t.feeRule.rule}</Text>}
      </View>
      {!!t.reason && (
        <View style={st.quote}>
          <Text style={ns.dim}>{t.reason}</Text>
        </View>
      )}
      {independence && centerTurn && (
        <View style={st.transition}>
          <Pressable onPress={() => setWithTransition((v) => !v)} style={st.check} accessibilityRole="checkbox" accessibilityState={{ checked: withTransition }}>
            <Ionicons name={withTransition ? 'checkbox' : 'square-outline'} size={20} color={withTransition ? semantic.action : colors.textDim} />
            <Text style={{ color: '#fff', flex: 1, fontWeight: '600' }}>Eski üst ajansa geçiş komisyonu tanımla</Text>
          </Pressable>
          {withTransition && (
            <View style={{ gap: 6 }}>
              <View style={st.inline}>
                <Text style={st.statLabel}>Oran (%)</Text>
                <TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" style={[ns.input, st.smallInput]} accessibilityLabel="Geçiş komisyonu oranı" />
                <Text style={st.dimSmall}>180 gün · mevcut yayıncılar</Text>
              </View>
              <Text style={st.foot}>Geçiş komisyonu bağımsız ajansın payından ayrılır; toplam ajans havuzu sınırı aşılmaz.</Text>
            </View>
          )}
        </View>
      )}
      <View style={st.actions}>
        <Button small variant="danger" icon="close" title="Reddet" onPress={reject} style={{ flex: 1 }} />
        {centerTurn && <Button small icon="checkmark" title="Onayla" onPress={approve} style={{ flex: 1 }} />}
      </View>
      {!centerTurn && <Text style={st.foot}>Bu talep merkez onayı beklemiyor; taraflar karar veriyor. Merkez yalnızca reddedebilir.</Text>}
    </Panel>
  );
}

function PayoutCard({ p, demo, ask, after }: { p: AdminPayout; demo: boolean; ask: AskFn; after: () => void }) {
  const act = async (action: 'approve' | 'pay' | 'reject' | 'cancel') => {
    const a: Ask =
      action === 'approve'
        ? {
            title: 'Ödeme onaylansın mı?',
            message: `${p.agency.name} için ${fmtD(p.amount)} elmas (${fmtUsd(p.usd)}). Ödemeyi başka bir yetkili yapacak.`,
            confirm: 'Onayla',
            min: 0,
            placeholder: 'İsteğe bağlı not',
          }
        : action === 'pay'
          ? {
              title: 'Ödendi olarak işaretle',
              message: `${fmtD(p.amount)} elmas · ${fmtUsd(p.usd)} · ${p.currency}. Banka veya ödeme sağlayıcısındaki işlem numarasını gir.`,
              confirm: 'Ödendi',
              min: 0,
              placeholder: 'İsteğe bağlı not',
              field: { label: 'Ödeme referansı', placeholder: 'ör. TRX-82140' },
            }
          : {
              title: action === 'reject' ? 'Ödeme reddedilsin mi?' : 'Ödeme iptal edilsin mi?',
              message: 'Tutar ajansın kullanılabilir bakiyesine geri döner.',
              confirm: action === 'reject' ? 'Reddet' : 'İptal et',
              danger: true,
            };
    const r = await ask(a);
    if (!r) return;
    const msg = {
      approve: 'Ödeme onaylandı; ödemeyi başka bir yetkili yapacak.',
      pay: 'Ödeme kaydedildi.',
      reject: 'Ödeme reddedildi.',
      cancel: 'Ödeme iptal edildi.',
    }[action];
    await runAction(demo, () => centerNet.decidePayout(p.id, action, r.reason, action === 'pay' ? r.field : undefined), msg, after);
  };
  return (
    <Panel>
      <View style={ns.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={ns.title}>{p.agency.name}</Text>
          <Text style={st.dimSmall}>
            {p.agency.code} · talep #{p.id}
          </Text>
        </View>
        <Pill text={p.statusLabel} tone={statusTone(p.status)} />
      </View>
      <View style={st.amountRow}>
        <Text style={st.amount}>{fmtD(p.amount)}</Text>
        <Text style={st.amountUnit}>elmas</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.amountUsd}>
          {fmtUsd(p.usd)} · {p.currency}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        <Line label="Talep eden" value={`${p.requestedBy ?? '—'} · ${fmtDateTime(p.requestedAt)}`} />
        {p.approvedAt && <Line label="Onaylayan" value={`${p.approvedBy ?? '—'} · ${fmtDateTime(p.approvedAt)}`} />}
        {p.agency.status === 'suspended' && <Line label="Uyarı" value="Ajans askıda" />}
      </View>
      <View style={st.actions}>
        {p.status === 'pending' && (
          <>
            <Button small variant="danger" icon="close" title="Reddet" onPress={() => act('reject')} style={{ flex: 1 }} />
            <Button small icon="checkmark" title="Onayla" onPress={() => act('approve')} style={{ flex: 1 }} />
          </>
        )}
        {p.status === 'ready' && (
          <>
            <Button small variant="ghost" icon="close" title="İptal" onPress={() => act('cancel')} style={{ flex: 1 }} />
            <Button small variant="money" icon="cash-outline" title="Ödendi olarak işaretle" onPress={() => act('pay')} style={{ flex: 2 }} />
          </>
        )}
      </View>
    </Panel>
  );
}

// The old Performans tab (scores, tiers by score) is gone with the weekly levels (owners, 26 Nov 2026).

// --- Kurallar: settings, simulator, history -------------------------------------------------------------------
type Values = {
  pool_cap: number;
  top_rate: number;
  max_levels: number;
  parent_min_rate: number;
  commission_period: string;
  period_close_days: number;
  subagency_policy?: {
    enabled: boolean;
    approval: string;
    min_active_streamers: number;
  };
  join_policy?: { requires_approval: boolean };
  payout_policy?: {
    min_diamonds: number;
    currencies: string[];
    two_person: boolean;
  };
  transfer_policy?: {
    decision_days: number;
    require_center: boolean;
    free_below_diamonds: number;
    fee_rate: number;
    fee_payer: string;
    owner_choice: boolean;
  };
  performance?: {
    window_months: number;
    cadence: string;
    promotion_min_periods: number;
    demotion_min_periods: number;
    max_step: number;
    min_active_streamers: number;
    active_days: number;
    effective: string;
  };
  weights: Record<string, number>;
  tiers: Tier[];
  income_types: Record<string, boolean>;
  parent_zero?: { enabled: boolean; tier: string };
  bd_policy?: { rate: number; basis: string };
  weekly_levels?: { min_active: number; active_usd: number; new_weeks: number; levels: { key: string; name: string; rate: number; from: number; shown: boolean }[] };
  referral_policy?: { pct: number; free_weeks: number; weeks: number };
  /** Ajans asistanı: how many assistants an agency may have at once (server/api/agency-assistants.mjs). */
  assistant_policy?: { max: number };
};
const SETTING_TEXT: Record<string, string> = {
  pool_cap: 'Toplam havuz sınırı',
  top_rate: 'Üst ajans oranı',
  max_levels: 'Katman sayısı',
  subagency_policy: 'Alt ajans politikası',
  join_policy: 'Katılım politikası',
  income_types: 'Komisyona dahil gelirler',
  commission_period: 'Komisyon dönemi',
  period_close_days: 'Dönem kapanışı',
  payout_policy: 'Ödeme politikası',
  transfer_policy: 'Transfer politikası',
  performance: 'Performans politikası',
  weights: 'Puan ağırlıkları',
  tiers: 'Seviye tablosu',
  parent_min_rate: 'Üst ajans asgari payı',
  parent_zero: 'Üst ajans payını sıfırlama',
  parent_sees_sub_earnings: 'Alt ajans kazancı görünürlüğü',
  parent_sees_subs: 'Üst ajans referans ajanslarının yayıncılarını ve rakamlarını görür',
  bd_policy: 'BD politikası',
  suspension_policy: 'Askıya alma politikası',
  assistant_policy: 'Ajans asistanı sınırı',
  referral_policy: 'Referans ajans komisyonu',
};
const PERIOD_TEXT: Record<string, string> = {
  month: 'Aylık',
  week: 'Haftalık',
  quarter: 'Üç aylık',
};
const PAYER_TEXT: Record<string, string> = {
  to_agency: 'Yeni ajans',
  streamer: 'Yayıncı',
  none: 'Ücret yok',
};
const yesNo = (v: boolean | undefined) => (v ? 'Evet' : 'Hayır');

function RulesTab({ name, ask }: { name: string; ask: AskFn }) {
  const q = useNet(name, () => centerNet.settings(), demoAdminSettings);
  const save = async (key: string, value: unknown, title: string, message?: string) => {
    const r = await ask({
      title,
      message: message ?? 'Yeni kural yalnızca bundan sonraki gelir ve değerlendirmelere uygulanır; geçmiş komisyonlar değişmez.',
      confirm: 'Kaydet',
    });
    if (r) await runAction(q.demo, () => centerNet.saveSetting(key, value, r.reason), 'Kural kaydedildi.', q.reload);
  };
  return (
    <Scroll q={q}>
      <NetState q={q}>
        {(d) => {
          const v = d.values as unknown as Values;
          const editAssistants = async () => {
            const r = await ask({
              title: 'Ajans başına asistan',
              message: `Bir ajans aynı anda en fazla bu kadar asistan atayabilir. Şu an ${fmtD(v.assistant_policy?.max ?? 1)}. Var olan asistanlar etkilenmez.`,
              confirm: 'Kaydet',
              field: { label: 'Yeni sınır (0–10)', placeholder: String(v.assistant_policy?.max ?? 1), keyboard: 'numeric' },
            });
            if (!r) return;
            const max = /^\d{1,2}$/.test(r.field) ? Number(r.field) : NaN;
            if (!(max >= 0 && max <= 10)) return showAlert('Geçersiz değer', '0 ile 10 arasında bir sayı yaz.');
            await runAction(q.demo, () => centerNet.saveSetting('assistant_policy', { max }, r.reason), 'Kural kaydedildi.', q.reload);
          };
          return (
            <>
              {/* Today's rules (owners, Nov 2026): weekly levels, referral agencies, assistants (BD is management's own business, owners 26 Nov 2026: not shown in the app). The retired pool,
                  tiers and score weights are no longer shown. Levels are edited in the panel (Ajans seviyeleri). */}
              {v.weekly_levels && (
                <Section title="Haftalık seviyeler">
                  <Panel>
                    {v.weekly_levels.levels.map((l) => (
                      <Line key={l.key} label={`${l.name}${l.from > 0 ? ` · ${fmtD(l.from)} elmas` : ''}${l.shown ? '' : ' (uygulamada görünmez)'}`} value={fmtPct(l.rate)} strong={l.shown} />
                    ))}
                    <Text style={st.foot}>
                      Haftalık elmas eşiğine ve aktif yayıncıya göre (Başlangıç ve üstü için o hafta en az {fmtUsd(v.weekly_levels.active_usd)} kazanan {fmtD(v.weekly_levels.min_active)} yayıncı). Yeni ajans ilk {fmtD(v.weekly_levels.new_weeks)} hafta Başlangıç oranını alır. Hafta içinde en alt oran yazılır, Pazartesi 00:00’da fark eklenir. Yayıncının elması azalmaz. Düzenleme: panel › Ajans seviyeleri.
                    </Text>
                  </Panel>
                </Section>
              )}

              <Section title="Ağ kuralları">
                <Panel>
                  <View style={{ gap: 2 }}>
                    {v.referral_policy && (
                      <Line
                        label="Referans ajans komisyonu"
                        value={v.referral_policy.pct > 0 ? `${fmtPct(v.referral_policy.pct)} · ${fmtD(v.referral_policy.weeks)} hafta` : 'Kapalı'}
                      />
                    )}
                    {v.referral_policy && v.referral_policy.pct > 0 && <Line label="Komisyonsuz ilk hafta" value={`${fmtD(v.referral_policy.free_weeks)} hafta`} />}
                    {v.assistant_policy && <EditLine label="Ajans başına asistan" value={fmtD(v.assistant_policy.max)} onEdit={editAssistants} />}
                    <Line label="Komisyon dönemi" value={PERIOD_TEXT[v.commission_period] ?? v.commission_period} />
                    <Line label="Dönem kapanışı" value={`${fmtD(v.period_close_days)} gün sonra`} />
                  </View>
                  <Text style={st.foot}>Referans ajans komisyonunu platform öder; ajansların komisyonundan kesilmez. Oranlar panelden değişir.</Text>
                </Panel>
              </Section>

              <Section title="Komisyona dahil gelirler">
                <ListGroup footer="Değişiklik yalnızca bundan sonraki gelirlere uygulanır.">
                  {d.incomeTypes.map((t) => {
                    const on = !!v.income_types?.[t];
                    return (
                      <ListRow
                        key={t}
                        icon={on ? 'checkmark-circle' : 'remove-circle-outline'}
                        tone={on ? 'success' : 'neutral'}
                        title={INCOME_TEXT[t] ?? t}
                        subtitle={on ? 'Komisyona dahil' : 'Komisyona dahil değil'}
                        right={<Pill text={on ? 'Dahil' : 'Hariç'} tone={on ? 'success' : 'neutral'} />}
                        onPress={() => save('income_types', { [t]: !on }, `${INCOME_TEXT[t] ?? t} ${on ? 'hariç tutulsun mu?' : 'dahil edilsin mi?'}`)}
                      />
                    );
                  })}
                </ListGroup>
              </Section>

              <Section title="Politikalar">
                <Panel>
                  {v.payout_policy && (
                    <View style={{ gap: 2 }}>
                      <Text style={st.groupTitle}>Ödeme</Text>
                      <Line label="Alt limit" value={`${fmtD(v.payout_policy.min_diamonds)} elmas · ${fmtUsd(usdOf(v.payout_policy.min_diamonds))}`} />
                      <Line label="Para birimleri" value={v.payout_policy.currencies.join(', ')} />
                      <Line label="İki kişili onay" value={yesNo(v.payout_policy.two_person)} />
                    </View>
                  )}
                  {v.transfer_policy && (
                    <View style={{ gap: 2 }}>
                      <Text style={st.groupTitle}>Transfer</Text>
                      <Line label="Karar süresi" value={`${fmtD(v.transfer_policy.decision_days)} gün`} />
                      <Line label="Merkez onayı" value={yesNo(v.transfer_policy.require_center)} />
                      <Line label="Ücretsiz transfer sınırı" value={`${fmtD(v.transfer_policy.free_below_diamonds)} elmas`} />
                      <Line label="Transfer ücreti" value={`${fmtPct(v.transfer_policy.fee_rate)} · ${PAYER_TEXT[v.transfer_policy.fee_payer] ?? v.transfer_policy.fee_payer}`} />
                      <Line label="Ajans ücretsiz bırakabilir" value={yesNo(v.transfer_policy.owner_choice)} />
                    </View>
                  )}
                </Panel>
              </Section>

              <Section title="Kural geçmişi">
                {d.history.length === 0 ? (
                  <Empty icon="time-outline" text="Henüz kural değişikliği yok; varsayılanlar geçerli." />
                ) : (
                  <ListGroup>
                    {d.history.slice(0, 30).map((h) => (
                      <ListRow
                        key={h.id}
                        icon="document-text-outline"
                        tone="neutral"
                        title={SETTING_TEXT[h.key] ?? h.key}
                        subtitle={`${h.reason} · ${h.set_by ?? 'Merkez'} · ${fmtDateTime(h.created_at)}`}
                      />
                    ))}
                  </ListGroup>
                )}
              </Section>
            </>
          );
        }}
      </NetState>
    </Scroll>
  );
}

function EditLine({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${label} düzenle`} style={st.editLine}>
      <Text style={st.lineLabel}>{label}</Text>
      <View style={st.inline}>
        <Text style={st.lineValue}>{value}</Text>
        <Ionicons name="create-outline" size={15} color={semantic.action} />
      </View>
    </Pressable>
  );
}

// --- Denetim: audit log ---------------------------------------------------------------------------------------
const ACTION_TEXT: Record<string, string> = {
  'agency.approve': 'Ajans onayı',
  'agency.create': 'Ajans oluşturma',
  'agency.ops_score': 'Operasyon puanı',
  'agency.parent': 'Üst ajans değişikliği',
  'agency.rate': 'Oran kararı',
  'agency.reject': 'Ajans reddi',
  'agency.status': 'Durum değişikliği',
  'agency.submit': 'Başvuru gönderimi',
  'agency.tier': 'Seviye kararı',
  'agency.view': 'Görüntüleme',
  'agency.violation': 'İhlal kaydı',
  'appeal.decide': 'İtiraz kararı',
  'appeal.open': 'İtiraz',
  'bd.assign': 'BD ataması',
  'commission.reverse': 'Komisyon iptali',
  'income.record': 'Gelir kaydı',
  'jobs.run': 'Arka plan işi',
  'ledger.adjust': 'Düzeltme kaydı',
  'payout.request': 'Ödeme talebi',
  'performance.run': 'Performans değerlendirmesi',
  'period.close': 'Dönem kapanışı',
  'platform_staff.remove': 'Merkez ekibinden çıkarma',
  'platform_staff.set': 'Merkez ekibi yetkisi',
  'reports.export': 'Rapor dışa aktarma',
  'role.create': 'Rol oluşturma',
  'role.update': 'Rol güncelleme',
  'settings.set': 'Kural değişikliği',
  'staff.remove': 'Ekipten çıkarma',
  'staff.set': 'Ekip yetkisi',
  'streamer.assign': 'Yayıncı ataması',
  'streamer.invite': 'Yayıncı daveti',
  'streamer.link': 'Yayıncı bağlantısı',
  'sub.close': 'Alt ajans kapatma',
  'transfer.approve': 'Transfer onayı',
  'transfer.center': 'Merkez transfer kararı',
  'transfer.complete': 'Transfer tamamlandı',
  'transfer.open': 'Transfer talebi',
  'transfer.reject': 'Transfer reddi',
  'transition.create': 'Geçiş komisyonu',
};
const TARGET_TEXT: Record<string, string> = {
  agency: 'Ajans',
  run: 'Değerlendirme',
  payout: 'Ödeme',
  transfer: 'Transfer',
  setting: 'Kural',
  user: 'Kullanıcı',
  streamer: 'Yayıncı',
  role: 'Rol',
  appeal: 'İtiraz',
  commission: 'Komisyon',
  period: 'Dönem',
};

const AUDIT_PAGE = 30;

function AuditTab({ name }: { name: string }) {
  const [result, setResult] = useState<'all' | 'ok' | 'denied'>('all');
  const [limit, setLimit] = useState(AUDIT_PAGE);
  const q = useNet(name, () => centerNet.audit(), demoAudit);
  return (
    <Scroll q={q}>
      <NetState q={q}>
        {(rows) => {
          const shown = rows.filter((r) => result === 'all' || (result === 'ok' ? r.result !== 'denied' : r.result === 'denied'));
          return (
            <Section title="Denetim kaydı" right={<Text style={st.dimSmall}>{shown.length} kayıt</Text>}>
              <ChoiceChips<'all' | 'ok' | 'denied'>
                value={result}
                onChange={(v) => {
                  setResult(v);
                  setLimit(AUDIT_PAGE);
                }}
                options={[
                  ['all', 'Tümü'],
                  ['ok', 'Uygulanan'],
                  ['denied', 'Reddedilen'],
                ]}
              />
              {shown.length === 0 ? (
                <Empty icon="shield-checkmark-outline" text="Kayıt yok." />
              ) : (
                <ListGroup footer="Kayıtlar değiştirilemez ve silinemez. Yetkisiz denemeler de kaydedilir.">
                  {shown.slice(0, limit).map((r) => {
                    const denied = r.result === 'denied';
                    const target = `${TARGET_TEXT[r.targetType] ?? r.targetType} ${r.targetId.length > 12 ? `${r.targetId.slice(0, 8)}…` : r.targetId}`;
                    return (
                      <ListRow
                        key={r.id}
                        icon={denied ? 'ban-outline' : 'shield-checkmark-outline'}
                        tone={denied ? 'danger' : 'neutral'}
                        title={ACTION_TEXT[r.action] ?? r.action}
                        subtitle={[`${r.actor?.name ?? 'Sistem'} · ${target}`, r.reason, fmtDateTime(r.at)].filter(Boolean).join('\n')}
                        right={<Pill text={denied ? 'Reddedildi' : 'Uygulandı'} tone={denied ? 'danger' : 'success'} />}
                      />
                    );
                  })}
                </ListGroup>
              )}
              {shown.length > limit && <Button small variant="ghost" icon="chevron-down" title={`Daha fazla göster (${fmtD(shown.length - limit)} kayıt daha)`} onPress={() => setLimit((n) => n + AUDIT_PAGE)} />}
            </Section>
          );
        }}
      </NetState>
    </Scroll>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, gap: space.xl, paddingBottom: 56 },
  foot: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  dimSmall: { color: colors.textDim, fontSize: 12 },
  branch: { flexDirection: 'row', paddingLeft: 14 },
  branchLine: {
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(10,159,165,0.35)',
    marginRight: 10,
    marginVertical: 4,
  },
  node: { padding: 14, gap: 10 },
  nodeSub: { padding: 12 },
  nodeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nodeHeadMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  nodeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeName: { color: '#fff', fontSize: 15, fontFamily: fonts.displayBold },
  more: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  nodeStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: {
    flexGrow: 1,
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  statValue: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,95,162,0.08)',
  },
  upcomingText: { color: colors.text, fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  route: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  routeEnd: { flex: 1, gap: 2 },
  routeName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    paddingLeft: 10,
  },
  transition: {
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallInput: { width: 72, paddingVertical: 8, textAlign: 'center' },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  amount: {
    color: '#fff',
    fontSize: 24,
    fontFamily: fonts.display,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  amountUnit: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  amountUsd: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rankText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.displayBold,
    fontVariant: ['tabular-nums'],
  },
  score: {
    color: '#fff',
    fontSize: 22,
    fontFamily: fonts.display,
    fontVariant: ['tabular-nums'],
  },
  editor: {
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  editLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 4,
  },
  lineLabel: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  lineValue: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  groupTitle: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.displayBold,
    marginBottom: 2,
  },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cell: { width: 68, textAlign: 'center' },
  cellInput: { paddingVertical: 8, paddingHorizontal: 6 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  weightTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  weightFill: { height: '100%', borderRadius: 3, backgroundColor: SERIES.own },
  simInputs: { flexDirection: 'row', gap: space.sm },
});
