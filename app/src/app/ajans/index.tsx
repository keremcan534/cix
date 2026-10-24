import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { AGENCIES, AGENCY_EVENTS, ROLE_LABEL, agencyByCode } from '@/data/agency';
import { showAlert } from '@/lib/alert';
import { RULES, pct, usd } from '@/data/rules';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function AgencyHub() {
  const { agencyId, agencyRole, ownedAgency, pendingAgency } = useApp();
  if (agencyRole === 'owner' || agencyRole === 'assistant') return <OwnerEntry />;
  if (agencyId) return <MemberView />;
  if (pendingAgency || ownedAgency?.status === 'İnceleniyor') return <Pending />;
  return <JoinOrCreate />;
}

function Pending() {
  const { pendingAgency, ownedAgency } = useApp();
  const a = AGENCIES.find((x) => x.id === pendingAgency);
  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Ajans" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <ActivityIndicator color={colors.pink} size="large" />
        <Text style={styles.title}>{a ? `${a.name} başvurunu inceliyor` : `${ownedAgency?.name} ajans başvurun inceleniyor`}</Text>
        <Text style={[styles.dim, { textAlign: 'center' }]}>Sonuç bildirim olarak gelecek. Ret durumunda gerekçe gösterilir ve itiraz edebilirsin. (Demo: birkaç saniye)</Text>
      </View>
    </SafeAreaView>
  );
}

