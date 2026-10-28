import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/chat-thread';
import { Avatar, VerifiedBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { colors } from '@/theme';
import { goBack } from '@/lib/nav';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = userById(id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatThread
        user={user}
        header={(typing) => (
          <View style={styles.header}>
            <Pressable onPress={() => goBack()} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/kullanici/${user.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            >
              <Avatar uri={user.avatar} size={38} online={user.online} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name}>{user.name}</Text>
                  {user.verified && <VerifiedBadge />}
                </View>
                <Text style={styles.status}>{typing ? 'yazıyor...' : user.online ? 'Çevrimiçi' : `${user.city}`}</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'sesli' } })} hitSlop={8}>
              <Ionicons name="call-outline" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'goruntulu' } })}
              hitSlop={8}
              style={{ marginLeft: 14 }}
            >
              <Ionicons name="videocam-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { color: '#fff', fontWeight: '700', fontSize: 16 },
  status: { color: colors.textDim, fontSize: 12 },
});
