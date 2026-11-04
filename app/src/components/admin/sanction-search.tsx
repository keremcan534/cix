// Yönetim › Yaptırımlar: the person search (name, username, phone, e-mail, account id, #sanction or #device id)
// with its result rows (role, running and total sanctions). Used by Kişi ara and Yetkiler.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListGroup, ListRow } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import * as admin from '@/lib/live/admin';
import { roleLabel } from '@/lib/sanction-format';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { LoadState, StatusPill, useLoad } from './parts';
import { useDebounced } from './sanction-parts';

/** The search box and its result rows; `onPick` opens a person (their sanctions, or their permissions). */
export function useUserSearch() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const ready = q.length >= 2 || /^#?\d+$/.test(q);
  const load = useLoad(() => (ready ? admin.sanctionSearch(q) : Promise.resolve([] as admin.SanctionSearchUser[])), [ready ? q : '']);
  return { text, setText, q: ready ? q : '', load };
}

export function SearchBox({ search, title, hint }: { search: ReturnType<typeof useUserSearch>; title: string; hint: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.searchCard}>
      <Text style={s.searchTitle}>{title}</Text>
      <View style={s.inputWrap}>
        <Ionicons name="search" size={16} color={colors.textDim} />
        <TextInput
          value={search.text}
          onChangeText={search.setText}
          placeholder="Ad, kullanıcı adı, telefon, e-posta, #yaptırım veya #cihaz no"
          placeholderTextColor={colors.textDim}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={title}
        />
        {!!search.text && (
          <Pressable onPress={() => search.setText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>
      <Text style={s.hint}>{hint}</Text>
    </View>
  );
}

export function SearchResults({ search, onPick }: { search: ReturnType<typeof useUserSearch>; onPick: (u: admin.SanctionSearchUser) => void }) {
  if (!search.q) return null;
  return (
    <LoadState load={search.load} empty={(d) => (d.length ? null : { icon: 'search-outline', title: 'Kimse bulunamadı', text: 'Yazımı kontrol et ya da kimlik, telefon veya #numara ile dene.' })}>
      {(d) => (
        <ListGroup label={`${d.length} sonuç`} footer={d.length >= 30 ? 'İlk 30 sonuç gösteriliyor; aramayı daralt.' : undefined}>
          {d.map((u) => (
            <ListRow
              key={u.id}
              icon={u.role === 'admin' || u.role === 'moderator' ? 'shield-outline' : 'person-outline'}
              tone={u.liveSanctions ? 'danger' : 'neutral'}
              title={u.deleted ? `${u.name} (silinmiş)` : u.name}
              subtitle={[roleLabel(u.role), u.phone].filter(Boolean).join(' · ')}
              right={<Counts live={u.liveSanctions} total={u.totalSanctions} />}
              onPress={() => onPick(u)}
              accessibilityLabel={`${u.name}, ${u.liveSanctions} süren, ${u.totalSanctions} toplam yaptırım`}
            />
          ))}
        </ListGroup>
      )}
    </LoadState>
  );
}

function Counts({ live, total }: { live: number; total: number }) {
  const s = useStyles();
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      {live > 0 ? <StatusPill text={`${live} süren`} tone="danger" /> : null}
      <Text style={s.total}>{total ? `${total} toplam` : 'Temiz'}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  searchCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: surface.rim, ...lift },
  searchTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10, minWidth: 0 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  total: { color: colors.textDim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
}));
