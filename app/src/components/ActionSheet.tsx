import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors } from '@/theme';

export type SheetOption = { label: string; onPress: () => void; destructive?: boolean };

/** Cross-platform bottom sheet menu (Alert with many buttons doesn't work on web). */
export function ActionSheet({ visible, title, titleArt, options, onClose }: { visible: boolean; title?: string; /** 3D picture before the title. */ titleArt?: number; options: SheetOption[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {title &&
          (titleArt ? (
            <View style={styles.titleRow}>
              <Image source={titleArt} style={{ width: 20, height: 20 }} />
              <Text style={[styles.title, { paddingVertical: 0 }]}>{title}</Text>
            </View>
          ) : (
            <Text style={styles.title}>{title}</Text>
          ))}
        {options.map((o) => (
          <Pressable
            key={o.label}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.cardAlt }]}
            onPress={() => {
              onClose();
              o.onPress();
            }}
          >
            <Text style={[styles.optionText, o.destructive && { color: colors.red }]}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.option, { marginTop: 6 }]} onPress={onClose}>
          <Text style={[styles.optionText, { color: colors.textDim }]}>Vazgeç</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 12, paddingBottom: 34 },
  title: { color: colors.textDim, textAlign: 'center', paddingVertical: 10, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  option: { paddingVertical: 15, alignItems: 'center', borderRadius: 14 },
  optionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
