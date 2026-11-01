// The centre's agency-network management (Spec 1 §10, Spec 2 §11): the organisation tree, approvals (agencies,
// transfers with transition commission, payouts with separated duties), performance runs with manual tier and rate
// decisions, the commission rules with their history and a simulator, and the audit log. Everything comes from the
// server (centerNet in lib/agency-net); every decision carries a written reason and never applies to past earnings.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Kpi, KpiGrid, Line, NetState, Panel, Pill, RateSplit, ScoreBar, Section, SERIES, Tabs, TierLadder, diamondsKpi, ns, statusTone, useAsk, type Ask } from '@/components/agency-net';
import { Backdrop } from '@/components/fx/surface';
import { SCENES } from '@/components/fx/scenes';
import { ChoiceChips, ListGroup, ListRow } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { DEMO_TIERS, demoAdminList, demoAdminOverview, demoAdminPayouts, demoAdminPerf, demoAdminSettings, demoAdminTransfers, demoAudit, demoTree } from '@/data/agency-net-demo';
import {
  CHANGE_TEXT,
  CRITERIA_TEXT,
  FLAG_TEXT,
  INCOME_TEXT,
  LEVEL_TEXT,
  PARTY_TEXT,
  SOURCE_TEXT,
  STATUS_TEXT,
  TRANSFER_STATUS,
  TRANSFER_TEXT,
  centerNet,
  errorText,
  fmtD,
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtScore,
  fmtUsd,
  runAction,
  unavailable,
  useNet,
  usdOf,
  type AdminAgency,
  type AdminPayout,
  type AdminScore,
  type Loaded,
  type Simulation,
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
const numIn = (s: string) => {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(v) ? v : NaN;
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
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'genel', label: 'Genel' },
          { key: 'onay', label: 'Onaylar', badge: waiting },
          { key: 'perf', label: 'Performans' },
          { key: 'kural', label: 'Kurallar' },
          { key: 'denetim', label: 'Denetim' },
        ]}
      />
      {tab === 'genel' && <GeneralTab name={me.name} ov={ov} ask={ask} />}
      {tab === 'onay' && <ApprovalsTab name={me.name} ask={ask} after={ov.reload} />}
      {tab === 'perf' && <PerformanceTab name={me.name} ask={ask} />}
      {tab === 'kural' && <RulesTab name={me.name} ask={ask} />}
      {tab === 'denetim' && <AuditTab name={me.name} />}
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
  return (
    <Scroll q={tree}>
      <NetState q={ov}>
        {(o) => (
          <Section title="Son 30 gün">
            <KpiGrid>
              <Kpi icon="business-outline" label="Üst ajans" value={fmtD(o.tops)} sub={`${fmtD(o.subs)} alt ajans`} />
              <Kpi icon="people-outline" label="Bağlı yayıncı" value={fmtD(o.streamers)} sub={`${fmtD(o.suspended)} ajans askıda`} />
              <Kpi icon="diamond-outline" tone="money" label="Komisyon matrahı" {...diamondsKpi(o.base30)} />
              <Kpi icon="pie-chart-outline" tone="money" label="Ajans komisyonu" {...diamondsKpi(o.commission30)} />
              <Kpi icon="briefcase-outline" label="BD komisyonu" {...diamondsKpi(o.bd30)} />
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
            <Text style={st.foot}>Komisyon havuzu sınırı {fmtPct(o.poolCap)}. Tutarlar sunucuda hesaplanır; 5000 elmas = 1 USD.</Text>
          </Section>
        )}
      </NetState>
      <NetState q={tree}>
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
        {(!!n.tierName || n.overtakes || n.flags.length > 0) && (
          <View style={st.pills}>
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

// --- Performans: runs, scores, manual tier and rate -------------------------------------------------------------
function PerformanceTab({ name, ask }: { name: string; ask: AskFn }) {
  const [runId, setRunId] = useState<number | undefined>(undefined);
  const q = useNet(
    name,
    async () => {
      const [perf, settings] = await Promise.all([centerNet.performance(runId), centerNet.settings().catch((e) => (unavailable(e) ? Promise.reject(e) : null))]);
      const tiers = (settings?.values.tiers as Tier[] | undefined) ?? null;
      return {
        perf,
        tiers,
        poolCap: (settings?.values.pool_cap as number | undefined) ?? null,
      };
    },
    () => ({
      perf: demoAdminPerf(),
      tiers: DEMO_TIERS as Tier[] | null,
      poolCap: 0.4 as number | null,
    }),
    [runId],
  );
  const run = async (dryRun: boolean) => {
    if (dryRun) {
      await runAction(
        q.demo,
        () => centerNet.runPerformance(true, 'Deneme değerlendirmesi'),
        'Deneme tamamlandı. Seviye ve oranlar değişmedi; sonuçlar listede.',
        () => {
          setRunId(undefined);
          q.reload();
        },
      );
      return;
    }
    const r = await ask({
      title: 'Değerlendirme çalıştırılsın mı?',
      message: 'Tüm ajansların puanı hesaplanır. Hak edilen seviye ve oran değişiklikleri bir sonraki dönemden geçerli olur; mevcut dönem ve geçmiş kazançlar değişmez. Üst ajanslara bildirim gider.',
      confirm: 'Çalıştır',
      placeholder: 'ör. Kasım ayı değerlendirmesi',
    });
    if (r)
      await runAction(
        q.demo,
        () => centerNet.runPerformance(false, r.reason),
        'Değerlendirme tamamlandı.',
        () => {
          setRunId(undefined);
          q.reload();
        },
      );
  };
  return (
    <Scroll q={q}>
      <Panel>
        <Text style={ns.title}>Performans değerlendirmesi</Text>
        <Text style={ns.dim}>Puan; hacim, aktif yayıncı, büyüme, tutma, yeni yayıncı, operasyon ve güvenilirlik ağırlıklarıyla sunucuda hesaplanır. Deneme hiçbir oranı değiştirmez.</Text>
        <View style={st.actions}>
          <Button small variant="tonal" icon="flask-outline" title="Deneme değerlendirmesi" onPress={() => run(true)} style={{ flex: 1 }} />
          <Button small icon="play" title="Değerlendirmeyi çalıştır" onPress={() => run(false)} style={{ flex: 1 }} />
        </View>
      </Panel>
      <NetState q={q}>
        {(d) => {
          const runs = d.perf.runs;
          const cur = runs.find((r) => r.id === d.perf.runId);
          const tierLabel = (k: string | null) => (k ? (d.tiers?.find((t) => t.key === k)?.name ?? k) : '—');
          return (
            <>
              <Section title="Değerlendirmeler">
                {runs.length === 0 ? (
                  <Empty icon="analytics-outline" text="Henüz değerlendirme çalıştırılmadı." />
                ) : (
                  <Panel>
                    <ChoiceChips<number> value={d.perf.runId ?? 0} onChange={(v) => setRunId(v)} options={runs.slice(0, 8).map((r) => [r.id, `#${r.id}${r.dryRun ? ' · deneme' : ''}`])} />
                    {cur && (
                      <View style={{ gap: 2 }}>
                        <Line label="Tarih" value={fmtDateTime(cur.asOf)} />
                        <Line label="Ölçüm aralığı" value={`${fmtDate(cur.windowFrom)} – ${fmtDate(cur.asOf)}`} />
                        <Line label="Yürürlük" value={cur.dryRun ? 'Deneme (uygulanmadı)' : fmtDate(cur.effectiveFrom)} strong />
                        <Line label="Çalıştıran" value={cur.runBy ?? '—'} />
                        {!!cur.note && <Line label="Not" value={cur.note} />}
                      </View>
                    )}
                  </Panel>
                )}
              </Section>
              <Section title="Puanlar" right={<Text style={st.dimSmall}>{d.perf.scores.length} ajans</Text>}>
                {d.perf.scores.length === 0 && runs.length > 0 && <Empty icon="list-outline" text="Bu değerlendirmede puan yok." />}
                {d.perf.scores.map((s) => (
                  <ScoreCard key={s.agencyId} s={s} tiers={d.tiers} tierLabel={tierLabel} demo={q.demo} ask={ask} after={q.reload} />
                ))}
                <Text style={st.foot}>
                  Seviye ve oranı yalnızca merkez elle değiştirebilir; üst ajans, alt ajansının puanını, seviyesini veya oranını değiştiremez. Her karar gerekçesiyle kayda geçer ve geçmişe uygulanmaz.
                </Text>
              </Section>
            </>
          );
        }}
      </NetState>
    </Scroll>
  );
}

function ScoreCard({ s, tiers, tierLabel, demo, ask, after }: { s: AdminScore; tiers: Tier[] | null; tierLabel: (k: string | null) => string; demo: boolean; ask: AskFn; after: () => void }) {
  const [mode, setMode] = useState<'tier' | 'rate' | null>(null);
  const [tier, setTier] = useState(s.assigned ?? s.current ?? tiers?.[0]?.key ?? '');
  const [rate, setRate] = useState('');
  const sub = s.level > 1;
  const parent = s.parent?.name ?? null;
  const saveTier = async () => {
    if (!tier) return;
    const r = await ask({
      title: `${s.name}: ${tierLabel(tier)}`,
      message: 'Seviye ve buna bağlı oran bir sonraki dönemden geçerli olur. Geçmiş kazançlar değişmez.',
      confirm: 'Seviyeyi ata',
    });
    if (r)
      await runAction(
        demo,
        () => centerNet.setTier(s.agencyId, tier, r.reason),
        'Seviye kararı kaydedildi.',
        () => {
          setMode(null);
          after();
        },
      );
  };
  const saveRate = async () => {
    const v = pctIn(rate);
    if (!(v >= 0) || v > 1) return showAlert('Geçersiz oran', 'Yüzde olarak gir (ör. 32 veya 32,5).');
    const r = await ask({
      title: `${s.name}: oran ${fmtPct(v)}`,
      message: sub
        ? 'Alt ajans oranı, üst ajansın asgari payını bırakacak şekilde sınırlıdır; sunucu aşan oranı reddeder. Yeni oran geleceğe uygulanır.'
        : 'Üst ajans oranı havuz sınırını aşamaz. Yeni oran geleceğe uygulanır.',
      confirm: 'Oranı belirle',
    });
    if (r)
      await runAction(
        demo,
        () => centerNet.setRate(s.agencyId, v, r.reason),
        'Oran kararı kaydedildi.',
        () => {
          setMode(null);
          after();
        },
      );
  };
  return (
    <Panel>
      <View style={ns.rowBetween}>
        <View style={st.rank}>
          <Text style={st.rankText}>{s.rank ?? '—'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.nodeName} numberOfLines={1}>
            {s.name}
          </Text>
          <Text style={st.dimSmall} numberOfLines={1}>
            {LEVEL_TEXT(s.level)}
            {parent ? ` · üst: ${parent}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.score}>{fmtScore(s.score)}</Text>
          <Text style={st.dimSmall}>puan</Text>
        </View>
      </View>
      <ScoreBar score={s.score} parentScore={s.parentScore} />
      <View style={{ gap: 2 }}>
        {sub && <Line label="Hak ettiği seviye" value={tierLabel(s.qualified)} />}
        {sub && <Line label="Atanan seviye" value={s.assignedName ?? tierLabel(s.assigned)} strong />}
        {sub && s.current !== s.assigned && <Line label="Önceki seviye" value={tierLabel(s.current)} />}
        <Line label="Art arda dönem" value={fmtD(s.streak)} />
      </View>
      <View style={st.pills}>
        <Pill
          text={CHANGE_TEXT[s.change] ?? s.change}
          tone={s.change === 'up' ? 'success' : s.change === 'down' ? 'danger' : s.change === 'waiting' ? 'money' : 'neutral'}
          icon={s.change === 'up' ? 'arrow-up' : s.change === 'down' ? 'arrow-down' : s.change === 'held' ? 'lock-closed-outline' : 'remove'}
        />
        {s.overtakes && <Pill text="Üst ajansı geçti" tone="money" icon="trending-up" />}
        {s.flags.map((f) => (
          <Pill key={f} text={FLAG_TEXT[f] ?? f} tone={f === 'review' || f === 'decline' || f === 'spike' ? 'danger' : 'neutral'} icon="flag-outline" />
        ))}
      </View>
      <View style={st.actions}>
        {sub && tiers && (
          <Button small variant={mode === 'tier' ? 'hero' : 'tonal'} icon="podium-outline" title="Seviye ata" onPress={() => setMode(mode === 'tier' ? null : 'tier')} style={{ flex: 1 }} />
        )}
        <Button small variant={mode === 'rate' ? 'hero' : 'tonal'} icon="options-outline" title="Oran belirle" onPress={() => setMode(mode === 'rate' ? null : 'rate')} style={{ flex: 1 }} />
      </View>
      {mode === 'tier' && tiers && (
        <View style={st.editor}>
          <ChoiceChips<string> value={tier} onChange={setTier} options={tiers.map((t) => [t.key, `${t.name} · ${fmtPct(t.sub_rate)}`])} />
          <Button small title="Kaydet" icon="checkmark" onPress={saveTier} />
        </View>
      )}
      {mode === 'rate' && (
        <View style={st.editor}>
          <View style={st.inline}>
            <Text style={st.statLabel}>Yeni oran (%)</Text>
            <TextInput
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="ör. 32"
              placeholderTextColor={colors.textDim}
              style={[ns.input, st.smallInput]}
              accessibilityLabel="Yeni oran"
            />
          </View>
          <Button small title="Kaydet" icon="checkmark" onPress={saveRate} />
        </View>
      )}
    </Panel>
  );
}

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
  bd_policy: 'BD politikası',
  suspension_policy: 'Askıya alma politikası',
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
          const editPct = async (key: 'pool_cap' | 'top_rate' | 'parent_min_rate', title: string, hint: string) => {
            const r = await ask({
              title,
              message: `${hint} Şu an ${fmtPct(v[key])}. Geçmiş komisyonlar değişmez.`,
              confirm: 'Kaydet',
              field: {
                label: 'Yeni değer (%)',
                placeholder: String((v[key] ?? 0) * 100).replace('.', ','),
                keyboard: 'decimal-pad',
              },
            });
            if (!r) return;
            const val = pctIn(r.field);
            if (!(val >= 0) || val > 1) return showAlert('Geçersiz değer', 'Yüzde olarak gir (ör. 40).');
            await runAction(q.demo, () => centerNet.saveSetting(key, val, r.reason), 'Kural kaydedildi.', q.reload);
          };
          return (
            <>
              <Section title="Komisyon havuzu">
                <Panel>
                  <RateSplit
                    rate={v.tiers?.[0]?.sub_rate ?? 0}
                    parentShare={Math.max(0, (v.top_rate ?? 0) - (v.tiers?.[0]?.sub_rate ?? 0))}
                    poolCap={v.pool_cap}
                    ownLabel={`Alt ajans (${v.tiers?.[0]?.name ?? 'ilk seviye'})`}
                    parentLabel="Üst ajans farkı"
                  />
                  <View style={{ gap: 2 }}>
                    <EditLine
                      label="Toplam havuz sınırı"
                      value={fmtPct(v.pool_cap)}
                      onEdit={() => editPct('pool_cap', 'Toplam havuz sınırı', 'Bir hediyeden tüm ajanslara yazılabilecek en yüksek komisyon.')}
                    />
                    <EditLine label="Üst ajans oranı" value={fmtPct(v.top_rate)} onEdit={() => editPct('top_rate', 'Üst ajans oranı', 'Üst ajansın zincirdeki toplam oranı; havuz sınırını aşamaz.')} />
                    <EditLine
                      label="Üst ajans asgari payı"
                      value={fmtPct(v.parent_min_rate)}
                      onEdit={() => editPct('parent_min_rate', 'Üst ajans asgari payı', 'Alt ajans en yüksek seviyede olsa da üst ajansa kalan pay.')}
                    />
                    <Line label="Katman sayısı" value={fmtD(v.max_levels)} />
                    <Line label="Komisyon dönemi" value={PERIOD_TEXT[v.commission_period] ?? v.commission_period} />
                    <Line label="Dönem kapanışı" value={`${fmtD(v.period_close_days)} gün sonra`} />
                    {v.parent_zero && (
                      <Line label="Üst ajans payını sıfırlama" value={v.parent_zero.enabled ? `Açık (${v.tiers.find((t) => t.key === v.parent_zero?.tier)?.name ?? v.parent_zero.tier})` : 'Kapalı'} />
                    )}
                    {v.bd_policy && <Line label="BD komisyonu" value={`${fmtPct(v.bd_policy.rate)} · ayrı ödenir`} />}
                  </View>
                </Panel>
              </Section>

              <Section title="Seviyeler ve oranlar">
                <Panel>
                  <TierLadder tiers={v.tiers} current={null} score={null} poolCap={v.pool_cap} floor={v.parent_min_rate} />
                  <TiersEditor
                    key={JSON.stringify(v.tiers)}
                    tiers={v.tiers}
                    onSave={(tiers) =>
                      save(
                        'tiers',
                        tiers,
                        'Seviye tablosu kaydedilsin mi?',
                        'Yeni eşik ve oranlar bir sonraki değerlendirmeden geçerli olur. Üst seviyenin oranı alttakinden düşük olamaz; sunucu kontrol eder.',
                      )
                    }
                  />
                </Panel>
              </Section>

              <Section title="Puan ağırlıkları">
                <Panel>
                  <WeightsEditor
                    key={JSON.stringify(v.weights)}
                    weights={v.weights}
                    criteria={d.criteria}
                    onSave={(w) => save('weights', w, 'Ağırlıklar kaydedilsin mi?', 'Puanlar bir sonraki değerlendirmede yeni ağırlıklarla hesaplanır.')}
                  />
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
                  {v.performance && (
                    <View style={{ gap: 2 }}>
                      <Text style={st.groupTitle}>Performans</Text>
                      <Line label="Ölçüm penceresi" value={`${fmtD(v.performance.window_months)} ay`} />
                      <Line label="Değerlendirme sıklığı" value={PERIOD_TEXT[v.performance.cadence] ?? v.performance.cadence} />
                      <Line label="Yükselme için art arda dönem" value={fmtD(v.performance.promotion_min_periods)} />
                      <Line label="Düşüş için art arda dönem" value={fmtD(v.performance.demotion_min_periods)} />
                      <Line label="Bir seferde en fazla" value={`${fmtD(v.performance.max_step)} seviye`} />
                      <Line label="Asgari aktif yayıncı" value={fmtD(v.performance.min_active_streamers)} />
                      <Line label="Yürürlük" value={v.performance.effective === 'immediate' ? 'Hemen' : 'Bir sonraki dönem'} />
                    </View>
                  )}
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
                  {v.subagency_policy && (
                    <View style={{ gap: 2 }}>
                      <Text style={st.groupTitle}>Alt ajans</Text>
                      <Line label="Alt ajans kurulabilir" value={yesNo(v.subagency_policy.enabled)} />
                      <Line label="Onay" value={v.subagency_policy.approval === 'auto' ? 'Otomatik' : 'Merkez onayı'} />
                      {v.join_policy && <Line label="Yayıncı katılımı onaylı" value={yesNo(v.join_policy.requires_approval)} />}
                    </View>
                  )}
                </Panel>
              </Section>

              <Simulator demo={q.demo} />

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

function TiersEditor({ tiers, onSave }: { tiers: Tier[]; onSave: (t: Tier[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    tiers.map((t) => ({
      min: String(t.min_score),
      rate: String(Math.round(t.sub_rate * 1e4) / 100).replace('.', ','),
    })),
  );
  const submit = () => {
    const out = tiers.map((t, i) => ({
      ...t,
      min_score: i === 0 ? 0 : numIn(draft[i].min),
      sub_rate: pctIn(draft[i].rate),
    }));
    if (out.some((t) => !Number.isFinite(t.min_score) || !Number.isFinite(t.sub_rate) || t.min_score < 0 || t.min_score > 100 || t.sub_rate < 0))
      return showAlert('Geçersiz değer', 'Puan 0–100, oran yüzde olarak girilmeli.');
    onSave(out);
  };
  if (!open) return <Button small variant="tonal" icon="create-outline" title="Eşik ve oranları düzenle" onPress={() => setOpen(true)} />;
  return (
    <View style={st.editor}>
      <View style={st.tableHead}>
        <Text style={[st.statLabel, { flex: 1 }]}>Seviye</Text>
        <Text style={[st.statLabel, st.cell]}>Asgari puan</Text>
        <Text style={[st.statLabel, st.cell]}>Alt ajans %</Text>
      </View>
      {tiers.map((t, i) => (
        <View key={t.key} style={st.tableRow}>
          <Text style={[st.lineValue, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>
            {t.name}
          </Text>
          <TextInput
            value={draft[i].min}
            editable={i > 0}
            onChangeText={(x) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, min: x } : r)))}
            keyboardType="decimal-pad"
            style={[ns.input, st.cell, st.cellInput, i === 0 && { opacity: 0.5 }]}
            accessibilityLabel={`${t.name} asgari puan`}
          />
          <TextInput
            value={draft[i].rate}
            onChangeText={(x) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, rate: x } : r)))}
            keyboardType="decimal-pad"
            style={[ns.input, st.cell, st.cellInput]}
            accessibilityLabel={`${t.name} alt ajans oranı`}
          />
        </View>
      ))}
      <View style={st.actions}>
        <Button small variant="ghost" title="Vazgeç" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Button small icon="checkmark" title="Kaydet" onPress={submit} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function WeightsEditor({ weights, criteria, onSave }: { weights: Record<string, number>; criteria: string[]; onSave: (w: Record<string, number>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(criteria.map((k) => [k, String(weights[k] ?? 0)])));
  const vals = Object.fromEntries(criteria.map((k) => [k, numIn(draft[k] ?? '')]));
  const total = criteria.reduce((x, k) => x + (Number.isFinite(vals[k]) ? vals[k] : 0), 0);
  const dirty = criteria.some((k) => vals[k] !== (weights[k] ?? 0));
  const submit = () => {
    if (criteria.some((k) => !Number.isFinite(vals[k]) || vals[k] < 0 || vals[k] > 100)) return showAlert('Geçersiz ağırlık', 'Her ağırlık 0 ile 100 arasında olmalı.');
    onSave(vals);
  };
  return (
    <View style={{ gap: 10 }}>
      {criteria.map((k) => {
        const v = Number.isFinite(vals[k]) ? vals[k] : 0;
        return (
          <View key={k} style={st.weightRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={ns.rowBetween}>
                <Text style={st.lineValue}>{CRITERIA_TEXT[k] ?? k}</Text>
                <Text style={st.dimSmall}>{total > 0 ? fmtPct(v / total) : '—'}</Text>
              </View>
              <View style={st.weightTrack}>
                <View style={[st.weightFill, { width: `${total > 0 ? (v / total) * 100 : 0}%` }]} />
              </View>
            </View>
            <TextInput
              value={draft[k]}
              onChangeText={(x) => setDraft((d) => ({ ...d, [k]: x }))}
              keyboardType="decimal-pad"
              style={[ns.input, st.smallInput]}
              accessibilityLabel={`${CRITERIA_TEXT[k] ?? k} ağırlığı`}
            />
          </View>
        );
      })}
      <Text style={st.foot}>Toplam {fmtD(total)}. Ağırlıklar oransaldır; her kriterin puana katkısı ağırlığının toplama oranıdır.</Text>
      {dirty && <Button small icon="checkmark" title="Ağırlıkları kaydet" onPress={submit} />}
    </View>
  );
}

function Simulator({ demo }: { demo: boolean }) {
  const [base, setBase] = useState('10000');
  const [subRate, setSubRate] = useState('');
  const [res, setRes] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const b = Math.round(numIn(base));
    if (!(b > 0)) return showAlert('Geçersiz matrah', 'Pozitif bir elmas miktarı gir.');
    const sr = subRate.trim() ? pctIn(subRate) : undefined;
    if (sr !== undefined && !(sr >= 0)) return showAlert('Geçersiz oran', 'Alt ajans oranını yüzde olarak gir veya boş bırak.');
    if (demo) return runAction(true, async () => {});
    setBusy(true);
    try {
      setRes(
        await centerNet.simulate({
          base: b,
          ...(sr !== undefined ? { subRate: sr } : {}),
        }),
      );
    } catch (e) {
      showAlert('Hesaplanamadı', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Komisyon simülatörü">
      <Panel>
        <Text style={ns.dim}>Sunucunun kurallarıyla tek bir hediyenin dağılımını gösterir; kayıt oluşturmaz.</Text>
        <View style={st.simInputs}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={st.statLabel}>Hediye elması (matrah)</Text>
            <TextInput value={base} onChangeText={setBase} keyboardType="number-pad" style={ns.input} accessibilityLabel="Matrah" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={st.statLabel}>Alt ajans oranı (%)</Text>
            <TextInput
              value={subRate}
              onChangeText={setSubRate}
              keyboardType="decimal-pad"
              placeholder="Boş: yalnız üst ajans"
              placeholderTextColor={colors.textDim}
              style={ns.input}
              accessibilityLabel="Alt ajans oranı"
            />
          </View>
        </View>
        <Button small icon="calculator-outline" title={busy ? 'Hesaplanıyor' : 'Hesapla'} disabled={busy} onPress={go} />
        {res && (
          <View style={{ gap: 2 }}>
            {res.shares.map((x, i) => (
              <Line key={i} label={`${x.agency} · ${x.kind === 'direct' ? 'doğrudan' : 'fark'} ${fmtPct(x.rate)}`} value={`${fmtD(x.amount)} elmas`} />
            ))}
            <Line label={`Toplam ajans komisyonu · ${fmtPct(res.totalRate)}`} value={`${fmtD(res.pool)} elmas · ${fmtUsd(res.usd.pool)}`} strong />
            <Line label="Platformda kalan" value={`${fmtD(res.platformKeeps)} elmas`} />
            <Text style={st.foot}>Yayıncı hediye elmasının tamamını alır; komisyon platformun payından ödenir. Havuz sınırı {fmtPct(res.poolCap)}.</Text>
          </View>
        )}
      </Panel>
    </Section>
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
    backgroundColor: 'rgba(19,217,223,0.08)',
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
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
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
  cell: { width: 84, textAlign: 'center' },
  cellInput: { paddingVertical: 8 },
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
