import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FramedAvatar, GradientButton, VerifiedBadge } from '@/components/ui';
import { MOMENTS, userById, type Moment, type User } from '@/data/mock';
import {
  AUTHOR_SVIP,
  EXTRA_MOMENTS,
  MOMENT_TOPIC_OF,
  MOMENT_TOPICS,
  NAME_COLORS,
  SEED_COMMENTS,
  agoLabel,
  agoMinutes,
  distanceLabel,
  type MomentComment,
} from '@/data/social-ui';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const TABS = ['arkadaş', 'Tavsiye et', 'Son'] as const;
type Tab = (typeof TABS)[number];
type FeedMoment = Moment & { topicId?: string };

const INITIAL: FeedMoment[] = [...EXTRA_MOMENTS, ...MOMENTS].map((m) => ({ ...m, topicId: MOMENT_TOPIC_OF[m.id] }));

export default function MomentsScreen() {
  const { bump, blocked, following, me, notifications, sendMessage, settings, vipLevel, equipped } = useApp();
  const [tab, setTab] = useState<Tab>('Tavsiye et');
  const [topic, setTopic] = useState<string | null>(null);
  const [moments, setMoments] = useState<FeedMoment[]>(INITIAL);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, MomentComment[]>>(SEED_COMMENTS);
  const [greeted, setGreeted] = useState<Set<string>>(new Set());
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  let feed = moments.filter((m) => !blocked.has(m.userId));
  if (tab === 'arkadaş') feed = feed.filter((m) => m.userId === 'me' || following.has(m.userId));
  if (topic) feed = feed.filter((m) => m.topicId === topic);
  if (tab === 'Son') feed = [...feed].sort((a, b) => agoMinutes(a.time) - agoMinutes(b.time));

  const authorOf = (m: Moment): User => (m.userId === 'me' ? me : userById(m.userId));

  const post = (text: string, image: string | undefined, topicId: string | undefined) => {
    setMoments((m) => [{ id: String(Date.now()), userId: 'me', text, image, likes: 0, comments: 0, time: 'şimdi', topicId }, ...m]);
    setComposing(false);
    bump('moments');
  };

  const greet = (user: User) => {
    if (greeted.has(user.id)) return router.push(`/sohbet/${user.id}`);
    sendMessage(user.id, 'Selam! 👋');
    bump('greetings');
    setGreeted((prev) => new Set(prev).add(user.id));
  };

  const share = async (m: Moment) => {
    try {
      await Share.share({ message: `${authorOf(m).name} bir an paylaştı: “${m.text}” · Similar Club` });
    } catch {
      showAlert('Paylaşılamadı', 'Bu cihazda paylaşım desteklenmiyor.');
    }
  };

  const commentCount = (m: Moment) => m.comments + (comments[m.id]?.length ?? 0) - (SEED_COMMENTS[m.id]?.length ?? 0);
  const openMoment = moments.find((m) => m.id === commentsFor);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={{ alignItems: 'center' }}>
            <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
            {t === tab && <View style={styles.underline} />}
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/bildirimler')} hitSlop={10}>
          <Ionicons name="notifications-outline" size={25} color="#fff" />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <FlatList
        data={feed}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics}>
              {MOMENT_TOPICS.map((t) => (
                <Pressable key={t.id} onPress={() => setTopic((cur) => (cur === t.id ? null : t.id))}>
                  <LinearGradient
                    colors={t.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.topic, topic === t.id && styles.topicActive, topic && topic !== t.id && { opacity: 0.55 }]}
                  >
                    <Text style={styles.topicTitle} numberOfLines={1}>
                      # {t.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.topicViews}>{t.views}</Text>
                    </View>
                    <Text style={styles.topicEmoji}>{t.emoji}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>
            {topic && (
              <View style={styles.topicFilter}>
                <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}># {MOMENT_TOPICS.find((t) => t.id === topic)?.title}</Text>
                <Pressable onPress={() => setTopic(null)} hitSlop={8}>
                  <Text style={{ color: colors.pink, fontWeight: '700', fontSize: 12 }}>Tümünü göster</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 38 }}>{tab === 'arkadaş' ? '👥' : '🌙'}</Text>
            <Text style={{ color: colors.textDim, textAlign: 'center' }}>
              {tab === 'arkadaş' ? 'Takip ettiklerinin anları burada görünür.' : 'Bu konuda henüz an yok. İlk paylaşan sen ol!'}
            </Text>
            {tab === 'arkadaş' && (
              <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/kesfet')}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Yeni insanlar keşfet</Text>
              </Pressable>
            )}
          </View>
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const author = authorOf(item);
          const isMe = item.userId === 'me';
          return (
            <MomentCard
              moment={item}
              author={author}
              isMe={isMe}
              svip={isMe ? vipLevel : (AUTHOR_SVIP[author.id] ?? 0)}
              frameId={isMe ? equipped.frame : undefined}
              showDistance={settings.cityDiscovery}
              liked={liked.has(item.id)}
              commentCount={commentCount(item)}
              greeted={greeted.has(author.id)}
              onLike={() =>
                setLiked((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
              onComment={() => setCommentsFor(item.id)}
              onShare={() => share(item)}
              onGreet={() => greet(author)}
            />
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setComposing(true)} accessibilityLabel="Yeni an paylaş">
        <Ionicons name="paper-plane" size={24} color="#fff" />
      </Pressable>

      <Composer visible={composing} onClose={() => setComposing(false)} onPost={post} />
      <CommentsSheet
        visible={!!openMoment}
        comments={(openMoment ? (comments[openMoment.id] ?? []) : []).filter((c) => !blocked.has(c.userId))}
        me={me}
        onClose={() => setCommentsFor(null)}
        onSend={(text) => {
          if (!openMoment) return;
          const c: MomentComment = { id: String(Date.now()), userId: 'me', text, time: 'şimdi' };
          setComments((prev) => ({ ...prev, [openMoment.id]: [...(prev[openMoment.id] ?? []), c] }));
        }}
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />;
}

function MomentCard({
  moment,
  author,
  isMe,
  svip,
  frameId,
  showDistance,
  liked,
  commentCount,
  greeted,
  onLike,
  onComment,
  onShare,
  onGreet,
}: {
  moment: Moment;
  author: User;
  isMe: boolean;
  svip: number;
  frameId?: string;
  showDistance: boolean;
  liked: boolean;
  commentCount: number;
  greeted: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onGreet: () => void;
}) {
  const female = author.gender === 'Kadın';
  const meta = [agoLabel(moment.time), !isMe && showDistance ? distanceLabel(author.distanceKm) : null].filter(Boolean).join('  |  ');
  const openProfile = () => (isMe ? router.push('/(tabs)/profil') : router.push(`/kullanici/${author.id}`));

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable onPress={openProfile}>
          <FramedAvatar uri={author.avatar} size={50} vipLevel={svip} frameId={frameId} online={!svip && author.online} />
          {svip > 0 && (
            <LinearGradient colors={['#A855F7', '#EC4899']} style={styles.svipTag}>
              <Text style={styles.svipText}>SVIP{svip}</Text>
            </LinearGradient>
          )}
        </Pressable>
        <Pressable style={{ flex: 1, gap: 3 }} onPress={openProfile}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, NAME_COLORS[author.id] ? { color: NAME_COLORS[author.id] } : null]} numberOfLines={1}>
              {author.name}
            </Text>
            {author.gender && (
              <View style={[styles.genderChip, { backgroundColor: female ? 'rgba(236,72,153,0.18)' : 'rgba(56,189,248,0.18)' }]}>
                <Text style={{ color: female ? colors.pink : '#38BDF8', fontSize: 12, fontWeight: '700' }}>
                  {female ? '♀' : '♂'}
                  {author.age}
                </Text>
              </View>
            )}
            {author.verified && <VerifiedBadge size={15} />}
          </View>
          <Text style={styles.meta}>{meta}</Text>
        </Pressable>
        {!isMe && (
          <Pressable onPress={onGreet} hitSlop={6}>
            <LinearGradient colors={greeted ? [colors.cardAlt, colors.cardAlt] : ['rgba(244,114,182,0.25)', 'rgba(236,72,153,0.4)']} style={styles.hiBtn}>
              <Text style={styles.hiText}>{greeted ? 'Sohbet' : 'Hi ❤'}</Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.text}>{moment.text}</Text>
        {moment.image && <Image source={{ uri: moment.image }} style={styles.image} />}
        <View style={styles.actions}>
          <Pressable onPress={onShare} hitSlop={8}>
            <Ionicons name="arrow-redo-outline" size={22} color={colors.textDim} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.action} onPress={onLike} hitSlop={8}>
            <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={21} color={liked ? colors.pink : colors.textDim} />
            <Text style={[styles.actionText, liked && { color: colors.pink }]}>{moment.likes + (liked ? 1 : 0)}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={onComment} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.textDim} />
            <Text style={styles.actionText}>{commentCount}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Composer({ visible, onClose, onPost }: { visible: boolean; onClose: () => void; onPost: (text: string, image: string | undefined, topicId: string | undefined) => void }) {
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [topicId, setTopicId] = useState<string | undefined>();

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) setImage(res.assets[0].uri);
  };

  const submit = () => {
    if (!draft.trim() && !image) return showAlert('Boş an paylaşılamaz', 'Bir şeyler yaz ya da fotoğraf ekle.');
    onPost(draft.trim(), image, topicId);
    setDraft('');
    setImage(undefined);
    setTopicId(undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Yeni an paylaş</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Neler oluyor?"
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.composeInput}
            autoFocus
          />
          {image && (
            <View style={{ alignSelf: 'flex-start' }}>
              <Image source={{ uri: image }} style={styles.preview} />
              <Pressable style={styles.removeImage} onPress={() => setImage(undefined)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MOMENT_TOPICS.map((t) => (
              <Pressable key={t.id} onPress={() => setTopicId((cur) => (cur === t.id ? undefined : t.id))} style={[styles.topicChip, topicId === t.id && styles.topicChipActive]}>
                <Text style={[styles.topicChipText, topicId === t.id && { color: '#fff' }]}># {t.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable onPress={pickImage} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="image-outline" size={24} color={colors.textDim} />
              <Text style={{ color: colors.textDim, fontSize: 13 }}>Fotoğraf</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Pressable onPress={onClose}>
                <Text style={{ color: colors.textDim }}>Vazgeç</Text>
              </Pressable>
              <GradientButton small title="Paylaş" onPress={submit} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommentsSheet({
  visible,
  comments,
  me,
  onClose,
  onSend,
}: {
  visible: boolean;
  comments: MomentComment[];
  me: User;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: '70%' }]}>
          <Text style={styles.sheetTitle}>Yorumlar ({comments.length})</Text>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
            {comments.length === 0 && <Text style={{ color: colors.textDim, textAlign: 'center', paddingVertical: 20 }}>İlk yorumu sen yap 💬</Text>}
            {comments.map((c) => {
              const u = c.userId === 'me' ? me : userById(c.userId);
              return (
                <Pressable
                  key={c.id}
                  style={styles.comment}
                  onPress={() => {
                    if (c.userId === 'me') return;
                    onClose();
                    router.push(`/kullanici/${u.id}`);
                  }}
                >
                  <Image source={{ uri: u.avatar }} style={styles.commentAvatar} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.textDim, fontSize: 12, fontWeight: '700' }}>
                      {u.name} · <Text style={{ fontWeight: '400' }}>{c.time}</Text>
                    </Text>
                    <Text style={{ color: '#fff', fontSize: 14 }}>{c.text}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.commentInputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Yorum yaz…"
              placeholderTextColor={colors.textDim}
              style={styles.commentInput}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable onPress={send} hitSlop={8} style={styles.sendBtn}>
              <Ionicons name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  tab: { color: colors.textDim, fontSize: 17, fontWeight: '600' },
  tabActive: { color: '#fff', fontSize: 20, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: colors.pink, marginTop: 4, width: 20 },
  badge: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  topics: { gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  topic: { width: 168, height: 66, borderRadius: 14, padding: 10, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  topicActive: { borderColor: '#fff' },
  topicTitle: { color: '#fff', fontWeight: '800', fontSize: 14, maxWidth: 130 },
  topicViews: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  topicEmoji: { position: 'absolute', right: 8, bottom: 4, fontSize: 28, opacity: 0.85 },
  topicFilter: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  empty: { alignItems: 'center', gap: 10, padding: 32 },
  emptyBtn: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  card: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  svipTag: { position: 'absolute', bottom: -6, left: 5, right: 5, alignItems: 'center', borderRadius: 6, paddingVertical: 1 },
  svipText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15, maxWidth: 150 },
  genderChip: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  meta: { color: colors.textDim, fontSize: 12 },
  hiBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(236,72,153,0.5)' },
  hiText: { color: colors.pink, fontWeight: '900', fontStyle: 'italic', fontSize: 14 },
  body: { paddingLeft: 60, gap: 10 },
  text: { color: '#fff', fontSize: 15, lineHeight: 21 },
  image: { width: '78%', aspectRatio: 0.78, borderRadius: 12, backgroundColor: colors.card },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.card, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  composeInput: { color: '#fff', minHeight: 90, fontSize: 16, textAlignVertical: 'top' },
  preview: { width: 110, height: 110, borderRadius: 12, backgroundColor: colors.cardAlt },
  removeImage: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 3 },
  topicChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'transparent' },
  topicChipActive: { borderColor: colors.pink, backgroundColor: 'rgba(236,72,153,0.2)' },
  topicChipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  comment: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 999, paddingLeft: 14, paddingRight: 4, paddingVertical: 4 },
  commentInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 8 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
});
