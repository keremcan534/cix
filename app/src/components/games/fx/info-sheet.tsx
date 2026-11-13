// A game's "?" sheet: how it is played, what it pays (the game's own paytable as children) and the standing notes
// about the game balance. Everything a round doesn't need on screen lives here, so the stage and its controls are
// all a player sees while playing.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { salonArt } from '@/components/games/fx/salon-art';
import { Text } from '@/components/text';
import { tapHaptic } from '@/lib/haptics';
import { SCRIM, edge } from '@/theme';

/** The same two notes under every Oyun Salonu game. */
export const GAME_BALANCE_NOTE = 'Kazançlar oyun bakiyesine yazılır; bahisler önce oradan düşer. Oyun bakiyesi yalnızca oyunlarda kullanılır, hediye edilemez ve paraya çevrilemez.';

export function GameInfoSheet({ visible, onClose, title, rules, children }: { visible: boolean; onClose: () => void; title: string; rules: string; /** The paytable, odds or anything else the game explains. */ children?: ReactNode }) {
  // Android modals draw edge to edge: the last line stays above the navigation bar.
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(24, bottom + 12) }]}>
        <View style={s.grip} />
        <View style={s.head}>
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kuralları kapat">
            <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={s.block}>
            <Text style={s.label}>Nasıl oynanır</Text>
            <Text style={s.body}>{rules}</Text>
          </View>
          {children}
          <View style={s.block}>
            <Text style={s.label}>Oyun bakiyesi</Text>
            <Text style={s.body}>{GAME_BALANCE_NOTE}</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** The round "?" on a game's stage. */
// The shared "Kurallar" button picture (fx/salon-art); without it, a ring in the game's tint around a "?".
const RULES = salonArt('dugme-kurallar');

export function InfoButton({ onPress, tint = 'rgba(255,255,255,0.55)' }: { onPress: () => void; tint?: string }) {
  return (
    <Pressable
      style={RULES !== undefined ? s.roundPic : [s.round, { borderColor: tint }]}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Kurallar ve ödeme tablosu"
    >
      {RULES !== undefined ? <Image source={RULES} style={s.pic} accessibilityIgnoresInvertColors /> : <Ionicons name="help" size={18} color="#fff" />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { maxHeight: '78%', backgroundColor: '#111A30', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8, ...edge.sheet },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '900' },
  block: { gap: 5 },
  label: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 21 },
  round: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  roundPic: { width: 34, height: 34, borderRadius: 17, boxShadow: '0 3px 6px rgba(0,0,0,0.45)' },
  pic: { width: 34, height: 34 },
});
