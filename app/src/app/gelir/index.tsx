import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { ExchangeSheet } from '@/components/exchange-sheet';
import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { LUCKY_RECIPIENT_SHARE, RULES, pct, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { liveMode } from '@/lib/live';
import { liveRules, useLiveCatalog } from '@/lib/live/catalog-live';
import { useServerWithdrawals } from '@/lib/live/withdraw';
import { diamondValueTl, selfExchangeRate } from '@/lib/coins-bank';
import { activeLocks, channelLabel, lockDays, lockProgress, nextUnlock, timeLeft, type DiamondLock } from '@/lib/diamond-locks';
import { stampLabel } from '@/lib/tr';
import { useApp, type Earning, type EarningSource } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

// Income labels for each store earning source.
export const INCOME_LABEL: Record<EarningSource, string> = {
  Hediye: 'Oda Hediyeleri Geliri',
  Arama: 'Arama Geliri',
  'Cazibe bonusu': 'Yankı Bonusu',
  Görev: 'Görev Ödülü',
  'Ajans bonusu': 'Ajans bonusu',
  'Oda sahibi bonusu': 'Oda sahibi bonusu',
  'Aile bonusu': 'Tayfa bonusu',
  'Arama bonusu': 'Arama bonusu',
};

/** Right-hand detail line: the stored gift for gift income, else the rule behind it. */
export const incomeDetail = (e: Earning) => {
  if (e.source === 'Hediye') {
    // Older rows have no gift stored; the price alone can't tell which gift it was.
    const g = e.gift;
    return g ? `${g.emoji} ${g.name} x${g.count}${g.lucky ? ` · Uğurlu (${pct(LUCKY_RECIPIENT_SHARE)})` : ''}` : '🎁 Hediye';
  }
  if (e.source === 'Oda sahibi bonusu') return `Bonus ${pct(RULES.roomOwnerBonus)}`;
  if (e.source === 'Arama') return 'Görüntülü arama';
  return 'Platform ödülü';
};

const PREVIEW = 10;
/** Locks shown before "Tümünü gör". */
const LOCK_PREVIEW = 5;
const fmt = (n: number) => n.toLocaleString('tr-TR');

/** The clock the countdowns read; a minute is fine for "2 gün 4 saat" and "35 dk". */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function IncomeScreen() {
  const { diamonds, withdrawableDiamonds: free, lockedDiamonds: locked, diamondLocks, earnings } = useApp();
  // Live mode: a pending withdrawal holds its diamonds on the server (they are already out of the balance).
  const withdrawState = useServerWithdrawals();
  // Çevir's rate line: the server's rate in a live build (Canlı ayarlar), the compiled one otherwise.
  const liveCat = useLiveCatalog();
  const per10k = Math.floor(10_000 * selfExchangeRate(liveMode() ? liveRules(liveCat) : RULES));
  const pendingWithdraw = liveMode() ? withdrawState.list.find((w) => w.status === 'pending') : undefined;
  const { colors, semantic, ink } = useTheme();
  const styles = useStyles();
  const [exchange, setExchange] = useState(false);
  const [allLocks, setAllLocks] = useState(false);
  const now = useMinuteClock();
  // Soonest first: the list answers "when can I take these out?".
  const locks = activeLocks(diamondLocks, now).sort((a, b) => a.unlockAt - b.unlockAt);
  const next = nextUnlock(locks, now);
  const lockedNote = locked > 0 ? `\n\n${fmt(locked)} elmasın kilidi henüz açılmadı; açıldıkça bu tutara eklenir.` : '';
  // Three ways out, all from the withdrawable part: Çevir (own diamonds → coins at the in-app price), Anında
  // bozdur (Jeton Noktası pays the cash value now) and Para Çek (weekly payout).
  const instant = () =>
    showAlert(
      'Anında bozdur',
      `Jeton Noktası çekilebilir elmasını resmi değerinden hemen öder: ${fmt(free)} 💎 ≈ ${fmt(Math.floor(diamondValueTl(free)))} TL. Senden ücret kesilmez. Haftalık ödemeyi beklemek istersen Para Çek'i kullan.${lockedNote}`,
      [
        { text: 'Kapat', style: 'cancel' },
        { text: "Jeton Noktası'na git", onPress: () => router.push('/coins-bank') },
      ],
    );

  const info = () =>
    showAlert(
      'Elmasların',
      `${fmt(RULES.diamondsPerUsd)} elmas = 1 USD. Toplam ${fmt(diamonds)} elmasın yaklaşık ${usd(diamonds)} değerindedir.\n\nÇekilebilir kazanç: hemen çekebileceğin, bozdurabileceğin ya da jetona çevirebileceğin elmaslar.\nKilitli elmas: Google Play veya App Store'dan alınan jetonla gelen hediyeler ${RULES.pendingDays} gün, Jeton Noktası jetonuyla gelenler ${RULES.jetonPendingDays} gün kilitli kalır (iade süresi). Süre dolunca kendiliğinden çekilebilir kazanca geçer.\n\nPara çekmek için en az ${fmt(RULES.minWithdrawDiamonds)} elmas (${usd(RULES.minWithdrawDiamonds)}) gerekir.`,
    );

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Gelir"
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => router.push('/davet')} hitSlop={8} style={styles.headIcon} accessibilityLabel="Arkadaşını Getir">
              <Ionicons name="gift" size={18} color={colors.gold} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Kazanç' } })} hitSlop={8} style={styles.headIcon} accessibilityLabel="Müşteri hizmetleri">
              <Ionicons name="headset" size={18} color={colors.primaryText} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <LinearGradient colors={[colors.cardAlt, colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Pressable onPress={info} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button" accessibilityLabel="Elmaslar hakkında bilgi">
            <Text style={styles.balanceLabel}>Toplam elmas · {usd(diamonds)}</Text>
            <Ionicons name="help-circle-outline" size={18} color={ink(0.9)} />
          </Pressable>
          <Text style={styles.balanceN}>{fmt(diamonds)}</Text>
          {/* The two parts of the balance on one bar: green may leave now, grey waits for its lock. */}
          <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {free > 0 && <View style={[styles.meterFree, { flex: free }]} />}
            {locked > 0 && <View style={[styles.meterLocked, { flex: locked }]} />}
          </View>
          <View style={styles.split}>
            <View style={styles.part} accessible accessibilityLabel={`Çekilebilir kazanç: ${fmt(free)} elmas, yaklaşık ${usd(free)}`}>
              <View style={styles.partHead}>
                <Ionicons name="lock-open" size={14} color={semantic.successText} />
                <Text style={styles.partLabel} numberOfLines={1}>Çekilebilir kazanç</Text>
              </View>
              <Text style={styles.partN} numberOfLines={1} adjustsFontSizeToFit>{fmt(free)}</Text>
              <Text style={styles.partSub} numberOfLines={1}>≈ {usd(free)}</Text>
            </View>
            <View style={styles.part} accessible accessibilityLabel={`Kilitli elmas: ${fmt(locked)}${next ? `, ilk kilit ${timeLeft(next, now)} sonra açılır` : ''}`}>
              <View style={styles.partHead}>
                <Ionicons name="lock-closed" size={14} color={colors.textDim} />
                <Text style={styles.partLabel} numberOfLines={1}>Kilitli elmas</Text>
              </View>
              <Text style={styles.partN} numberOfLines={1} adjustsFontSizeToFit>{fmt(locked)}</Text>
              <Text style={styles.partSub} numberOfLines={1}>{next ? `İlki ${timeLeft(next, now)} sonra açılır` : 'Kilitli elmas yok'}</Text>
            </View>
          </View>
          <Pressable style={({ pressed }) => [styles.exchangeBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => setExchange(true)} accessibilityRole="button" accessibilityLabel="Elmasları jetona çevir">
            <Ionicons name="swap-horizontal" size={20} color={semantic.moneyInk} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exchangeTitle}>Çevir</Text>
              <Text style={styles.exchangeSub} numberOfLines={1}>10.000 elmas = {fmt(per10k)} jeton · ücret yok</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={semantic.moneyInk} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
            <Pressable style={styles.outlineBtn} onPress={() => router.push('/yayinci/cek')}>
              <Text style={styles.outlineText}>Para Çek</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={instant}>
              <Text style={styles.outlineText}>Anında bozdur</Text>
            </Pressable>
          </View>
          {pendingWithdraw && (
            <Text style={[styles.exchangeSub, { marginTop: 8 }]} onPress={() => router.push('/yayinci/cek')}>
              Bekleyen çekim talebi: {fmt(pendingWithdraw.diamonds)} elmas. Sonuçlanana kadar bakiyeden ayrı tutulur.
            </Text>
          )}
        </LinearGradient>

        <Pressable style={styles.bankLink} onPress={() => router.push('/coins-bank')} accessibilityLabel="Jeton Noktası">
          <Art name="finans-haftalik-odeme-banka" size={26} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Jeton Noktası</Text>
            <Text style={styles.dim}>Cüzdan, kazançlar, ödemeler ve kurallar</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>

        <View style={styles.sectionHead}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={13} color={colors.textDim} />
          </View>
          <Text style={styles.sectionTitle}>Kilitli elmas</Text>
          {locked > 0 && <Text style={styles.dim}>{fmt(locked)} 💎</Text>}
        </View>
        {locks.length === 0 ? (
          <Card style={styles.noLocks}>
            <Ionicons name="lock-open" size={18} color={semantic.successText} />
            <Text style={[styles.dim, { flex: 1 }]}>Şu an kilitli elmasın yok; bakiyenin tamamı çekilebilir.</Text>
          </Card>
        ) : (
          <Card style={styles.lockList}>
            {(allLocks ? locks : locks.slice(0, LOCK_PREVIEW)).map((l, i) => (
              <LockRow key={l.id} lock={l} now={now} first={i === 0} />
            ))}
            {locks.length > LOCK_PREVIEW && (
              <Pressable onPress={() => setAllLocks((v) => !v)} style={styles.lockMore} accessibilityRole="button">
                <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{allLocks ? 'Daha az göster' : `Tümünü gör (${locks.length})`}</Text>
              </Pressable>
            )}
          </Card>
        )}
        <Text style={styles.lockNote}>
          {`Google Play veya App Store'dan alınan jetonla gönderilen hediyelerin elmasları ${RULES.pendingDays} gün, Jeton Noktası jetonuyla gönderilenler ${RULES.jetonPendingDays} gün kilitli kalır. Bu süre iade içindir; dolunca elmaslar kendiliğinden çekilebilir kazanca geçer.`}
        </Text>

        <View style={styles.sectionHead}>
          <Icon3D name="diamond" size={22} />
          <Text style={styles.sectionTitle}>Elmas Detayları</Text>
          <Pressable onPress={() => router.push('/gelir/detay')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.dim}>Daha fazla</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {earnings.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 30 }}>
            <Art name="maskot-uyuyan-bakiye" size={52} />
            <Text style={styles.dim}>Veri yok</Text>
            <Text style={[styles.dim, { textAlign: 'center' }]}>Odanda hediye aldığında veya arama yaptığında elmas gelirin burada listelenir.</Text>
          </Card>
        ) : (
          earnings.slice(0, PREVIEW).map((e) => <EarningRow key={e.id} e={e} />)
        )}
        {earnings.length > PREVIEW && (
          <Pressable onPress={() => router.push('/gelir/detay')} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Tümünü gör ({earnings.length})</Text>
          </Pressable>
        )}
      </ScrollView>
      <ExchangeSheet visible={exchange} onClose={() => setExchange(false)} />
    </SafeAreaView>
  );
}

