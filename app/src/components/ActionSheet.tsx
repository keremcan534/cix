import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
/** `icon` is an Ionicons glyph. When any option has one, the sheet becomes a left-aligned list with an icon column. */
export type SheetOption = { label: string; onPress: () => void; destructive?: boolean; icon?: IconName };

/** Cross-platform bottom sheet menu (Alert with many buttons doesn't work on web). */
export function ActionSheet({ visible, title, titleArt, options, onClose }: { visible: boolean; title?: string; /** 3D picture before the title. */ titleArt?: number; options: SheetOption[]; onClose: () => void }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const listed = options.some((o) => o.icon);
  // Android modals draw edge to edge: keep 'Vazgeç' above the navigation bar.
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(34, bottom + 8) }]}>
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
            style={({ pressed }) => [styles.option, listed && styles.listed, pressed && { backgroundColor: colors.cardAlt }]}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              o.onPress();
            }}
          >
            {listed && (
              <View style={styles.iconBox}>{o.icon && <Ionicons name={o.icon} size={20} color={o.destructive ? semantic.danger : colors.text} />}</View>
            )}
            <Text style={[styles.optionText, listed && styles.listedText, o.destructive && { color: semantic.danger }]}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.option, { marginTop: 6 }]} onPress={onClose}>
          <Text style={[styles.optionText, { color: colors.textDim }]}>Vazgeç</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 12, paddingBottom: 34 },
  title: { color: colors.textDim, textAlign: 'center', paddingVertical: 10, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  option: { paddingVertical: 15, alignItems: 'center', borderRadius: 14 },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  listed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, paddingHorizontal: 14 },
  listedText: { flex: 1, textAlign: 'left' },
  iconBox: { width: 24, alignItems: 'center' },
}));
