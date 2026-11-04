// Yönetim: the owner's panel in a live build, opened from Ayarlar for admin accounts (lib/live/admin useIsAdmin).
// A full-screen sheet, not a route: Özet, Şikâyetler, Para çekme, Ajans ödemeleri and İadeler on the server's
// admin routes. Every money or account action asks first, then shows a short result and reloads its list.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { type Pending } from '@/lib/admin-format';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { AccountSheet } from './account-sheet';
import { AgencyPayoutsSection } from './agency-payouts';
import { OverviewSection, type Tab } from './overview';
import { AdminContext, InputSheet, Toast, useLoad, type AdminCtx, type SheetSpec } from './parts';
import { RefundsSection } from './refunds';
import { ReportsSection } from './reports';
import { WithdrawalsSection } from './withdrawals';

const TABS: { key: Tab; label: string; count?: keyof Pending }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'cekim', label: 'Para çekme', count: 'withdrawals' },
  { key: 'ajans', label: 'Ajans ödemeleri', count: 'payouts' },
  { key: 'sikayet', label: 'Şikâyetler', count: 'reports' },
  { key: 'iade', label: 'İadeler' },
];

/** What waits for the owner; a part that can't be read stays undefined (shown as –, no badge). */
async function loadPending(): Promise<Partial<Pending>> {
  const [r, w, p] = await Promise.allSettled([admin.reports('open'), admin.withdrawals('pending'), admin.agencyPayouts()]);
  return {
    reports: r.status === 'fulfilled' ? r.value.length : undefined,
    withdrawals: w.status === 'fulfilled' ? w.value.rows.length : undefined,
    payouts: p.status === 'fulfilled' ? p.value.filter((x) => x.status === 'pending' || x.status === 'ready').length : undefined,
  };
}

export function AdminPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null);
  // Android's back button closes the sheet on top first, then the panel.
  const back = () => {
    if (sheet) setSheet(null);
    else if (account) setAccount(null);
    else onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      {visible && <PanelBody onClose={onClose} sheet={sheet} setSheet={setSheet} account={account} setAccount={setAccount} />}
    </Modal>
  );
}

function PanelBody({
  onClose,
  sheet,
  setSheet,
  account,
  setAccount,
}: {
  onClose: () => void;
  sheet: SheetSpec | null;
  setSheet: (s: SheetSpec | null) => void;
  account: { id: string; name: string } | null;
  setAccount: (a: { id: string; name: string } | null) => void;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const [tab, setTab] = useState<Tab>('ozet');
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const pending = useLoad(loadPending);

  const ctx: AdminCtx = {
    toast: (text) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 })),
    ask: setSheet,
    openAccount: (id, name) => setAccount({ id, name }),
    changed: pending.reload,
  };

  return (
    <AdminContext.Provider value={ctx}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
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
            {TABS.map((t) => {
              const on = t.key === tab;
              const n = t.count ? pending.data?.[t.count] : undefined;
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
          {tab === 'ozet' && <OverviewSection pending={pending.data} onPending={pending.reload} goTo={setTab} />}
          {tab === 'sikayet' && <ReportsSection />}
          {tab === 'cekim' && <WithdrawalsSection />}
          {tab === 'ajans' && <AgencyPayoutsSection />}
          {tab === 'iade' && <RefundsSection />}
        </View>
        {account && <AccountSheet key={account.id} id={account.id} name={account.name} onClose={() => setAccount(null)} />}
        {sheet && <InputSheet key={sheet.title} spec={sheet} onClose={() => setSheet(null)} />}
        {toast && <Toast key={toast.n} text={toast.text} onDone={() => setToast(null)} />}
      </SafeAreaView>
    </AdminContext.Provider>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface }) => ({
  tabs: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm, borderBottomWidth: 0 },
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
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.money },
  badgeOn: { backgroundColor: '#FFFFFF' },
  badgeText: { color: semantic.moneyInk, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badgeTextOn: { color: colors.primary },
}));
