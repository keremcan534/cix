import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Card, GradientButton, Header, TextLink } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { hostLevel } from '@/data/economy';
import { diamondValueTl } from '@/lib/coins-bank';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { IS_DEMO } from '@/lib/build';
import { liveMode, oneOnOneOpen } from '@/lib/live';
import { useLiveCallStats } from '@/lib/live/call-log';
import { useLiveEarnings } from '@/lib/live/earnings';
import { RULES, pct, settlement, usd } from '@/data/rules';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Bugün'];

const PERKS: { icon: string; art?: ArtName; title: string; text: string }[] = [
  { icon: '🎁', art: 'finans-hediyelerden-kazan', title: 'Hediyelerden kazan', text: 'Gelen her hediye elmasa dönüşür.' },
  { icon: '📹', art: 'finans-ucretli-aramalar', title: 'Ücretli aramalar', text: 'Görüntülü aramalarda dakika başı kazan.' },
  { icon: '🏦', art: 'finans-haftalik-odeme-banka', title: 'Haftalık ödeme', text: 'Elmaslarını banka hesabına çek.' },
];
/** Calls are promised as a way to earn only where this build has them (the demo's, or the server's: oneOnOneOpen). */
const perks = () => PERKS.filter((p) => p.art !== 'finans-ucretli-aramalar' || oneOnOneOpen());

/** The picture for an earning row by its source; other sources keep the emoji. */
const EARNING_ART: Partial<Record<string, ArtName>> = { Hediye: 'finans-hediyelerden-kazan', Arama: 'finans-ucretli-aramalar' };

