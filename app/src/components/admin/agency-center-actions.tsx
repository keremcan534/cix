// Ajans Merkezi → Genel: the centre's own move on the agency network (docs/AJANS_HIYERARSI.md "merkez ataması"):
// create an agency for a partner (approved at once, server/api/agency-admin.mjs POST create). Assigning streamers
// by hand is gone from the app: a streamer joins by code in the first days, later only by a transfer the centre
// approves (Transferler). The server checks the right (agencies.manage) and every rule; a refusal is shown as it comes. People are found with the Yaptırımlar search
// (name, username, phone, e-mail or account id), which needs sanction.view; an account id can always be pasted.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ns } from '@/components/agency-net';
import { DepthCard } from '@/components/fx/surface';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ChoiceChips } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { centerNet, errorText, runAction, type TreeNode } from '@/lib/agency-net';
import { showAlert } from '@/lib/alert';
import { ApiError } from '@/lib/api';
import { sanctionSearch } from '@/lib/live/admin';
import { SCRIM, colors, edge, fonts, radius, semantic, space } from '@/theme';

type Person = { id: string; name: string; sub?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_TEXT: Record<string, string> = {
  user: 'Üye',
  moderator: 'Moderatör',
  admin: 'Yönetici',
  coins_bank: 'Jeton Noktası hesabı',
};

export function CenterActions({ nodes, demo, after }: { nodes: TreeNode[]; demo: boolean; after: () => void }) {
  const [on, setOn] = useState(false);
  const open = () => (demo ? void runAction(true, async () => {}) : setOn(true));
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Button small variant="tonal" icon="add-circle-outline" title="Ajans oluştur" onPress={open} style={{ flex: 1 }} />
      {on && (
        <CreateSheet
          nodes={nodes}
          close={() => setOn(false)}
          done={() => {
            setOn(false);
            after();
          }}
        />
      )}
    </View>
  );
}

function CreateSheet({ nodes, close, done }: { nodes: TreeNode[]; close: () => void; done: () => void }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const tops = nodes.filter((n) => n.level === 1 && n.status === 'approved');
  const ok = name.trim().length >= 2;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    let made: { name: string; code: string } | null = null;
    const sent = await runAction(false, async () => {
      made = (
        await centerNet.create({
          name: name.trim(),
          ...(person ? { owner: person.id } : {}),
          ...(parentId ? { parentId } : {}),
        })
      ).agency;
    });
    setBusy(false);
    if (!sent) return;
    const m = made as { name: string; code: string } | null;
    if (m) showAlert('Ajans oluşturuldu', `${m.name} onaylandı. Ajans kodu: ${m.code}`);
    done();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoid style={st.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Kapat" />
        <DepthCard style={st.sheet}>
          <ScrollView contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
            <Text style={st.title}>Ajans oluştur</Text>
            <Text style={ns.dim}>Merkezin oluşturduğu ajans hemen onaylanır. Sahibini şimdi seçebilir ya da sonra atayabilirsin.</Text>
                <Field label="Ajans adı">
                  <TextInput value={name} onChangeText={setName} placeholder="Örn. Kuzey Yıldızı Medya" placeholderTextColor={colors.textDim} maxLength={60} style={ns.input} />
                </Field>
                <Field label="Türü">
                  <ChoiceChips
                    value={parentId ? 'sub' : 'top'}
                    onChange={(v) => setParentId(v === 'top' ? '' : (tops[0]?.id ?? ''))}
                    options={
                      tops.length
                        ? [
                            ['top', 'Üst ajans'],
                            ['sub', 'Alt ajans'],
                          ]
                        : [['top', 'Üst ajans']]
                    }
                  />
                </Field>
                {!!parentId && (
                  <Field label="Üst ajansı">
                    <AgencyPick nodes={tops} value={parentId} onChange={setParentId} />
                  </Field>
                )}
                <Field label="Sahibi (isteğe bağlı)">
                  <PersonPick value={person} onChange={setPerson} />
                </Field>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Vazgeç" variant="ghost" onPress={close} style={{ flex: 1 }} />
              <Button title={busy ? 'Gönderiliyor' : 'Oluştur'} variant="hero" disabled={!ok || busy} onPress={submit} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </DepthCard>
      </KeyboardAvoid>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      {children}
    </View>
  );
}

