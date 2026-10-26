import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmojiPanel } from '@/components/EmojiPanel';
import { Avatar, VerifiedBadge } from '@/components/ui';
import { BOT_LINES, DM_PRICE, FOLLOWS_ME, userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, gradientDeep } from '@/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = userById(id);
  const { conversations, sendMessage, markRead, following, toggleFollow, blocked, spendCoins } = useApp();
  const mutual = following.has(user.id) && FOLLOWS_ME.has(user.id);
  const isBlocked = blocked.has(user.id);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const convo = conversations.find((c) => c.userId === user.id);
  const messages = convo?.messages ?? [];
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    markRead(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, messages.length]);

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  // Index of the other person's latest message: everything I sent before it counts as read.
  const lastTheirs = messages.map((m) => m.fromMe).lastIndexOf(false);

  const send = () => {
    const text = draft.trim();
    if (!text || isBlocked) return;
    // Mutual follow chats are free; otherwise each message costs coins (price shown before sending).
    if (!mutual && !spendCoins(DM_PRICE, `Mesaj: ${user.name}`)) {
      showAlert('Yetersiz jeton', `Karşılıklı takip olmadan mesaj başı ${DM_PRICE} jeton.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    sendMessage(user.id, text);
    setEmojiOpen(false);
    setDraft('');
    // Fake reply so the prototype feels real.
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      setTyping(false);
      sendMessage(user.id, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)], false);
    }, 1500);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListFooterComponent={
            <View style={styles.intro}>
              <Avatar uri={user.avatar} size={72} ring />
              <Text style={styles.introName}>
                {user.name}, {user.age}
              </Text>
              <Text style={styles.status}>{user.bio}</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.fromMe ? (
              <LinearGradient colors={gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bubble, styles.mine]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
                <Text style={styles.time}>
                  {item.time}{' '}
                  <Text style={{ color: messages.indexOf(item) < lastTheirs ? '#7DD3FC' : 'rgba(255,255,255,0.7)' }}>✓✓</Text>
                </Text>
              </LinearGradient>
            ) : (
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
                <Text style={styles.time}>{item.time}</Text>
              </View>
            )
          }
        />
        {isBlocked ? (
          <Text style={styles.notice}>Bu kullanıcıyı engelledin; mesaj gönderemezsin.</Text>
        ) : (
          !mutual && (
            <Pressable style={styles.notice} onPress={() => toggleFollow(user.id)}>
              <Text style={{ color: colors.gold, fontSize: 12, textAlign: 'center' }}>
                Karşılıklı takip değilsiniz · mesaj başı 🪙 {DM_PRICE}. {following.has(user.id) ? `${user.name} seni takip etmiyor.` : 'Takip et → karşılıklıysa ücretsiz.'}
              </Text>
            </Pressable>
          )
        )}
        {emojiOpen && <EmojiPanel onPick={(e) => setDraft((d) => d + e)} />}
        <View style={styles.inputRow}>
          <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel="Emoji" hitSlop={6}>
            <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={26} color={colors.textDim} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Mesaj yaz..."
            placeholderTextColor={colors.textDim}
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable onPress={send}>
            <LinearGradient colors={gradientDeep} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  intro: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  introName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.cardAlt, borderBottomLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 15 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  notice: { paddingHorizontal: 16, paddingVertical: 6, color: colors.textDim, textAlign: 'center', fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