export default function HostCenter() {
  const { isHost, becomeHost, me } = useApp();
  const { colors, gradientDeep } = useTheme();
  const styles = useStyles();

  if (!isHost) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Yayıncı Merkezi" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <LinearGradient colors={gradientDeep} style={styles.hero}>
            <Icon3D name="mic" size={64} />
            <Text style={styles.heroTitle}>Yayıncı ol, kazanmaya başla</Text>
            <Text style={styles.heroText}>{oneOnOneOpen() ? 'Oda aç, sohbet et, hediyeler ve aramalardan elmas kazan.' : 'Oda aç, sohbet et, hediyelerden elmas kazan.'}</Text>
          </LinearGradient>
          {perks().map((p) => (
            <Card key={p.title} style={styles.perk}>
              {p.art ? <Art name={p.art} size={36} /> : <Text style={{ fontSize: 28 }}>{p.icon}</Text>}
              <View style={{ flex: 1 }}>
                <Text style={styles.perkTitle}>{p.title}</Text>
                <Text style={styles.dim}>{p.text}</Text>
              </View>
            </Card>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={styles.dim}>Şartlar: 18+, gerçek kişi doğrulaması</Text>
            <Ionicons
              name={me.verified ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={me.verified ? colors.green : colors.textDim}
              accessibilityLabel={me.verified ? 'Doğrulandı' : 'Doğrulanmadı'}
            />
          </View>
          <GradientButton
            title="Yayıncı başvurusu yap"
            icon="mic"
            onPress={() => {
              if (me.verified) return becomeHost();
              // 18+ and real-person checks are a payout requirement, so a store build never skips them.
              if (!IS_DEMO)
                return showAlert('Doğrulama gerekli', 'Yayıncı olmak ve kazancını çekebilmek için önce 18 yaş ve gerçek kişi doğrulamasını tamamlamalısın. Doğrulama için Destek ekibimize yaz.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Doğrulama talebi aç', onPress: () => router.push({ pathname: '/destek', params: { kategori: 'Doğrulama' } }) },
                ]);
              showAlert('Doğrulama gerekli', 'Yayıncı olmak için önce gerçek kişi doğrulaması yapmalısın. Bu demo sürümünde başvurun yine de onaylandı.');
              becomeHost();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const app = useApp();
  const { totalDiamonds, weekly, earnings, agencyId, withdrawals, me } = app;
  // Live mode: the server's balance and its two parts (summed over every lock), the store's until it answers.
  const live = liveMode();
  const server = useLiveEarnings(app.diamonds);
  const fromServer = live && server.status === 'ready';
  const diamonds = fromServer ? server.diamonds : app.diamonds;
  const free = fromServer ? server.withdrawable : app.withdrawableDiamonds;
  const locked = fromServer ? server.locked : app.lockedDiamonds;
  // The join window runs from sign-up; once it has passed the host is already on the management account.
  const [joinedDays] = useState(() => (me.joinedAt ? Math.floor((Date.now() - new Date(me.joinedAt).getTime()) / 86_400_000) : 0));
  const joinDaysLeft = Math.max(0, RULES.hostAgencyJoinDays - joinedDays);
  const { current, next } = hostLevel(totalDiamonds);
  const progress = next ? (totalDiamonds - current.min) / (next.min - current.min) : 1;
  const max = Math.max(...weekly, 1);
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const agency = AGENCIES.find((a) => a.id === agencyId);
  const { colors, semantic, gradient } = useTheme();
  const styles = useStyles();

  const exchange = () =>
    // Diamonds turn into coins only in the main Coins Bank account (lib/coins-bank); hosts cash out instead.
    // Only the withdrawable part: locked diamonds (lib/diamond-locks) wait for their lock.
    showAlert('Anında bozdur', `Jeton Noktası çekilebilir elmasını resmi değerinden hemen öder: ${free.toLocaleString('tr-TR')} elmas ≈ ${Math.floor(diamondValueTl(free)).toLocaleString('tr-TR')} TL. Senden ücret kesilmez.${locked > 0 ? `\n\n${locked.toLocaleString('tr-TR')} elmasın kilidi henüz açılmadı.` : ''}`, [
      { text: 'Kapat', style: 'cancel' },
      { text: "Jeton Noktası'na git", onPress: () => router.push('/coins-bank') },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Yayıncı Merkezi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <LinearGradient colors={['#0EA5E9', '#0A8F95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Text style={styles.balanceLabel}>Elmas bakiyesi</Text>
          <Text style={styles.balanceN}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
          <Text style={styles.balanceLabel}>≈ {usd(diamonds)}</Text>
          <View style={styles.balanceSplit}>
            <View style={styles.balancePart}>
              <Ionicons name="lock-open" size={13} color="#fff" />
              <Text style={styles.balancePartText} numberOfLines={1}>Çekilebilir {free.toLocaleString('tr-TR')}</Text>
            </View>
            <View style={styles.balancePart}>
              <Ionicons name="lock-closed" size={13} color="#fff" />
              <Text style={styles.balancePartText} numberOfLines={1}>Kilitli {locked.toLocaleString('tr-TR')}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={styles.balanceBtn} onPress={() => router.push('/yayinci/cek')}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.balanceBtnText}>Para çek</Text>
            </Pressable>
            {/* Jeton Noktası is still a demo screen: a live build doesn't send anyone there. */}
            {!live && (
              <Pressable style={styles.balanceBtn} onPress={exchange}>
                <Ionicons name="flash-outline" size={18} color="#fff" />
                <Text style={styles.balanceBtnText}>Anında bozdur</Text>
              </Pressable>
            )}
          </View>
        </LinearGradient>

        <View style={[styles.affil, { borderColor: agency ? colors.green : colors.gold }]}>
          {agency ? (
            <Text style={{ color: colors.text, fontWeight: '800' }}>{`🏢 Ajans: ${agency.name}`}</Text>
          ) : (
            <View style={styles.titleRow}>
              <Art name="finans-ajanssiz-yayinci" size={20} />
              <Text style={{ color: colors.text, fontWeight: '800' }}>Ajanssız yayıncı</Text>
            </View>
          )}
          <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 17 }}>
            {agency
              ? `${RULES.agencyHostInactiveDays} gün çevrimiçi olmaz ve çekim yapmazsan ajanstan düşer, yönetim hesabına aktarılırsın. Kazancın etkilenmez.`
              : `Kayıttan itibaren ${RULES.hostAgencyJoinDays} gün içinde bir ajansa katılmazsan yönetim hesabına (platform) bağlanırsın: kazancını almaya ve para çekmeye sorunsuz devam edersin, sadece senin üzerinden ajans komisyonu oluşmaz. ${joinDaysLeft > 0 ? `Kalan süre: ${joinDaysLeft} gün.` : 'Bu süre doldu, şu an yönetim hesabına bağlısın; istediğin zaman bir ajansa katılabilirsin.'}`}
          </Text>
          {!agency && (
            <TextLink title="Ajansa katıl" color={colors.gold} onPress={() => router.push('/ajans')} />
          )}
        </View>

        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>
              Yayıncı seviyesi: Lv.{current.level} {current.name}
            </Text>
            <Text style={styles.dim}>{totalDiamonds.toLocaleString('tr-TR')} 💎</Text>
          </View>
          <View style={styles.track}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.dim}>
            {next ? `Lv.${next.level} ${next.name} için ${(next.min - totalDiamonds).toLocaleString('tr-TR')} elmas kaldı` : 'En yüksek seviyedesin 🎉'}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Bu hafta</Text>
            <Text style={{ color: semantic.diamondText, fontWeight: '700' }}>💎 {weekTotal.toLocaleString('tr-TR')}</Text>
          </View>
          <View style={styles.chart}>
            {weekly.map((v, i) => (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barValue}>{v >= 1000 ? `${(v / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k` : v}</Text>
                <View style={[styles.bar, { height: Math.max(4, (v / max) * 110) }, i === 6 && { backgroundColor: semantic.action }]} />
                <Text style={styles.barLabel}>{DAYS[i]}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Bugünkü kazanç" value={`💎 ${weekly[6].toLocaleString('tr-TR')}`} />
          <Stat label="Para çekme" value={`${withdrawals.length} talep`} />
        </View>

        <Pressable onPress={() => router.push('/ajans')}>
          <Card style={styles.perk}>
            <Text style={{ fontSize: 28 }}>{agency?.logo ?? '🏢'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{agency ? agency.name : 'Bir ajansa katıl'}</Text>
              <Text style={styles.dim}>{agency ? `Ajansa ${pct(RULES.agencyCommission)} komisyon ayrıca ödenir — senden kesilmez` : 'Ajansa bağlı yayıncılar ekstra bonus kazanır'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Card>
        </Pressable>

        <Analytics />

        <Card style={{ gap: 4 }}>
          <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Son kazançlar</Text>
          {earnings.length === 0 ? (
            <Text style={styles.dim}>{oneOnOneOpen() ? 'Henüz kazanç yok. Bir oda aç veya aramayı bekle — gelen hediyeler burada görünür.' : 'Henüz kazanç yok. Bir oda aç — gelen hediyeler burada görünür.'}</Text>
          ) : (
            earnings.slice(0, 15).map((e) => (
              <View key={e.id} style={styles.earning}>
                {EARNING_ART[e.source] ? <Art name={EARNING_ART[e.source]!} size={23} /> : <Text style={{ fontSize: 18 }}>⭐</Text>}
                <Text style={{ color: colors.text, flex: 1 }}>
                  {e.source}
                  {e.fromId ? ` · ${userById(e.fromId).name}` : ''}
                </Text>
                <Text style={styles.dim}>{e.time}</Text>
                <Text style={{ color: semantic.diamondText, fontWeight: '700', width: 70, textAlign: 'right' }}>+{e.amount}</Text>
              </View>
            ))
          )}
        </Card>

        <GradientButton title="Yayın aç" icon="radio" onPress={() => router.push('/oda/yeni')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Analytics() {
  const { earnings, agencyId, weekly } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const sum = (src: string) => earnings.filter((e) => e.source === src).reduce((x, e) => x + e.amount, 0);
  // Live: this week's paid calls and matches from the server (lib/live/call-log). Their diamonds reached this phone
  // as diamonds like a gift's, so they come out of the gift figure instead of being counted twice.
  const live = liveMode();
  const server = useLiveCallStats(live && oneOnOneOpen());
  const serverCalls = live ? (server?.diamonds ?? 0) : 0;
  const gifts = Math.max(0, sum('Hediye') + weekly.slice(0, 6).reduce((a, b) => a + b, 0) - serverCalls);
  const ownerBonus = sum('Oda sahibi bonusu');
  const familyBonus = sum('Aile bonusu');
  const callBonus = live ? serverCalls : sum('Arama bonusu') + sum('Arama');
  const net = gifts + ownerBonus + familyBonus + callBonus;
  const { commission } = settlement(gifts, !!agencyId);
  // Only figures the app actually records: this week's daily diamonds and the earning rows. Stream time and
  // audience numbers need the server's room logs, so they are left out rather than estimated.
  const fmt = (n: number) => n.toLocaleString('tr-TR');
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const activeDays = weekly.filter((v) => v > 0).length;
  const best = weekly.reduce((bi, v, i) => (v > weekly[bi] ? i : bi), 0);
  const giftRows = earnings.filter((e) => e.source === 'Hediye');
  const senders = new Set(giftRows.map((e) => e.fromId).filter(Boolean)).size;
  const calls = live ? (server?.calls ?? 0) : earnings.filter((e) => e.source === 'Arama').length;
  const metrics = [
    ['Aktif gün', `${activeDays} / 7`],
    ['En iyi gün', weekly[best] > 0 ? `${DAYS[best]} · ${fmt(weekly[best])}` : '—'],
    ['Günlük ortalama', `${fmt(Math.round(weekTotal / 7))} elmas`],
    ['Hediye gönderen', fmt(senders)],
    ['Gelen hediye', fmt(giftRows.reduce((n, e) => n + (e.gift?.count ?? 1), 0))],
    ...(oneOnOneOpen() ? [['Ücretli arama', fmt(calls)]] : []),
  ];
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.titleRow}>
        <Art name="finans-yayinci-analizi" size={20} />
        <Text style={styles.cardTitle}>Yayıncı analizi (bu hafta)</Text>
      </View>
      {weekTotal === 0 && earnings.length === 0 && <Text style={styles.dim}>Bu hafta henüz kazanç yok. Oda açıp hediye aldığında rakamlar burada güncellenir.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {metrics.map(([l, v]) => (
          <View key={l} style={styles.metric}>
            <Text style={styles.dim}>{l}</Text>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardTitle, { fontSize: 14, marginTop: 4 }]}>Kazanç dökümü</Text>
      <Line label="Brüt hediye değeri" value={`💎 ${gifts.toLocaleString('tr-TR')}`} />
      <Line label={`Oda sahibi bonusu (${pct(RULES.roomOwnerBonus)})`} value={`+ ${ownerBonus.toLocaleString('tr-TR')}`} />
      <Line label="Aile bonusu" value={`+ ${familyBonus.toLocaleString('tr-TR')}`} />
      {oneOnOneOpen() && <Line label="Arama kazancı / bonusu" value={`+ ${callBonus.toLocaleString('tr-TR')}`} />}
      <Line label="Net hak edişin" value={`💎 ${net.toLocaleString('tr-TR')} · ${usd(net)}`} bold />
      {agencyId && <Line label={`Ajans komisyonu (${pct(RULES.agencyCommission)}, ayrıca ödenir)`} value={`${commission.toLocaleString('tr-TR')} · ${usd(commission)}`} dim />}
      <Text style={styles.dim}>
        {RULES.diamondsPerUsd.toLocaleString('tr-TR')} elmas = 1 USD. Komisyon ve bonuslar senin kazancından kesilmez; iade edilen işlemler dökümden çıkarılır.
      </Text>
    </Card>
  );
}

function Line({ label, value, bold, dim }: { label: string; value: string; bold?: boolean; dim?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.dim, bold && { color: colors.text, fontWeight: '800' }]}>{label}</Text>
      <Text style={{ color: dim ? colors.textDim : bold ? colors.green : colors.text, fontWeight: bold ? '800' : '600' }}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
    </Card>
  );
}

// The hero and balance cards are colored gradients in both schemes, so the white on them stays.
const useStyles = makeStyles(({ colors, lift }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroText: { color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  perkTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
  balance: { borderRadius: 20, padding: 20, gap: 2 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)' },
  balanceN: { color: '#fff', fontSize: 34, fontWeight: '900' },
  balanceBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingVertical: 10 },
  balanceBtnText: { color: '#fff', fontWeight: '700' },
  balanceSplit: { flexDirection: 'row', gap: 8, marginTop: 10 },
  balancePart: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(4,22,29,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 1 },
  balancePartText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150 },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  bar: { width: 18, borderRadius: 6, backgroundColor: colors.primary },
  barValue: { color: colors.textDim, fontSize: 10 },
  barLabel: { color: colors.textDim, fontSize: 11 },
  metric: { flexBasis: '30%', flexGrow: 1, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 8, gap: 2 },
  earning: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  // The colored rim (green with an agency, gold without) replaces lift's hairline; its shadow stays.
  affil: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, ...lift, borderWidth: 1 },
}));
