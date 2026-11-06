// A read from the server that failed: what is missing and "Tekrar dene", instead of an empty list or a 0 that
// looks real (Gelir, Kazanç Detayları, Cüzdan).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme';

export function LoadError({ text, onRetry, style }: { text: string; onRetry: () => void; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color={colors.textDim} />
      <Text style={styles.text}>{text}</Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Tekrar dene" style={styles.retry}>
        <Text style={styles.retryText}>Tekrar dene</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  text: { color: colors.text, fontSize: 13, flex: 1 },
  retry: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt },
  retryText: { color: colors.primaryText, fontWeight: '800', fontSize: 13 },
}));
