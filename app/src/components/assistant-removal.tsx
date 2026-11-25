// Asistanlıktan çıkarma isteği (owners, 25 Nov 2026; server/api/agency-assistants.mjs): the owner asks, the assistant
// accepts (it ends), rejects (it stays) or disputes; after a rejection the owner may dispute. A dispute goes to
// management, who talk to both sides and decide in the panel. The assistant's card is shown on the agency screen and
// on Ben (a woman who streams for an agency doesn't see the agency screen); the owner's note sheet is here too.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { agencyNet, fmtDateTime, runAction, type AssistantRemoval } from '@/lib/agency-net';
import { showAlert } from '@/lib/alert';
import { SCRIM, radius, space } from '@/theme';

/** The words for a request's state, as the owner reads it on the assistant's card. */
export function removalStateText(r: AssistantRemoval): string | null {
  if (r.status === 'pending') return `${fmtDateTime(r.askedAt)}: çıkarma isteği gönderildi, ${r.assistant.name} henüz cevap vermedi.`;
  if (r.status === 'rejected') return `${r.assistant.name} çıkarma isteğini reddetti; asistanlığı sürüyor. Yönetime itiraz edebilirsin.`;
  if (r.status === 'disputed') return `İtiraz yönetimde (${r.disputedBy === 'owner' ? 'senin itirazın' : `${r.assistant.name} itiraz etti`}). Yönetim iki tarafla iletişime geçecek.`;
  return null;
}

/**
 * The assistant's own card: the request with Reddet / Onayla / İtiraz et, or where it stands. `light`: on Ben's
 * light paper; otherwise the agency screen's dark one.
 */
export function AssistantRemovalCard({ r, light = false, onDone }: { r: AssistantRemoval; light?: boolean; onDone: () => void }) {
  const [note, setNote] = useState(false);
  const fg = light ? '#2A1430' : '#fff';
  const dim = light ? 'rgba(42,20,48,0.68)' : 'rgba(255,255,255,0.68)';
  if (r.status !== 'pending' && r.status !== 'disputed') return null;
  const answer = (a: 'accept' | 'reject') =>
    showAlert(
      a === 'accept' ? 'Onaylıyor musun?' : 'Reddediyor musun?',
      a === 'accept' ? `${r.agency.name} ajansındaki asistanlığın biter; bundan sonraki kazançlardan pay yazılmaz. Hesabına geçen elmaslar sende kalır.` : 'Asistanlığın sürer. Ajans sahibi yönetime itiraz edebilir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: a === 'accept' ? 'Onayla' : 'Reddet', style: a === 'accept' ? 'destructive' : 'default', onPress: () => void runAction(false, () => agencyNet.answerRemoval(r.id, a), a === 'accept' ? 'Asistanlığın sona erdi.' : 'İsteği reddettin; asistanlığın sürüyor.', onDone) },
      ],
    );
  return (
    <View style={[st.card, light ? st.cardLight : st.cardDark]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Ionicons name={r.status === 'disputed' ? 'people-circle-outline' : 'alert-circle-outline'} size={22} color="#E0457B" />
        <Text style={[st.title, { color: fg }]}>{r.status === 'disputed' ? 'Asistanlık itirazı yönetimde' : 'Asistanlıktan çıkarma isteği'}</Text>
      </View>
      {r.status === 'pending' ? (
        <>
          <Text style={[st.body, { color: dim }]}>
            {r.agency.name} ajansının sahibi {r.owner.name}, seni asistanlıktan çıkarmak istiyor ({fmtDateTime(r.askedAt)}). Onaylarsan asistanlığın biter; reddedersen sürer. Anlaşamıyorsan itiraz et: konu yönetime geçer.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Reddet" variant="ghost" small onPress={() => answer('reject')} style={{ flex: 1 }} />
            <Button title="Onayla" variant="tonal" small onPress={() => answer('accept')} style={{ flex: 1 }} />
          </View>
          <Button title="İtiraz et" variant="ghost" small icon="flag-outline" onPress={() => setNote(true)} />
        </>
      ) : (
        <Text style={[st.body, { color: dim }]}>{r.agency.name}: yönetim seninle ve ajans sahibiyle iletişime geçip karar verecek. Karar verilene kadar asistanlığın sürer.</Text>
      )}
      {note && (
        <NoteSheet
          title="İtiraz et"
          text="Neden itiraz ettiğini kısaca yaz. Konu yönetime geçer; yönetim iki tarafla iletişime geçip karar verir."
          onClose={() => setNote(false)}
          onSend={(t) => runAction(false, () => agencyNet.answerRemoval(r.id, 'dispute', t), 'İtirazın yönetime iletildi.', () => (setNote(false), onDone()))}
        />
      )}
    </View>
  );
}

/** A short note (3–500) for a dispute, on the agency screen's dark sheet. */
export function NoteSheet({ title, text, onClose, onSend }: { title: string; text: string; onClose: () => void; onSend: (note: string) => Promise<unknown> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (v.trim().length < 3) return showAlert('Açıklama gerekli', 'En az 3 karakter yaz.');
    setBusy(true);
    try {
      await onSend(v.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoid style={st.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={st.sheet}>
          <Text style={[st.title, { color: '#fff' }]}>{title}</Text>
          <Text style={[st.body, { color: 'rgba(255,255,255,0.7)' }]}>{text}</Text>
          <TextInput value={v} onChangeText={setV} multiline maxLength={500} placeholder="Açıklama" placeholderTextColor="rgba(255,255,255,0.4)" style={st.input} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Vazgeç" variant="ghost" small onPress={onClose} style={{ flex: 1 }} />
            <Button title={busy ? 'Gönderiliyor…' : 'Gönder'} variant="tonal" small disabled={busy} onPress={() => void send()} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const st = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  cardDark: { backgroundColor: 'rgba(224,69,123,0.10)', borderColor: 'rgba(224,69,123,0.35)' },
  cardLight: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(224,69,123,0.35)' },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  body: { fontSize: 13.5, lineHeight: 19 },
  wrap: { flex: 1, justifyContent: 'center', backgroundColor: SCRIM, padding: space.lg },
  sheet: { gap: space.md, padding: space.xl, borderRadius: radius.xl, backgroundColor: '#1B1426', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  input: { minHeight: 90, textAlignVertical: 'top', color: '#fff', fontSize: 15, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
});
