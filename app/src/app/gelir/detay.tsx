import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EarningRow } from '@/app/gelir/index';
import { Art } from '@/components/Art';
import { Card } from '@/components/ui';
import { userById } from '@/data/mock';
import { usd } from '@/data/rules';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { useApp, type Earning, type EarningSource, type LedgerRow } from '@/store';
import { colors } from '@/theme';

type Main = 'diamonds' | 'gifts';
type Sub = 'system' | 'spend' | 'social';

const SYSTEM_SOURCES: EarningSource[] = ['Görev', 'Ajans bonusu', 'Oda sahibi bonusu', 'Aile bonusu', 'Arama bonusu'];
const SOCIAL_SOURCES: EarningSource[] = ['Hediye', 'Arama'];
const SUBS: [Sub, string][] = [
  ['system', 'Sistem Ödülleri'],
  ['spend', 'Elmas Giderleri'],
  ['social', 'Sosyal'],
];
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function EarningsDetail() {
  const { totalDiamonds, withdrawals, earnings, ledger } = useApp();
  const [main, setMain] = useState<Main>('diamonds');
  const [sub, setSub] = useState<Sub>('system');
  const [refreshing, setRefreshing] = useState(false);

  // Data is local state in this prototype; "refresh" only shows the spinner briefly.
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  const withdrawn = withdrawals.reduce((s, w) => s + w.diamonds, 0);
  const pendingWithdraw = withdrawals.filter((w) => w.status === 'Beklemede').reduce((s, w) => s + w.diamonds, 0);
  // The store has no "uncollected income" concept yet (e.g. weekly bonuses awaiting settlement) → always 0.
  const uncollected = 0;

  const system = earnings.filter((e) => SYSTEM_SOURCES.includes(e.source));
  const social = earnings.filter((e) => SOCIAL_SOURCES.includes(e.source));
  const spends = ledger.filter((l) => l.currency === 'diamond' && l.amount < 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Kazanç Detayları</Text>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['diamonds', 'Elmas Detayları'],
            ['gifts', 'Hediye Alım Detayı'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setMain(k)} style={[styles.tab, main === k && styles.tabActive]}>
            <Text style={[styles.tabText, main === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primaryText} />}
      >
        {main === 'diamonds' ? (
          <>
            <View style={styles.summary}>
              <SummaryRow label="Birikmiş gelir" value={`+${fmt(totalDiamonds)}`} hint={usd(totalDiamonds)} />
              <SummaryRow label="Birikmiş çekilme" value={fmt(withdrawn)} hint={pendingWithdraw ? `${fmt(pendingWithdraw)} beklemede` : usd(withdrawn)} />
              <SummaryRow
                label="Toplanmamış Gelir"
                value={fmt(uncollected)}
                onInfo={() =>
                  showAlert(
                    'Toplanmamış Gelir',
                    'Kazanılmış ancak henüz elmas bakiyene aktarılmamış gelirdir (ör. haftalık hesaplanan aile ve ajans bonusları, incelemedeki işlemler). Hesaplama tamamlanınca otomatik olarak bakiyene eklenir.',
                  )
                }
              />
            </View>

            <View style={styles.subTabs}>
              {SUBS.map(([k, l]) => (
                <Pressable key={k} onPress={() => setSub(k)} style={styles.subTab}>
                  <Text style={[styles.subText, sub === k && styles.subActive]}>{l}</Text>
                  <View style={[styles.subBar, sub === k && { backgroundColor: colors.primary }]} />
                </Pressable>
              ))}
            </View>

            <View style={styles.list}>
              {sub === 'system' && (system.length ? system.map((e) => <EarningRow key={e.id} e={e} />) : <Empty onRetry={refresh} />)}
              {sub === 'social' && (social.length ? social.map((e) => <EarningRow key={e.id} e={e} />) : <Empty onRetry={refresh} />)}
              {sub === 'spend' && (spends.length ? spends.map((l) => <SpendRow key={l.id} l={l} />) : <Empty onRetry={refresh} />)}
            </View>
          </>
        ) : (
          <GiftReceipts earnings={earnings} onRetry={refresh} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, hint, onInfo }: { label: string; value: string; hint?: string; onInfo?: () => void }) {
  return (
    <View style={styles.sumRow}>
      <Text style={{ fontSize: 16 }}>💎</Text>
      <Text style={styles.sumLabel}>{label}</Text>
      {onInfo && (
        <Pressable onPress={onInfo} hitSlop={8}>
          <Ionicons name="help-circle-outline" size={18} color={colors.textDim} />
        </Pressable>
      )}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.sumValue}>{value}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
    </View>
  );
}

function SpendRow({ l }: { l: LedgerRow }) {
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{l.reason}</Text>
        <Text style={styles.dim}>
          {l.ref} · Bugün {l.time}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.rowTitle, { color: colors.red }]}>{fmt(l.amount)} 💎</Text>
        <Text style={[styles.dim, { color: l.status === 'Beklemede' ? colors.gold : colors.textDim }]}>{l.status}</Text>
      </View>
    </Card>
  );
}

