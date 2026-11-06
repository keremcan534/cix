// One "no access" state for a staff or agency screen the server refused (403), shown once instead of an error block
// per section, with a way back.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Panel, ns } from '@/components/agency-net';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { colors } from '@/theme';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

export function NoAccess({ title = 'Bu ekran için yetkin yok', text }: { title?: string; text?: string }) {
  return (
    <Panel style={{ alignItems: 'center', gap: 10, paddingVertical: 36 }}>
      <Ionicons name="lock-closed-outline" size={30} color={colors.textDim} />
      <Text style={[ns.title, { textAlign: 'center' }]}>{title}</Text>
      {!!text && <Text style={[ns.dim, { textAlign: 'center' }]}>{text}</Text>}
      <Button title="Geri dön" variant="tonal" small icon="arrow-back" onPress={goBack} />
    </Panel>
  );
}