function JoinOrCreate() {
  const { joinAgency, applyAgency, isHost } = useApp();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [idNo, setIdNo] = useState('');
  const preview = agencyByCode(code);

  const join = () => {
    if (!isHost) return showAlert('Önce yayıncı ol', 'Ajansa katılmak için yayıncı başvurusu yapmalısın.', [{ text: 'Tamam' }, { text: 'Yayıncı Merkezi', onPress: () => router.push('/yayinci') }]);
    if (!preview) return showAlert('Geçersiz kod', 'Bu koda ait bir ajans bulunamadı.');
    if (!accepted) return showAlert('Şartları onayla', 'Katılmadan önce üyelik şartlarını okuyup onaylaman gerekiyor.');
    const err = joinAgency(code);
    if (err) showAlert('Katılım başarısız', err);
  };

  const create = () => {
    if (name.trim().length < 3) return showAlert('Ajans adı en az 3 karakter olmalı');
    if (idNo.replace(/\D/g, '').length !== 11) return showAlert('Kimlik/vergi numarası 11 hane olmalı');
    applyAgency(name.trim());
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Ajans" />
      <View style={styles.segment}>
        {(['join', 'create'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segActive]}>
            <Text style={styles.segText}>{m === 'join' ? 'Ajansa katıl' : 'Ajans kur'}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {mode === 'join' ? (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={styles.title}>Davet koduyla katıl</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Örn. STAR01" placeholderTextColor={colors.textDim} autoCapitalize="characters" style={styles.input} />
              {code.length >= 6 && !preview && <Text style={{ color: colors.red }}>Bu koda ait ajans yok.</Text>}
              {preview && (
                <View style={styles.preview}>
                  <Text style={{ fontSize: 30 }}>{preview.logo}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{preview.name}</Text>
                    <Text style={styles.dim}>
                      Sahibi {preview.owner} · {preview.hosts} yayıncı · Kuruluş {preview.founded}
                    </Text>
                    <Text style={[styles.dim, preview.status !== 'active' && { color: colors.red }]}>{preview.status === 'active' ? `Ajans komisyonu ${pct(RULES.agencyCommission)} · yayıncı kazancından kesilmez` : 'Bu ajans kapalı — yeni üye kabul etmiyor'}</Text>
                  </View>
                </View>
              )}
              {preview && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Üyelik şartları</Text>
                  {preview.terms.map((t) => (
                    <Text key={t} style={styles.dim}>
                      • {t}
                    </Text>
                  ))}
                  <Pressable style={styles.check} onPress={() => setAccepted((v) => !v)}>
                    <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={22} color={accepted ? colors.pink : colors.textDim} />
                    <Text style={{ color: '#fff', flex: 1 }}>Şartları okudum ve kabul ediyorum</Text>
                  </Pressable>
                </View>
              )}
              <GradientButton title="Başvur" onPress={join} />
            </Card>
            <Text style={styles.section}>Ajanslar</Text>
            {AGENCIES.map((a) => (
              <Pressable key={a.id} onPress={() => setCode(a.code)}>
                <Card style={styles.row}>
                  <Text style={{ fontSize: 30 }}>{a.logo}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{a.name}</Text>
                    <Text style={styles.dim}>
                      {a.status === 'active' ? `${a.hosts} yayıncı · ${a.code}` : 'Kapalı'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </Card>
              </Pressable>
            ))}
          </>
        ) : (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Yeni ajans başvurusu</Text>
            <Text style={styles.dim}>Başvurun platform tarafından incelenir. Onaylanınca benzersiz bir davet kodu üretilir ve ajans sahibi paneli açılır.</Text>
            <Text style={styles.label}>Ajans adı</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Örn. Yıldız Ajans" placeholderTextColor={colors.textDim} maxLength={24} />
            <Text style={styles.label}>Açıklama</Text>
            <TextInput value={desc} onChangeText={setDesc} style={[styles.input, { minHeight: 70 }]} multiline placeholder="Ajansını kısaca anlat" placeholderTextColor={colors.textDim} />
            <Text style={styles.label}>Kimlik / vergi no (11 hane)</Text>
            <TextInput value={idNo} onChangeText={(t) => setIdNo(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" style={styles.input} placeholder="•••••••••••" placeholderTextColor={colors.textDim} />
            <GradientButton title="Başvuruyu gönder" icon="send" onPress={create} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OwnerEntry() {
  const { ownedAgency, agencyRole } = useApp();
  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Ajans" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 44 }}>🏢</Text>
          <Text style={[styles.title, { fontSize: 20 }]}>{ownedAgency?.name}</Text>
          <Text style={styles.dim}>
            {ROLE_LABEL[agencyRole!]} · Davet kodu: {ownedAgency?.code}
          </Text>
        </Card>
        <GradientButton title="Ajans sahibi paneli" icon="speedometer" onPress={() => router.push('/ajans/panel')} />
        <GradientButton title="Ajans sohbet grubu" icon="chatbubbles" onPress={() => router.push('/ajans/sohbet')} />
        <GradientButton title="Üye ağım ve komisyonlar" icon="git-network" onPress={() => router.push('/ajans/ag')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberView() {
  const { agencyId, weekly, earnings, transfer, requestTransfer, createTicket } = useApp();
  const a = AGENCIES.find((x) => x.id === agencyId)!;
  const [showTransfer, setShowTransfer] = useState(false);
  const [toCode, setToCode] = useState('');
  const [reason, setReason] = useState('');
  const week = weekly.reduce((x, y) => x + y, 0);
  const statuses = [
    { label: 'Bekleyen', value: Math.round(week * 0.3), color: colors.gold },
    { label: 'Onaylanan', value: Math.round(week * 0.5), color: '#7DD3FC' },
    { label: 'Ödenen', value: Math.round(week * 0.2), color: colors.green },
    { label: 'İtirazda', value: 0, color: colors.red },
  ];

  const submitTransfer = (leave: boolean) => {
    const err = requestTransfer(leave ? null : toCode, reason);
    if (err) return showAlert('Talep oluşturulamadı', err);
    setShowTransfer(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Ajansım" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Card style={styles.row}>
          <Text style={{ fontSize: 40 }}>{a.logo}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { fontSize: 18 }]}>{a.name}</Text>
            <Text style={styles.dim}>
              Sahibi {a.owner} · ID {a.code} · Üye: Ajans yayıncısı
            </Text>
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Performansım</Text>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Bugün" value="2 sa" />
            <Stat label="Bu hafta" value="14 sa" />
            <Stat label="Bu ay" value="52 sa" />
            <Stat label="Aktif gün" value="18" />
          </View>
          <Text style={styles.dim}>Haftalık elmas: 💎 {week.toLocaleString('tr-TR')} · Hedef: 40.000 💎 · Hesaplama: her gün 04:00</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Hak edişlerim</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {statuses.map((s) => (
              <View key={s.label} style={styles.statusBox}>
                <Text style={[styles.dim, { color: s.color }]}>{s.label}</Text>
                <Text style={{ color: '#fff', fontWeight: '800' }}>💎 {s.value.toLocaleString('tr-TR')}</Text>
                <Text style={styles.dim}>{usd(s.value)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.dim}>Kazancının tamamı senin. Ajansın {pct(RULES.agencyCommission)} komisyonu platform tarafından ayrıca ödenir, senden kesilmez. Son hareket: {earnings[0] ? `${earnings[0].source} +${earnings[0].amount}` : '—'}</Text>
          <Pressable
            onPress={() => {
              const no = createTicket('İtiraz', `Hak ediş itirazı · ${a.name}`);
              showAlert('İtiraz oluşturuldu', `Talep #${no}`);
            }}
          >
            <Text style={{ color: colors.pink, fontWeight: '700' }}>Hak edişe itiraz et</Text>
          </Pressable>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Ajans etkinlikleri ve görevler</Text>
          {AGENCY_EVENTS.map((e) => (
            <View key={e.id} style={{ gap: 2 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>📅 {e.title}</Text>
              <Text style={styles.dim}>
                {e.when} · {e.reward} · {e.joined} katılımcı
              </Text>
            </View>
          ))}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Ajans değişikliği / ayrılma</Text>
          {transfer ? (
            <>
              <Text style={{ color: colors.gold, fontWeight: '700' }}>Talep: {transfer.toCode ? `${transfer.toCode} ajansına geçiş` : 'Ajanstan ayrılma'} · {transfer.status}</Text>
              <Text style={styles.dim}>
                Oluşturma {transfer.created} · Karar en geç {transfer.decisionIn} içinde · Gerekçe: {transfer.reason}
              </Text>
              {transfer.steps.map((st, i) => (
                <View key={i} style={styles.step}>
                  <Text style={{ fontSize: 14 }}>{st.status === 'Bekliyor' ? '⏳' : st.status === 'Reddedildi' ? '❌' : '✅'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>{st.label}</Text>
                    <Text style={styles.dim}>
                      {st.status}
                      {st.time ? ` · ${st.time}` : ''}
                      {st.note ? ` · ${st.note}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
              {transfer.mode && (
                <Text style={styles.dim}>
                  Transfer türü: {transfer.mode}
                  {transfer.fee ? ` · Ücret ${transfer.fee.toLocaleString('tr-TR')} 💎 (${usd(transfer.fee)}), hedef ajans öder` : ''} · Kural: {transfer.feeRule}
                </Text>
              )}
              <Text style={styles.dim}>Geçmiş kazançların, eski ve yeni ajansın komisyon dönemleri ayrı korunur. Reddedilirse gerekçe gösterilir; itiraz edebilirsin.</Text>
              <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'İtiraz' } })}>
                <Text style={{ color: colors.pink, fontWeight: '700' }}>Transfer kararına itiraz et →</Text>
              </Pressable>
            </>
          ) : showTransfer ? (
            <>
              <Text style={styles.dim}>
                Süreç: mevcut ajans sahibi onaylar (ücretli/ücretsiz) → hedef ajans kabul eder → bağlantı tek işlemde güncellenir. En geç 7 gün. Tahmini transfer ücreti:{' '}
                {Math.round(weekly.reduce((x, y) => x + y, 0) * 4 * 0.1).toLocaleString('tr-TR')} 💎 (son 30 gün × %10, hedef ajans öder; senden kesilmez).
              </Text>
              <TextInput value={toCode} onChangeText={(t) => setToCode(t.toUpperCase())} placeholder="Yeni ajans kodu (ayrılmak için boş bırak)" placeholderTextColor={colors.textDim} style={styles.input} autoCapitalize="characters" />
              <TextInput value={reason} onChangeText={setReason} placeholder="Gerekçe" placeholderTextColor={colors.textDim} style={[styles.input, { minHeight: 60 }]} multiline />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <GradientButton small title="Geçiş talebi" onPress={() => submitTransfer(false)} />
                <Pressable style={styles.secondary} onPress={() => submitTransfer(true)}>
                  <Text style={{ color: colors.red, fontWeight: '700' }}>Ayrılma talebi</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable onPress={() => setShowTransfer(true)}>
              <Text style={{ color: colors.pink, fontWeight: '700' }}>Talep oluştur →</Text>
            </Pressable>
          )}
        </Card>

        <GradientButton title="Ajans sohbet grubu" icon="chatbubbles" onPress={() => router.push('/ajans/sohbet')} />
        <GradientButton title="Üye ağım ve komisyonlar" icon="git-network" onPress={() => router.push('/ajans/ag')} />
        <Pressable style={{ alignItems: 'center', padding: 6 }} onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Ajans' } })}>
          <Text style={{ color: colors.textDim }}>🛟 Platform desteğine doğrudan yaz (ajansı aşarak)</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{value}</Text>
      <Text style={styles.dim}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  section: { color: '#fff', fontWeight: '700', fontSize: 16, marginTop: 6 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4 },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700' },
  statusBox: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 10, padding: 8 },
  secondary: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.cardAlt, justifyContent: 'center' },
});
