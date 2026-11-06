// The sign-up screens' header: back, the step counter and the title. The counter numbers only the screens the
// person really goes through (lib/signup signupStep); with a single step there is nothing to count, so it is
// left out (gorsel-22 f, giris-14).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { goBack } from '@/lib/nav';
import { makeStyles, useTheme } from '@/theme';

export function SignupHeader({ step, total, title, subtitle }: { step: number; total: number; title: string; subtitle?: string }) {
  const { colors, gradient } = useTheme();
  const styles = useStyles();
  const counted = total > 1;
  return (
    <View style={{ gap: 18, paddingHorizontal: 20, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        {counted && (
          <>
            <View style={styles.track}>
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
            </View>
            <Text style={styles.step}>
              {step}/{total}
            </Text>
          </>
        )}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  // The empty track is a step darker than the paper in the light scheme, where a white card track would vanish.
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: dark ? colors.card : colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  step: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textDim, fontSize: 15, lineHeight: 21 },
}));
