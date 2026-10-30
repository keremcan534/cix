import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

import { GroupChat } from '@/components/GroupChat';
import { GradientButton, Header, StateIcon } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { USERS } from '@/data/mock';
import { useApp } from '@/store';
import { colors } from '@/theme';

const LAST_ACTIVE = ['12 dk önce', '1 sa önce', 'Dün 22:40', '2 gün önce', '3 gün önce'];

export default function AgencyChat() {
  const { agencyId, agencyChat, sendAgencyMessage, ownedAgency } = useApp();
  const name = agencyId === 'own' ? ownedAgency?.name : AGENCIES.find((a) => a.id === agencyId)?.name;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={`${name ?? 'Ajans'} · Grup`} />
      {agencyId ? (
        <GroupChat
          members={USERS.slice(0, 10)}
          messages={agencyChat}
          onSend={sendAgencyMessage}
          pinned="📢 Bu hafta: PK turnuvası Cumartesi 21:00 · Aylık 100 saat hedefi"
          lastActive={(u) => LAST_ACTIVE[Number(u.id.slice(1)) % LAST_ACTIVE.length]}
          roomId="r2"
          quickActions={[
            { key: 'panel', label: 'Ajans paneli', emoji: '📊', onPress: () => router.push('/ajans') },
            { key: 'bank', label: 'Coins Bank', emoji: '🏦', onPress: () => router.push('/coins-bank') },
            { key: 'net', label: 'Üye ağı', emoji: '🌐', onPress: () => router.push('/ajans/ag') },
          ]}
        />
      ) : (
        // Access is checked here and (in the real product) on the server for every message read.
        <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
          <StateIcon name="lock-closed" />
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Ajans grubuna sadece ajans üyeleri erişebilir</Text>
          <GradientButton title="Ajansları gör" onPress={() => router.replace('/ajans')} style={{ marginTop: 8, alignSelf: 'stretch' }} />
        </View>
      )}
    </SafeAreaView>
  );
}
