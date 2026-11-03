// Shown instead of a call or Hemen Tanış screen in a live build (lib/live callsAvailable): an old link or a
// notification can still open the route, and nothing must start or charge there.
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button, Header, Screen, StateIcon } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

export function CallsUnavailable({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Header title={title} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
          <StateIcon name="call-outline" />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Yakında</Text>
          <Text style={{ color: colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            Bire bir arama ve Hemen Tanış bu sürümde henüz açık değil. Sesli odalarda konuşabilir, mesajlaşabilirsin.
          </Text>
          <Button title="Geri dön" variant="tonal" small onPress={() => goBack()} style={{ marginTop: 6 }} />
        </View>
      </SafeAreaView>
    </Screen>
  );
}
