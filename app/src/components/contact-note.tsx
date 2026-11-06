// The note above a composer when the contact filter refused what was typed (lib/contact-filter): the text stays
// in the input and this says why it did not go out. The screen clears it as soon as the text is changed.
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme';

export function ContactNote({ text, style }: { text: string | null; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!text) return null;
  return (
    <View style={[styles.note, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="shield-half" size={18} color={colors.gold} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

// The look of the safety note under a suspicious message (components/chat-thread), so both read as the same voice.
const useStyles = makeStyles(({ colors }) => ({
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 6, backgroundColor: 'rgba(246,189,96,0.12)', borderColor: 'rgba(246,189,96,0.4)', borderWidth: 1, borderRadius: 12, padding: 10 },
  text: { color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
}));
