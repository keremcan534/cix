// Takipçiler / Takip: a bottom sheet listing people; a tap opens their profile. The list is handed in as a
// loader so the Ben tab and someone else's profile (live: the server; demo: the sample people) share it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, Button } from '@/components/ui';
import { makeStyles, radius, space, type, useTheme } from '@/theme';
import { RowSkeleton, Skeletons } from '@/components/fx/skeleton';

export type ListedPerson = { id: string; name: string; avatarUrl?: string | null };

export function FollowListSheet({
  title,
  visible,
  load,
  empty,
  onClose,
}: {
  title: string;
  visible: boolean;
  /** Read each time the sheet opens. */
  load: () => Promise<ListedPerson[]> | ListedPerson[];
  /** Shown when the list is empty. */
  empty: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const { bottom } = useSafeAreaInsets();
  // Each opening (and "Tekrar dene") is a new read; its answer is kept under its number, so an old answer
  // shows nothing and the sheet starts from the spinner.
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; people: ListedPerson[] | null } | null>(null);
  const current = result && result.attempt === attempt ? result : null;
  const failed = !!current && current.people === null;
  const people = current?.people ?? null;

  const close = () => {
    setAttempt((n) => n + 1);
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    Promise.resolve()
      .then(load)
      .then((list) => alive && setResult({ attempt, people: list }))
      .catch(() => alive && setResult({ attempt, people: null }));
    return () => {
      alive = false;
    };
    // `load` is a new function each render; the list is read when the sheet opens (or on "Tekrar dene").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, attempt]);

  const open = (id: string) => {
    close();
    router.push(`/kullanici/${id}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.scrim} onPress={close} accessibilityLabel={`${title} listesini kapat`} />
      <View style={[s.sheet, { paddingBottom: Math.max(space.lg, bottom + 8) }]}>
        <View style={s.header}>
          <Text style={s.title}>{title}</Text>
          <Pressable onPress={close} hitSlop={10} style={s.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        {failed ? (
          <View style={s.state}>
            <Text style={s.stateText}>Liste yüklenemedi. Bağlantını kontrol et.</Text>
            <Button title="Tekrar dene" variant="tonal" onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : people === null ? (
          <Skeletons count={5} gap={6} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <RowSkeleton />
          </Skeletons>
        ) : people.length === 0 ? (
          <View style={s.state}>
            <Text style={s.stateText}>{empty}</Text>
          </View>
        ) : (
          <FlatList
            data={people}
            keyExtractor={(p) => p.id}
            style={s.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => open(item.id)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`${item.name} profilini aç`}>
                <Avatar uri={item.avatarUrl ?? undefined} name={item.name} size={44} />
                <Text style={s.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '80%', minHeight: 240, backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  title: { flex: 1, color: colors.text, fontSize: type.title, fontWeight: '800' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  state: { alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.xl },
  stateText: { color: colors.textDim, textAlign: 'center' },
}));
