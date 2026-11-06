// Ajans → Ofis → Yayıncılar → "Yayıncı davet et" with a server: the owner types the streamer's name as the app
// shows it (or a username), picks them from the people the server finds (lib/agency-net findInvitees), and the
// invite names that account by id. Sign-up sets no username, so a username-only field left almost everyone out.
// The server decides whether the invite can go out; people already in an agency can't be picked.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DepthCard } from '@/components/fx/surface';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Avatar, Button } from '@/components/ui';
import { agencyNet, errorText, findInvitees, runAction, type Invitee } from '@/lib/agency-net';
import { colors, fonts, radius, semantic, space } from '@/theme';

const MIN = 2;
const AGENCY_TEXT = { this: 'Zaten ajansında', other: 'Başka bir ajansa bağlı; ancak kendi transfer talebiyle geçebilir' } as const;

/** Mounted while open; `onSent` runs after the server took the invite. */
export function InviteSheet({ agencyId, onClose, onSent }: { agencyId: string; onClose: () => void; onSent?: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; users: Invitee[]; error: string | null } | null>(null);
  const [pick, setPick] = useState<Invitee | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const term = q.trim();
  const long = term.replace(/^@+/, '').length >= MIN;
  const searching = long && found?.q !== term;

  // Searches once the typing pauses; a slower answer for older text is dropped.
  useEffect(() => {
    if (!long) return;
    let alive = true;
    const t = setTimeout(() => {
      findInvitees(agencyId, term)
        .then((users) => alive && setFound({ q: term, users, error: null }))
        .catch((e) => alive && setFound({ q: term, users: [], error: errorText(e) }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [agencyId, term, long]);

  const send = async () => {
    if (!pick || busy) return;
    setBusy(true);
    const sent = await runAction(false, () => agencyNet.invite(agencyId, { user: pick.id }, note.trim() || undefined), `${pick.name} davet edildi. Kabul edince ajansına bağlanır.`);
    setBusy(false);
    if (!sent) return;
    onSent?.();
    onClose();
  };

  const users = long && found?.q === term ? found.users : [];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoid style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <DepthCard style={s.sheet}>
          <Text style={s.title}>Yayıncı davet et</Text>
          <Text style={s.msg}>Yayıncının uygulamada görünen adını ya da kullanıcı adını yaz, listeden seç. Davet kabul edilince yayıncı ajansına bağlanır.</Text>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Ad veya kullanıcı adı</Text>
            <TextInput
              value={q}
              onChangeText={(t) => {
                setQ(t);
                setPick(null);
              }}
              placeholder="Örn. Deniz"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              style={s.input}
              accessibilityLabel="Ad veya kullanıcı adı"
            />
          </View>

          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.xs }}>
            {!long ? (
              <Text style={s.hint}>Aramak için en az {MIN} harf yaz.</Text>
            ) : searching ? (
              <ActivityIndicator color={colors.textDim} style={{ paddingVertical: space.md }} />
            ) : found?.error ? (
              <Text style={[s.hint, { color: semantic.danger }]}>{found.error}</Text>
            ) : users.length === 0 ? (
              <Text style={s.hint}>Bu adla kimse bulunamadı. Adı profilinde göründüğü gibi yaz ya da kullanıcı adını dene.</Text>
            ) : (
              users.map((u) => {
                const on = pick?.id === u.id;
                const taken = u.agency ? AGENCY_TEXT[u.agency] : null;
                return (
                  <Pressable
                    key={u.id}
                    disabled={!!taken}
                    onPress={() => setPick(on ? null : u)}
                    style={[s.row, on && s.rowOn, taken && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !!taken }}
                    accessibilityLabel={u.name}
                  >
                    <Avatar uri={u.avatarUrl ?? undefined} name={u.name} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>
                        {u.name}
                      </Text>
                      {(!!u.username || !!taken) && (
                        <Text style={s.sub} numberOfLines={2}>
                          {[u.username ? `@${u.username}` : null, taken].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {on && <Ionicons name="checkmark-circle" size={22} color={semantic.actionText} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Davet notu (isteğe bağlı)</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Kısa bir not yaz" placeholderTextColor={colors.textDim} multiline maxLength={300} style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Vazgeç" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Davet gönder" disabled={!pick || busy} onPress={send} style={{ flex: 1 }} />
          </View>
        </DepthCard>
      </KeyboardAvoid>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,8,18,0.6)' },
  sheet: { margin: space.md, padding: space.xl, gap: space.lg, borderRadius: radius.xl },
  title: { color: '#fff', fontSize: 19, fontFamily: fonts.display },
  msg: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 19, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { borderColor: semantic.actionText, backgroundColor: 'rgba(255,255,255,0.05)' },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
});
