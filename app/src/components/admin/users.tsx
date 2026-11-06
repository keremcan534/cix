// Yönetim › Kullanıcılar (admins only): every account on the server, newest first, 50 at a time, with search.
// An account opens its money record (AccountSheet); Sil deletes it the way the person's own "Hesabı sil" does.
// The smoke-test accounts ("Test A" / "Test B", development sign-in only) are marked and go with one button.
// A room's 8-digit ID finds its owner; "Oda Lv. MAX" raises the owner's room to the top level (or back to Lv.1).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ROOM_XP_THRESHOLDS } from '@/data/catalog';
import { ago, fmtDate } from '@/lib/admin-format';
import { copyText } from '@/lib/clipboard';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { ItemCard, Line, LoadState, Notice, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad } from './parts';

const SIGN_IN: Record<string, string> = { google: 'Google', email: 'E-posta' };
const ROLE: Record<string, string> = { admin: 'Yönetici', moderator: 'Moderatör' };
const MAX_LEVEL = ROOM_XP_THRESHOLDS.length;

export function UsersSection() {
  const ctx = useAdmin();
  const { colors } = useTheme();
  const s = useStyles();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [more, setMore] = useState<{ rows: admin.AdminUser[]; next: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useLoad(() => {
    setMore(null);
    return admin.users(search);
  }, [search]);
  const d = load.data;
  const rows = d ? [...d.users, ...(more?.rows ?? [])] : [];
  const next = more ? more.next : (d?.next ?? null);

  const loadMore = () => {
    if (next === null || busy) return;
    setBusy(true);
    admin
      .users(search, next)
      .then((r) => setMore((m) => ({ rows: [...(m?.rows ?? []), ...r.users], next: r.next })))
      .catch(() => ctx.toast('Devamı yüklenemedi'))
      .finally(() => setBusy(false));
  };

  const deleteTests = () =>
    confirmThen(
      ctx,
      {
        title: 'Deneme hesaplarını sil',
        message: `Sunucu denemesinin açtığı ${d?.tests ?? 0} hesap ("Test A", "Test B") silinir. Gerçek kişilere dokunulmaz. Bu işlem geri alınamaz.`,
        confirm: 'Hepsini sil',
        destructive: true,
      },
      admin.deleteTestUsers,
      (r) => `${r.deleted} deneme hesabı silindi`,
      load.reload,
      setBusy,
    );

  return (
    <SectionScroll load={load}>
      <View style={s.searchCard}>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={16} color={colors.textDim} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => setSearch(draft)}
            placeholder="Ad, kullanıcı adı, e-posta, hesap kimliği veya oda ID"
            placeholderTextColor={colors.textDim}
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Kullanıcı ara"
          />
          {!!draft && (
            <Pressable
              onPress={() => {
                setDraft('');
                setSearch('');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Aramayı temizle"
            >
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </Pressable>
          )}
        </View>
        {d && <Text style={s.hint}>{search ? `${d.total} sonuç` : `Toplam ${d.total} kayıtlı hesap`}</Text>}
      </View>

      {!!d?.tests && !search && (
        <View style={{ gap: space.sm }}>
          <Notice tone="danger" icon="flask-outline" text={`${d.tests} hesap sunucu denemesinden kalmış ("Test A", "Test B"). Bunlar gerçek kişi değil.`} />
          <Button title="Deneme hesaplarını sil" icon="trash-outline" variant="danger" small onPress={deleteTests} disabled={busy} />
        </View>
      )}

      <LoadState load={load} empty={(x) => (x.users.length ? null : search ? { icon: 'search-outline', title: 'Bu aramayla kimse bulunamadı' } : { icon: 'people-outline', title: 'Henüz kayıtlı hesap yok' })}>
        {() => (
          <>
            {rows.map((u) => (
              <UserCard key={u.id} u={u} onDone={load.reload} />
            ))}
            {next !== null && <Button title={busy ? 'Yükleniyor…' : 'Daha fazla göster'} variant="tonal" small onPress={loadMore} disabled={busy} />}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function UserCard({ u, onDone }: { u: admin.AdminUser; onDone: () => void }) {
  const ctx = useAdmin();
  const [busy, setBusy] = useState(false);
  const staff = !!ROLE[u.role];
  const signIn = u.signIn.map((p) => SIGN_IN[p] ?? p).join(', ') || 'Cihaz (deneme girişi)';
  const remove = () =>
    confirmThen(
      ctx,
      {
        title: 'Hesabı sil',
        message: `${u.name}\n\nProfil, mesajlar, takipler ve oturumlar silinir; kişi çıkış yapar. Para kayıtları yasal olarak saklanır. Bu işlem geri alınamaz.`,
        confirm: 'Sil',
        destructive: true,
      },
      () => admin.deleteUser(u.id),
      () => 'Hesap silindi',
      onDone,
      setBusy,
    );
  const roomLevel = u.roomLevel ?? 1;
  const atMax = roomLevel >= MAX_LEVEL;
  const setLevel = () =>
    confirmThen(
      ctx,
      {
        title: atMax ? 'Oda seviyesini sıfırla' : 'Odayı Lv. MAX yap',
        message: atMax
          ? `${u.name} kişisinin odası Lv.1'e döner. Mikrofon ve düzen hakları da Lv.1'e iner.`
          : `${u.name} kişisinin odası Lv.${MAX_LEVEL} olur: en çok mikrofon ve bütün düzenler açılır. Odadaki herkes hemen görür.`,
        confirm: atMax ? 'Lv.1 yap' : 'Lv. MAX yap',
        destructive: atMax,
      },
      () => admin.setRoomLevel(u.id, atMax ? 1 : MAX_LEVEL),
      (r) => `Oda seviyesi Lv.${r.level} oldu`,
      onDone,
      setBusy,
    );
  return (
    <ItemCard
      title={u.name}
      sub={u.username ? `@${u.username}` : undefined}
      pill={u.test ? <StatusPill text="Deneme" tone="danger" /> : staff ? <StatusPill text={ROLE[u.role]} tone="action" /> : undefined}
      actions={
        <>
          <Button title="Hesap" icon="wallet-outline" variant="ghost" small onPress={() => ctx.openAccount(u.id, u.name)} />
          <Button title={atMax ? 'Oda Lv.1' : 'Oda Lv. MAX'} icon="trending-up-outline" variant="tonal" small onPress={setLevel} disabled={busy} />
          {!staff && <Button title="Sil" icon="trash-outline" variant="danger" small onPress={remove} disabled={busy} />}
        </>
      }
    >
      <Line label="Giriş" value={signIn} />
      <Line label="Kayıt" value={`${fmtDate(u.createdAt)} · ${ago(u.createdAt)}`} />
      <Line label="Oda" value={u.room ? `ID ${u.room.code} · Lv.${roomLevel}` : `Oda açmadı · Lv.${roomLevel}`} />
      <Line label="Kimlik" value={u.id} mono onCopy={() => copyText(u.id, 'Hesap kimliği')} />
    </ItemCard>
  );
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  searchCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: surface.rim, ...lift },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10, minWidth: 0 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
}));
