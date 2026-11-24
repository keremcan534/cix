// A room shared into the family chat or the agency chat (Odayı paylaş › Aileye / Ajansta paylaş): the message is the
// invite line with the room's ID (lib/room-social roomShareText), and under it this button opens the room. The room is
// found by its ID among the open rooms (the room list); a closed or unknown one says so.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { serverRoomByCode } from '@/lib/live';
import { sharedRoomCode } from '@/lib/room-social';

export function RoomShareChip({ text, mine }: { text: string; mine: boolean }) {
  const code = sharedRoomCode(text);
  const [busy, setBusy] = useState(false);
  if (!code) return null;
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const room = await serverRoomByCode(code);
      if (room) router.push(`/oda/${room.id}`);
      else showAlert('Oda şu an açık değil', 'Bu oda kapanmış ya da içinde kimse yok. Biraz sonra tekrar dene.');
    } catch {
      showAlert('Oda açılamadı', 'İnternetini kontrol edip tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={open} style={[s.chip, mine && s.chipMine]} accessibilityRole="button" accessibilityLabel="Odaya git">
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mic" size={14} color="#fff" />}
      <Text style={s.text}>Odaya git</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 6, backgroundColor: '#7C3AED', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  text: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
