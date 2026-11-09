// Yönetim › Duyurular (admins): what Mesajlar › Similar Ekibi shows (server/api/team.mjs). A notice goes to everyone
// or to one person (that one also gets a push); one for everyone may run as an Odalar banner for 1–30 days. A link is
// a path in the app (/siralama, /oda/…); the picture goes to the storage first (media.mjs kind notice).
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ago, fmtDate } from '@/lib/admin-format';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import { type PickedImage } from '@/lib/live/profile';
import { TEAM_KINDS, TEAM_KIND_LABEL, adminTeam, removeTeamNotice, sendTeamNotice, type AdminTeamNotice, type TeamKind } from '@/lib/live/team';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { Filters, ItemCard, Line, LoadState, Notice, SectionScroll, StatusPill, useAdmin, useLoad } from './parts';

type Who = { id: string; name: string };
const DAYS = ['0', '1', '3', '7', '30'] as const;
const EMPTY = { kind: 'notice' as TeamKind, title: '', body: '', link: '', image: null as PickedImage | null, to: null as Who | null, days: '0' as (typeof DAYS)[number] };

export function TeamSection() {
  const ctx = useAdmin();
  const load = useLoad(adminTeam);
  const s = useStyles();
  const { colors } = useTheme();
  const [d, setD] = useState(EMPTY);
  const [everyone, setEveryone] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof EMPTY>) => setD((x) => ({ ...x, ...p }));

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 1], quality: 0.8 });
    if (!res.canceled) set({ image: { uri: res.assets[0].uri, mimeType: res.assets[0].mimeType } });
  };

  const send = () => {
    if (d.title.trim().length < 2) return showAlert('Gönderilemedi', 'Başlık en az 2 harf olmalı.');
    if (!everyone && !d.to) return showAlert('Gönderilemedi', 'Duyurunun gideceği kişiyi seç.');
    const days = everyone ? Number(d.days) : 0;
    const who = everyone ? 'herkese' : `${d.to!.name} kişisine (bildirim de gider)`;
    showAlert('Duyuruyu gönder', `“${d.title.trim()}” ${who} gönderilsin mi?${days ? ` Odalar’da ${days} gün banner olarak görünür.` : ''}`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Gönder',
        onPress: () => {
          setBusy(true);
          sendTeamNotice({ kind: d.kind, title: d.title, body: d.body, link: d.link, target: everyone ? undefined : d.to!.id, bannerDays: days, image: d.image })
            .then(() => {
              ctx.toast('Duyuru gönderildi');
              setD(EMPTY);
              load.reload();
            })
            .catch((e: unknown) => showAlert('Gönderilemedi', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const remove = (n: AdminTeamNotice) =>
    showAlert('Duyuruyu kaldır', `“${n.title}” herkesin listesinden${n.banner ? ' ve Odalar bannerından' : ''} kalksın mı? Kayıt denetim için saklanır.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () =>
          removeTeamNotice(n.id)
            .then(() => {
              ctx.toast('Duyuru kaldırıldı');
              load.reload();
            })
            .catch((e: unknown) => showAlert('Kaldırılamadı', message(e))),
      },
    ]);

  return (
    <SectionScroll load={load}>
      <Notice text="Duyurular Mesajlar › Similar Ekibi’nde görünür. Kişiye özel olan yalnız o kişiye gider ve bildirim olarak da düşer. Herkese giden bir duyuru Odalar’da banner olarak da dönebilir." />
      <Text style={s.label}>Tür</Text>
      <Filters value={d.kind} options={TEAM_KINDS.map((k) => [k, TEAM_KIND_LABEL[k]] as [TeamKind, string])} onChange={(kind) => set({ kind })} />
      <Text style={s.label}>Başlık</Text>
      <TextInput value={d.title} onChangeText={(title) => set({ title })} maxLength={80} placeholder="Ör. Hafta sonu PK turnuvası" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Başlık" />
      <Text style={s.label}>Metin</Text>
      <TextInput value={d.body} onChangeText={(body) => set({ body })} maxLength={1000} multiline placeholder="Ayrıntılar (isteğe bağlı)" placeholderTextColor={colors.textDim} style={[s.input, s.multi]} accessibilityLabel="Metin" />
      <Text style={s.label}>Bağlantı</Text>
      <TextInput
        value={d.link}
        onChangeText={(link) => set({ link })}
        maxLength={120}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="/siralama (isteğe bağlı)"
        placeholderTextColor={colors.textDim}
        style={s.input}
        accessibilityLabel="Bağlantı"
      />
      <Text style={s.hint}>Uygulamada bir yol: /siralama, /oda/…, /magaza. Dış site yazılamaz.</Text>
      <Text style={s.label}>Görsel</Text>
      {d.image ? (
        <View style={{ gap: space.sm }}>
          <Image source={{ uri: d.image.uri }} style={s.preview} resizeMode="cover" accessibilityIgnoresInvertColors />
          <Button title="Görseli kaldır" icon="trash-outline" variant="ghost" small onPress={() => set({ image: null })} />
        </View>
      ) : (
        <Button title="Görsel seç" icon="image-outline" variant="tonal" small onPress={() => void pick()} />
      )}
      <Text style={s.label}>Kime</Text>
      <Filters
        value={everyone ? 'all' : 'one'}
        options={[
          ['all', 'Herkes'],
          ['one', 'Bir kişi'],
        ]}
        onChange={(v) => setEveryone(v === 'all')}
      />
      {everyone ? (
        <>
          <Text style={s.label}>Odalar bannerı</Text>
          <Filters value={d.days} options={DAYS.map((x) => [x, x === '0' ? 'Yok' : `${x} gün`] as [(typeof DAYS)[number], string])} onChange={(days) => set({ days })} />
        </>
      ) : (
        <PersonPicker value={d.to} onChange={(to) => set({ to })} />
      )}
      <Button title={busy ? 'Gönderiliyor…' : 'Duyuruyu gönder'} icon="send" disabled={busy} onPress={send} />

      <Text style={[s.label, { marginTop: space.lg }]}>Gönderilenler</Text>
      <LoadState load={load} empty={(list) => (list.length ? null : { icon: 'megaphone-outline', title: 'Henüz duyuru yok' })}>
        {(list) =>
          list.map((n) => {
            const running = n.banner && !!n.endsAt && Date.parse(n.endsAt) > Date.now();
            return (
              <ItemCard
                key={n.id}
                title={n.title}
                sub={`${TEAM_KIND_LABEL[n.kind]} · ${n.target ? n.target.name : 'Herkes'} · ${ago(n.createdAt)}`}
                pill={running ? <StatusPill text="Banner" tone="action" /> : n.target ? <StatusPill text="Kişisel" /> : undefined}
                actions={<Button title="Kaldır" variant="danger" small onPress={() => remove(n)} />}
              >
                {!!n.body && <Line label="Metin" value={n.body} />}
                {!!n.link && <Line label="Bağlantı" value={n.link} mono />}
                {n.banner && !!n.endsAt && <Line label="Banner bitişi" value={fmtDate(n.endsAt)} />}
                {!!n.imageUrl && <Image source={{ uri: n.imageUrl }} style={s.preview} resizeMode="cover" accessibilityIgnoresInvertColors />}
                {!!n.by && <Line label="Gönderen" value={n.by} />}
              </ItemCard>
            );
          })
        }
      </LoadState>
    </SectionScroll>
  );
}

/** Finds a person by name or phone (the sanctions search) and picks one. */
function PersonPicker({ value, onChange }: { value: Who | null; onChange: (w: Who | null) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<admin.SanctionSearchUser[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (value)
    return (
      <View style={s.chosen}>
        <Text style={s.chosenName} numberOfLines={1}>
          {value.name}
        </Text>
        <Button title="Değiştir" variant="ghost" small onPress={() => onChange(null)} />
      </View>
    );
  const search = () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    admin
      .sanctionSearch(q)
      .then((users) => setFound(users.filter((u) => !u.deleted)))
      .catch((e: unknown) => showAlert('Aranamadı', message(e)))
      .finally(() => setBusy(false));
  };
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Ad veya telefon"
          placeholderTextColor={colors.textDim}
          style={[s.input, { flex: 1 }]}
          accessibilityLabel="Kişi ara"
        />
        <Button title="Ara" small variant="tonal" disabled={busy || q.trim().length < 2} onPress={search} />
      </View>
      {found?.length === 0 && <Text style={s.hint}>Kimse bulunamadı.</Text>}
      {found?.map((u) => (
        <Pressable key={u.id} onPress={() => onChange({ id: u.id, name: u.name })} accessibilityRole="button" style={s.result}>
          <Text style={s.chosenName} numberOfLines={1}>
            {u.name}
          </Text>
          {!!u.phone && <Text style={s.hint}>{u.phone}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: space.sm },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  multi: { minHeight: 84, textAlignVertical: 'top' },
  preview: { width: '100%', aspectRatio: 2, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  chosenName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  result: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt, gap: 2 },
}));
