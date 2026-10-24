import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, GradientButton, VerifiedBadge } from '@/components/ui';
import { ME, MOMENTS, userById, type Moment } from '@/data/mock';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function MomentsScreen() {
  const [moments, setMoments] = useState(MOMENTS);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const { bump } = useApp();

  const post = () => {
    if (!draft.trim()) return;
    setMoments((m) => [{ id: String(Date.now()), userId: ME.id, text: draft.trim(), likes: 0, comments: 0, time: 'şimdi' }, ...m]);
    setDraft('');
    setComposing(false);
    bump('moments');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Anlar</Text>
        <Pressable onPress={() => setComposing(true)} hitSlop={10}>
          <Ionicons name="add-circle" size={30} color={colors.pink} />
        </Pressable>
      </View>
      <FlatList
        data={moments}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MomentCard moment={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <Modal visible={composing} animationType="slide" transparent onRequestClose={() => setComposing(false)}>
        <View style={styles.composeWrap}>
          <View style={styles.compose}>
            <Text style={styles.composeTitle}>Yeni an paylaş</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Neler oluyor?"
              placeholderTextColor={colors.textDim}
              multiline
              style={styles.composeInput}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Ionicons name="image-outline" size={24} color={colors.textDim} />
                <Ionicons name="location-outline" size={24} color={colors.textDim} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Pressable onPress={() => setComposing(false)}>
                  <Text style={{ color: colors.textDim }}>Vazgeç</Text>
                </Pressable>
                <GradientButton small title="Paylaş" onPress={post} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MomentCard({ moment }: { moment: Moment }) {
  const user = userById(moment.userId);
  const [liked, setLiked] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable style={styles.row} onPress={() => user.id !== 'me' && router.push(`/kullanici/${user.id}`)}>
        <Avatar uri={user.avatar} size={42} online={user.online} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.name}>{user.name}</Text>
            {user.verified && <VerifiedBadge />}
          </View>
          <Text style={styles.meta}>
            {user.city} · {moment.time}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textDim} />
      </Pressable>
      <Text style={styles.text}>{moment.text}</Text>
      {moment.image && <Image source={{ uri: moment.image }} style={styles.image} />}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => setLiked((l) => !l)}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.pink : colors.textDim} />
          <Text style={styles.actionText}>{moment.likes + (liked ? 1 : 0)}</Text>
        </Pressable>
        <View style={styles.action}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textDim} />
          <Text style={styles.actionText}>{moment.comments}</Text>
        </View>
        <View style={styles.action}>
          <Ionicons name="gift-outline" size={20} color={colors.textDim} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  card: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 12 },
  text: { color: '#fff', fontSize: 15, lineHeight: 21 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.card },
  actions: { flexDirection: 'row', gap: 22 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.textDim, fontSize: 13 },
  composeWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  compose: { backgroundColor: colors.card, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12, paddingBottom: 34 },
  composeTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  composeInput: { color: '#fff', minHeight: 100, fontSize: 16, textAlignVertical: 'top' },
});