function AgencyPick({ nodes, value, onChange }: { nodes: TreeNode[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLocaleLowerCase('tr-TR');
  const list = nodes.filter((n) => !term || n.name.toLocaleLowerCase('tr-TR').includes(term) || n.code.toLowerCase().includes(term)).slice(0, 8);
  const cur = nodes.find((n) => n.id === value);
  return (
    <View style={{ gap: 6 }}>
      {nodes.length > 8 && <TextInput value={q} onChangeText={setQ} placeholder="Ajans adı veya kodu" placeholderTextColor={colors.textDim} autoCapitalize="none" style={ns.input} />}
      {cur && !list.includes(cur) && <Choice on text={`${cur.name} · ${cur.code}`} onPress={() => {}} />}
      {list.map((n) => (
        <Choice key={n.id} on={n.id === value} text={`${n.name} · ${n.code}`} onPress={() => onChange(n.id)} />
      ))}
      {nodes.length === 0 && <Text style={ns.dim}>Seçilebilecek aktif ajans yok.</Text>}
    </View>
  );
}

function PersonPick({ value, onChange }: { value: Person | null; onChange: (p: Person | null) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Person[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const look = async () => {
    const t = q.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const users = await sanctionSearch(t);
      setRows(
        users
          .filter((u) => !u.deleted)
          .map((u) => ({
            id: u.id,
            name: u.name,
            sub: ROLE_TEXT[u.role] ?? 'Üye',
          })),
      );
      if (!users.length) setNote('Kimse bulunamadı.');
    } catch (e) {
      // Without the search right an account id still works: the server checks it when the action is sent.
      if (UUID.test(t)) setRows([{ id: t.toLowerCase(), name: 'Hesap kimliği', sub: t.toLowerCase() }]);
      else setRows([]);
      setNote(e instanceof ApiError && e.status === 403 ? 'Kişi aramak için Yaptırımlar görüntüleme yetkisi gerekir; hesap kimliğini yapıştırabilirsin.' : errorText(e));
    }
    setBusy(false);
  };
  if (value)
    return (
      <View style={st.picked}>
        <Ionicons name="person-circle-outline" size={20} color={semantic.action} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.pickedName} numberOfLines={1}>
            {value.name}
          </Text>
          {!!value.sub && (
            <Text style={ns.dim} numberOfLines={1}>
              {value.sub}
            </Text>
          )}
        </View>
        <Button small variant="ghost" title="Değiştir" onPress={() => onChange(null)} />
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'stretch' }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={look}
          placeholder="Ad, kullanıcı adı, telefon veya hesap kimliği"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          style={[ns.input, { flex: 1 }]}
        />
        <Button small variant="tonal" title={busy ? 'Aranıyor' : 'Ara'} disabled={busy || q.trim().length < 2} onPress={look} />
      </View>
      {rows?.slice(0, 8).map((p) => (
        <Choice key={p.id} on={false} text={p.sub ? `${p.name} · ${p.sub}` : p.name} onPress={() => onChange(p)} />
      ))}
      {!!note && <Text style={ns.dim}>{note}</Text>}
    </View>
  );
}

function Choice({ on, text, onPress }: { on: boolean; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[st.choice, on && st.choiceOn]}>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? semantic.action : colors.textDim} />
      <Text style={st.choiceText} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: SCRIM,
  },
  sheet: {
    margin: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    maxHeight: '88%',
    ...edge.card,
  },
  title: { color: '#fff', fontSize: 19, fontFamily: fonts.display },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  choiceOn: { backgroundColor: 'rgba(10,159,165,0.16)' },
  choiceText: { color: '#fff', fontSize: 14, flex: 1 },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pickedName: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
