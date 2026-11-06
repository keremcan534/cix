// Yönetim: the owner's panel in a live build, opened from Ayarlar for admin accounts (lib/live/admin useIsAdmin).
// A full-screen sheet, not a route: Özet, Canlı ayarlar, Para çekme, Ajans ödemeleri, Şikâyetler, İadeler and
// Yaptırımlar on the server's admin routes. Every money or account action asks first, then shows a short result and reloads
// its list. Yaptırımlar shows only when the sanctions meta answers (sanction.view; a 403 hides it); one person's
// sanctions open over the tabs, and custom sheets (apply, appeal decision, policy editor) over everything.
// Canlı ayarlar shows only for admins whose GET /api/admin/live-settings answers (a 403 hides it).
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { type Pending } from '@/lib/admin-format';
import { ApiError } from '@/lib/api';
import * as admin from '@/lib/live/admin';
import { type SanctionMeta } from '@/lib/sanction-format';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { AccountSheet } from './account-sheet';
import { AgencyPayoutsSection } from './agency-payouts';
import { LiveSettingsSection, loadLiveAccess, type LiveAccess } from './live-settings';
import { OverviewSection, type Tab } from './overview';
import { AdminContext, InputSheet, LoadState, SectionScroll, Toast, useLoad, type AdminCtx, type Load, type SheetSpec } from './parts';
import { RefundsSection } from './refunds';
import { ReportsSection } from './reports';
import { SanctionUserScreen } from './sanction-user';
import { SanctionsSection } from './sanctions';
import { WithdrawalsSection } from './withdrawals';

const TABS: { key: Tab; label: string; count?: keyof Pending }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'ayarlar', label: 'Canlı ayarlar' },
  { key: 'cekim', label: 'Para çekme', count: 'withdrawals' },
  { key: 'ajans', label: 'Ajans ödemeleri', count: 'payouts' },
  { key: 'sikayet', label: 'Şikâyetler', count: 'reports' },
  { key: 'iade', label: 'İadeler' },
  { key: 'yaptirim', label: 'Yaptırımlar' },
];

/** The sanctions meta and what waits there (tab badge); meta null when this staff member has no sanction.view. */
async function loadSanctionMeta(): Promise<{ meta: SanctionMeta | null; waiting?: number }> {
  try {
    const meta = await admin.sanctionMeta();
    // What waits for this person: approvals they may give and open appeals they may review.
    const [p, a] = await Promise.allSettled([
      meta.perms.includes('sanction.approve') ? admin.pendingSanctions() : Promise.resolve([]),
      meta.perms.includes('sanction.appeal') ? admin.appeals('open') : Promise.resolve([]),
    ]);
    const waiting = (p.status === 'fulfilled' ? p.value.length : 0) + (a.status === 'fulfilled' ? a.value.length : 0);
    return { meta, waiting };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { meta: null };
    throw e;
  }
}

type Person = { id: string; name: string };

const noLive = async (): Promise<LiveAccess> => ({ view: null });

/** What waits for the owner; a part that can't be read stays undefined (shown as –, no badge). */
async function loadPending(): Promise<Partial<Pending>> {
  const [r, w, p] = await Promise.allSettled([admin.reports('open'), admin.withdrawals('pending'), admin.agencyPayouts()]);
  return {
    reports: r.status === 'fulfilled' ? r.value.length : undefined,
    withdrawals: w.status === 'fulfilled' ? w.value.rows.length : undefined,
    payouts: p.status === 'fulfilled' ? p.value.filter((x) => x.status === 'pending' || x.status === 'ready').length : undefined,
  };
}

/** `moderator`: only the sanctions tab (the other tabs are the admin's). */
export function AdminPanel({ visible, onClose, moderator = false }: { visible: boolean; onClose: () => void; moderator?: boolean }) {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [account, setAccount] = useState<Person | null>(null);
  const [custom, setCustom] = useState<ReactNode | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  // Android's back button closes the sheet on top first, then one person's sanctions, then the panel.
  const back = () => {
    if (sheet) setSheet(null);
    else if (custom) setCustom(null);
    else if (account) setAccount(null);
    else if (person) setPerson(null);
    else onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      {visible && (
        <PanelBody
          moderator={moderator}
          onClose={() => {
            setCustom(null);
            setPerson(null);
            onClose();
          }}
          sheet={sheet}
          setSheet={setSheet}
          account={account}
          setAccount={setAccount}
          custom={custom}
          setCustom={setCustom}
          person={person}
          setPerson={setPerson}
        />
      )}
    </Modal>
  );
}