function GiftReceipts({ earnings, onRetry }: { earnings: Earning[]; onRetry: () => void }) {
  const gifts = earnings.filter((e) => e.source === 'Hediye');
  if (!gifts.length)
    return (
      <View style={styles.list}>
        <Empty onRetry={onRetry} />
      </View>
    );
  // Group by the gift stored with each earning (Lucky apart) and list the top senders for each.
  const groups = new Map<string, { label: string; count: number; total: number; senders: Map<string, number> }>();
  gifts.forEach((e) => {
    const g = e.gift;
    const key = g ? `${g.id}${g.lucky ? ':lucky' : ''}` : 'unknown';
    const cur = groups.get(key) ?? { label: g ? `${g.emoji} ${g.name}${g.lucky ? ' (Lucky)' : ''}` : '🎁 Hediye (eski kayıt)', count: 0, total: 0, senders: new Map<string, number>() };
    cur.count += g?.count ?? 1;
    cur.total += e.amount;
    if (e.fromId) cur.senders.set(e.fromId, (cur.senders.get(e.fromId) ?? 0) + 1);
    groups.set(key, cur);
  });
  const rows = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  return (
    <View style={[styles.list, { paddingTop: 14 }]}>
      <Text style={styles.dim}>
        Toplam {fmt(gifts.length)} hediye · +{fmt(gifts.reduce((s, e) => s + e.amount, 0))} 💎
      </Text>
      {rows.map(([key, g]) => {
        const top = [...g.senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        return (
          <Card key={key} style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowTitle}>
                {g.label} x{g.count}
              </Text>
              <Text style={{ color: '#5EEAF0', fontWeight: '600' }} numberOfLines={1}>
                {top.map(([id, n]) => `${userById(id).name} (${n})`).join(', ') || '—'}
              </Text>
            </View>
            <Text style={styles.rowTitle}>+{fmt(g.total)} 💎</Text>
          </Card>
        );
      })}
    </View>
  );
}

function Empty({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <Art name="maskot-bos-durum-maskotu" size={72} />
      <Text style={[styles.dim, { fontSize: 15 }]}>Veri yok</Text>
      <Text style={[styles.dim, { textAlign: 'center' }]}>Lütfen Yeniden Dene butonuna tıklayın{'\n'}veya listeyi aşağı çekerek yenileyin</Text>
      <Pressable onPress={onRetry} style={styles.retry}>
        <Text style={{ color: '#5EEAF0', fontWeight: '800', fontSize: 16 }}>Yeniden dene</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textDim, fontSize: 16, fontWeight: '700' },
  summary: { paddingHorizontal: 16, paddingTop: 10, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  sumLabel: { color: '#fff', fontSize: 16 },
  sumValue: { color: '#fff', fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12 },
  subTabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 22, paddingTop: 12 },
  subTab: { alignItems: 'center', gap: 6 },
  subText: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  subActive: { color: '#fff', fontWeight: '800' },
  subBar: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  retry: { marginTop: 10, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 30, paddingVertical: 12 },
});
