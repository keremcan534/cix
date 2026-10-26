// Coins Bank – central virtual-economy screen (PROTOTYPE: mock data, no real payments).
// Coins (bought, spent on gifts), Diamonds (creator earnings) and Bonus Credits (promotions, not
// withdrawable) are separate currencies. Creator earnings are never reduced by agency/BD commissions;
// those are separate platform liabilities. Payout state lives in src/lib/bank.ts.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { AGENCIES, AGENCY_MEMBERS } from '@/data/agency';
import {
  AGENCY_PAST,
  AGENCY_PAYOUT_HISTORY,
  BD_HIDDEN_ENTRIES,
  BD_LINKS,
  BD_PAST,
  BD_PAYOUT_HISTORY,
  BONUS_BALANCE,
  BONUS_LEDGER,
  CURRENT_PERIOD,
  PERIOD_RANGE,
  agencyCurrentRow,
  bdCurrent,
  type MockPayout,
} from '@/data/bank-mock';
import { RULES, pct, settlement, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import {
  ENTRY_EFFECT,
  PROVIDERS,
  approvePayout,
  blockedFor,
  completePayout,
  createPayout,
  failPayout,
  getPayout,
  paidFor,
  rejectPayout,
  rejectedFor,
  saveAccount,
  setBdView,
  unlinkedWithdrawals,
  useBank,
  validatePayout,
  verifyAccount,
  weeklyUsedFor,
  type AccountKind,
  type BankState,
  type Payout,
  type Provider,
  type Scope,
} from '@/lib/bank';
import { useApp } from '@/store';
import { colors } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

type Tab = 'wallet' | 'creator' | 'agency' | 'bd' | 'rules';
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'wallet', label: 'Cüzdanım', icon: 'wallet' },
  { key: 'creator', label: 'Yayıncı', icon: 'mic' },
  { key: 'agency', label: 'Ajans', icon: 'business' },
  { key: 'bd', label: 'BD', icon: 'git-network' },
  { key: 'rules', label: 'Kurallar & Denetim', icon: 'shield-checkmark' },
];

const fmt = (n: number) => n.toLocaleString('tr-TR');
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const dia = (n: number) => `${fmt(n)} 💎`;
const sumD = (xs: { diamonds: number }[]) => xs.reduce((s, x) => s + x.diamonds, 0);

const STATUS_COLOR: Record<string, string> = {
  'Manuel inceleme': colors.gold,
  Onaylandı: '#38BDF8',
  Ödendi: colors.green,
  Başarısız: colors.red,
  Reddedildi: colors.red,
  Bekliyor: colors.gold,
  Kesinleşti: '#38BDF8',
  Düzeltme: colors.primaryText,
  Başarılı: colors.green,
  Beklemede: colors.gold,
  İade: colors.primaryText,
  Aktif: colors.green,
  Kullanıldı: colors.textDim,
  'Süresi doldu': colors.textDim,
  Doğrulandı: colors.green,
  Doğrulanıyor: colors.gold,
  Doğrulanmadı: colors.red,
};

// --- derived balances (pure) --------------------------------------------------------
function agencyNumbers(bank: BankState) {
  const current = agencyCurrentRow();
  const rows = [current, ...AGENCY_PAST];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const pending = current.amount;
  const final = total - pending;
  const blocked = blockedFor(bank, 'agency');
  const paid = sumD(AGENCY_PAYOUT_HISTORY.filter((p) => p.status === 'Ödendi')) + paidFor(bank, 'agency');
  const rejected = sumD(AGENCY_PAYOUT_HISTORY.filter((p) => p.status === 'Reddedildi')) + rejectedFor(bank, 'agency');
  return { current, rows, total, pending, final, blocked, paid, rejected, available: Math.max(0, final - paid - blocked), unpaid: Math.max(0, total - paid) };
}

function bdNumbers(bank: BankState) {
  const cur = bdCurrent();
  const rows = [...cur.rows, ...BD_PAST.rows];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const pending = cur.rows.reduce((s, r) => s + r.amount, 0);
  const final = total - pending;
  const blocked = blockedFor(bank, 'bd');
  const paid = sumD(BD_PAYOUT_HISTORY.filter((p) => p.status === 'Ödendi')) + paidFor(bank, 'bd');
  const rejected = rejectedFor(bank, 'bd');
  const dupes = [...cur.blocked, ...BD_PAST.blocked];
  return { rows, total, pending, final, blocked, paid, rejected, dupes, available: Math.max(0, final - paid - blocked), unpaid: Math.max(0, total - paid) };
}

