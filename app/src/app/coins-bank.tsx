// Coins Bank – central virtual-economy screen (PROTOTYPE: mock data, no real payments).
// Coins (bought, spent on gifts), Diamonds (creator earnings) and Bonus Credits (promotions, not
// withdrawable) are separate currencies. Creator earnings are never reduced by agency/BD commissions;
// those are separate platform liabilities. Payout state lives in src/lib/bank.ts.
// Finance administration (rules, payout approval, reconciliation) is not part of the app; it lives in
// the separate Finance Control platform. Here users only see balances, request payouts and track them.
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
  PROVIDERS,
  blockedFor,
  createPayout,
  paidFor,
  rejectedFor,
  saveAccount,
  setBdView,
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
import { Art, type ArtName } from '@/components/Art';

type Tab = 'wallet' | 'creator' | 'agency' | 'bd';
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'wallet', label: 'Cüzdanım', icon: 'wallet' },
  { key: 'creator', label: 'Yayıncı', icon: 'mic' },
  { key: 'agency', label: 'Ajans', icon: 'business' },
  { key: 'bd', label: 'BD', icon: 'git-network' },
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
  return { current, rows, total, pending, final, blocked, paid, rejected, available: Math.max(0, final - paid - blocked) };
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
  return { rows, total, pending, final, blocked, paid, rejected, dupes, available: Math.max(0, final - paid - blocked) };
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
        <Stat label="Bonus Kredi" art="finans-bonus-kredi" value={fmt(BONUS_BALANCE)} sub={cashable ? `${pct(rules.bonusCashable)} çekilebilir` : 'Çekilemez · yalnız uygulama içi'} color={colors.primaryText} />
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
                  {fmt(r.amount)} {r.currency === 'coin' ? '🪙' : r.currency === 'game' ? '🎮' : '💎'}
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
  const { isHost, becomeHost, diamonds, totalDiamonds, earnings, withdrawals, rules } = useApp();
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
  // Classic withdrawals made on /yayinci/cek count towards completed payouts and the weekly limit.
  const legacySum = sumD(withdrawals);
  // Demo split: this session's earnings are all from today, i.e. inside the pending window.
  const pending = Math.min(totalDiamonds, earnings.reduce((s, e) => s + e.amount, 0));
  const final = totalDiamonds - pending;
  const available = Math.max(0, diamonds - blocked);
  const completed = paidFor(bank, 'creator') + legacySum;
  const rejected = rejectedFor(bank, 'creator');

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
      <PayoutHistory scope="creator">
        {withdrawals.map((w) => (
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

// Read-only for the account owner: approval, rejection and transfer are done by the finance team
// on the separate Finance Control platform; open requests simply wait here with a status note.
function PayoutHistory({ scope, children }: { scope: Scope; children?: ReactNode }) {
  const bank = useBank();
  const [open, setOpen] = useState<string | null>(null);
  const list = bank.payouts.filter((p) => p.scope === scope);

  return (
    <Card style={{ gap: 6 }}>
      <SectionTitle icon="time" title="Ödeme geçmişi" />
      {list.length === 0 && !children && <Text style={styles.dim}>Henüz ödeme talebi yok.</Text>}
      {list.map((p) => (
        <PayoutItem key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
      ))}
      {children}
    </Card>
  );
}

function PayoutItem({ p, open, onToggle }: { p: Payout; open: boolean; onToggle: () => void }) {
  const waiting = p.status === 'Manuel inceleme' ? 'Finans ekibi inceliyor. Sonuç burada görünür.' : p.status === 'Onaylandı' ? 'Onaylandı · ödeme transfer sırasında.' : null;
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
      {waiting && (
        <View style={styles.waiting}>
          <Ionicons name="hourglass-outline" size={14} color={colors.gold} />
          <Text style={[styles.dim, { flex: 1 }]}>{waiting}</Text>
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
function Stat({ label, value, sub, color, art }: { label: string; value: string; sub?: string; color: string; art?: ArtName }) {
  const text = (
    <Text style={[styles.statValue, { color }, art && { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  );
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {art ? (
        <View style={styles.statRow}>
          <Art name={art} size={22} />
          {text}
        </View>
      ) : (
        text
      )}
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

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal}>{v}</Text>
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
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statSub: { color: colors.textDim, fontSize: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sectionText: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
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
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: 12, padding: 10 },
  payout: { backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  step: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  stepDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  stepText: { color: '#fff', fontSize: 12 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  lockIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
});
