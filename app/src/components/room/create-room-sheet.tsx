// "Oda oluştur" in a live build: name, bulletin, type and an optional password, then the room opens on the server
// (lib/live openServerRoom, server/api/rooms.mjs POST /api/rooms). /oda/yeni shows it while I have no open room.
// The server checks every field again; a password is kept only as its hash there.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ROOM_TYPES, type RoomType } from '@/data/catalog';
import type { Room } from '@/data/mock';
import { message, openServerRoom } from '@/lib/live';
import { ROOM_FORM, roomFormError } from '@/lib/live/room-form';
import { SCRIM, makeStyles, radius, space } from '@/theme';

export function CreateRoomSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (room: Room) => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [roomType, setRoomType] = useState<RoomType>('free');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const problem = roomFormError(title, password);

  const create = async () => {
    setTried(true);
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await openServerRoom(title, announcement, { roomType, password: password.trim() || undefined }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Kapat" />
      <KeyboardAvoid style={s.wrap} pointerEvents="box-none">
        <View style={[s.sheet, { paddingBottom: Math.max(34, insets.bottom + 8) }]}>
          <View style={s.grip} />
          <Text style={s.title}>Oda oluştur</Text>
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
            <View style={s.field}>
              <Text style={s.label}>Oda adı</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                maxLength={ROOM_FORM.title}
                placeholder="Örn. Gece sohbeti"
                placeholderTextColor={s.dim.color}
                accessibilityLabel="Oda adı"
                returnKeyType="next"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Duyuru (isteğe bağlı)</Text>
              <TextInput
                style={[s.input, s.multi]}
                value={announcement}
                onChangeText={setAnnouncement}
                maxLength={ROOM_FORM.announcement}
                multiline
                placeholder="Odaya girenler ilk bunu görür"
                placeholderTextColor={s.dim.color}
                accessibilityLabel="Duyuru"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Oda türü</Text>
              <View style={s.chips}>
                {ROOM_TYPES.map((t) => {
                  const on = t.id === roomType;
                  return (
                    <Pressable key={t.id} style={[s.chip, on && s.chipOn]} onPress={() => setRoomType(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t.name}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Şifre (isteğe bağlı)</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                maxLength={ROOM_FORM.passwordMax}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={`${ROOM_FORM.passwordMin}–${ROOM_FORM.passwordMax} karakter`}
                placeholderTextColor={s.dim.color}
                accessibilityLabel="Oda şifresi"
              />
              <Text style={s.hint}>Boş bırakırsan herkes girebilir. Şifreyi yalnızca davet ettiğin kişilerle paylaş.</Text>
            </View>
            {(tried && problem) || error ? <Text style={s.error}>{error ?? problem}</Text> : null}
            <Button title={busy ? 'Açılıyor…' : 'Odayı aç'} icon="mic" disabled={busy} onPress={() => void create()} />
          </ScrollView>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, edge }) => ({
  dim: { color: colors.textDim },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: SCRIM },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, maxHeight: '90%', ...edge.sheet },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  input: { color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  multi: { minHeight: 72, textAlignVertical: 'top' },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipOn: { backgroundColor: semantic.tonal, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: semantic.tonalText },
  error: { color: semantic.danger, fontSize: 13 },
}));