// --- screen -------------------------------------------------------------------------
export default function CoinsBankScreen() {
  const [tab, setTab] = useState<Tab>('wallet');
  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Coins Bank"
        right={
          <View style={styles.protoPill}>
            <Text style={styles.protoPillText}>PROTOTİP</Text>
          </View>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Ionicons name={t.icon} size={15} color={tab === t.key ? '#fff' : colors.textDim} />
            <Text style={[styles.tabText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <Ionicons name="flask" size={16} color={colors.gold} />
          <Text style={styles.bannerText}>Demo: tüm tutarlar örnek veridir, gerçek ödeme veya para transferi yapılmaz. Gerçek sistemde tüm doğrulamalar sunucuda çalışır.</Text>
        </View>
        {tab === 'wallet' && <WalletTab />}
        {tab === 'creator' && <CreatorTab />}
        {tab === 'agency' && <AgencyTab />}
        {tab === 'bd' && <BdTab />}
        {tab === 'rules' && <RulesTab />}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- 1) Wallet -----------------------------------------------------------------------
function WalletTab() {
  const { coins, diamonds, ledger, rules } = useApp();
  const [filter, setFilter] = useState<'all' | 'coin' | 'diamond'>('all');
  const rows = ledger.filter((r) => filter === 'all' || r.currency === filter).slice(0, 25);
  const cashable = rules.bonusCashable > 0;
  return (
    <>
      <LinearGradient colors={['#1F3050', '#16253C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroLabel}>Jeton bakiyesi</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon3D name="coin" size={40} />
          <Text style={styles.heroN}>{fmt(coins)}</Text>
        </View>
        <Text style={styles.heroSub}>Jetonlar satın alınır ve hediyelerde harcanır. Nakde çevrilmez.</Text>
        <Pressable style={styles.heroBtn} onPress={() => router.push('/cuzdan')} accessibilityLabel="Jeton yükle">
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.heroBtnText}>Jeton yükle</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.grid}>
        <Stat label="Bonus Kredi" value={`🎟️ ${fmt(BONUS_BALANCE)}`} sub={cashable ? `${pct(rules.bonusCashable)} çekilebilir` : 'Çekilemez · yalnız uygulama içi'} color={colors.primaryText} />
        <Stat label="Elmas (ayrı birim)" value={dia(diamonds)} sub={`≈ ${usd(diamonds)} · Yayıncı sekmesi`} color="#7DD3FC" />
      </View>

      <Card style={{ gap: 8 }}>
        <SectionTitle icon="information-circle" title="Para birimleri" />
        <Bullet text="🪙 Jeton: satın alınır, hediye ve mağazada harcanır. Para çekmeye konu olmaz." />
        <Bullet text={`💎 Elmas: yayıncının kazanç ölçüsü; jetondan ayrıdır. Hediye jetonu başına ${rules.creatorDiamondsPerCoin} 💎, ${fmt(rules.diamondsPerUsd)} 💎 = $1.`} />
        <Bullet text={`🎟️ Bonus Kredi: kampanya bakiyesi. ${cashable ? `En fazla ${pct(rules.bonusCashable)} nakde çevrilebilir.` : 'Varsayılan olarak çekilemez (bonusCashable = 0).'}`} />
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="pricetags" title="Bonus defteri" />
        {BONUS_LEDGER.map((b) => (
          <View key={b.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{b.reason}</Text>
              <Text style={styles.mono}>
                {b.ref} · {b.time}
                {b.expires ? ` · son: ${b.expires}` : ''} · v{b.ruleVersion}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.amount, { color: b.amount >= 0 ? colors.green : colors.red }]}>
                {b.amount >= 0 ? '+' : ''}
                {fmt(b.amount)} 🎟️
              </Text>
              <Badge text={b.status} />
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="receipt" title="Son hareketler" />
        <View style={styles.chips}>
          {(['all', 'coin', 'diamond'] as const).map((f) => (
            <Chip key={f} label={f === 'all' ? 'Tümü' : f === 'coin' ? 'Jeton' : 'Elmas'} on={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
        {rows.length === 0 ? (
          <Text style={[styles.dim, { paddingVertical: 12 }]}>Henüz hareket yok. Jeton yüklediğinde veya hediye gönderdiğinde her işlem benzersiz bir TX numarasıyla burada görünür.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.reason}</Text>
                <Text style={styles.mono}>
                  {r.ref} · Bugün {r.time}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.amount, { color: r.amount >= 0 ? colors.green : colors.red }]}>
                  {r.amount >= 0 ? '+' : ''}
                  {fmt(r.amount)} {r.currency === 'coin' ? '🪙' : '💎'}
                </Text>
                <Badge text={r.status} />
              </View>
            </View>
          ))
        )}
        <Pressable onPress={() => router.push('/cuzdan')} style={styles.linkRow}>
          <Text style={styles.link}>Tüm hareketler ve jeton paketleri</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </Pressable>
      </Card>
    </>
  );
}

// --- 2) Creator earnings ---------------------------------------------------------------
function CreatorTab() {
  const { isHost, becomeHost, diamonds, totalDiamonds, earnings, withdrawals, requestWithdraw, rules } = useApp();
  const bank = useBank();
  if (!isHost)
    return (
      <LockedCard
        icon="mic-off"
        title="Yayıncı kazancın yok"
        text="Hediye ve aramalardan elmas kazanmak için yayıncı merkezini aç. Kazançların, bekleyen/kesinleşmiş tutarların ve ödeme taleplerin burada yönetilir."
        action="Yayıncı merkezini aç (demo)"
        onPress={becomeHost}
      />
    );

  const blocked = blockedFor(bank, 'creator');
  const legacy = unlinkedWithdrawals(withdrawals, bank.payouts);
  const legacySum = sumD(legacy);
  // Demo split: this session's earnings are all from today, i.e. inside the pending window.
  const pending = Math.min(totalDiamonds, earnings.reduce((s, e) => s + e.amount, 0));
  const final = totalDiamonds - pending;
  const available = Math.max(0, diamonds - blocked);
  const completed = paidFor(bank, 'creator') + legacySum;
  const rejected = rejectedFor(bank, 'creator');

  // Settles an approved payout through the app store's existing withdraw (deducts diamonds there).
  const finalize = (p: Payout) => {
    const err = requestWithdraw(p.diamonds, p.account.legacyRef);
    if (err) {
      failPayout(p.id, `Cüzdan reddetti: ${err}`);
      return err;
    }
    completePayout(p.id, { diamonds: p.diamonds, iban: p.account.legacyRef });
    return null;
  };

  return (
    <>
      <SectionTitle icon="stats-chart" title="Kazançlarım" />
      <View style={styles.grid}>
        <Stat label="Toplam kazanç" value={dia(totalDiamonds)} sub={usd(totalDiamonds)} color="#7DD3FC" />
        <Stat label="Bekleyen kazanç" value={dia(pending)} sub={`Son ${rules.pendingDays} gün · ${usd(pending)}`} color={colors.gold} />
        <Stat label="Kesinleşmiş kazanç" value={dia(final)} sub={usd(final)} color={colors.green} />
        <Stat label="Çekilebilir bakiye" value={dia(available)} sub={usd(available)} color="#fff" />
        <Stat label="Ödeme sürecinde" value={dia(blocked)} sub={`Bloke · ${usd(blocked)}`} color={colors.gold} />
        <Stat label="Tamamlanan ödemeler" value={dia(completed)} sub={usd(completed)} color={colors.green} />
        <Stat label="Reddedilen / başarısız" value={dia(rejected)} sub="Blokajı çözüldü" color={colors.red} />
      </View>
      <Note text={`Bekleyen kazanç iade/ters ibraz penceresindedir (${rules.pendingDays} gün). Ajans ve BD komisyonları yayıncı kazancından kesilmez; platform ayrıca öder.`} />

      <PayoutAccountCard scope="creator" />
      <PayoutForm scope="creator" available={available} legacyWeekly={legacySum} />
      <PayoutHistory scope="creator" finalize={finalize}>
        {legacy.map((w) => (
          <MockPayoutRow key={w.id} p={{ ref: `WD-${w.id.slice(-6).replace('.', '')}`, diamonds: w.diamonds, status: w.status === 'Onaylandı' ? 'Ödendi' : 'Beklemede', time: `Bugün ${w.time}`, account: `IBAN •••• ${w.iban.replace(/\s/g, '').slice(-4)}`, note: `Klasik çekim (/yayinci/cek) · ${w.status}` }} />
        ))}
      </PayoutHistory>
    </>
  );
}

// --- 3) Agency commission --------------------------------------------------------------
function AgencyTab() {
  const { agencyRole, ownedAgency, rules } = useApp();
  const bank = useBank();
  const isOwner = agencyRole === 'owner' || ownedAgency?.status === 'Onaylandı';
  if (!isOwner)
    return (
      <LockedCard
        icon="lock-closed"
        title="Ajans defteri kilitli"
        text="Bu bölüm yalnızca ajans sahiplerine açıktır. Ajans sahibi olduğunda yalnızca kendi ajansının komisyon defterini, bağlı yayıncı raporunu ve ödemelerini görürsün; başka ajansların verileri gösterilmez."
        action="Ajans merkezine git"
        onPress={() => router.push('/ajans')}
      />
    );

  const a = agencyNumbers(bank);
  const ex = settlement(100_000, true);
  return (
    <>
      <Card style={{ gap: 4 }}>
        <Text style={styles.cardTitle}>🏢 {ownedAgency?.name ?? 'Ajansım'}</Text>
        <Text style={styles.dim}>Kapsam: yalnızca kendi ajansın{ownedAgency?.code ? ` · Kod ${ownedAgency.code}` : ''}</Text>
      </Card>
      <View style={styles.grid}>
        <Stat label="Toplam komisyon" value={dia(a.total)} sub={usd(a.total)} color="#7DD3FC" />
        <Stat label="Kesinleşmiş" value={dia(a.final)} sub={usd(a.final)} color={colors.green} />
        <Stat label="Bekleyen" value={dia(a.pending)} sub={`${CURRENT_PERIOD} · ${usd(a.pending)}`} color={colors.gold} />
        <Stat label="Çekilebilir" value={dia(a.available)} sub={usd(a.available)} color="#fff" />
        <Stat label="Ödeme sürecinde" value={dia(a.blocked)} sub="Bloke" color={colors.gold} />
        <Stat label="Ödenen" value={dia(a.paid)} sub={usd(a.paid)} color={colors.green} />
      </View>

      <Card style={{ gap: 6 }}>
        <SectionTitle icon="calculator" title="Komisyon kuralı" />
        <KV k="Taban" v="Bağlı yayıncıların uygun elmas kazancı (hediye + arama). Platform bonusları hariç." />
        <KV k="Oran" v={`${pct(rules.agencyCommission)} · kural v${rules.version}`} />
        <KV k="Geçerlilik" v={`${rules.period} dönem · ${CURRENT_PERIOD} (${PERIOD_RANGE[CURRENT_PERIOD]})`} />
        <KV k="Değişiklik" v="Yeni oran yalnızca açık dönemden itibaren geçerlidir; kapanmış satırlar kendi oran ve sürümünü saklar." />
        <Note text={`Örnek: yayıncı ${dia(100_000)} = ${usd(ex.streamer)} kazanır. Ajans ${pct(rules.agencyCommission)} = ${usd(ex.commission)} ayrıca ödenir. Yayıncının kazancı azalmaz.`} />
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="people" title={`Uygun kazanç raporu · ${CURRENT_PERIOD}`} />
        {AGENCY_MEMBERS.map((m) => {
          const s = settlement(m.diamonds, true);
          return (
            <View key={m.user.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.user.name}</Text>
                <Text style={styles.dim}>
                  {m.status === 'active' ? 'Aktif' : m.status === 'passive' ? 'Pasif' : 'Yeni'} · katılım {m.joined}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{dia(s.streamer)}</Text>
                <Text style={[styles.dim, { color: colors.green }]}>+{dia(s.commission)} komisyon</Text>
              </View>
            </View>
          );
        })}
        <KV k="Toplam taban" v={`${dia(a.current.base)} → ${dia(a.current.amount)} (${usd(a.current.amount)})`} />
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="list" title="Komisyon geçmişi" />
        {a.rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.period}</Text>
              <Text style={styles.mono}>
                {r.ref} · taban {dia(r.base)} × {pct(r.rate)} · v{r.ruleVersion}
              </Text>
              {r.note && <Text style={styles.dim}>{r.note}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.amount, r.amount < 0 && { color: colors.red }]}>{dia(r.amount)}</Text>
              <Badge text={r.status} />
            </View>
          </View>
        ))}
      </Card>

      <PayoutAccountCard scope="agency" />
      <PayoutForm scope="agency" available={a.available} />
      <PayoutHistory scope="agency">
        {AGENCY_PAYOUT_HISTORY.map((p) => (
          <MockPayoutRow key={p.ref} p={p} />
        ))}
      </PayoutHistory>
    </>
  );
}