function PanelBody({
  moderator,
  onClose,
  sheet,
  setSheet,
  account,
  setAccount,
  custom,
  setCustom,
  person,
  setPerson,
}: {
  moderator: boolean;
  onClose: () => void;
  sheet: SheetSpec | null;
  setSheet: (s: SheetSpec | null) => void;
  account: Person | null;
  setAccount: (a: Person | null) => void;
  custom: ReactNode | null;
  setCustom: (n: ReactNode | null) => void;
  person: Person | null;
  setPerson: (p: Person | null) => void;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const [tab, setTab] = useState<Tab>(moderator ? 'yaptirim' : 'ozet');
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const pending = useLoad(loadPending);
  const sanctions = useLoad(loadSanctionMeta);
  const isAdmin = admin.useIsAdmin();
  const live = useLoad<LiveAccess>(moderator ? noLive : loadLiveAccess);
  const meta = sanctions.data?.meta ?? null;
  // Shown once the meta answers, or after a failure other than 403 (the tab offers Tekrar dene); hidden on a 403.
  const showSanctions = !!meta || !!sanctions.error;
  // Canlı ayarlar: admins only, same rule (a 403 from the server hides the tab).
  const showLive = isAdmin && !moderator && (!!live.data?.view || !!live.error);
  const tabs = moderator
    ? TABS.filter((t) => t.key === 'yaptirim')
    : TABS.filter((t) => (t.key !== 'yaptirim' || showSanctions) && (t.key !== 'ayarlar' || showLive));

  const ctx: AdminCtx = {
    toast: (text) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 })),
    ask: setSheet,
    openAccount: (id, name) => setAccount({ id, name }),
    changed: () => {
      pending.reload();
      sanctions.reload();
    },
    canSanction: !!meta,
    openSanctions: (id, name) => {
      setAccount(null);
      setPerson({ id, name });
    },
    present: setCustom,
  };

  return (
    <AdminContext.Provider value={ctx}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {person && meta && <SanctionUserScreen key={person.id} id={person.id} name={person.name} meta={meta} onClose={() => setPerson(null)} />}
        {/* The tabs stay mounted under one person's screen, so a search or filter is still there after Geri. */}
        <View style={[{ flex: 1 }, person && meta ? { display: 'none' } : null]}>
          <Header
            title="Yönetim"
            onBack={() => {
              setSheet(null);
              setAccount(null);
              onClose();
            }}
          />
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} accessibilityRole="tablist">
              {tabs.map((t) => {
                const on = t.key === tab;
                const n = t.key === 'yaptirim' ? sanctions.data?.waiting : t.count ? pending.data?.[t.count] : undefined;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={n ? `${t.label}, ${n} bekliyor` : t.label}
                    style={[s.tab, on && s.tabOn]}
                  >
                    <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
                    {!!n && (
                      <View style={[s.badge, on && s.badgeOn]}>
                        <Text style={[s.badgeText, on && s.badgeTextOn]}>{n > 99 ? '99+' : n}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={{ flex: 1 }}>
            {tab === 'ayarlar' && <LiveSettingsSection load={live} />}
            {tab === 'ozet' && <OverviewSection pending={pending.data} onPending={pending.reload} goTo={setTab} />}
            {tab === 'sikayet' && <ReportsSection />}
            {tab === 'cekim' && <WithdrawalsSection />}
            {tab === 'ajans' && <AgencyPayoutsSection />}
            {tab === 'iade' && <RefundsSection />}
            {tab === 'yaptirim' && <SanctionsTab load={sanctions} />}
          </View>
        </View>
        {account && <AccountSheet key={account.id} id={account.id} name={account.name} onClose={() => setAccount(null)} />}
        {custom}
        {sheet && <InputSheet key={sheet.title} spec={sheet} onClose={() => setSheet(null)} />}
        {toast && <Toast key={toast.n} text={toast.text} onDone={() => setToast(null)} />}
      </SafeAreaView>
    </AdminContext.Provider>
  );
}

/** Yaptırımlar once its meta is read; the calm loading / error state until then (each view has its own scroll). */
function SanctionsTab({ load }: { load: Load<{ meta: SanctionMeta | null }> }) {
  if (load.data?.meta) return <SanctionsSection meta={load.data.meta} onMeta={load.reload} />;
  return (
    <SectionScroll load={load}>
      <LoadState
        load={load}
        empty={() => ({
          icon: 'lock-closed-outline',
          title: 'Yaptırım yetkin yok',
          text: 'Bu bölüm için yaptırım görüntüleme yetkisi gerekir.',
        })}
      >
        {() => null}
      </LoadState>
    </SectionScroll>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface }) => ({
  tabs: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
    borderBottomWidth: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: surface.rim,
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  tabTextOn: { color: '#FFFFFF' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.money,
  },
  badgeOn: { backgroundColor: '#FFFFFF' },
  badgeText: {
    color: semantic.moneyInk,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  badgeTextOn: { color: colors.primary },
}));
