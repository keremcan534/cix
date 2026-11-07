// Shown instead of a screen that only has demo data so far (Anlar, Aile, Arkadaşını Getir, Jeton Noktası) in a
// live build: the server has no such feature yet, so a real user must not see sample people, sample money or a
// button that takes real coins. An old link or a notification can still open the route; it lands here.
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button, Header, Screen, StateIcon } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

export function ComingSoon({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Header title={title} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
          <StateIcon name="time-outline" />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Bu bölüm yakında</Text>
          <Text style={{ color: colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            Bu sürümde henüz açık değil. Hazır olduğunda buradan ulaşabileceksin.
          </Text>
          <Button title="Geri dön" variant="tonal" small onPress={() => goBack()} style={{ marginTop: 6 }} />
        </View>
      </SafeAreaView>
    </Screen>
  );
}
