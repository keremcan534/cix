// Seat action menu that opens right next to the tapped seat (not a bottom sheet), so it's clear which
// seat it acts on. Placed below the seat when there is room, otherwise above, and kept on screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/text';
import { colors } from '@/theme';

export type SeatMenuItem = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; destructive?: boolean; dividerBefore?: boolean };
export type Rect = { x: number; y: number; w: number; h: number };

const W = 228;
const ROW = 46;

export function SeatMenu({ anchor, title, items, onClose }: { anchor: Rect | null; title?: string; items: SeatMenuItem[]; onClose: () => void }) {
  const screen = useWindowDimensions();
  if (!anchor) return null;
  const dividers = items.filter((i) => i.dividerBefore).length;
  const height = Math.min(items.length * ROW + dividers * 9 + (title ? 34 : 0) + 14, screen.height * 0.6);
  const cx = anchor.x + anchor.w / 2;
  const left = Math.min(Math.max(12, cx - W / 2), screen.width - W - 12);
  const below = anchor.y + anchor.h + 10 + height < screen.height - 16;
  const top = below ? anchor.y + anchor.h + 10 : Math.max(16, anchor.y - 10 - height);
  const arrowLeft = Math.min(Math.max(16, cx - left - 7), W - 30);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Menüyü kapat" />
      {/* Highlight ring on the seat the menu belongs to */}
      <View pointerEvents="none" style={[s.focus, { left: anchor.x - 4, top: anchor.y - 4, width: anchor.w + 8, height: anchor.h + 8, borderRadius: (anchor.w + 8) / 2 }]} />
      <View style={[s.menu, { left, top, width: W, maxHeight: height }]}>
        <View style={[s.arrow, { left: arrowLeft }, below ? { top: -7, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }]} />
        {title && (
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
        )}
        <ScrollView bounces={false}>
          {items.map((it) => (
            <View key={it.key}>
              {it.dividerBefore && <View style={s.divider} />}
              <Pressable
                style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}
                onPress={() => {
                  onClose();
                  it.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={it.label}
              >
                <Ionicons name={it.icon} size={18} color={it.destructive ? '#FF7A82' : colors.text} />
                <Text style={[s.label, it.destructive && { color: '#FF7A82' }]} numberOfLines={1}>
                  {it.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  focus: { position: 'absolute', borderWidth: 2, borderColor: '#13D9DF' },
  menu: { position: 'absolute', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  arrow: { position: 'absolute', width: 14, height: 14, backgroundColor: colors.card, borderColor: colors.border, transform: [{ rotate: '45deg' }] },
  title: { color: colors.textDim, fontSize: 12, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: ROW, paddingHorizontal: 14 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },
});
