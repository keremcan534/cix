// Yayıncı Merkezi › Otomatik Mesajlarım (docs/OTOMATIK_MESAJ.md §5): a woman streamer's 10 automatic messages, each
// hers to word or left as the default, today's rights (automatic messages and quick replies, apart), and her switch.
// The server checks every word (the contact filter, the length) and decides who gets them and when
// (server/api/auto-chat.mjs); this screen only edits and shows. Live mode only: the demo has no automatic messages.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Button, Card, Header } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { liveMode, message } from '@/lib/live';
import { loadTemplates, resetTemplate, saveTemplate, setAutoChoice, useAutoMe, type Templates } from '@/lib/live/auto-chat';
import { makeStyles, useTheme } from '@/theme';

export default function AutoMessages() {
  const { colors } = useTheme();
  const s = useStyles();
  const me = useAutoMe();
  const [data, setData] = useState<Templates | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!liveMode()) return;
    loadTemplates()
      .then((d) => {
        setData(d);
        setDrafts(Object.fromEntries(d.templates.map((t) => [t.no, t.text])));
      })
      .catch((e) => setFailed(message(e)));
  }, []);

  const apply = (d: Templates, no: number) => {
    setData(d);
    setDrafts((x) => ({ ...x, [no]: d.templates.find((t) => t.no === no)?.text ?? x[no] }));
  };
  const save = async (no: number) => {
    setBusy(no);
    try {
      apply(await saveTemplate(no, drafts[no] ?? ''), no);
    } catch (e) {
      showAlert('Kaydedilemedi', message(e));
    } finally {
      setBusy(null);
    }
  };
  const reset = async (no: number) => {
    setBusy(no);
    try {
      apply(await resetTemplate(no), no);
    } catch (e) {
      showAlert('Geri alınamadı', message(e));
    } finally {
      setBusy(null);
    }
  };

  if (!liveMode()) {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Otomatik Mesajlarım" />
        <Text style={s.empty}>Otomatik mesajlar sunucuya bağlı sürümde çalışır.</Text>
      </SafeAreaView>
    );
  }
  const auto = data?.auto ?? me?.auto ?? null;
  const quick = me?.quick ?? null;
  return (
    <SafeAreaView style={s.safe}>
      <Header title="Otomatik Mesajlarım" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {failed ? (
          <Card>
            <Text style={s.title}>Açılamadı</Text>
            <Text style={s.dim}>{failed}</Text>
          </Card>
        ) : !data ? (
          <ActivityIndicator color={colors.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <Text style={s.title}>Bugünkü haklar</Text>
              <View style={s.row}>
                <Text style={s.label}>Otomatik mesaj</Text>
                <Text style={s.value}>{auto ? `${auto.left}/${auto.total} kaldı` : '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Hazır cevap</Text>
                <Text style={s.value}>{quick ? `${quick.left}/${quick.total} kaldı` : '—'}</Text>
              </View>
              <Text style={s.dim}>Haklar Türkiye saatiyle her gece 00.00’da yenilenir, kullanılmayan hak ertesi güne geçmez. İki hak birbirinden ayrıdır.</Text>
              {auto && auto.left === 0 && <Text style={[s.dim, { color: colors.gold }]}>Otomatik mesaj hakkın kalmadı. Elmas kazanmak için gelen mesajları yanıtla.</Text>}
              <View style={[s.row, { marginTop: 4 }]}>
                <Text style={[s.label, { flex: 1 }]}>Otomatik mesajlarım gönderilsin</Text>
                <Switch
                  value={me?.auto?.sending ?? true}
                  onValueChange={(v) => void setAutoChoice('autoSend', v).catch((e) => showAlert('Kaydedilemedi', message(e)))}
                  accessibilityLabel="Otomatik mesajlarım gönderilsin"
                />
              </View>
              <Text style={s.dim}>
                Sistem, çevrimiçi olduğun zamanlarda şablonlarından birini sana uygun yeni kullanıcılara gönderir. Mesaj karşı tarafta “Otomatik mesaj” olarak görünür.
              </Text>
            </Card>
            {data.templates.map((t) => {
              const draft = drafts[t.no] ?? t.text;
              const changed = draft.trim() !== t.text;
              const len = draft.trim().length;
              const bad = len < data.limits.min || len > data.limits.max;
              return (
                <Card key={t.no} style={{ gap: 8 }}>
                  <View style={s.row}>
                    <Text style={s.title}>Mesaj {t.no}</Text>
                    <Text style={[s.badge, t.custom ? s.badgeMine : null]}>{t.custom ? 'Kişiselleştirilmiş' : 'Varsayılan'}</Text>
                  </View>
                  <TextInput
                    value={draft}
                    onChangeText={(v) => setDrafts((x) => ({ ...x, [t.no]: v.replace(/\n/g, ' ') }))}
                    maxLength={data.limits.max}
                    multiline
                    style={s.input}
                    placeholderTextColor={colors.textDim}
                    accessibilityLabel={`Otomatik mesaj ${t.no}`}
                  />
                  <Text style={[s.dim, bad && changed ? { color: colors.pink } : null]}>
                    {len}/{data.limits.max} karakter{bad && changed ? ` · en az ${data.limits.min} karakter olmalı` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Kaydet" icon="checkmark" small disabled={!changed || bad || busy !== null} onPress={() => void save(t.no)} style={{ flex: 1 }} />
                    <Button title="Varsayılana dön" icon="refresh" small variant="ghost" disabled={!t.custom || busy !== null} onPress={() => void reset(t.no)} style={{ flex: 1 }} />
                  </View>
                  {t.custom && (
                    <Text style={s.dim} numberOfLines={2}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.textDim} /> Varsayılan: {t.defaultText}
                    </Text>
                  )}
                </Card>
              );
            })}
            <Text style={s.dim}>
              Telefon numarası, sosyal medya hesabı, IBAN gibi iletişim bilgileri ve uygunsuz ifadeler kaydedilmez. Kurallara uymayan mesaj gönderilmez.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textDim, textAlign: 'center', padding: 32 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: colors.text, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, fontWeight: '800' },
  badge: { color: colors.textDim, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  badgeMine: { color: '#fff', backgroundColor: colors.primary },
  input: { color: colors.text, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 48 },
}));
