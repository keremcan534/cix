import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Check, Chips, Field, KV, Note, Section, StatusBadge, Timeline, s } from '@/components/agency-apps';
import { Button, Header } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import {
  CLOSED,
  COUNTRIES,
  EMPTY_FORM,
  EXPERIENCE_LABEL,
  MAIN_PATH,
  agencyById,
  answerInfoRequest,
  cancelApplication,
  duplicateOf,
  myApplications,
  publicHistory,
  regionName,
  saveDraft,
  stamp,
  submitApplication,
  useAgencyApps,
  validEmail,
  validPhone,
  validateForm,
  type AppDocument,
  type Application,
  type ApplicationForm,
  type DocKind,
  type Experience,
} from '@/lib/agency-apps';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const ME = 'me';
const DOC_KINDS: DocKind[] = ['Kimlik', 'İşletme belgesi', 'Deneyim kanıtı', 'Diğer'];

async function pickDocument(kind: DocKind, count: number): Promise<AppDocument | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const kb = a.fileSize ? Math.max(1, Math.round(a.fileSize / 1024)) : 300 + count * 40;
  return { id: `doc-${Date.now()}`, name: a.fileName ?? `belge-${count + 1}.jpg`, kind, at: stamp(Date.now()), size: kb > 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${kb} KB`, uri: a.uri };
}

export default function AgencyApplicationScreen() {
  useAgencyApps(); // re-render on store changes
  const mine = myApplications(ME);
  const active = mine.find((a) => a.status !== 'Taslak' && !CLOSED.includes(a.status));
  const latestClosed = mine.find((a) => CLOSED.includes(a.status));
  const draft = mine.find((a) => a.status === 'Taslak');
  const [fresh, setFresh] = useState(false);

  if (active) return <Tracking app={active} />;
  if (latestClosed && !fresh && !draft) return <Tracking app={latestClosed} onNew={() => setFresh(true)} />;
  return <ApplicationFormView draft={draft} />;
}

// --- Form ------------------------------------------------------------------------

function ApplicationFormView({ draft }: { draft?: Application }) {
  const { me } = useApp();
  const [f, setF] = useState<ApplicationForm>(draft?.form ?? { ...EMPTY_FORM, fullName: me.name.includes(' ') ? me.name : '', city: me.city ?? '' });
  const [emailOk, setEmailOk] = useState(draft?.emailVerified ?? false);
  const [phoneOk, setPhoneOk] = useState(draft?.phoneVerified ?? false);
  const [docs, setDocs] = useState<AppDocument[]>(draft?.docs ?? []);
  const [docKind, setDocKind] = useState<DocKind>('Deneyim kanıtı');
  const [draftId, setDraftId] = useState(draft?.id);
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [number, setNumber] = useState('');

  const up = <K extends keyof ApplicationForm>(k: K, v: ApplicationForm[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (k === 'email') setEmailOk(false);
    if (k === 'phone') setPhoneOk(false);
  };
  const problem = validateForm(f, emailOk, phoneOk);

  const save = () => {
    const id = saveDraft(ME, f, emailOk, phoneOk, docs, draftId);
    setDraftId(id);
    showAlert('Taslak kaydedildi', 'Başvuruna daha sonra kaldığın yerden devam edebilirsin.');
  };
  const toReview = () => {
    if (problem) {
      errorHaptic();
      return showAlert('Eksik bilgi', problem);
    }
    const dup = duplicateOf(f, draftId);
    if (dup) {
      errorHaptic();
      return showAlert('Mükerrer başvuru', dup);
    }
    setStep('review');
  };
  const submit = () => {
    const id = saveDraft(ME, f, emailOk, phoneOk, docs, draftId);
    setDraftId(id);
    const err = submitApplication(ME, id);
    if (err) {
      errorHaptic();
      return showAlert('Başvuru gönderilemedi', err);
    }
    successHaptic();
    setNumber(myApplications(ME).find((a) => a.id === id)?.number ?? '');
    setStep('done');
  };
  const addDoc = async () => {
    const d = await pickDocument(docKind, docs.length);
    if (d) setDocs((x) => [...x, d]);
  };

  if (step === 'done') {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Ajans Başvurusu" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Ionicons name="checkmark-circle" size={72} color={semantic.success} />
          <Text style={[s.title, { textAlign: 'center' }]}>Başvurun alındı</Text>
          <Text style={[s.dim, { textAlign: 'center' }]}>Başvuru numaran</Text>
          <Text selectable style={{ color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1 }}>
            {number}
          </Text>
          <Text style={[s.dim, { textAlign: 'center' }]}>Durumunu bu ekrandan takip edebilirsin. Senden ek bilgi istenirse bildirim gelir.</Text>
          <Button title="Başvurumu takip et" icon="eye" onPress={() => router.replace('/ajans/basvuru')} style={{ alignSelf: 'stretch' }} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Bilgilerini kontrol et" />
        <ScrollView contentContainerStyle={s.scroll}>
          <Note text="Göndermeden önce bilgilerini kontrol et. Gönderdikten sonra yalnız senden ek bilgi istenirse güncelleyebilirsin." />
          <Section title="Ajans ve iletişim" icon="business" right={<EditLink onPress={() => setStep('form')} />}>
            <KV k="Ajans adı" v={f.agencyName} />
            <KV k="Ad soyad" v={f.fullName} />
            <KV k="E-posta" v={`${f.email} ✓`} />
            <KV k="Telefon" v={`${f.phone} ✓`} />
            <KV k="Ülke / şehir" v={`${f.country} · ${f.city}`} />
            <KV k="Bölge" v={regionName(f.country, f.city)} />
          </Section>
          <Section title="Deneyim" icon="ribbon" right={<EditLink onPress={() => setStep('form')} />}>
            <KV k="Ajans deneyimi" v={f.experience ? EXPERIENCE_LABEL[f.experience] : ''} />
            <KV k="Önceki platformlar" v={f.platforms} />
            <KV k="Ajans / şirket" v={f.company} />
            <KV k="Bağlantılar" v={f.links} />
          </Section>
          <Section title="Plan ve hedefler" icon="trending-up" right={<EditLink onPress={() => setStep('form')} />}>
            <KV k="Tahmini yayıncı" v={f.estimatedHosts} />
            <KV k="Yayıncı planı" v={f.recruitPlan} />
            <KV k="Büyüme hedefi" v={f.growthGoals} />
            <KV k="Ek açıklama" v={f.notes} />
            <KV k="Belgeler" v={docs.length ? docs.map((d) => `${d.kind}: ${d.name}`).join('\n') : 'Yok'} />
          </Section>
          <Check done={f.consent} label="Gizlilik bildirimi ve veri işleme onayı verildi" />
          <Button title="Başvuruyu gönder" icon="send" onPress={submit} />
          <Button title="Düzenlemeye dön" variant="ghost" onPress={() => setStep('form')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Header title="Ajans Başvurusu" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Note text="Yıldızlı (*) alanlar zorunlu, diğerleri isteğe bağlı. Vergi numarası gerekmez. Taslağı kaydedip sonra devam edebilirsin." />

          <Section title="1. Ajans ve iletişim" icon="business">
            <Field label="Ajans adı" required value={f.agencyName} onChange={(v) => up('agencyName', v)} placeholder="Örn. Yıldız Ajans" maxLength={32} />
            <Field label="Adın ve soyadın" required value={f.fullName} onChange={(v) => up('fullName', v)} placeholder="Örn. Ayşe Yılmaz" />
            <Field
              label="E-posta adresi"
              required
              value={f.email}
              onChange={(v) => up('email', v.trim())}
              placeholder="ornek@mail.com"
              keyboardType="email-address"
              right={<VerifyButton ok={emailOk} enabled={validEmail(f.email)} target={f.email} onVerified={() => setEmailOk(true)} />}
            />
            <Field
              label="Telefon numarası"
              required
              value={f.phone}
              onChange={(v) => up('phone', v)}
              placeholder="05xx xxx xx xx"
              keyboardType="phone-pad"
              right={<VerifyButton ok={phoneOk} enabled={validPhone(f.phone)} target={f.phone} onVerified={() => setPhoneOk(true)} />}
            />
            <Text style={s.label}>
              Faaliyet gösterilecek ülke<Text style={{ color: colors.primaryText }}> *</Text>
            </Text>
            <Chips options={COUNTRIES.map((c) => ({ key: c, label: c }))} value={f.country} onChange={(v) => up('country', v)} />
            <Field label="Şehir veya faaliyet bölgesi" required value={f.city} onChange={(v) => up('city', v)} placeholder="Örn. İstanbul" />
          </Section>

          <Section title="2. Deneyim" icon="ribbon">
            <Text style={s.label}>
              Ajans deneyimin<Text style={{ color: colors.primaryText }}> *</Text>
            </Text>
            <View style={{ gap: 8 }}>
              {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((k) => (
                <Pressable key={k} onPress={() => up('experience', k)} style={[s.chip, { borderRadius: 14, paddingVertical: 12, maxWidth: undefined }, f.experience === k && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: f.experience === k }}>
                  <View style={s.row}>
                    <Ionicons name={f.experience === k ? 'radio-button-on' : 'radio-button-off'} size={18} color={f.experience === k ? '#fff' : colors.textDim} />
                    <Text style={[s.body, { flex: 1 }, f.experience !== k && { color: colors.textDim }]}>{EXPERIENCE_LABEL[k]}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Field label="Daha önce çalıştığın canlı yayın / sesli sohbet platformları" value={f.platforms} onChange={(v) => up('platforms', v)} placeholder="Örn. Yalla, Bigo Live" />
            <Field label="Mevcut ajans veya şirket bilgileri" value={f.company} onChange={(v) => up('company', v)} placeholder="Şirket adı, kuruluş yılı…" />
            <Field label="Sosyal medya ve web sitesi bağlantıları" value={f.links} onChange={(v) => up('links', v)} placeholder="instagram.com/…, www…" />
          </Section>

          <Section title="3. Plan ve hedefler" icon="trending-up">
            <Field label="SimilarClub'a kazandırabileceğin tahmini yayıncı sayısı" required value={f.estimatedHosts} onChange={(v) => up('estimatedHosts', v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" placeholder="Örn. 25" />
            <Field label="Yayıncı bulma ve yönetme planın" value={f.recruitPlan} onChange={(v) => up('recruitPlan', v)} multiline placeholder="Yayıncıları nereden bulacaksın, nasıl destekleyeceksin?" />
            <Field label="Ajansın büyüme hedefleri" value={f.growthGoals} onChange={(v) => up('growthGoals', v)} multiline placeholder="Örn. 6 ayda 50 aktif yayıncı" />
            <Field label="Eklemek istediklerin" value={f.notes} onChange={(v) => up('notes', v)} multiline />
          </Section>

          <Section title="4. Belge veya kanıt" icon="document-attach">
            <Text style={s.dim}>Gerekli görülürse kimlik, işletme belgesi veya önceki ajans deneyimini gösteren ekran görüntüsü ekleyebilirsin.</Text>
            <Chips options={DOC_KINDS.map((k) => ({ key: k, label: k }))} value={docKind} onChange={setDocKind} />
            {docs.map((d) => (
              <View key={d.id} style={s.row}>
                <Ionicons name="document-text" size={18} color={colors.primaryText} />
                <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>
                  {d.kind}: {d.name}
                </Text>
                <Text style={s.mono}>{d.size}</Text>
                <Pressable onPress={() => setDocs((x) => x.filter((y) => y.id !== d.id))} hitSlop={10} accessibilityLabel={`${d.name} kaldır`}>
                  <Ionicons name="close-circle" size={20} color={colors.textDim} />
                </Pressable>
              </View>
            ))}
            <Button title="Belge ekle" icon="add" variant="tonal" small onPress={addDoc} style={{ alignSelf: 'flex-start' }} />
            <Note tone="warn" text="Belgeler şifreli saklanır. Yalnız başvuruna atanmış yetkili personel görebilir ve her görüntüleme kayda geçer." />
          </Section>

          <Section title="5. Gizlilik" icon="shield-checkmark">
            <Text style={s.dim}>
              Bilgilerin yalnız ajans başvurunun değerlendirilmesi, ajans hesabının kurulması ve yasal yükümlülükler için işlenir. Başvurun reddedilir veya iptal edilirse veriler saklama süresi sonunda silinir. Belgelerin üçüncü kişilerle paylaşılmaz.
            </Text>
            <Pressable onPress={() => up('consent', !f.consent)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: f.consent }}>
              <Ionicons name={f.consent ? 'checkbox' : 'square-outline'} size={24} color={f.consent ? colors.primaryText : colors.textDim} />
              <Text style={[s.body, { flex: 1 }]}>
                Gizlilik bildirimini okudum, verilerimin işlenmesini onaylıyorum<Text style={{ color: colors.primaryText }}> *</Text>
              </Text>
            </Pressable>
          </Section>

          {problem && <Note tone="warn" text={`Göndermeden önce: ${problem}`} />}
          <Button title="Kontrol et ve gönder" icon="arrow-forward" onPress={toReview} />
          <Button title="Taslak olarak kaydet" variant="tonal" icon="save-outline" onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EditLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Düzenle</Text>
    </Pressable>
  );
}

/** Demo verification: a code is "sent", any 6 digits confirm it. */
function VerifyButton({ ok, enabled, target, onVerified }: { ok: boolean; enabled: boolean; target: string; onVerified: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  if (ok)
    return (
      <View style={[s.row, { gap: 4 }]} accessibilityLabel="Doğrulandı">
        <Ionicons name="checkmark-circle" size={20} color={semantic.success} />
        <Text style={{ color: semantic.success, fontWeight: '800', fontSize: 13 }}>Doğrulandı</Text>
      </View>
    );
  if (code !== null)
    return (
      <TextInput
        value={code}
        onChangeText={(t) => {
          const c = t.replace(/\D/g, '').slice(0, 6);
          setCode(c);
          if (c.length === 6) {
            successHaptic();
            onVerified();
            setCode(null);
          }
        }}
        keyboardType="number-pad"
        placeholder="6 haneli kod"
        placeholderTextColor={colors.textDim}
        style={[s.input, { width: 120 }]}
        accessibilityLabel="Doğrulama kodu"
        autoFocus
      />
    );
  return (
    <Button
      title="Kod gönder"
      small
      variant="tonal"
      disabled={!enabled}
      onPress={() => {
        setCode('');
        showAlert('Kod gönderildi', `${target} adresine/numarasına 6 haneli kod gönderdik. (Demo: herhangi 6 hane)`);
      }}
    />
  );
}

// --- Tracking --------------------------------------------------------------------

function Tracking({ app, onNew }: { app: Application; onNew?: () => void }) {
  const { activateOwnedAgency, ownedAgency, createTicket } = useApp();
  const [answer, setAnswer] = useState('');
  const [extraDocs, setExtraDocs] = useState<AppDocument[]>([]);
  const open = app.infoRequests.find((q) => !q.answer);
  const stepIndex = MAIN_PATH.indexOf(app.status === 'Ek Bilgi Bekleniyor' || app.status === 'Askıya Alındı' ? (app.resumeTo ?? 'Ön İncelemede') : app.status);

  const sendAnswer = () => {
    if (!open) return;
    const err = answerInfoRequest(ME, app.id, open.id, answer, extraDocs);
    if (err) {
      errorHaptic();
      return showAlert('Gönderilemedi', err);
    }
    successHaptic();
    setAnswer('');
    setExtraDocs([]);
    showAlert('Yanıtın iletildi', 'Başvurun değerlendirmeye kaldığı yerden devam ediyor.');
  };
  const cancel = () =>
    showAlert('Başvuru iptal edilsin mi?', 'İptal edilen başvuru yeniden açılamaz; istersen yeni başvuru yapabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: () => {
          const err = cancelApplication(ME, app.id);
          if (err) showAlert('İptal edilemedi', err);
        },
      },
    ]);
  const goAgency = () => {
    const ag = app.agencyId ? agencyById(app.agencyId) : undefined;
    if (ag && ownedAgency?.status !== 'Onaylandı') activateOwnedAgency(ag.name, ag.code);
    router.push(`/ajans/hesap/${app.agencyId}`);
  };

  return (
    <SafeAreaView style={s.safe}>
      <Header title="Başvurum" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.mono} selectable>
            {app.number}
          </Text>
          <Text style={s.title}>{app.form.agencyName}</Text>
          <StatusBadge status={app.status} />
          <Text style={s.dim}>Gönderim: {app.submittedTs ? stamp(app.submittedTs) : '—'}</Text>
          {/* Progress along the main path */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            {MAIN_PATH.map((p, i) => (
              <View key={p} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: app.status === 'Reddedildi' || app.status === 'Başvuru İptal Edildi' ? colors.border : i <= stepIndex ? semantic.success : colors.border }} />
            ))}
          </View>
          <Text style={s.dim}>{MAIN_PATH.map((p, i) => (i <= stepIndex ? `✓ ${p}` : p)).join('  ›  ')}</Text>
        </View>

        {app.status === 'Ek Bilgi Bekleniyor' && open && (
          <Section title="Senden ek bilgi istendi" icon="chatbubble-ellipses">
            <Text style={s.body}>{open.question}</Text>
            <Text style={s.mono}>{open.at}</Text>
            <TextInput value={answer} onChangeText={setAnswer} multiline placeholder="Yanıtını yaz" placeholderTextColor={colors.textDim} style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} accessibilityLabel="Ek bilgi yanıtı" />
            {extraDocs.map((d) => (
              <Text key={d.id} style={s.dim}>
                📎 {d.name}
              </Text>
            ))}
            <Button
              title="Belge ekle"
              icon="attach"
              variant="tonal"
              small
              style={{ alignSelf: 'flex-start' }}
              onPress={async () => {
                const d = await pickDocument('Diğer', app.docs.length + extraDocs.length);
                if (d) setExtraDocs((x) => [...x, d]);
              }}
            />
            <Button title="Yanıtı gönder" icon="send" onPress={sendAnswer} />
          </Section>
        )}

        {app.status === 'Onaylandı' && (
          <Section title="Tebrikler, ajansın onaylandı" icon="checkmark-done">
            <KV k="Ajans kimliği" v={app.agencyId ?? '—'} />
            <Text style={s.dim}>Sıradaki adımlar: sözleşme ve komisyon tanımı, Coins Bank, finansal doğrulama. Para çekme yetkisi bu adımlar tamamlanınca açılır.</Text>
            <Button title="Ajans hesabıma git" icon="business" onPress={goAgency} />
          </Section>
        )}

        {(app.status === 'Reddedildi' || app.status === 'Askıya Alındı') && (
          <Section title={app.status === 'Reddedildi' ? 'Başvurun reddedildi' : 'Başvurun askıya alındı'} icon="alert-circle">
            <Text style={s.body}>{app.decisionReason ?? 'Gerekçe belirtilmedi.'}</Text>
            {app.status === 'Reddedildi' && (
              <Button
                title="Karara itiraz et"
                variant="tonal"
                onPress={() => {
                  const no = createTicket('İtiraz', `Ajans başvurusu itirazı · ${app.number}`);
                  showAlert('İtiraz oluşturuldu', `Destek talebi #${no}`);
                }}
              />
            )}
          </Section>
        )}

        <Section title="Durum geçmişi" icon="time">
          <Timeline items={publicHistory(app)} />
        </Section>

        <Section title="Başvuru bilgilerin" icon="document-text">
          <KV k="Ad soyad" v={app.form.fullName} />
          <KV k="E-posta" v={app.form.email} />
          <KV k="Telefon" v={app.form.phone} />
          <KV k="Ülke / şehir" v={`${app.form.country} · ${app.form.city}`} />
          <KV k="Deneyim" v={app.form.experience ? EXPERIENCE_LABEL[app.form.experience] : ''} />
          <KV k="Tahmini yayıncı" v={app.form.estimatedHosts} />
          <KV k="Belgeler" v={app.docs.length ? app.docs.map((d) => d.name).join('\n') : 'Yok'} />
          <Text style={s.dim}>Bu başvuruyu yalnız sen ve yetkili SimilarClub personeli görebilir.</Text>
        </Section>

        {!CLOSED.includes(app.status) && <Button title="Başvuruyu iptal et" variant="danger" onPress={cancel} />}
        {onNew && CLOSED.includes(app.status) && app.status !== 'Onaylandı' && <Button title="Yeni başvuru yap" icon="add" onPress={onNew} />}
      </ScrollView>
    </SafeAreaView>
  );
}