// --- 4) BD commission ------------------------------------------------------------------
function BdTab() {
  const { rules } = useApp();
  const bank = useBank();
  const toggle = (
    <Card style={[styles.row, { paddingVertical: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>BD görünümü (demo)</Text>
        <Text style={styles.dim}>Gerçekte yalnızca BD rolüne sahip hesaplar görür.</Text>
      </View>
      <Switch value={bank.bdView} onValueChange={setBdView} trackColor={{ false: colors.cardAlt, true: colors.primary }} thumbColor="#fff" />
    </Card>
  );
  if (!bank.bdView)
    return (
      <>
        {toggle}
        <LockedCard icon="git-network" title="BD komisyon defteri" text="Business Development (BD) temsilcileri getirdikleri ajansların uygun yayıncı tabanı üzerinden komisyon alır. Görmek için demo BD görünümünü aç." />
      </>
    );

  const b = bdNumbers(bank);
  const ex = settlement(100_000, true);
  const exBd = Math.round(100_000 * rules.bdCommission);
  const mine = BD_LINKS.filter((l) => l.mine);
  const agency = (id: string) => AGENCIES.find((x) => x.id === id);
  return (
    <>
      {toggle}
      <View style={styles.grid}>
        <Stat label="Toplam BD payı" value={dia(b.total)} sub={usd(b.total)} color="#7DD3FC" />
        <Stat label="Kesinleşmiş" value={dia(b.final)} sub={usd(b.final)} color={colors.green} />
        <Stat label="Bekleyen" value={dia(b.pending)} sub={CURRENT_PERIOD} color={colors.gold} />
        <Stat label="Çekilebilir" value={dia(b.available)} sub={usd(b.available)} color="#fff" />
        <Stat label="Ödeme sürecinde" value={dia(b.blocked)} sub="Bloke" color={colors.gold} />
        <Stat label="Ödenen" value={dia(b.paid)} sub={usd(b.paid)} color={colors.green} />
      </View>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="link" title="BD ↔ ajans ilişkileri" />
        {mine.map((l) => {
          const ag = agency(l.agencyId);
          return (
            <View key={l.agencyId} style={styles.row}>
              <Text style={{ fontSize: 24 }}>{ag?.logo}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {ag?.name} · {ag?.code}
                </Text>
                <Text style={styles.mono}>
                  {l.contract} · {l.since}&apos;den beri · {l.source}
                </Text>
              </View>
              <Badge text={l.status} />
            </View>
          );
        })}
        <Text style={styles.dim}>
          Kapsam dışı: {BD_LINKS.length - mine.length} ajans ({BD_HIDDEN_ENTRIES} kazanç kaydı) başka bir BD&apos;ye bağlı olduğu için gizlendi.
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <SectionTitle icon="calculator" title="BD komisyon kuralı" />
        <KV k="Oran" v={`${pct(rules.bdCommission)} · kural v${rules.version}`} />
        <KV k="Taban" v="Ajansın uygun yayıncı tabanı = o ajansa bağlı yayıncıların uygun elmas kazancı. Ajans komisyonu üzerinden hesaplanmaz (komisyon üstüne komisyon yok)." />
        <KV k="Tekillik" v="Her kazanç kaydı (earningId) için BD payı yalnızca bir kez hesaplanır." />
        <Note text={`Örnek: yayıncı ${dia(100_000)} = ${usd(ex.streamer)}, ajans ${usd(ex.commission)}, BD ${pct(rules.bdCommission)} = ${usd(exBd)}. Platform yükümlülüğü: ${usd(ex.platformTotal + exBd)}.`} />
      </Card>

      <Card style={{ gap: 4, borderWidth: 1, borderColor: 'rgba(255,101,118,0.4)' }}>
        <SectionTitle icon="shield" title={`Çift komisyon engellendi (${b.dupes.length})`} />
        {b.dupes.map((d) => (
          <View key={`${d.earningId}-${d.agencyId}-${d.period}`} style={styles.row}>
            <Ionicons name="ban" size={18} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {d.earningId} · {d.host}
              </Text>
              <Text style={styles.dim}>
                {agency(d.agencyId)?.name} · {d.period} · {d.note}
              </Text>
            </View>
            <Text style={[styles.amount, { color: colors.textDim, textDecorationLine: 'line-through' }]}>{dia(Math.round(d.diamonds * rules.bdCommission))}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="list" title="BD komisyon defteri" />
        {b.rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {agency(r.agencyId)?.name} · {r.period}
              </Text>
              <Text style={styles.mono}>
                {r.count} kazanç · taban {dia(r.base)} × {pct(r.rate)} · v{r.ruleVersion}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.amount}>{dia(r.amount)}</Text>
              <Badge text={r.status} />
            </View>
          </View>
        ))}
      </Card>

      <PayoutAccountCard scope="bd" />
      <PayoutForm scope="bd" available={b.available} />
      <PayoutHistory scope="bd">
        {BD_PAYOUT_HISTORY.map((p) => (
          <MockPayoutRow key={p.ref} p={p} />
        ))}
      </PayoutHistory>
    </>
  );
}

// --- 5) Rules & audit -------------------------------------------------------------------
const DB_TABLES: [string, string][] = [
  ['wallets', 'Kullanıcı başına jeton / elmas / bonus bakiyesi'],
  ['wallet_transactions', 'Her bakiye hareketi (benzersiz TX, kural sürümü)'],
  ['payment_orders', 'Mağaza satın alma siparişleri ve doğrulama'],
  ['gifts', 'Hediye kataloğu ve fiyatları'],
  ['gift_transactions', 'Gönderilen hediyeler (jeton → elmas)'],
  ['diamonds_ledger', 'Elmas giriş/çıkış defteri'],
  ['creator_earnings_ledger', 'Yayıncı kazançları: bekleyen / kesinleşmiş'],
  ['agency_earnings_ledger', 'Ajans komisyon satırları'],
  ['agency_commission_rules', 'Ajans oranı, tabanı, geçerlilik dönemi'],
  ['bd_commission_ledger', 'BD payları (earningId başına tek kayıt)'],
  ['bonus_ledger', 'Kampanya bonusları, kullanım ve süre sonu'],
  ['creator_payout_accounts', 'Yayıncı ödeme hesapları + doğrulama'],
  ['agency_payout_accounts', 'Ajans ödeme hesapları + doğrulama'],
  ['payout_requests', 'Çekim talepleri, idempotency anahtarı, blokaj'],
  ['payout_transactions', 'Banka / sağlayıcı transfer sonuçları'],
  ['financial_rules', 'Sürümlü finansal kurallar'],
  ['audit_logs', 'Değiştirilemez denetim kayıtları'],
];
const SECURITY_NOTES = [
  'Tüm tutar, limit ve yetki kontrolleri sunucuda yapılır; istemci yalnızca talep gönderir.',
  'Her talep idempotency anahtarı taşır; tekrar eden istek ilk sonucu döndürür, ikinci kayıt oluşmaz.',
  'Bakiye ve defter kaydı aynı veritabanı işleminde (atomik) güncellenir.',
  'Hatalar silinmez; ters kayıt (reversal) veya düzeltme kaydıyla giderilir.',
  'Olağandışı işlemler (ani yüksek çekim, yeni hesap + büyük tutar, çok sayıda iade) inceleme kuyruğuna düşer.',
  'Görevler ayrılığı: finansal kuralları düzenleyen kişi ödeme onaylayamaz.',
];

function RulesTab() {
  const { rules, ruleHistory, ledger, diamonds } = useApp();
  const bank = useBank();
  const a = agencyNumbers(bank);
  const b = bdNumbers(bank);
  const sold = ledger.filter((r) => r.currency === 'coin' && r.amount > 0 && r.reason.startsWith('Yükleme')).reduce((s, r) => s + r.amount, 0);
  const spent = ledger.filter((r) => r.currency === 'coin' && r.amount < 0).reduce((s, r) => s - r.amount, 0);
  const creatorBlocked = blockedFor(bank, 'creator');
  const liability = diamonds + a.unpaid + b.unpaid;
  const items: [string, string][] = [
    ['Yayıncı elmas / hediye jetonu', `${rules.creatorDiamondsPerCoin} 💎 / 🪙`],
    ['Elmas → USD', `${fmt(rules.diamondsPerUsd)} 💎 = $1`],
    ['Ajans komisyonu', `${pct(rules.agencyCommission)} (yayıncıdan kesilmez)`],
    ['BD komisyonu', `${pct(rules.bdCommission)} · ajansın uygun yayıncı tabanı`],
    ['Min. çekim / talep', `${dia(rules.minWithdrawDiamonds)} (${usd(rules.minWithdrawDiamonds)})`],
    ['Maks. çekim / talep', `${dia(rules.maxWithdrawDiamonds)} (${usd(rules.maxWithdrawDiamonds)})`],
    ['Haftalık çekim limiti', `${dia(rules.weeklyWithdrawLimitDiamonds)} (${usd(rules.weeklyWithdrawLimitDiamonds)})`],
    ['Otomatik onay eşiği', `< ${dia(rules.autoApproveUnderDiamonds)} · üstü manuel inceleme`],
    ['Bekleme süresi', `${rules.pendingDays} gün`],
    ['Bonus nakde çevrilebilir', rules.bonusCashable === 0 ? 'Hayır (0)' : pct(rules.bonusCashable)],
    ['Hesap dönemi', rules.period],
  ];
  return (
    <>
      <Card style={{ gap: 6 }}>
        <View style={styles.rowBetween}>
          <SectionTitle icon="document-text" title="Geçerli finansal kurallar" />
          <View style={styles.versionPill}>
            <Text style={styles.versionText}>v{rules.version}</Text>
          </View>
        </View>
        {items.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
        <Text style={styles.dim}>Salt okunur. Kurallar yönetim panelinde düzenlenir; her değişiklik yeni sürüm oluşturur ve yalnız ileriye dönük uygulanır.</Text>
        <Pressable onPress={() => router.push('/yonetim')} style={styles.linkRow}>
          <Text style={styles.link}>Yönetim paneline git</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </Pressable>
        {ruleHistory.slice(0, 5).map((h) => (
          <Text key={h.id} style={styles.mono}>
            {h.time} · v{h.version} · {h.field}: {h.from} → {h.to}
          </Text>
        ))}
      </Card>

      <Card style={{ gap: 6 }}>
        <SectionTitle icon="git-compare" title="Mutabakat (demo)" />
        <KV k="Satılan jeton (oturum)" v={`🪙 ${fmt(sold)} · yayıncı karşılığı ${usd(sold * rules.creatorDiamondsPerCoin)}`} />
        <KV k="Harcanan jeton (oturum)" v={`🪙 ${fmt(spent)}`} />
        <KV k="Yayıncı elmas yükümlülüğü" v={`${dia(diamonds)} · ${usd(diamonds)} (bloke ${usd(creatorBlocked)})`} />
        <KV k="Ajans komisyon yükümlülüğü" v={`${dia(a.unpaid)} · ${usd(a.unpaid)}`} />
        <KV k="BD komisyon yükümlülüğü" v={`${dia(b.unpaid)} · ${usd(b.unpaid)}`} />
        <KV k="Bonus kredi" v={rules.bonusCashable === 0 ? 'Nakit yükümlülüğü yok (çekilemez)' : `${usd(BONUS_BALANCE * rules.bonusCashable * rules.creatorDiamondsPerCoin)}`} />
        <View style={styles.divider} />
        <KV k="Toplam platform yükümlülüğü" v={`${usd(liability)}`} strong />
        <Text style={styles.dim}>Ajans ve BD payları yayıncı kazancından düşülmez; platformun ayrı yükümlülükleridir.</Text>
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="finger-print" title={`Denetim kaydı (${bank.audit.length})`} />
        {bank.audit.length === 0 ? (
          <Text style={styles.dim}>Henüz banka işlemi yok. Ödeme hesabı eklediğinde veya talep oluşturduğunda her adım burada kalıcı olarak kaydedilir.</Text>
        ) : (
          bank.audit.slice(0, 40).map((r) => (
            <View key={r.id} style={styles.auditRow}>
              <Text style={styles.auditTime}>{r.time}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.action}</Text>
                <Text style={styles.dim}>{r.detail}</Text>
                <Text style={styles.mono}>
                  {r.actor} · {r.ref} · v{r.ruleVersion}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="book" title="Banka defteri (blokaj / çözülme)" />
        {bank.entries.length === 0 ? (
          <Text style={styles.dim}>Kayıt yok.</Text>
        ) : (
          bank.entries.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {e.kind} · {e.payoutRef}
                </Text>
                <Text style={styles.mono}>
                  {e.ref} · {e.time} · {ENTRY_EFFECT[e.kind]} · v{e.ruleVersion}
                </Text>
              </View>
              <Text style={styles.amount}>{dia(e.amount)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionTitle icon="server" title="Önerilen veritabanı tabloları" />
        {DB_TABLES.map(([t, d]) => (
          <View key={t} style={{ paddingVertical: 3 }}>
            <Text style={styles.tableName}>{t}</Text>
            <Text style={styles.dim}>{d}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 6 }}>
        <SectionTitle icon="lock-closed" title="Güvenlik notları" />
        {SECURITY_NOTES.map((n) => (
          <Bullet key={n} text={n} />
        ))}
      </Card>
    </>
  );
}

// --- payout building blocks ----------------------------------------------------------------
function PayoutAccountCard({ scope }: { scope: Scope }) {
  const bank = useBank();
  const acc = bank.accounts[scope];
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<AccountKind>('bank');
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('TR');
  const [provider, setProvider] = useState<Provider>('Payoneer');
  const [handle, setHandle] = useState('');

  const save = () => {
    const doSave = () => {
      const err = saveAccount(scope, { kind, holder, iban, provider, handle });
      if (err) return showAlert('Hesap kaydedilemedi', err);
      setEditing(false);
      showAlert('Hesap kaydedildi', 'Talep oluşturabilmek için hesabı doğrulaman gerekir.');
    };
    if (acc)
      showAlert('Hesap değişikliği', 'Ödeme hesabı değişince yeniden doğrulama gerekir. Açık talepler kayıtlı oldukları hesapla devam eder.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Değiştir', onPress: doSave },
      ]);
    else doSave();
  };

  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle icon="card" title="Ödeme hesabı" />
      {acc ? (
        <View style={styles.row}>
          <Ionicons name={acc.kind === 'bank' ? 'business' : 'globe'} size={20} color={colors.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{acc.kind === 'bank' ? `IBAN ${acc.iban?.replace(/(.{4})/g, '$1 ').trim()}` : `${acc.provider} · ${acc.handle}`}</Text>
            <Text style={styles.dim}>
              {acc.holder} · eklendi {acc.created}
            </Text>
          </View>
          <Badge text={acc.status} />
        </View>
      ) : (
        <Text style={styles.dim}>Henüz ödeme hesabı yok. Para çekmek için doğrulanmış bir banka hesabı veya ödeme sağlayıcısı gerekir.</Text>
      )}
      {acc?.status === 'Doğrulanmadı' && <GradientButton small title="Hesabı doğrula (demo)" icon="shield-checkmark" onPress={() => verifyAccount(scope)} />}
      {acc?.status === 'Doğrulanıyor' && <Text style={[styles.dim, { color: colors.gold }]}>Doğrulanıyor… (ad-soyad eşleşmesi + mikro transfer)</Text>}
      {!editing ? (
        <Pressable onPress={() => setEditing(true)} style={styles.linkRow}>
          <Text style={styles.link}>{acc ? 'Hesabı değiştir' : 'Hesap ekle'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </Pressable>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={styles.chips}>
            <Chip label="Banka hesabı (IBAN)" on={kind === 'bank'} onPress={() => setKind('bank')} />
            <Chip label="Ödeme sağlayıcı" on={kind === 'provider'} onPress={() => setKind('provider')} />
          </View>
          <TextInput value={holder} onChangeText={setHolder} placeholder="Hesap sahibinin adı soyadı" placeholderTextColor={colors.textDim} style={styles.input} />
          {kind === 'bank' ? (
            <TextInput
              value={iban}
              onChangeText={(t) => setIban(t.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 32))}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
              style={styles.input}
            />
          ) : (
            <>
              <View style={styles.chips}>
                {PROVIDERS.map((p) => (
                  <Chip key={p} label={p} on={provider === p} onPress={() => setProvider(p)} />
                ))}
              </View>
              <TextInput value={handle} onChangeText={setHandle} placeholder="E-posta veya hesap numarası" placeholderTextColor={colors.textDim} autoCapitalize="none" style={styles.input} />
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setEditing(false)} style={[styles.ghostBtn, { flex: 1 }]}>
              <Text style={styles.ghostText}>Vazgeç</Text>
            </Pressable>
            <GradientButton small title="Kaydet" icon="save" onPress={save} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Card>
  );
}

function PayoutForm({ scope, available, legacyWeekly = 0 }: { scope: Scope; available: number; legacyWeekly?: number }) {
  const bank = useBank();
  const [amount, setAmount] = useState('');
  const [nonce, setNonce] = useState(1);
  const n = Number(amount) || 0;
  const error = n ? validatePayout(bank, scope, n, available, legacyWeekly) : null;
  const weekUsed = weeklyUsedFor(bank, scope) + legacyWeekly;
  const cap = Math.min(available, RULES.maxWithdrawDiamonds);
  const presets = [...new Set([RULES.minWithdrawDiamonds, 100_000, RULES.autoApproveUnderDiamonds, 1_000_000, cap])]
    .filter((p) => p >= RULES.minWithdrawDiamonds && p <= cap)
    .sort((x, y) => x - y);

  const submit = () => {
    // Same nonce + amount = same idempotency key: a double tap returns the first request.
    const res = createPayout({ scope, diamonds: n, available, legacyWeekly, key: `${scope}:${nonce}:${n}` });
    if (!res.ok) return showAlert('Talep oluşturulamadı', res.error);
    if (res.duplicate) return showAlert('Talep zaten oluşturuldu', `${res.payout.ref} · Aynı istek ikinci kez işlenmedi.`);
    setNonce((x) => x + 1);
    setAmount('');
    const p = res.payout;
    showAlert(
      p.review === 'Otomatik onay' ? 'Talep otomatik onaylandı ✅' : 'Manuel incelemeye alındı 🕵️',
      `${p.ref} · ${dia(p.diamonds)} (${usd(p.diamonds)}) bloke edildi ve tekrar kullanılamaz.\nHesap: ${p.account.label}\n(Demo – gerçek ödeme yapılmaz)`,
    );
  };

  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle icon="cash" title="Para çekme talebi" />
      <Text style={styles.dim}>
        Çekilebilir: {dia(available)} ({usd(available)}) · Bu hafta: {dia(weekUsed)} / {dia(RULES.weeklyWithdrawLimitDiamonds)}
      </Text>
      {presets.length > 0 ? (
        <View style={styles.chips}>
          {presets.map((p) => (
            <Chip key={p} label={p === cap && p === available ? `Tümü · ${fmt(p)}` : fmt(p)} on={n === p} onPress={() => setAmount(String(p))} />
          ))}
        </View>
      ) : (
        <Text style={[styles.dim, { color: colors.gold }]}>Talep için en az {dia(RULES.minWithdrawDiamonds)} çekilebilir bakiye gerekir.</Text>
      )}
      <TextInput
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/\D/g, '').slice(0, 10))}
        keyboardType="number-pad"
        placeholder={`Tutar (💎) · min ${fmt(RULES.minWithdrawDiamonds)} · maks ${fmt(RULES.maxWithdrawDiamonds)}`}
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      {n > 0 && (
        <Text style={[styles.dim, { color: error ? colors.red : colors.green }]}>
          {error ?? `≈ ${usd(n)} · ${n < RULES.autoApproveUnderDiamonds ? 'Otomatik onay' : 'Manuel inceleme'}`}
        </Text>
      )}
      <GradientButton title="Talep oluştur" icon="send" onPress={submit} />
    </Card>
  );
}

function PayoutHistory({ scope, finalize, children }: { scope: Scope; finalize?: (p: Payout) => string | null; children?: ReactNode }) {
  const { ruleHistory } = useApp();
  const bank = useBank();
  const [open, setOpen] = useState<string | null>(null);
  const list = bank.payouts.filter((p) => p.scope === scope);

  const approve = (p: Payout) => {
    // Separation of duties: whoever edited financial rules in this session can't approve payouts.
    if (ruleHistory.length > 0)
      return showAlert('Görevler ayrılığı', 'Bu oturumda finansal kuralları düzenledin. Kural düzenleyen kişi ödeme onaylayamaz; talebi başka bir finans yetkilisi onaylamalı.');
    const err = approvePayout(p.id);
    if (err) showAlert('İşlem yapılmadı', err);
  };
  const reject = (p: Payout) => {
    const err = rejectPayout(p.id, 'Finans incelemesi: belge eksik (demo)');
    if (err) showAlert('İşlem yapılmadı', err);
  };
  const complete = (p: Payout) => {
    // A second tap after settlement must not withdraw twice: re-read the live status first.
    if (getPayout(p.id)?.status !== 'Onaylandı') return;
    const err = finalize ? finalize(p) : completePayout(p.id);
    if (err) showAlert('Ödeme başarısız', `${err}\nBloke tutar serbest bırakıldı.`);
  };
  const fail = (p: Payout) => {
    const err = failPayout(p.id, 'Banka transferi reddetti (demo)');
    if (err) showAlert('İşlem yapılmadı', err);
  };

  return (
    <Card style={{ gap: 6 }}>
      <SectionTitle icon="time" title="Ödeme geçmişi" />
      {list.length === 0 && !children && <Text style={styles.dim}>Henüz ödeme talebi yok.</Text>}
      {list.map((p) => (
        <PayoutItem
          key={p.id}
          p={p}
          open={open === p.id}
          onToggle={() => setOpen(open === p.id ? null : p.id)}
          onApprove={() => approve(p)}
          onReject={() => reject(p)}
          onComplete={() => complete(p)}
          onFail={() => fail(p)}
        />
      ))}
      {children}
    </Card>
  );
}

function PayoutItem({
  p,
  open,
  onToggle,
  onApprove,
  onReject,
  onComplete,
  onFail,
}: {
  p: Payout;
  open: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onComplete: () => void;
  onFail: () => void;
}) {
  return (
    <View style={styles.payout}>
      <Pressable onPress={onToggle} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {dia(p.diamonds)} · {usd(p.diamonds)}
          </Text>
          <Text style={styles.mono}>
            {p.ref} · {p.created} · {p.review} · v{p.ruleVersion}
          </Text>
        </View>
        <Badge text={p.status} />
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} />
      </Pressable>
      {open && (
        <View style={{ gap: 4, paddingTop: 6 }}>
          <Text style={styles.dim}>Hesap: {p.account.label}</Text>
          {p.reason && <Text style={[styles.dim, { color: colors.red }]}>Neden: {p.reason}</Text>}
          {p.steps.map((s, i) => (
            <View key={`${p.id}-${i}`} style={styles.step}>
              <View style={styles.stepDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>
                  {s.time} · {s.label} <Text style={styles.dim}>({s.actor})</Text>
                </Text>
                {s.note && <Text style={styles.mono}>{s.note}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
      {p.status === 'Manuel inceleme' && (
        <View style={styles.actions}>
          <Pressable onPress={onApprove} style={[styles.actBtn, { borderColor: colors.green }]}>
            <Text style={[styles.actText, { color: colors.green }]}>Finans onayı (demo)</Text>
          </Pressable>
          <Pressable onPress={onReject} style={[styles.actBtn, { borderColor: colors.red }]}>
            <Text style={[styles.actText, { color: colors.red }]}>Reddet (demo)</Text>
          </Pressable>
        </View>
      )}
      {p.status === 'Onaylandı' && (
        <View style={styles.actions}>
          <Pressable onPress={onComplete} style={[styles.actBtn, { borderColor: colors.green }]}>
            <Text style={[styles.actText, { color: colors.green }]}>Ödemeyi tamamla (demo)</Text>
          </Pressable>
          <Pressable onPress={onFail} style={[styles.actBtn, { borderColor: colors.red }]}>
            <Text style={[styles.actText, { color: colors.red }]}>Başarısız simüle et</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MockPayoutRow({ p }: { p: Pick<MockPayout, 'ref' | 'diamonds' | 'time' | 'account' | 'note'> & { status: string } }) {
  return (
    <View style={styles.payout}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {dia(p.diamonds)} · {usd(p.diamonds)}
          </Text>
          <Text style={styles.mono}>
            {p.ref} · {p.time} · {p.account}
          </Text>
          {p.note && <Text style={styles.dim}>{p.note}</Text>}
        </View>
        <Badge text={p.status} />
      </View>
    </View>
  );
}

// --- small UI pieces ---------------------------------------------------------------------
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={16} color={colors.primaryText} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  const c = STATUS_COLOR[text] ?? colors.textDim;
  return (
    <View style={[styles.badge, { borderColor: c }]}>
      <Text style={[styles.badgeText, { color: c }]}>{text}</Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={[styles.kvVal, strong && { fontWeight: '900', color: colors.gold }]}>{v}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Text style={styles.dim}>•</Text>
      <Text style={[styles.dim, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Ionicons name="information-circle" size={16} color="#7DD3FC" />
      <Text style={[styles.dim, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function LockedCard({ icon, title, text, action, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; action?: string; onPress?: () => void }) {
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
      <View style={styles.lockIcon}>
        <Ionicons name={icon} size={28} color={colors.textDim} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.dim, { textAlign: 'center' }]}>{text}</Text>
      {action && onPress && <GradientButton small title={action} onPress={onPress} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  protoPill: { backgroundColor: 'rgba(251,191,36,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  protoPillText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  tabs: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.35)', borderWidth: 1, borderRadius: 14, padding: 10 },
  bannerText: { color: colors.gold, fontSize: 12, flex: 1, lineHeight: 17 },
  hero: { borderRadius: 24, padding: 20, gap: 4, borderWidth: 1, borderColor: colors.border },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  heroN: { color: '#fff', fontSize: 36, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 999, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.border },
  statLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 17, fontWeight: '900' },
  statSub: { color: colors.textDim, fontSize: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sectionText: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  amount: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mono: { color: colors.textDim, fontSize: 12, fontFamily: MONO },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 },
  link: { color: colors.primaryText, fontWeight: '700' },
  ghostBtn: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  ghostText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  kv: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
  kvKey: { color: colors.textDim, fontSize: 12, width: 130 },
  kvVal: { color: '#fff', fontSize: 12, flex: 1, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: 12, padding: 10 },
  versionPill: { backgroundColor: colors.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  versionText: { color: colors.gold, fontWeight: '800', fontSize: 12 },
  auditRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  auditTime: { color: colors.textDim, fontSize: 12, fontFamily: MONO, width: 58 },
  tableName: { color: '#A5F3F5', fontFamily: MONO, fontSize: 13, fontWeight: '700' },
  payout: { backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  step: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  stepDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  stepText: { color: '#fff', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  actBtn: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  actText: { fontWeight: '800', fontSize: 12 },
  lockIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
});