/** One lock: what it was, who sent it, which coins paid for it, and how long until it opens. */
function LockRow({ lock, now, first }: { lock: DiamondLock; now: number; first: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const who = lock.fromId ? userById(lock.fromId).name : 'Similar Club';
  const what = lock.gift ? `${lock.gift.name} ×${lock.gift.count}` : INCOME_LABEL[lock.source];
  const left = timeLeft(lock.unlockAt, now);
  return (
    <View style={[styles.lockRow, !first && styles.lockSep]} accessible accessibilityLabel={`${fmt(lock.amount)} elmas, ${what}, ${who}, ${channelLabel(lock.channel)}, ${left} sonra açılır`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{what}</Text>
          <Text style={styles.dim} numberOfLines={1}>
            <Text style={styles.sender}>{who}</Text> · {channelLabel(lock.channel)} · {lockDays(lock.channel)} gün
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={styles.amount}>{fmt(lock.amount)} 💎</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="time-outline" size={12} color={colors.textDim} />
            <Text style={styles.dim}>{left}</Text>
          </View>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(lockProgress(lock, now) * 100)}%` }]} />
      </View>
    </View>
  );
}

export function EarningRow({ e }: { e: Earning }) {
  const styles = useStyles();
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{INCOME_LABEL[e.source]}</Text>
        {e.fromId ? <Text style={styles.sender}>{userById(e.fromId).name}</Text> : <Text style={styles.sender}>Similar Club</Text>}
        <Text style={styles.dim}>{stampLabel(e.day, e.time)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.amount}>+{fmt(e.amount)} 💎</Text>
        <Text style={styles.dim}>{incomeDetail(e)}</Text>
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  headIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  balance: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, ...(dark ? null : { boxShadow: '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)' }) },
  balanceLabel: { color: ink(0.92), fontSize: 15 },
  balanceN: { color: colors.text, fontSize: 40, fontWeight: '900', marginTop: 4 },
  meter: { flexDirection: 'row', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: ink(0.12), marginTop: 12 },
  meterFree: { backgroundColor: semantic.success, borderRadius: 3 },
  meterLocked: { backgroundColor: ink(0.28), borderRadius: 3 },
  split: { flexDirection: 'row', gap: 10, marginTop: 12 },
  part: { flex: 1, minWidth: 0, gap: 2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : colors.card, borderWidth: 1, borderColor: ink(0.08) },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partLabel: { color: ink(0.82), fontSize: 12, fontWeight: '700', flexShrink: 1 },
  partN: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  partSub: { color: colors.textDim, fontSize: 12 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderColor: dark ? 'rgba(255,255,255,0.85)' : ink(0.22), borderRadius: 999, paddingVertical: 11, alignItems: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.12)' : colors.card },
  outlineText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  exchangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: semantic.money, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: semantic.moneyEdge },
  exchangeTitle: { color: semantic.moneyInk, fontWeight: '900', fontSize: 16 },
  exchangeSub: { color: semantic.moneyInk, fontSize: 12, opacity: 0.8, marginTop: 1 },
  bankLink: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  lockBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  noLocks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockList: { paddingVertical: 4, paddingHorizontal: 16 },
  lockRow: { paddingVertical: 12, gap: 10 },
  lockSep: { borderTopWidth: 1, borderTopColor: ink(0.08) },
  lockMore: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: ink(0.08) },
  lockNote: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: -4, paddingHorizontal: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: ink(0.1), overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: semantic.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sender: { color: dark ? '#5EEAF0' : semantic.actionText, fontWeight: '700' },
  // Diamond amount: white in the dark scheme (as before), the diamond's blue on the light one.
  amount: { color: dark ? colors.text : semantic.diamondText, fontWeight: '800', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
}));
