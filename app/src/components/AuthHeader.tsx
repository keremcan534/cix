import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { goBack } from '@/lib/nav';

const TOTAL_STEPS = 4;

export function AuthHeader({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  const { colors, gradient } = useTheme();
  const styles = useStyles();
  return (
    <View style={{ gap: 18, paddingHorizontal: 20, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.track}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${(step / TOTAL_STEPS) * 100}%` }]}
          />
        </View>
        <Text style={styles.step}>
          {step}/{TOTAL_STEPS}
        </Text>
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
