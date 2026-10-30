import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Check, Chips, KV, Note, Section, StatusBadge, Timeline, ViewerBar, s } from '@/components/agency-apps';
import { Button, Header } from '@/components/ui';
import { resolve, type PermissionKey } from '@/data/rbac';
import { showAlert } from '@/lib/alert';
import {
  CLOSED,
  EXPERIENCE_LABEL,
  addReviewNote,
  agencyById,
  approveApplication,
  assignBd,
  canDo,
  canSeeApp,
  canSeeDocs,
  duplicateOf,
  eligibleBds,
  logDocumentView,
  personName,
  regionName,
  rejectApplication,
  requestInfo,
  resumeApplication,
  sendToAdmin,
  stamp,
  startPreReview,
  suspendApplication,
  useAgencyApps,
  useViewer,
  type AppDocument,
  type Application,
} from '@/lib/agency-apps';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Mode = 'note' | 'info' | 'admin' | 'assign' | 'approve' | 'reject' | 'suspend';
const MODE: Record<Mode, { title: string; placeholder: string; perm: PermissionKey; cta: string }> = {
  note: { title: 'Dahili değerlendirme notu', placeholder: 'Başvuru sahibi bu notu görmez', perm: 'agency_apps.review', cta: 'Notu kaydet' },
  info: { title: 'Başvuru sahibinden ek bilgi iste', placeholder: 'Sorunu yaz; başvuru sahibine gösterilir', perm: 'agency_apps.review', cta: 'Talebi gönder' },
  admin: { title: 'Admin onayına gönder', placeholder: 'Değerlendirme özeti ve önerin', perm: 'agency_apps.review', cta: 'Admin’e gönder' },
  assign: { title: 'BD ata veya devret', placeholder: 'Not (isteğe bağlı)', perm: 'agency_apps.assign', cta: 'Ata' },
  approve: { title: 'Başvuruyu onayla', placeholder: 'Onay notu (isteğe bağlı)', perm: 'agency_apps.decide', cta: 'Onayla ve ajans hesabı oluştur' },
  reject: { title: 'Başvuruyu reddet', placeholder: 'Ret gerekçesi (başvuru sahibine gösterilir)', perm: 'agency_apps.decide', cta: 'Reddet' },
  suspend: { title: 'Başvuruyu askıya al', placeholder: 'Askıya alma gerekçesi', perm: 'agency_apps.decide', cta: 'Askıya al' },
};

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rbac, notify, activateOwnedAgency } = useApp();
  const st = useAgencyApps();
  const viewer = useViewer();
  const ctx = { rbac, actor: viewer };
  const app = st.apps.find((a) => a.id === id);
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState('');
  const [bdPick, setBdPick] = useState<string | null>(null);
  const [scores, setScores] = useState({ experience: 3, capacity: 3 });
  const [preview, setPreview] = useState<AppDocument | null>(null);

  if (!app || !canSeeApp(ctx, app)) {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Başvuru" />
        <ViewerBar />
        <View style={s.scroll}>
          <Note tone="bad" text={app ? 'Bu başvuruyu görüntüleme yetkin yok: sana atanmamış veya kapsamın dışında.' : 'Başvuru bulunamadı.'} />
        </View>
      </SafeAreaView>
    );
  }

  const isOpen = !CLOSED.includes(app.status);
  const allowedFor = (perm: PermissionKey) => canDo(ctx, perm, app);
  // Which actions this status allows; permission is shown separately so the reason for a lock is visible.
  const actions: { mode: Mode | 'pre' | 'resume'; label: string; show: boolean; perm: PermissionKey; variant: 'hero' | 'tonal' | 'danger' }[] = [
    { mode: 'pre', label: 'Ön incelemeye al', show: app.status === 'Başvuru Alındı', perm: 'agency_apps.assign', variant: 'tonal' },
    { mode: 'assign', label: app.assignedBd ? 'Başka BD’ye devret' : 'BD ata', show: isOpen && app.status !== 'Askıya Alındı', perm: 'agency_apps.assign', variant: 'tonal' },
    { mode: 'note', label: 'Dahili not ekle', show: isOpen, perm: 'agency_apps.review', variant: 'tonal' },
    { mode: 'info', label: 'Ek bilgi iste', show: ['Ön İncelemede', 'BD Değerlendirmesinde', 'Admin Onayı Bekleniyor'].includes(app.status), perm: 'agency_apps.review', variant: 'tonal' },
    { mode: 'admin', label: 'Admin onayına gönder', show: app.status === 'BD Değerlendirmesinde', perm: 'agency_apps.review', variant: 'hero' },
    { mode: 'approve', label: 'Onayla', show: app.status === 'Admin Onayı Bekleniyor', perm: 'agency_apps.decide', variant: 'hero' },
    { mode: 'reject', label: 'Reddet', show: isOpen, perm: 'agency_apps.decide', variant: 'danger' },
    { mode: 'suspend', label: 'Askıya al', show: isOpen && app.status !== 'Askıya Alındı', perm: 'agency_apps.decide', variant: 'danger' },
    { mode: 'resume', label: 'Askıyı kaldır', show: app.status === 'Askıya Alındı', perm: 'agency_apps.decide', variant: 'tonal' },
  ];
  const shown = actions.filter((a) => a.show);
  const locked = shown.filter((a) => !allowedFor(a.perm));
  const usable = shown.filter((a) => allowedFor(a.perm));

  const tellApplicant = (title: string, body: string) => {
    if (app.applicantId === 'me') notify({ kind: 'system', icon: 'business', title, body, href: '/ajans/basvuru' });
  };
  const done = (err: string | null, ok: string) => {
    if (err) {
      errorHaptic();
      return showAlert('İşlem yapılamadı', err);
    }
    successHaptic();
    setMode(null);
    setText('');
    setBdPick(null);
    showAlert(ok);
  };

  const run = (m: Mode | 'pre' | 'resume') => {
    if (m === 'pre') return done(startPreReview(ctx, app.id), 'Ön incelemeye alındı');
    if (m === 'resume') return done(resumeApplication(ctx, app.id), 'Askı kaldırıldı');
    setMode(m);
    setText('');
  };
  const confirm = () => {
    if (!mode) return;
    if (mode === 'note') return done(addReviewNote(ctx, app.id, text, scores), 'Not kaydedildi');
    if (mode === 'info') {
      const err = requestInfo(ctx, app.id, text);
      if (!err) tellApplicant('Ajans başvurun için ek bilgi istendi', text.trim());
      return done(err, 'Ek bilgi talebi gönderildi');
    }
    if (mode === 'admin') return done(sendToAdmin(ctx, app.id, text), 'Admin onayına gönderildi');
    if (mode === 'assign') {
      if (!bdPick) return showAlert('Bir BD seç');
      return done(assignBd(ctx, app.id, bdPick, text), 'Atama yapıldı');
    }
    if (mode === 'reject') {
      const err = rejectApplication(ctx, app.id, text);
      if (!err) tellApplicant('Ajans başvurun sonuçlandı', `Reddedildi: ${text.trim()}`);
      return done(err, 'Başvuru reddedildi');
    }
    if (mode === 'suspend') {
      const err = suspendApplication(ctx, app.id, text);
      if (!err) tellApplicant('Ajans başvurun askıya alındı', text.trim());
      return done(err, 'Başvuru askıya alındı');
    }
    if (mode === 'approve') {
      const { err, agencyId } = approveApplication(ctx, app.id, text);
      if (!err && agencyId) {
        const ag = agencyById(agencyId);
        if (app.applicantId === 'me' && ag) activateOwnedAgency(ag.name, ag.code);
        tellApplicant('Ajans başvurun onaylandı 🎉', `Ajans kimliğin: ${agencyId}. Sözleşme ve komisyon adımları için ajans hesabına git.`);
      }
      done(err, `Onaylandı · ajans hesabı ${agencyId ?? ''} oluşturuldu`);
    }
  };

  const dup = isOpen ? duplicateOf(app.form, app.id) : null;
  const docsVisible = canSeeDocs(ctx, app);
  const bdOptions = eligibleBds(rbac, app).filter((b) => b !== app.assignedBd);
  const myAssignments = st.assignments.filter((x) => x.appId === app.id);

  return (
    <SafeAreaView style={s.safe}>
      <Header title={app.number} />
      <ViewerBar />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <StatusBadge status={app.status} />
          <Text style={s.title}>{app.form.agencyName}</Text>
          <KV k="Başvuru sahibi" v={`${app.form.fullName} (${personName(app.applicantId)})`} />
          <KV k="Bölge" v={`${app.form.city}, ${app.form.country} · ${regionName(app.form.country, app.form.city)}`} />
          <KV k="Atanan BD" v={app.assignedBd ? personName(app.assignedBd) : 'Atanmadı'} />
          <KV k="Gönderim" v={app.submittedTs ? stamp(app.submittedTs) : '—'} />
          {app.decidedAt && <KV k="Karar" v={app.decidedAt} />}
          {app.decisionReason && <KV k="Gerekçe" v={app.decisionReason} />}
          {app.agencyId && (
            <Button title={`Ajans hesabı ${app.agencyId}`} icon="business" variant="tonal" small style={{ alignSelf: 'flex-start' }} onPress={() => router.push(`/ajans/hesap/${app.agencyId}`)} />
          )}
        </View>

        {/* Actions */}
        {shown.length > 0 && (
          <Section title="İşlemler" icon="flash">
            <View style={s.chips}>
              {usable.map((a) => (
                <Button key={a.mode} title={a.label} small variant={a.variant} onPress={() => run(a.mode)} />
              ))}
            </View>
            {locked.map((a) => (
              <Note key={a.mode} tone="bad" text={`${a.label}: ${resolve(rbac, viewer, a.perm, { type: 'platform' }).allowed ? 'kapsamın bu bölgeyi kapsamıyor' : 'yetkin kapalı'} (${a.perm}).`} />
            ))}
            {mode && (
              <View style={{ gap: 8 }}>
                <View style={s.divider} />
                <Text style={s.label}>{MODE[mode].title}</Text>
                {mode === 'assign' && (
                  <>
                    {bdOptions.length ? (
                      <Chips options={bdOptions.map((b) => ({ key: b, label: personName(b) }))} value={bdPick} onChange={setBdPick} />
                    ) : (
                      <Text style={s.dim}>Bu bölgede değerlendirme yetkisi olan başka personel yok.</Text>
                    )}
                    <Text style={s.dim}>Yalnız bu başvurunun bölgesinde (atanmış başvuru görüntüleme + değerlendirme) yetkisi olan personel listelenir.</Text>
                  </>
                )}
                {mode === 'note' && (
                  <>
                    <Text style={s.dim}>Deneyim</Text>
                    <Chips options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n}` }))} value={String(scores.experience)} onChange={(v) => setScores((x) => ({ ...x, experience: Number(v) }))} />
                    <Text style={s.dim}>Yayıncı kapasitesi</Text>
                    <Chips options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n}` }))} value={String(scores.capacity)} onChange={(v) => setScores((x) => ({ ...x, capacity: Number(v) }))} />
                  </>
                )}
                {mode === 'approve' && <Note text="Onay ajans hesabını oluşturur; para çekme yetkisi vermez. Sözleşme, komisyon, Coins Bank ve finansal doğrulama ayrı adımlardır." />}
                <TextInput value={text} onChangeText={setText} multiline placeholder={MODE[mode].placeholder} placeholderTextColor={colors.textDim} style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} accessibilityLabel={MODE[mode].title} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={MODE[mode].cta} variant={mode === 'reject' || mode === 'suspend' ? 'danger' : 'hero'} onPress={confirm} style={{ flex: 1 }} />
                  <Button title="Vazgeç" variant="ghost" onPress={() => setMode(null)} />
                </View>
              </View>
            )}
          </Section>
        )}

        <Section title="Kontroller" icon="shield-checkmark">
          <Check done={app.emailVerified} label="E-posta doğrulandı" />
          <Check done={app.phoneVerified} label="Telefon doğrulandı" />
          <Check done={!dup} label={dup ? `Mükerrer uyarısı: ${dup}` : 'Mükerrer başvuru / ajans yok'} />
          <Check done={app.docs.length > 0} label={app.docs.length ? `${app.docs.length} belge yüklendi` : 'Belge yüklenmedi (gerekirse ek bilgi iste)'} />
          <Text style={s.dim}>Vergi numarası istenmez.</Text>
        </Section>

        <ApplicationInfo app={app} />

        <Section title="Belgeler" icon="document-attach">
          {!docsVisible ? (
            <Note tone="bad" text="Belgeleri görüntüleme yetkin yok." />
          ) : app.docs.length ? (
            app.docs.map((d) => (
              <View key={d.id} style={s.row}>
                <Ionicons name="document-lock" size={18} color={colors.primaryText} />
                <View style={{ flex: 1 }}>
                  <Text style={s.body} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={s.mono}>
                    {d.kind} · {d.size} · {d.at}
                  </Text>
                </View>
                <Button
                  title="Görüntüle"
                  small
                  variant="ghost"
                  onPress={() => {
                    logDocumentView(ctx, app.id, d.name);
                    if (d.uri) setPreview(d);
                    else showAlert(d.name, 'Demo belgesi: içerik yok. Görüntüleme denetim kaydına yazıldı.');
                  }}
                />
              </View>
            ))
          ) : (
            <Text style={s.dim}>Belge yok.</Text>
          )}
          <Text style={s.dim}>Belgeler şifreli depolanır; her görüntüleme kişi ve saatle kaydedilir.</Text>
        </Section>

        <Section title="Değerlendirmeler ve yazışmalar" icon="chatbubbles">
          {!app.reviews.length && <Text style={s.dim}>Henüz not yok.</Text>}
          {app.reviews.map((r) => (
            <View key={r.id} style={{ gap: 2, paddingVertical: 4 }}>
              <View style={s.row}>
                <Text style={[s.label, { flex: 1 }]}>{r.kind}</Text>
                <Text style={s.mono}>{r.at}</Text>
              </View>
              <Text style={s.body}>{r.text}</Text>
              <Text style={s.dim}>
                {personName(r.actor)}
                {r.scores ? ` · Deneyim ${r.scores.experience}/5 · Kapasite ${r.scores.capacity}/5` : ''}
                {r.kind === 'Değerlendirme notu' ? ' · dahili' : ''}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Durum geçmişi" icon="time">
          <Timeline items={app.history} />
        </Section>

        {myAssignments.length > 0 && (
          <Section title="Atama geçmişi" icon="git-branch">
            {myAssignments.map((x) => (
              <Text key={x.id} style={s.dim}>
                {x.at} · {x.kind}: {personName(x.bdId)} · {personName(x.by)} tarafından{x.note ? ` · ${x.note}` : ''}
              </Text>
            ))}
          </Section>
        )}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 }} onPress={() => setPreview(null)}>
          {preview?.uri && <Image source={{ uri: preview.uri }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />}
          <Text style={[s.dim, { marginTop: 12 }]}>Kapatmak için dokun</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ApplicationInfo({ app }: { app: Application }) {
  const f = app.form;
  return (
    <Section title="Başvuru bilgileri" icon="document-text">
      <KV k="Ajans adı" v={f.agencyName} />
      <KV k="Ad soyad" v={f.fullName} />
      <KV k="E-posta" v={f.email} />
      <KV k="Telefon" v={f.phone} />
      <KV k="Ülke / şehir" v={`${f.country} · ${f.city}`} />
      <KV k="Ajans deneyimi" v={f.experience ? EXPERIENCE_LABEL[f.experience] : ''} />
      <KV k="Önceki platformlar" v={f.platforms} />
      <KV k="Ajans / şirket" v={f.company} />
      <KV k="Bağlantılar" v={f.links} />
      <KV k="Tahmini yayıncı" v={f.estimatedHosts} />
      <KV k="Yayıncı planı" v={f.recruitPlan} />
      <KV k="Büyüme hedefi" v={f.growthGoals} />
      <KV k="Ek açıklama" v={f.notes} />
      <KV k="Veri işleme onayı" v={f.consent ? 'Verildi' : 'Yok'} />
      {app.infoRequests.map((q) => (
        <View key={q.id} style={{ gap: 2, paddingTop: 6 }}>
          <Text style={s.label}>Ek bilgi: {q.question}</Text>
          <Text style={s.dim}>{q.answer ? `Yanıt (${q.answeredAt}): ${q.answer}` : 'Yanıt bekleniyor'}</Text>
        </View>
      ))}
    </Section>
  );
}
