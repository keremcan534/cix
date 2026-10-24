import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { FAQ, TICKET_CATEGORIES, type TicketCategory } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp, type Ticket } from '@/store';
import { colors } from '@/theme';

const STATUS_COLOR: Record<Ticket['status'], string> = { Açık: colors.gold, Yanıtlandı: '#7DD3FC', Çözüldü: colors.green, 'Yeniden açıldı': colors.pink };

export default function SupportScreen() {
  const { kategori } = useLocalSearchParams<{ kategori?: string }>();
  const { tickets, createTicket } = useApp();
  const initial = TICKET_CATEGORIES.includes(kategori as TicketCategory) ? (kategori as TicketCategory) : 'Teknik';
  const [tab, setTab] = useState<'new' | 'list' | 'faq'>(kategori ? 'new' : 'faq');
  const [category, setCategory] = useState<TicketCategory>(initial);
  const [text, setText] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const submit = () => {
    if (text.trim().length < 10) return showAlert('Lütfen sorunu biraz daha detaylı anlat (en az 10 karakter)');
    const no = createTicket(category, text.trim());
    setText('');
    setTab('list');
    showAlert('Talep oluşturuldu', `Talep numaran #${no}. Yanıtlar ve durum değişiklikleri burada görünür.`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Destek merkezi" />
      <View style={styles.segment}>
        {(
          [
            ['faq', 'SSS'],
            ['new', 'Yeni talep'],
            ['list', `Taleplerim (${tickets.length})`],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
            <Text style={styles.segText}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {tab === 'faq' &&
          FAQ.map((f, i) => (
            <Pressable key={f.q} onPress={() => setOpenFaq(openFaq === i ? null : i)}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>{f.q}</Text>
                  <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textDim} />
                </View>
                {openFaq === i && <Text style={styles.dim}>{f.a}</Text>}
              </Card>
            </Pressable>
          ))}

        {tab === 'new' && (
          <Card style={{ gap: 10 }}>
            <Text style={styles.label}>Kategori</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TICKET_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && { borderColor: colors.pink }]}>
                  <Text style={styles.chipText}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Açıklama</Text>
            <TextInput value={text} onChangeText={setText} multiline placeholder="Ne oldu? Tarih, kullanıcı ID veya işlem numarası eklersen daha hızlı çözeriz." placeholderTextColor={colors.textDim} style={[styles.input, { minHeight: 110 }]} />
            <Pressable onPress={() => showAlert('Kanıt ekleme', 'Ekran görüntüsü ekleme gerçek sürümde dosya seçiciyle yapılır (demo).')} style={styles.attach}>
              <Ionicons name="attach" size={18} color={colors.textDim} />
              <Text style={styles.dim}>Kanıt ekle (ekran görüntüsü)</Text>
            </Pressable>
            <GradientButton title="Gönder" icon="send" onPress={submit} />
          </Card>
        )}

        {tab === 'list' && (tickets.length === 0 ? <Text style={[styles.dim, { textAlign: 'center', marginTop: 30 }]}>Henüz talebin yok.</Text> : tickets.map((t) => <TicketCard key={t.id} t={t} />))}
      </ScrollView>
    </SafeAreaView>
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
              <Text style={[styles.dim, { fontSize: 10 }]}>
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
