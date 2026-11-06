// The note above a composer when the contact filter refused what was typed (lib/contact-filter): the text stays
// in the input and this says why it did not go out. The screen clears it as soon as the text is changed.
// Near the automatic mute it also says what the server answered: tries left, or that messages are off for a while.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncExternalStore } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { getContactStrike, onContactStrike, strikeWarning } from '@/lib/contact-filter';
import { serverNow } from '@/lib/sanction-time';
import { makeStyles, useTheme } from '@/theme';

export function ContactNote({ text, style }: { text: string | null; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const strike = useSyncExternalStore(onContactStrike, getContactStrike, getContactStrike);
  if (!text) return null;
  const warning = strikeWarning(strike, serverNow());
  return (
    <View style={[styles.note, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="shield-half" size={18} color={colors.gold} />
      <View style={styles.body}>
        <Text style={styles.text}>{text}</Text>
        {warning ? <Text style={styles.warning}>{warning}</Text> : null}
      </View>
    </View>
  );
}

// The look of the safety note under a suspicious message (components/chat-thread), so both read as the same voice.
const useStyles = makeStyles(({ colors }) => ({
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 6, backgroundColor: 'rgba(246,189,96,0.12)', borderColor: 'rgba(246,189,96,0.4)', borderWidth: 1, borderRadius: 12, padding: 10 },
  body: { flex: 1, gap: 4 },
  text: { color: colors.text, fontSize: 12, lineHeight: 17 },
  warning: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
}));
