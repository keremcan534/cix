import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, VerifiedBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function MessagesScreen() {
  const { conversations } = useApp();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Text style={styles.title}>Mesajlar</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={<Text style={styles.empty}>{"Henüz mesaj yok. Keşfet'ten birine selam ver!"}</Text>}
        renderItem={({ item }) => {
          const u = userById(item.userId);
          const last = item.messages[item.messages.length - 1];
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/sohbet/${u.id}`)}>
              <Avatar uri={u.avatar} size={52} online={u.online} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name}>{u.name}</Text>
                  {u.verified && <VerifiedBadge />}
                </View>
                <Text style={[styles.last, item.unread > 0 && { color: '#fff' }]} numberOfLines={1}>
                  {last.fromMe ? 'Sen: ' : ''}
                  {last.text}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.time}>{last.time}</Text>
                {item.unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { color: '#fff', fontSize: 24, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 10 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  last: { color: colors.textDim, fontSize: 13 },
  time: { color: colors.textDim, fontSize: 11 },
  badge: { backgroundColor: colors.pink, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
