import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { FAQ, TICKET_CATEGORIES, type TicketCategory } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp, type Ticket } from '@/store';
import { colors, gradientDeep } from '@/theme';

const STATUS_COLOR: Record<Ticket['status'], string> = { Açık: colors.gold, Yanıtlandı: '#7DD3FC', Çözüldü: colors.green, 'Yeniden açıldı': colors.primaryText };

// Quick-help chips → the matching ticket category.
const TOPICS: { label: string; category: TicketCategory }[] = [
  { label: 'Hesap ve yetkiler', category: 'Hesap kısıtlaması' },
  { label: 'Elmas ve altın', category: 'Kazanç' },
  { label: 'İhlal Raporu', category: 'Şikâyet' },
  { label: 'Yükleme', category: 'Ödeme' },
  { label: 'Olağanüstü', category: 'Güvenlik' },
  { label: 'Doğrulama', category: 'Üyelik' },
  { label: 'Diğer', category: 'Teknik' },
];
const SUPPORT_EMAIL = 'destek@similarclub.app';
const FAQ_PREVIEW = 3;

type View_ = 'home' | 'faq' | 'new' | 'list';

export default function SupportScreen() {
  const { kategori } = useLocalSearchParams<{ kategori?: string }>();
  const { tickets, createTicket } = useApp();
  const initial = TICKET_CATEGORIES.includes(kategori as TicketCategory) ? (kategori as TicketCategory) : 'Teknik';
  const [tab, setTab] = useState<View_>(kategori ? 'new' : 'home');
  const [category, setCategory] = useState<TicketCategory>(initial);
  const [feedback, setFeedback] = useState(false);
  const [text, setText] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const openNew = (c: TicketCategory, isFeedback = false) => {
    setCategory(c);
    setFeedback(isFeedback);
    setTab('new');
  };

  const submit = () => {
    if (text.trim().length < 10) return showAlert('Lütfen sorunu biraz daha detaylı anlat (en az 10 karakter)');
    const no = createTicket(category, (feedback ? '[Geri bildirim] ' : '') + text.trim());
    setText('');
    setFeedback(false);
    setTab('list');
    showAlert('Talep oluşturuldu', `Talep numaran #${no}. Yanıtlar ve durum değişiklikleri burada görünür.`);
  };

  const email = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => showAlert('Resmi e-posta', `Bize ${SUPPORT_EMAIL} adresinden ulaşabilirsin.`));

  const faqItem = (f: (typeof FAQ)[number], i: number, last: boolean) => (
    <Pressable key={f.q} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={[styles.faqRow, !last && styles.divider]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.faqQ}>{f.q}</Text>
        <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.textDim} />
      </View>
      {openFaq === i && <Text style={styles.dim}>{f.a}</Text>}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={tab === 'home' ? '' : 'Müşteri hizmetleri'} />
      {tab !== 'home' && (
        <View style={styles.segment}>
          <Pressable onPress={() => setTab('home')} style={styles.segBtn} accessibilityLabel="Müşteri hizmetleri ana sayfa">
            <Ionicons name="home" size={15} color="#fff" />
          </Pressable>
          {(
            [
              ['faq', 'SSS'],
              ['new', feedback ? 'Geri bildirim' : 'Yeni talep'],
              ['list', `Taleplerim (${tickets.length})`],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
              <Text style={styles.segText}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {tab === 'home' && (
          <>
            <View style={styles.hero}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.heroTitle}>Müşteri hizmetleri</Text>
                <Text style={styles.heroSub}>Merhaba, size nasıl yardımcı olabilirim?</Text>
              </View>
              <LinearGradient colors={gradientDeep} style={styles.bot}>
                <Text style={{ fontSize: 30 }}>😉</Text>
              </LinearGradient>
            </View>

            <View style={styles.topics}>
              {TOPICS.map((t) => (
                <Pressable key={t.label} onPress={() => openNew(t.category)} style={({ pressed }) => [styles.topic, pressed && { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.topicText}>{t.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                </Pressable>
              ))}
            </View>

            <Card style={{ paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                <Text style={{ fontSize: 18 }}>🔥</Text>
                <Text style={styles.cardTitle}>SSS</Text>
                <View style={{ flex: 1 }} />
                {FAQ.length > FAQ_PREVIEW && (
                  <Pressable onPress={() => setTab('faq')} hitSlop={8}>
                    <Text style={[styles.dim, { color: colors.primaryText, fontWeight: '700' }]}>Tümü</Text>
                  </Pressable>
                )}
              </View>
              {FAQ.slice(0, FAQ_PREVIEW).map((f, i, arr) => faqItem(f, i, i === arr.length - 1))}
            </Card>

            <ServiceRow icon="headset" tint={['#F59E0B', '#F97316']} title="Çevrimiçi müşteri hizmetleri" sub="Manuel servis süresi 9:00 - 19:00" onPress={() => openNew(category)} />
            <ServiceRow icon="create" tint={['#3B82F6', '#0E7C9A']} title="Geri bildirim" onPress={() => openNew('Teknik', true)} />
            <ServiceRow
              icon="chatbubbles"
              tint={['#38BDF8', '#3B82F6']}
              title="Sorun Takibi"
              sub={tickets.length ? `${tickets.length} talep · ${tickets.filter((t) => t.status === 'Yanıtlandı').length} yanıtlandı` : undefined}
              onPress={() => setTab('list')}
            />
            <ServiceRow icon="mail" tint={['#D946EF', '#FF6576']} title="Resmi e-posta" sub={SUPPORT_EMAIL} onPress={email} />
          </>
        )}

        {tab === 'faq' && <Card style={{ paddingVertical: 4 }}>{FAQ.map((f, i, arr) => faqItem(f, i, i === arr.length - 1))}</Card>}

        {tab === 'new' && (
          <Card style={{ gap: 10 }}>
            {feedback && <Text style={styles.dim}>Uygulamayı geliştirmemize yardım et: öneri, hata veya beğenmediğin bir şeyi yaz.</Text>}
            <Text style={styles.label}>Kategori</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TICKET_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && { borderColor: colors.primaryText }]}>
                  <Text style={styles.chipText}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Açıklama</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={feedback ? 'Önerini veya geri bildirimini yaz…' : 'Ne oldu? Tarih, kullanıcı ID veya işlem numarası eklersen daha hızlı çözeriz.'}
              placeholderTextColor={colors.textDim}
              style={[styles.input, { minHeight: 110 }]}
            />
            <Pressable onPress={() => showAlert('Kanıt ekleme', 'Ekran görüntüsü ekleme gerçek sürümde dosya seçiciyle yapılır (demo).')} style={styles.attach}>
              <Ionicons name="attach" size={18} color={colors.textDim} />
              <Text style={styles.dim}>Kanıt ekle (ekran görüntüsü)</Text>
            </Pressable>
            <GradientButton title="Gönder" icon="send" onPress={submit} />
            <Text style={[styles.dim, { textAlign: 'center' }]}>Canlı destek 9:00 - 19:00 arasında yanıt verir; diğer saatlerde talebin sıraya alınır.</Text>
          </Card>
        )}

        {tab === 'list' && (tickets.length === 0 ? <Text style={[styles.dim, { textAlign: 'center', marginTop: 30 }]}>Henüz talebin yok.</Text> : tickets.map((t) => <TicketCard key={t.id} t={t} />))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ServiceRow({ icon, tint, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: readonly [string, string]; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      <Card style={styles.service}>
        <LinearGradient colors={tint} style={styles.serviceIcon}>
          <Ionicons name={icon} size={24} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.serviceTitle}>{title}</Text>
          {sub && <Text style={styles.dim}>{sub}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
      </Card>
    </Pressable>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  const { replyTicket, setTicketStatus } = useApp();
  const [reply, setReply] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            #{t.number} · {t.category}
          </Text>
          <Text style={styles.dim} numberOfLines={open ? undefined : 1}>
            {t.text}
          </Text>
        </View>
        <Text style={{ color: STATUS_COLOR[t.status], fontWeight: '800', fontSize: 12 }}>{t.status}</Text>
      </Pressable>
      {open && (
        <>
          {t.replies.map((r, i) => (
            <View key={i} style={[styles.reply, r.from === 'me' && { alignSelf: 'flex-end', backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontSize: 13 }}>{r.text}</Text>
              <Text style={[styles.dim, { fontSize: 11 }]}>
                {r.from === 'support' ? 'Destek' : 'Sen'} · {r.time}
              </Text>
            </View>
          ))}
          <TextInput value={reply} onChangeText={setReply} placeholder="Ek bilgi yaz / itiraz et" placeholderTextColor={colors.textDim} style={styles.input} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GradientButton
              small
              title="Gönder"
              onPress={() => {
                if (!reply.trim()) return;
                replyTicket(t.id, reply.trim());
                setReply('');
              }}
            />
            {t.status !== 'Çözüldü' && (
              <Pressable style={styles.secondary} onPress={() => setTicketStatus(t.id, 'Çözüldü')}>
                <Text style={{ color: colors.green, fontWeight: '700' }}>Çözüldü olarak kapat</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
  heroSub: { color: colors.textDim, fontSize: 16 },
  bot: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  topicText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  faqRow: { paddingVertical: 14, gap: 6 },
  faqQ: { color: '#fff', fontSize: 15, flex: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  service: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  serviceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  segBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 11, textAlignVertical: 'top' },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reply: { backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, maxWidth: '90%', gap: 2 },
  secondary: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.cardAlt, justifyContent: 'center' },
});
