import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { RULES, pct, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

// --- Campaign config (demo values; reward amounts are diamond-equivalents shown in USD via usd()) ----
const DAY = 86_400_000;
const nowMs = () => Date.now();
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const EVENT_START = todayStart.getTime() - 10 * DAY;
const EVENT_END = EVENT_START + 30 * DAY - 1_000;
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/** Same for every invited user: registers + completes real-person verification within 2 days. */
const SIGNUP_REWARD = 5_000;
const INCOME_TASKS = [
  { days: 5, goal: 10_000, reward: 5_000 },
  { days: 10, goal: 20_000, reward: 15_000 },
  { days: 15, goal: 40_000, reward: 20_000 },
];
const MILESTONES = [
  { invites: 5, reward: 25_000 },
  { invites: 10, reward: 30_000 },
  { invites: 20, reward: 55_000 },
  { invites: 30, reward: 60_000 },
];
const INVITE_CAP = 50;
const TICKER = [
  { name: 'S***e', reward: 312_500 },
  { name: 'M***t', reward: 87_000 },
  { name: 'E***f', reward: 145_000 },
  { name: 'A***n', reward: 52_500 },
];
const rulesText = () => [
  `1. Etkinlik süresi: ${fmtDate(EVENT_START)} - ${fmtDate(EVENT_END)}.`,
  `2. Kayıt ödülü: Davet ettiğin arkadaşın davet kodunla kayıt olup 2 gün içinde Gerçek Kişi Doğrulamasını tamamlarsa ${usd(SIGNUP_REWARD)} kazanırsın. Ödül tutarı herkes için aynıdır.`,
  '3. Gelir görev ödülü: Arkadaşın belirtilen gün içinde gelir hedefine ulaşır, doğrulamayı tamamlar ve en az bir kez başarılı para çekme yaparsa ödül verilir.',
  `4. Arkadaş kazancı: Arkadaşının gelirinden ${pct(RULES.inviteIncomeShare)} ve şarjlarından ${pct(RULES.inviteRechargeShare)} oranında ödül alırsın. Bu ödüller platform tarafından ayrıca ödenir; arkadaşının kazancından veya bakiyesinden düşülmez.`,
  `5. Ek bonus: Etkinlik süresince kümülatif başarılı davet sayına göre (5/10/20/30) ek ödül açılır. En fazla ${INVITE_CAP} davet sayılır.`,
  '6. Her gerçek kişi ve her cihaz için tek hesap geçerlidir. Sahte hesap, toplu kayıt veya kendi kendini davet tespit edilirse ödüller iptal edilir ve hesap kısıtlanabilir.',
  '7. Ödüller doğrulama ve güvenlik kontrollerinden sonra hesabına aktarılır.',
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const remaining = (t: number) => {
  const s = Math.max(0, Math.floor((EVENT_END - t) / 1000));
  return [Math.floor(s / 86_400), Math.floor((s % 86_400) / 3600), Math.floor((s % 3600) / 60), s % 60];
};

type Nav = { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } };

export default function InviteScreen() {
  const { inviteCode, inviteRewards, simulateInviteePurchase } = useApp();
  const [t, setT] = useState(nowMs);

  useEffect(() => {
    const id = setInterval(() => setT(nowMs()), 1000);
    return () => clearInterval(id);
  }, []);

  // The store has no invited-friend list yet; distinct invitees with a non-cancelled purchase stand in for it.
  const invited = new Set(inviteRewards.filter((r) => r.status !== 'İptal edildi').map((r) => r.inviteeId)).size;
  const units = inviteRewards.filter((r) => r.status === 'Onaylandı').length;
  const nextIdx = MILESTONES.findIndex((m) => invited < m.invites);
  const next = nextIdx >= 0 ? MILESTONES[nextIdx] : null;
  const prevGoal = nextIdx > 0 ? MILESTONES[nextIdx - 1].invites : 0;
  const [dd, hh, mm, ss] = remaining(t);
  const tick = TICKER[Math.floor(t / 3000) % TICKER.length];

  const shareInvite = async () => {
    try {
      await Share.share({ message: `Similar Club'a katıl, sesli odalarda tanışalım! Kayıt olurken davet kodumu kullan: ${inviteCode} 🎙️` });
    } catch {
      showAlert('Davet kodun', inviteCode);
    }
  };

  const copy = async () => {
    const clip = Platform.OS === 'web' ? (globalThis as Nav).navigator?.clipboard : undefined;
    if (clip) {
      try {
        await clip.writeText(inviteCode);
        return showAlert('Kopyalandı', `Davet kodun ${inviteCode} panoya kopyalandı.`);
      } catch {
        // fall through to the share sheet
      }
    }
    if (Platform.OS === 'web') return showAlert('Kopyalandı', `Davet kodun: ${inviteCode}`);
    try {
      await Share.share({ message: inviteCode });
    } catch {
      showAlert('Davet kodun', inviteCode);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Ödüllü Davet"
        right={
          <Pressable onPress={() => showAlert('Etkinlik Kuralları', rulesText().join('\n\n'))} style={styles.rulesBtn} hitSlop={6}>
            <Text style={styles.rulesText}>Etkinlik Kuralları</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 110 }}>
        <LinearGradient colors={['#F97316', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.ticker}>
            <Ionicons name="volume-medium-outline" size={18} color="#fff" />
            <Text style={styles.tickerText} numberOfLines={2}>
              {tick.name}, arkadaşlarını katılmaya davet ettikten sonra <Text style={{ color: colors.gold, fontWeight: '800' }}>{usd(tick.reward)}</Text> ödülleri alır
            </Text>
          </View>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Davet Kodum</Text>
            <Text style={styles.code}>{inviteCode}</Text>
            <Pressable onPress={copy} style={styles.copyBtn}>
              <Text style={styles.copyText}>Kopyala</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* Registration reward — identical for every invited user */}
        <Card style={styles.section}>
          <SectionTitle title="Kayıt ödülü" />
          <Pressable
            onPress={() => showAlert('Kayıt ödülü', 'Şimdi arkadaşlarını davet et ve ilgili görevleri tamamlayarak kayıt ödülü kazan!')}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            <LinearGradient colors={['#EA580C', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.signup}>
              <Text style={{ fontSize: 34 }}>🪙</Text>
              <Text style={styles.signupAmount}>{usd(SIGNUP_REWARD)}</Text>
              <Text style={styles.signupText}>
                Davet ettiğin arkadaşın kayıt olup 2 gün içinde Gerçek Kişi Doğrulamasını tamamladığında {usd(SIGNUP_REWARD)} ödül verilir. Ödül tüm kullanıcılar için aynıdır.
              </Text>
            </LinearGradient>
          </Pressable>
        </Card>

        {/* Income task rewards */}
        <Card style={styles.section}>
          <SectionTitle title="Gelir görev ödülü" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {INCOME_TASKS.map((x) => (
              <View key={x.days} style={styles.taskCard}>
                <LinearGradient colors={['#F97316', '#DB2777']} style={styles.taskTop}>
                  <Text style={styles.taskAmount}>{usd(x.reward)}</Text>
                  <Text style={{ fontSize: 30 }}>💰</Text>
                </LinearGradient>
                <Text style={styles.taskGoal}>
                  {x.days} gün içinde kazanç{'\n'}
                  {x.goal.toLocaleString('tr-TR')} 💎 ulaştı
                </Text>
              </View>
            ))}
          </View>
          <Text style={[styles.dim, { textAlign: 'center' }]}>
            Arkadaşın belirtilen gün içinde kazanç hedefine ulaşır, Gerçek Kişi Doğrulamasını tamamlar ve en az bir kez başarılı para çekme yaparsa ödül kazanırsın.
          </Text>
          <Pressable
            onPress={() =>
              showAlert(
                'İlerlemen',
                invited
                  ? `${invited} davetli arkadaşın var. Gelir hedeflerini henüz tamamlayan olmadı; hedef tamamlandığında ödül otomatik olarak hesabına eklenir.`
                  : 'Henüz davet ettiğin bir arkadaş yok. Davet kodunu paylaşarak başla!',
              )
            }
            style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={styles.link}>İlerlemeni Gör</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gold} />
          </Pressable>
        </Card>

        {/* Friend earnings — paid by the platform */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShareCard label="Gelir" value={pct(RULES.inviteIncomeShare)} tint="#38BDF8" text={`Arkadaşınızın gelirinden ${pct(RULES.inviteIncomeShare)} oranında komisyon alabilirsiniz`} />
          <ShareCard label="Şarj ödülü" value={pct(RULES.inviteRechargeShare)} tint={colors.green} text={`Arkadaşınızın şarjından ${pct(RULES.inviteRechargeShare)} oranında pay alabilirsiniz`} />
        </View>
        <Text style={[styles.dim, { textAlign: 'center', marginTop: -6 }]}>
          Bu ödüller platform tarafından ayrıca ödenir; arkadaşının kazancından veya bakiyesinden düşülmez.
        </Text>

        {/* Extra bonus with countdown + milestones */}
        <Card style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bonusTitle}>Ek Bonus</Text>
              <Text style={styles.dim}>Daha Fazla Davet Et, Daha Fazla Kazan</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.dim}>Etkinlik Süresi</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                {fmtDate(EVENT_START)}-{fmtDate(EVENT_END)}
              </Text>
            </View>
          </View>

          <LinearGradient colors={['#DC2626', '#F97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.countdown}>
            <Text style={styles.countTitle}>⏰ Sınırlı Süreli Etkinlik Ödülleri</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <TimeBox value={dd} label="Gün" />
              <Text style={styles.colon}>:</Text>
              <TimeBox value={hh} label="Saat" />
              <Text style={styles.colon}>:</Text>
              <TimeBox value={mm} label="Dakika" />
              <Text style={styles.colon}>:</Text>
              <TimeBox value={ss} label="Saniye" />
            </View>
          </LinearGradient>

          <View style={styles.milestones}>
            {MILESTONES.map((m, i) => {
              const done = invited >= m.invites;
              const current = i === nextIdx;
              return (
                <View key={m.invites} style={styles.milestone}>
                  <View style={{ height: 22, justifyContent: 'flex-end' }}>
                    {current && (
                      <View style={styles.here}>
                        <Text style={styles.hereText}>Buradasın</Text>
                      </View>
                    )}
                  </View>
                  <LinearGradient colors={done || current ? ['#FBBF24', '#F97316'] : [colors.cardAlt, colors.border]} style={styles.medal}>
                    <Text style={[styles.medalText, !(done || current) && { color: colors.textDim }]}>{usd(m.reward)}</Text>
                  </LinearGradient>
                  <View style={[styles.dot, (done || current) && { borderColor: '#F97316', backgroundColor: done ? '#F97316' : colors.card }]} />
                  <Text style={styles.mileN}>{m.invites}</Text>
                  <Text style={[styles.dim, { textAlign: 'center', fontSize: 11 }]}>Kümülatif{'\n'}davetiyeler</Text>
                  <View style={[styles.mileChip, done ? { backgroundColor: 'rgba(34,197,94,0.18)' } : current ? { backgroundColor: 'rgba(251,191,36,0.18)' } : null]}>
                    <Text style={[styles.mileChipText, { color: done ? colors.green : current ? colors.gold : colors.textDim }]}>
                      {done ? '✓ Kazanıldı' : current ? 'Devam Ediyor' : '🔒 Kilidi Açılacak'}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.mileTrack} />
          </View>

          <View style={styles.ringRow}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.dim, { textAlign: 'center' }]}>Mevcut Davet Edilen Arkadaşlar</Text>
              <Text style={styles.bigOrange}>{invited}</Text>
            </View>
            <Ring value={invited - prevGoal} max={(next?.invites ?? INVITE_CAP) - prevGoal} label={`${invited}`} sub={`/${next?.invites ?? INVITE_CAP}`} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.dim, { textAlign: 'center' }]}>Bir sonraki ödül için hâlâ davet etmeniz gereken</Text>
              <Text style={styles.bigOrange}>{next ? next.invites - invited : 0}</Text>
            </View>
          </View>
          {next ? (
            <Text style={styles.unlock}>
              🔥 <Text style={{ color: '#F97316', fontWeight: '800' }}>{next.invites - invited}</Text> arkadaş daha davet ederek{' '}
              <Text style={{ color: colors.gold, fontWeight: '800' }}>{usd(next.reward)}</Text> ödülünü açın
            </Text>
          ) : (
            <Text style={styles.unlock}>🎉 Tüm ek bonus ödüllerini açtın!</Text>
          )}

          <View style={{ gap: 6 }}>
            <View style={styles.capBubble}>
              <Text style={styles.capText}>
                {Math.min(invited, INVITE_CAP)}/{INVITE_CAP}
              </Text>
            </View>
            <View style={styles.capTrack}>
              <LinearGradient colors={['#FBBF24', '#F97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.capFill, { width: `${(Math.min(invited, INVITE_CAP) / INVITE_CAP) * 100}%` }]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.dim}>0</Text>
              <Text style={styles.dim}>{INVITE_CAP}</Text>
            </View>
          </View>
        </Card>

        {/* How a successful invite is counted */}
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#F97316" />
            <Text style={[styles.bonusTitle, { fontSize: 17, color: '#F97316' }]}>Başarılı davet nasıl sayılır?</Text>
          </View>
          <Text style={styles.dim}>• Arkadaşın davet kodunla veya davet bağlantınla kayıt olmalıdır.</Text>
          <Text style={styles.dim}>• Kayıttan sonra Gerçek Kişi Doğrulamasını tamamlamalıdır.</Text>
          <Text style={styles.dim}>• Her gerçek kişi ve her cihaz için yalnızca bir hesap geçerli sayılır.</Text>
          <Text style={styles.dim}>• Sahte hesap, toplu kayıt veya kendi kendini davet gibi kötüye kullanımlar tespit edilirse ilgili ödüller iptal edilir.</Text>
          <Text style={styles.dim}>Bu koşulları sağlayan davetler başarılı davet olarak geçerli sayılır.</Text>
        </Card>

        {/* Per-purchase invite reward units (kept from the tasks screen) */}
        <Card style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Davet ödüllerim</Text>
            <Text style={{ color: colors.gold, fontWeight: '800' }}>🎟️ {units} birim</Text>
          </View>
          <Text style={styles.dim}>
            Davet ettiğin kişi her başarılı jeton alımı yaptığında {RULES.inviteUnitsPerPurchase} davet ödül birimi kazanırsın. Ödül, alınan jeton miktarına değil başarılı alım sayısına bağlıdır. Başarısız/iade
            edilen alımlar ödül üretmez. Birimler elmas veya USD değildir.
          </Text>
          {inviteRewards.map((r) => (
            <View key={r.id} style={styles.rowBetween}>
              <Text style={{ color: '#fff' }}>
                {userById(r.inviteeId).name} · {r.ref}
              </Text>
              <Text style={{ color: r.status === 'Onaylandı' ? colors.green : r.status === 'Beklemede' ? colors.gold : colors.red, fontWeight: '700', fontSize: 12 }}>
                {r.status} · {r.time}
              </Text>
            </View>
          ))}
          <Pressable onPress={simulateInviteePurchase}>
            <Text style={{ color: colors.pink, fontWeight: '700' }}>(Demo) Davet ettiğim kişi jeton aldı</Text>
          </Pressable>
        </Card>
      </ScrollView>

      <View style={styles.sticky}>
        <Pressable onPress={shareInvite} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
          <LinearGradient colors={['#F97316', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.stickyBtn}>
            <Text style={styles.stickyText}>Arkadaşlarını Davet Et</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={{ color: '#F97316' }}>◆</Text>
      <Text style={styles.sectionTitleText}>{title}</Text>
      <Text style={{ color: '#F97316' }}>◆</Text>
    </View>
  );
}

function ShareCard({ label, value, text, tint }: { label: string; value: string; text: string; tint: string }) {
  return (
    <Card style={[styles.shareCard, { borderTopColor: tint }]}>
      <Text style={[styles.shareLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.shareValue}>{value}</Text>
      <Text style={styles.shareSub}>Arkadaş Kazancı</Text>
      <Text style={[styles.dim, { textAlign: 'center' }]}>{text}</Text>
    </Card>
  );
}

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <View style={styles.timeBox}>
        <Text style={styles.timeText}>{pad2(value)}</Text>
      </View>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

const RING = 116;
function Ring({ value, max, label, sub }: { value: number; max: number; label: string; sub: string }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 1;
  const angle = p * 2 * Math.PI - Math.PI / 2;
  const r = RING / 2 - 4;
  return (
    <View style={{ width: RING, height: RING }}>
      <View style={[styles.ring, p >= 1 && { borderColor: '#F97316' }]} />
      <View style={[styles.ringDot, { left: RING / 2 + r * Math.cos(angle) - 6, top: RING / 2 + r * Math.sin(angle) - 6 }]} />
      <View style={styles.ringCenter}>
        <Text style={[styles.bigOrange, { fontSize: 34 }]}>{label}</Text>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  rulesBtn: { backgroundColor: colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  rulesText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  hero: { borderRadius: 20, padding: 14, gap: 12 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  tickerText: { color: '#fff', fontSize: 13, flex: 1 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  codeLabel: { color: '#fff', fontSize: 15 },
  code: { color: '#FB7185', fontWeight: '900', fontSize: 16, flex: 1, letterSpacing: 1 },
  copyBtn: { backgroundColor: '#F97316', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  copyText: { color: '#fff', fontWeight: '800' },
  section: { gap: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 8, alignSelf: 'center', paddingHorizontal: 26 },
  sectionTitleText: { color: '#FDBA74', fontWeight: '900', fontSize: 18 },
  signup: { borderRadius: 16, padding: 18, alignItems: 'center', gap: 8 },
  signupAmount: { color: colors.gold, fontSize: 44, fontWeight: '900' },
  signupText: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 13, lineHeight: 19 },
  taskCard: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 16, overflow: 'hidden' },
  taskTop: { alignItems: 'center', paddingVertical: 12, gap: 4, borderTopLeftRadius: 60, borderTopRightRadius: 60 },
  taskAmount: { color: '#fff', fontWeight: '900', fontSize: 16 },
  taskGoal: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', padding: 8, lineHeight: 16 },
  link: { color: colors.gold, fontWeight: '800', textDecorationLine: 'underline' },
  shareCard: { flex: 1, alignItems: 'center', gap: 4, borderTopWidth: 4 },
  shareLabel: { fontWeight: '800' },
  shareValue: { color: '#fff', fontSize: 38, fontWeight: '900' },
  shareSub: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bonusTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  countdown: { borderRadius: 16, padding: 12, alignItems: 'center', gap: 8 },
  countTitle: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  timeBox: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: 'center', borderWidth: 2, borderColor: '#B91C1C' },
  timeText: { color: '#B91C1C', fontWeight: '900', fontSize: 22, fontVariant: ['tabular-nums'] },
  timeLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  colon: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 6 },
  milestones: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4 },
  milestone: { flex: 1, alignItems: 'center', gap: 4, zIndex: 1 },
  here: { backgroundColor: '#F97316', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  hereText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  medal: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#3B2300', fontWeight: '900', fontSize: 13 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.card, marginTop: 4 },
  mileTrack: { position: 'absolute', left: 16, right: 16, top: 10 + 22 + 4 + 62 + 4 + 4 + 6, height: 4, borderRadius: 2, backgroundColor: colors.border },
  mileN: { color: '#fff', fontWeight: '900', fontSize: 16 },
  mileChip: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: colors.card, marginTop: 2 },
  mileChipText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ring: { position: 'absolute', left: 4, top: 4, right: 4, bottom: 4, borderRadius: RING, borderWidth: 6, borderColor: 'rgba(249,115,22,0.22)' },
  ringDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#F97316' },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bigOrange: { color: '#F97316', fontSize: 30, fontWeight: '900' },
  unlock: { color: '#fff', textAlign: 'center', fontSize: 14 },
  capBubble: { alignSelf: 'flex-start', backgroundColor: '#F97316', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  capText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  capTrack: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  capFill: { height: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, backgroundColor: 'rgba(18,11,36,0.92)' },
  stickyBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  stickyText: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
