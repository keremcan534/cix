// The Koruma rules (lib/guard-core guardRulesText), with the server's numbers when the live catalog has them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { GiftArt } from '@/components/GiftArt';
import { guardRulesText } from '@/lib/guard-core';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { goBack } from '@/lib/nav';
import { makeStyles } from '@/theme';

export default function GuardRules() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const numbers = useLiveCatalog()?.guard;
  const [intro, how, ...rest] = guardRulesText(numbers ?? undefined);
  return (
    <LinearGradient colors={['#8B5CF6', '#D98BEA', '#F9B9E4']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 16 }}>
        <View style={styles.bar}>
          <Pressable onPress={() => goBack('/koruma')} hitSlop={8} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.big} accessibilityRole="header">
          Koruma
        </Text>
        <Text style={styles.intro}>{intro.lines.join(' ')}</Text>
        <View style={styles.card}>
          <Heading title={how.title} />
          <GiftArt giftId="koruma" emoji="🛡️" size={108} style={{ alignSelf: 'center' }} />
          {how.lines.map((l) => (
            <Text key={l} style={styles.line}>
              {l}
            </Text>
          ))}
        </View>
        <View style={styles.card}>
          {rest.map((sec) => (
            <View key={sec.title} style={{ gap: 6, marginBottom: 10 }}>
              <Heading title={sec.title} />
              {sec.lines.map((l, i) => (
                <Text key={l} style={[styles.line, sec.title === 'Koruma nasıl sürer?' && i === 0 && styles.strong]}>
                  {l}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function Heading({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.heading} accessibilityRole="header">
      <Ionicons name="heart" size={14} color="#8B3FE0" />
      <Text style={styles.headingText}>{title}</Text>
      <Ionicons name="heart" size={14} color="#8B3FE0" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  bar: { flexDirection: 'row', minHeight: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Only as wide as the word: it rises beside the back button and must not take that button's taps.
  big: { alignSelf: 'center', color: '#fff', fontSize: 44, fontWeight: '900', textAlign: 'center', marginTop: -36 },
  intro: { color: '#fff', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  // The page is the same in either scheme (the design's pink sheet); the text stays dark purple on it.
  card: { backgroundColor: 'rgba(255,240,250,0.94)', borderRadius: 24, padding: 18, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headingText: { color: '#7A2FD0', fontSize: 18, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  line: { color: '#8D45C9', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  strong: { fontWeight: '900', color: '#6D28D9' },
}));
