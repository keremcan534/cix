import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, Share, View, type AlertButton } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Art } from '@/components/Art';
import { ContactNote } from '@/components/contact-note';
import { useReport } from '@/components/report-sheet';
import { FramedAvatar, GradientButton, StateIcon, VerifiedBadge } from '@/components/ui';
import { ProfileGiftSheet } from '@/components/profile-gift-sheet';
import { GIFTS, MOMENTS, userById, type Gift, type Moment, type User } from '@/data/mock';
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
import { newRef } from '@/lib/api';
import { contactRefusal } from '@/lib/contact-filter';
import { liveGift, liveMode, message, toLocal } from '@/lib/live';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import * as live from '@/lib/live/moments';
import { cityDistanceText } from '@/lib/live/distances';
import type { PickedImage } from '@/lib/live/profile';
import { useGreet } from '@/components/use-greet';
import { useApp } from '@/store';
import { SCRIM, makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';
import { BrandLoader } from '@/components/fx/brand-loader';
import { PostSkeleton, Skeletons } from '@/components/fx/skeleton';

const TABS = ['Arkadaşlar', 'Önerilen', 'Son'] as const;
type Tab = (typeof TABS)[number];
type FeedMoment = Moment & { topicId?: string };

const INITIAL: FeedMoment[] = [...EXTRA_MOMENTS, ...MOMENTS].map((m) => ({ ...m, topicId: MOMENT_TOPIC_OF[m.id] }));

// Privileged name colors are drawn for the night background; on light paper each takes a deeper shade of its hue.
const LIGHT_NAME_COLOR: Record<string, string> = { '#FBBF24': '#9A6408', '#FF8A97': '#C8304A', '#FB923C': '#C2410C', '#A5F3F5': '#00757B' };

// A live build shows the server's Anlar (lib/live/moments): real posts, likes, comments and reports. The prototype
// keeps its sample feed, which never leaves this phone.
export default function MomentsScreen() {
  return liveMode() ? <LiveMoments /> : <DemoMoments />;
}

function DemoMoments() {
  const { bump, blocked, following, me, settings, vipLevel, equipped } = useApp();
  const [tab, setTab] = useState<Tab>('Önerilen');
  const [topic, setTopic] = useState<string | null>(null);
  const [moments, setMoments] = useState<FeedMoment[]>(INITIAL);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, MomentComment[]>>(SEED_COMMENTS);
  const { hasGreeted, greet } = useGreet();
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const gift = useMomentGift();
  const { colors } = useTheme();
  const styles = useStyles();

  let feed = moments.filter((m) => !blocked.has(m.userId));
  if (tab === 'Arkadaşlar') feed = feed.filter((m) => m.userId === 'me' || following.has(m.userId));
  if (topic) feed = feed.filter((m) => m.topicId === topic);
  if (tab === 'Son') feed = [...feed].sort((a, b) => agoMinutes(a.time) - agoMinutes(b.time));

  const authorOf = (m: Moment): User => (m.userId === 'me' ? me : userById(m.userId));

  const post = (text: string, image: PickedImage | undefined, topicId: string | undefined) => {
    setMoments((m) => [{ id: String(Date.now()), userId: 'me', text, image: image?.uri, likes: 0, comments: 0, time: 'şimdi', topicId }, ...m]);
    setComposing(false);
    bump('moments');
  };

  const share = (m: Moment) => shareMoment(authorOf(m).name, m.text);

  const commentCount = (m: Moment) => m.comments + (comments[m.id]?.length ?? 0) - (SEED_COMMENTS[m.id]?.length ?? 0);
  const openMoment = moments.find((m) => m.id === commentsFor);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FeedHeader tab={tab} onTab={setTab} />

      <FlatList
        data={feed}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <ComposeBar me={me} onPress={() => setComposing(true)} />
            <TopicStrip topic={topic} onTopic={setTopic} />
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <StateIcon name={tab === 'Arkadaşlar' ? 'people-outline' : 'moon-outline'} />
            <Text style={{ color: colors.textDim, textAlign: 'center' }}>
              {tab === 'Arkadaşlar' ? 'Takip ettiklerinin anları burada görünür.' : 'Bu konuda henüz an yok. İlk paylaşan sen ol!'}
            </Text>
            {tab === 'Arkadaşlar' && (
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
              likeCount={item.likes + (liked.has(item.id) ? 1 : 0)}
              timeLabel={agoLabel(item.time)}
              commentCount={commentCount(item)}
              greeted={hasGreeted(author.id)}
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
              onGift={() => gift.open(author)}
            />
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setComposing(true)} accessibilityRole="button" accessibilityLabel="Yeni an paylaş">
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Paylaş</Text>
      </Pressable>

      <Composer visible={composing} onClose={() => setComposing(false)} onPost={post} />
      {gift.sheet}
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

const FEED_TAB: Record<Tab, live.FeedTab> = { Arkadaşlar: 'friends', Önerilen: 'popular', Son: 'recent' };
/** The server's page size (moments.mjs): a full page means older posts may follow. */
const PAGE = 50;

const toSheet = (c: live.LiveComment): MomentComment => ({ id: c.id, userId: toLocal(c.author.id), text: c.text, time: live.agoText(c.createdAt), likes: c.likes, liked: c.liked });

/** Why the Paylaş button doesn't open the composer below Yankı Lv.5 (the server counts the points). */
function charmGate(p: live.Posting) {
  showAlert(
    `Yankı Lv.${p.needLevel} gerekli`,
    `Anlar'da paylaşım Yankı Lv.${p.needLevel} ve üstü için. Yankı puanın: ${p.points.toLocaleString('tr-TR')} / ${p.need.toLocaleString('tr-TR')}. Hediye aldıkça Yankı'n yükselir. Bu sırada anları beğenip yorum yapabilirsin.`,
    [
      { text: 'Tamam', style: 'cancel' },
      { text: 'Yankı seviyem', onPress: () => router.push('/seviye?tab=charm') },
    ],
  );
}

// The server's Anlar. A post or comment shows once the server has taken it (and stays in the composer if it
// didn't); a like shows at once and goes back if the server refuses it.
function LiveMoments() {
  const { bump, blocked, me, settings, toggleBlock } = useApp();
  const [tab, setTab] = useState<Tab>('Önerilen');
  const [topic, setTopic] = useState<string | null>(null);
  const [items, setItems] = useState<live.LiveMoment[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [composing, setComposing] = useState(false);
  const [menuFor, setMenuFor] = useState<live.LiveMoment | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [thread, setThread] = useState<live.LiveComment[] | null>(null);
  // Whether I may post (Yankı Lv.5 or staff), from the latest feed; null until the server says.
  const [posting, setPosting] = useState<live.Posting | null>(null);
  const { hasGreeted, greet } = useGreet();
  const report = useReport();
  const gift = useMomentGift();
  const { colors } = useTheme();
  const styles = useStyles();
  // Only the newest load fills the list (a tab tapped while a slower one is still on its way).
  const loadId = useRef(0);
  const paging = useRef(false);
  const openFor = useRef<string | null>(null);
  // A post or comment sent again after a failure keeps its request id, so the server stores it once.
  const postRef = useRef<string | null>(null);
  const commentRef = useRef<string | null>(null);

  // `nonce` loads the same tab again (pull to refresh, Tekrar dene); `pulled` makes a failed refresh say so,
  // since the list keeps what it had.
  const [nonce, setNonce] = useState(0);
  const pulled = useRef(false);
  useEffect(() => {
    const id = ++loadId.current;
    live
      .feedPage({ tab: FEED_TAB[tab], topic })
      .then(
        ({ moments: page, posting: may }) => {
          if (id !== loadId.current) return;
          setItems(page);
          if (may) setPosting(may);
          setFailed(null);
          setHasMore(tab !== 'Önerilen' && page.length >= PAGE);
        },
        (e) => {
          if (id !== loadId.current) return;
          setFailed(message(e));
          if (pulled.current) showAlert('Yenilenemedi', 'Bağlantını kontrol edip tekrar dene.');
        },
      )
      .finally(() => {
        if (id !== loadId.current) return;
        pulled.current = false;
        setRefreshing(false);
      });
  }, [tab, topic, nonce]);

  const pickTab = (t: Tab) => {
    if (t === tab) return;
    setTab(t);
    setItems(null);
    setFailed(null);
  };
  const pickTopic = (t: string | null) => {
    setTopic(t);
    setItems(null);
    setFailed(null);
  };
  const refresh = () => {
    pulled.current = true;
    setRefreshing(true);
    setNonce((n) => n + 1);
  };
  const retry = () => {
    setFailed(null);
    setNonce((n) => n + 1);
  };

  const loadMore = async () => {
    const last = items?.[items.length - 1];
    if (!hasMore || !last || paging.current) return;
    paging.current = true;
    const id = loadId.current;
    try {
      const page = await live.feed({ tab: FEED_TAB[tab], topic, before: last.id });
      if (id !== loadId.current) return;
      setItems((cur) => [...(cur ?? []), ...page.filter((m) => !cur?.some((c) => c.id === m.id))]);
      setHasMore(page.length >= PAGE);
    } catch {
      // The next scroll to the end tries again.
    } finally {
      paging.current = false;
    }
  };

  const patch = (id: string, f: (m: live.LiveMoment) => live.LiveMoment) => setItems((cur) => cur && cur.map((m) => (m.id === id ? f(m) : m)));

  const like = (m: live.LiveMoment) => {
    const on = !m.liked;
    const step = (x: live.LiveMoment, up: boolean) => ({ ...x, liked: up, likes: Math.max(0, x.likes + (up ? 1 : -1)) });
    patch(m.id, (x) => step(x, on));
    live.like(m.id, on).then(
      (r) => patch(m.id, (x) => ({ ...x, liked: r.liked, likes: r.likes })),
      (e) => {
        patch(m.id, (x) => (x.liked === on ? step(x, !on) : x));
        showAlert(on ? 'Beğenilemedi' : 'Beğeni geri alınamadı', message(e));
      },
    );
  };

  const post = async (text: string, image: PickedImage | undefined, topicId: string | undefined) => {
    postRef.current ??= newRef();
    try {
      const m = await live.post(text, image ?? null, topicId ?? null, postRef.current);
      postRef.current = null;
      setComposing(false);
      bump('moments');
      if (!topic || m.topic === topic) setItems((cur) => [m, ...(cur ?? []).filter((x) => x.id !== m.id)]);
      return true;
    } catch (e) {
      const gate = live.postingRefusal(e);
      if (gate) {
        setPosting(gate);
        setComposing(false);
        charmGate(gate);
      } else showAlert(image ? 'An paylaşılamadı' : 'Paylaşılamadı', message(e));
      return false;
    }
  };
  const startPost = () => (posting && !posting.allowed ? charmGate(posting) : setComposing(true));

  const removePost = (m: live.LiveMoment) =>
    showAlert('An silinsin mi?', 'Bu an ve yorumları herkesten kaldırılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          live.remove(m.id).then(
            () => setItems((cur) => cur && cur.filter((x) => x.id !== m.id)),
            (e) => showAlert('Silinemedi', message(e)),
          ),
      },
    ]);

  const block = (localId: string, name: string) =>
    showAlert(`${name} engellensin mi?`, 'Anlarını ve yorumlarını görmezsin, sana mesaj gönderemez. Engeli istediğin zaman kaldırabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => toggleBlock(localId) },
    ]);

  const menuOptions = (m: live.LiveMoment): SheetOption[] => {
    const localId = toLocal(m.author.id);
    if (localId === 'me') return [{ label: 'Anı sil', destructive: true, icon: 'trash-outline', onPress: () => removePost(m) }];
    return [
      { label: 'Şikâyet et', icon: 'flag-outline', onPress: () => report.start({ type: 'moment', id: m.id, name: m.author.name, onBlock: () => toggleBlock(localId) }, () => {}) },
      { label: `${m.author.name} kişisini engelle`, destructive: true, icon: 'ban-outline', onPress: () => block(localId, m.author.name) },
    ];
  };

  const openComments = (m: live.LiveMoment) => {
    openFor.current = m.id;
    commentRef.current = null;
    setCommentsFor(m.id);
    setThread(null);
    live.comments(m.id).then(
      (list) => openFor.current === m.id && setThread(list),
      (e) => {
        if (openFor.current !== m.id) return;
        setThread([]);
        showAlert('Yorumlar açılamadı', message(e));
      },
    );
  };
  const closeComments = () => {
    openFor.current = null;
    setCommentsFor(null);
  };

  const sendComment = async (text: string) => {
    const id = commentsFor;
    if (!id) return false;
    commentRef.current ??= newRef();
    try {
      const list = await live.comment(id, text, commentRef.current);
      commentRef.current = null;
      if (openFor.current === id) setThread(list);
      patch(id, (x) => ({ ...x, comments: list.length }));
      return true;
    } catch (e) {
      showAlert('Yorum gönderilemedi', message(e));
      return false;
    }
  };

  const openMoment = items?.find((m) => m.id === commentsFor);
  // My comments, and every comment under my post (the server also lets staff remove them).
  const canDelete = (c: MomentComment) => c.userId === 'me' || (!!openMoment && toLocal(openMoment.author.id) === 'me');
  const removeComment = (c: MomentComment) => {
    const postId = commentsFor;
    if (!postId) return;
    live.removeComment(c.id).then(
      () => {
        setThread((cur) => cur && cur.filter((x) => x.id !== c.id));
        patch(postId, (x) => ({ ...x, comments: Math.max(0, x.comments - 1) }));
      },
      (e) => showAlert('Silinemedi', message(e)),
    );
  };
  const deleteComment = (c: MomentComment) =>
    showAlert('Yorum silinsin mi?', c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => removeComment(c) },
    ]);
  // A like shows at once and goes back if the server refuses it.
  const likeComment = (c: MomentComment) => {
    const on = !c.liked;
    const step = (x: live.LiveComment, up: boolean) => ({ ...x, liked: up, likes: Math.max(0, x.likes + (up ? 1 : -1)) });
    const patchComment = (f: (x: live.LiveComment) => live.LiveComment) => setThread((cur) => cur && cur.map((x) => (x.id === c.id ? f(x) : x)));
    patchComment((x) => step(x, on));
    live.likeComment(c.id, on).then(
      (r) => patchComment((x) => ({ ...x, liked: r.liked, likes: r.likes })),
      (e) => {
        patchComment((x) => (x.liked === on ? step(x, !on) : x));
        showAlert(on ? 'Beğenilemedi' : 'Beğeni geri alınamadı', message(e));
      },
    );
  };
  const commentMenu = (c: MomentComment) => {
    const lc = thread?.find((x) => x.id === c.id);
    if (!lc || !commentsFor) return;
    const mine = c.userId === 'me';
    const buttons: AlertButton[] = [{ text: 'Vazgeç', style: 'cancel' }];
    if (canDelete(c)) buttons.push({ text: 'Sil', style: 'destructive', onPress: () => removeComment(c) });
    if (!mine)
      buttons.push({
        text: 'Şikâyet et',
        onPress: () => {
          // One sheet at a time: the comments close, the reasons open.
          closeComments();
          report.start({ type: 'comment', id: c.id, name: lc.author.name, note: c.text, onBlock: () => toggleBlock(c.userId) }, () => {});
        },
      });
    showAlert('Yorum', c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text, buttons);
  };

  const shown = (items ?? []).filter((m) => !blocked.has(toLocal(m.author.id)));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FeedHeader tab={tab} onTab={pickTab} />

      <FlatList
        data={shown}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <ComposeBar me={me} onPress={startPost} lockedBelow={posting && !posting.allowed ? posting.needLevel : undefined} />
            <TopicStrip topic={topic} onTopic={pickTopic} showViews={false} />
          </>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={hasMore && shown.length > 0 ? <BrandLoader size={20} /> : undefined}
        ListEmptyComponent={
          items === null && !failed ? (
            <Skeletons count={2} gap={24} style={{ paddingTop: 8 }}>
              <PostSkeleton />
            </Skeletons>
          ) : failed ? (
            <View style={styles.empty}>
              <StateIcon name="cloud-offline-outline" />
              <Text style={{ color: colors.textDim, textAlign: 'center' }}>Anlar yüklenemedi. {failed}</Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={retry}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Tekrar dene</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <StateIcon name={tab === 'Arkadaşlar' ? 'people-outline' : 'moon-outline'} />
              <Text style={{ color: colors.textDim, textAlign: 'center' }}>
                {tab === 'Arkadaşlar' ? 'Takip ettiklerinin anları burada görünür.' : topic ? 'Bu konuda henüz an yok. İlk paylaşan sen ol!' : 'Henüz an yok. İlk paylaşan sen ol!'}
              </Text>
              {tab === 'Arkadaşlar' && (
                <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/kesfet')}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Yeni insanlar keşfet</Text>
                </Pressable>
              )}
            </View>
          )
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const localId = toLocal(item.author.id);
          const isMe = localId === 'me';
          const author = isMe ? me : userById(localId);
          return (
            <MomentCard
              moment={{ id: item.id, userId: localId, text: item.text, image: item.imageUrl ?? undefined, likes: item.likes, comments: item.comments, time: '' }}
              author={author}
              isMe={isMe}
              svip={item.author.vipLevel}
              frameId={item.author.frame ?? undefined}
              showDistance={settings.cityDiscovery}
              distanceText={cityDistanceText(item.author.distance)}
              liked={item.liked}
              likeCount={item.likes}
              timeLabel={live.agoText(item.createdAt)}
              commentCount={item.comments}
              greeted={hasGreeted(author.id)}
              onLike={() => like(item)}
              onComment={() => openComments(item)}
              onShare={() => shareMoment(author.name, item.text)}
              onGreet={() => greet(author)}
              onGift={() => gift.open(author)}
              onMore={() => setMenuFor(item)}
            />
          );
        }}
      />

      <Pressable style={styles.fab} onPress={startPost} accessibilityRole="button" accessibilityLabel="Yeni an paylaş">
        <Ionicons name={posting && !posting.allowed ? 'lock-closed' : 'add'} size={posting && !posting.allowed ? 18 : 22} color="#fff" />
        <Text style={styles.fabText}>Paylaş</Text>
      </Pressable>

      <Composer visible={composing} onClose={() => setComposing(false)} onPost={post} />
      {gift.sheet}
      <CommentsSheet
        visible={!!commentsFor}
        loading={thread === null}
        comments={(thread ?? []).map(toSheet).filter((c) => !blocked.has(c.userId))}
        me={me}
        onClose={closeComments}
        onSend={sendComment}
        onLongPress={commentMenu}
        onLike={likeComment}
        canDelete={canDelete}
        onDelete={deleteComment}
      />
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} options={menuFor ? menuOptions(menuFor) : []} />
      {report.sheet}
    </SafeAreaView>
  );
}

/** Arkadaşlar · Önerilen · Son, and the bell. */
function FeedHeader({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { notifications } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <View style={styles.header}>
      {TABS.map((t) => (
        <Pressable key={t} onPress={() => onTab(t)} style={{ alignItems: 'center' }}>
          <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
          {t === tab && <View style={styles.underline} />}
        </Pressable>
      ))}
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/bildirimler')} hitSlop={10}>
        <Ionicons name="notifications-outline" size={25} color={colors.text} />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** The row above the feed that says where a post starts (the Paylaş button does the same). */
/** `lockedBelow`: posting opens at this Yankı level (the server said I'm below it). */
function ComposeBar({ me, onPress, lockedBelow }: { me: User; onPress: () => void; lockedBelow?: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={styles.composeBar} onPress={onPress} accessibilityRole="button" accessibilityLabel={lockedBelow ? `Paylaşım Yankı Lv.${lockedBelow} ile açılır` : 'Yeni an paylaş'}>
      <FramedAvatar uri={me.avatar} size={38} />
      <Text style={styles.composeHint} numberOfLines={1}>
        {lockedBelow ? `Paylaşım Yankı Lv.${lockedBelow} ile açılır` : 'Bugün neler oluyor? Bir an paylaş…'}
      </Text>
      <Ionicons name={lockedBelow ? 'lock-closed-outline' : 'image-outline'} size={22} color={colors.primaryText} />
    </Pressable>
  );
}

/**
 * A gift to a post's writer, from the post (no confirmation, as every gift). Live mode: the server takes the coins at
 * its price and pays the writer (POST /api/gifts/send, no room); the prototype spends on this phone.
 */
function useMomentGift() {
  const { coins, svipLevel, spendCoins, spendBlock, recordGift, bump } = useApp();
  const gifts = visibleGifts(GIFTS, useLiveCatalog());
  const [to, setTo] = useState<User | null>(null);
  const toWallet = { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') };
  const send = async (g: Gift): Promise<boolean> => {
    if (!to) return false;
    if ((g.minSvip ?? 0) > svipLevel) {
      showAlert('Üyelere özel hediye', `${g.name}, VIP ${g.minSvip} ve üstü için. Senin seviyen: VIP ${svipLevel}.`);
      return false;
    }
    if (liveMode()) {
      const limited = spendBlock(g.price);
      if (limited && limited !== 'Yetersiz bakiye.') {
        showAlert('Hediye gönderilemedi', limited);
        return false;
      }
      try {
        await liveGift(to.id, g.id, 1, undefined, 'moment');
      } catch (e) {
        showAlert('Hediye gönderilemedi', message(e), [{ text: 'Tamam', style: 'cancel' }, toWallet]);
        return false;
      }
    } else if (!spendCoins(g.price, `Hediye: ${g.name} → ${to.name}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [{ text: 'Vazgeç', style: 'cancel' }, toWallet]);
      return false;
    }
    recordGift(to.id, g.id, 1);
    bump('giftsSent', 1);
    return true;
  };
  const sheet = to ? <ProfileGiftSheet visible name={to.name} gifts={gifts} coins={coins} svipLevel={svipLevel} onClose={() => setTo(null)} onSend={send} /> : null;
  return { open: setTo, sheet };
}

async function shareMoment(name: string, text: string) {
  try {
    await Share.share({ message: `${name} bir an paylaştı: “${text}” · Similar Club` });
  } catch {
    showAlert('Paylaşılamadı', 'Bu cihazda paylaşım desteklenmiyor.');
  }
}

function Separator() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />;
}

/** The topic cards above the feed; tapping one filters by it, tapping it again shows all. The view counts are the
 * prototype's sample figures, so a live build leaves them out. */
function TopicStrip({ topic, onTopic, showViews = true }: { topic: string | null; onTopic: (t: string | null) => void; showViews?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics}>
        {MOMENT_TOPICS.map((t) => (
          <Pressable key={t.id} onPress={() => onTopic(topic === t.id ? null : t.id)}>
            <LinearGradient
              colors={t.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.topic, topic === t.id && styles.topicActive, topic && topic !== t.id && { opacity: 0.55 }]}
            >
              <Text style={styles.topicTitle} numberOfLines={1}>
                # {t.title}
              </Text>
              {showViews && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.topicViews}>{t.views}</Text>
                </View>
              )}
              <Text style={styles.topicEmoji}>{t.emoji}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
      {topic && (
        <View style={styles.topicFilter}>
          <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}># {MOMENT_TOPICS.find((t) => t.id === topic)?.title}</Text>
          <Pressable onPress={() => onTopic(null)} hitSlop={8}>
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 12 }}>Tümünü göster</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MomentCard({
  moment,
  author,
  isMe,
  svip,
  frameId,
  showDistance,
  distanceText,
  liked,
  likeCount,
  timeLabel,
  commentCount,
  greeted,
  onLike,
  onComment,
  onShare,
  onGreet,
  onGift,
  onMore,
}: {
  moment: Moment;
  author: User;
  isMe: boolean;
  svip: number;
  frameId?: string;
  showDistance: boolean;
  /** A live build's distance by city ("Aynı şehir", "350 km"; null: none to show); the demo's sample one without it. */
  distanceText?: string | null;
  liked: boolean;
  likeCount: number;
  timeLabel: string;
  commentCount: number;
  greeted: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onGreet: () => void;
  /** A gift to the writer (not on my own posts). */
  onGift?: () => void;
  /** The post's menu (delete my own, report someone else's). */
  onMore?: () => void;
}) {
  const { colors, dark, semantic } = useTheme();
  const styles = useStyles();
  const female = author.gender === 'Kadın';
  const nameColor = NAME_COLORS[author.id] ? (dark ? NAME_COLORS[author.id] : (LIGHT_NAME_COLOR[NAME_COLORS[author.id]] ?? NAME_COLORS[author.id])) : null;
  const meta = [timeLabel, !isMe && showDistance ? (distanceText !== undefined ? distanceText : distanceLabel(author.distanceKm)) : null].filter(Boolean).join('  |  ');
  const openProfile = () => (isMe ? router.push('/(tabs)/profil') : router.push(`/kullanici/${author.id}`));

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable onPress={openProfile}>
          <FramedAvatar uri={author.avatar} size={50} vipLevel={svip} frameId={frameId} online={!svip && author.online} />
          {svip > 0 && (
            <LinearGradient colors={['#F0468E', '#FF6576']} style={styles.svipTag}>
              <Text style={styles.svipText}>VIP {svip}</Text>
            </LinearGradient>
          )}
        </Pressable>
        <Pressable style={{ flex: 1, gap: 3 }} onPress={openProfile}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, nameColor ? { color: nameColor } : null]} numberOfLines={1}>
              {author.name}
            </Text>
            {author.gender && (
              <View style={[styles.genderChip, { backgroundColor: female ? 'rgba(255,101,118,0.18)' : 'rgba(56,189,248,0.18)' }]}>
                <Art name={female ? 'cinsiyet-kadin' : 'cinsiyet-erkek'} size={14} />
                <Text style={{ color: female ? colors.pink : dark ? '#38BDF8' : '#0369A1', fontSize: 12, fontWeight: '700' }}>{author.age}</Text>
              </View>
            )}
            {author.verified && <VerifiedBadge size={15} />}
          </View>
          <Text style={styles.meta}>{meta}</Text>
        </Pressable>
        {!isMe && (
          <Pressable
            onPress={onGreet}
            hitSlop={6}
            style={[styles.hiBtn, greeted && styles.hiBtnDone]}
            accessibilityRole="button"
            accessibilityLabel={greeted ? `${author.name} ile sohbet` : `${author.name} kişisine selam ver`}
          >
            <Ionicons name={greeted ? 'chatbubble-ellipses' : 'hand-left'} size={13} color={greeted ? colors.text : colors.pink} />
            <Text style={[styles.hiText, greeted && { color: colors.text }]}>{greeted ? 'Sohbet' : 'Selam'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.text}>{moment.text}</Text>
        {moment.image && <Image source={{ uri: moment.image }} style={styles.image} />}
        <View style={styles.actions}>
          <Pressable onPress={onShare} hitSlop={8} accessibilityLabel="Paylaş">
            <Ionicons name="arrow-redo-outline" size={22} color={colors.textDim} />
          </Pressable>
          {onMore && (
            <Pressable onPress={onMore} hitSlop={8} accessibilityLabel="Diğer seçenekler">
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textDim} />
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          {!isMe && onGift && (
            <Pressable style={styles.action} onPress={onGift} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${author.name} kişisine hediye gönder`}>
              <Ionicons name="gift-outline" size={20} color={semantic.moneyText} />
              <Text style={[styles.actionText, { color: semantic.moneyText }]}>Hediye</Text>
            </Pressable>
          )}
          <Pressable style={styles.action} onPress={onLike} hitSlop={8}>
            <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={21} color={liked ? colors.pink : colors.textDim} />
            <Text style={[styles.actionText, liked && { color: colors.pink }]}>{likeCount}</Text>
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

/** `onPost` may answer false (or a promise of it) when the post didn't go through: the draft then stays. */
type Sent = boolean | void | Promise<boolean | void>;

function Composer({ visible, onClose, onPost }: { visible: boolean; onClose: () => void; onPost: (text: string, image: PickedImage | undefined, topicId: string | undefined) => Sent }) {
  const [draft, setDraft] = useState('');
  // Why the text was not shared (contact details, lib/contact-filter); cleared as soon as it changes.
  const [refused, setRefused] = useState<string | null>(null);
  const edit = (next: string) => {
    setDraft(next);
    setRefused(null);
  };
  const [image, setImage] = useState<PickedImage | undefined>();
  const [topicId, setTopicId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const { colors } = useTheme();
  const styles = useStyles();
  // Android modals draw edge to edge: keep the last row above the navigation bar.
  const paddingBottom = Math.max(34, useSafeAreaInsets().bottom + 8);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const a = !res.canceled ? res.assets[0] : undefined;
    if (a) setImage({ uri: a.uri, mimeType: a.mimeType });
  };

  const submit = async () => {
    if (busy) return;
    if (!draft.trim() && !image) return showAlert('Boş an paylaşılamaz', 'Bir şeyler yaz ya da fotoğraf ekle.');
    const refusal = contactRefusal(draft.trim(), 'moment.post');
    if (refusal) return setRefused(refusal);
    setBusy(true);
    try {
      if ((await onPost(draft.trim(), image, topicId)) === false) return;
    } finally {
      setBusy(false);
    }
    setDraft('');
    setImage(undefined);
    setTopicId(undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoid style={styles.sheetWrap}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom }]}>
          <Text style={styles.sheetTitle}>Yeni an paylaş</Text>
          <TextInput
            value={draft}
            onChangeText={edit}
            placeholder="Neler oluyor?"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={1000}
            style={styles.composeInput}
            autoFocus
          />
          <ContactNote text={refused} style={styles.contactNote} />
          {image && (
            <View style={{ alignSelf: 'flex-start' }}>
              <Image source={{ uri: image.uri }} style={styles.preview} />
              <Pressable style={styles.removeImage} onPress={() => setImage(undefined)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MOMENT_TOPICS.map((t) => (
              <Pressable key={t.id} onPress={() => setTopicId((cur) => (cur === t.id ? undefined : t.id))} style={[styles.topicChip, topicId === t.id && styles.topicChipActive]}>
                <Text style={[styles.topicChipText, topicId === t.id && { color: colors.text }]}># {t.title}</Text>
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
              {busy ? <ActivityIndicator color={colors.primary} style={{ paddingHorizontal: 22 }} /> : <GradientButton small title="Paylaş" onPress={submit} />}
            </View>
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

function CommentsSheet({
  visible,
  comments,
  me,
  onClose,
  onSend,
  onLongPress,
  onLike,
  canDelete,
  onDelete,
  loading = false,
}: {
  visible: boolean;
  /** The comments are still on their way. */
  loading?: boolean;
  comments: MomentComment[];
  me: User;
  onClose: () => void;
  /** May answer false (or a promise of it) when the comment didn't go through: it then stays in the input. */
  onSend: (text: string) => Sent;
  /** A comment's menu (delete, report). */
  onLongPress?: (c: MomentComment) => void;
  /** Live only: the heart on each comment, and the bin on those I may remove. */
  onLike?: (c: MomentComment) => void;
  canDelete?: (c: MomentComment) => boolean;
  onDelete?: (c: MomentComment) => void;
}) {
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  const edit = (next: string) => {
    setDraft(next);
    setRefused(null);
  };
  const { colors } = useTheme();
  const styles = useStyles();
  const paddingBottom = Math.max(34, useSafeAreaInsets().bottom + 8);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    // Contact details are refused, not masked: the comment stays in the input.
    const refusal = contactRefusal(text, 'moment.comment');
    if (refusal) return setRefused(refusal);
    setBusy(true);
    try {
      if ((await onSend(text)) === false) return;
    } finally {
      setBusy(false);
    }
    setDraft('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoid style={styles.sheetWrap}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: '70%', paddingBottom }]}>
          <Text style={styles.sheetTitle}>{loading ? 'Yorumlar' : `Yorumlar (${comments.length})`}</Text>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
            {loading && <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />}
            {!loading && comments.length === 0 && <Text style={{ color: colors.textDim, textAlign: 'center', paddingVertical: 20 }}>İlk yorumu sen yap 💬</Text>}
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
                  onLongPress={onLongPress && (() => onLongPress(c))}
                >
                  <Photo uri={u.avatar} kind="face" style={styles.commentAvatar} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.textDim, fontSize: 12, fontWeight: '700' }}>
                      {u.name} · <Text style={{ fontWeight: '400' }}>{c.time}</Text>
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{c.text}</Text>
                    {onDelete && canDelete?.(c) && (
                      <Pressable onPress={() => onDelete(c)} hitSlop={8} style={styles.commentDelete} accessibilityRole="button" accessibilityLabel="Yorumu sil">
                        <Ionicons name="trash-outline" size={13} color={colors.textDim} />
                        <Text style={styles.commentDeleteText}>Sil</Text>
                      </Pressable>
                    )}
                  </View>
                  {onLike && (
                    <Pressable
                      onPress={() => onLike(c)}
                      hitSlop={10}
                      style={styles.commentLike}
                      accessibilityRole="button"
                      accessibilityLabel={c.liked ? 'Yorum beğenisini geri al' : 'Yorumu beğen'}
                      accessibilityState={{ selected: !!c.liked }}
                    >
                      <Ionicons name={c.liked ? 'heart' : 'heart-outline'} size={17} color={c.liked ? colors.pink : colors.textDim} />
                      {(c.likes ?? 0) > 0 && <Text style={[styles.commentLikeText, c.liked && { color: colors.pink }]}>{c.likes}</Text>}
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <ContactNote text={refused} style={styles.contactNote} />
          <View style={styles.commentInputRow}>
            <TextInput
              value={draft}
              onChangeText={edit}
              placeholder="Yorum yaz…"
              placeholderTextColor={colors.textDim}
              maxLength={300}
              style={styles.commentInput}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable onPress={send} hitSlop={8} style={styles.sendBtn} accessibilityLabel="Gönder">
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, lift, dark, edge }) => ({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  tab: { color: colors.textDim, fontSize: 17, fontWeight: '600' },
  tabActive: { color: colors.text, fontSize: 20, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4, width: 20 },
  badge: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  topics: { gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  topic: { width: 168, height: 66, borderRadius: 14, padding: 10, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  topicActive: { borderColor: colors.text },
  topicTitle: { color: '#fff', fontWeight: '800', fontSize: 14, maxWidth: 148 },
  topicViews: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  topicEmoji: { position: 'absolute', right: 8, bottom: 4, fontSize: 28, opacity: 0.85 },
  topicFilter: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, ...lift },
  empty: { alignItems: 'center', gap: 10, padding: 32 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  card: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  svipTag: { position: 'absolute', bottom: -6, left: 5, right: 5, alignItems: 'center', borderRadius: 6, paddingVertical: 1 },
  svipText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15, maxWidth: 150 },
  genderChip: { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  meta: { color: colors.textDim, fontSize: 12 },
  hiBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,101,118,0.45)', backgroundColor: 'rgba(255,101,118,0.12)' },
  hiBtnDone: { borderColor: 'transparent', backgroundColor: colors.cardAlt },
  hiText: { color: colors.pink, fontWeight: '700', fontSize: 13 },
  body: { paddingLeft: 60, gap: 10 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  image: { width: '78%', aspectRatio: 0.78, borderRadius: 12, backgroundColor: colors.card },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  composeBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  composeHint: { flex: 1, color: colors.textDim, fontSize: 14 },
  sheetWrap: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12, paddingBottom: 34, ...edge.sheet },
  sheetTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  composeInput: { color: colors.text, minHeight: 90, fontSize: 16, textAlignVertical: 'top' },
  preview: { width: 110, height: 110, borderRadius: 12, backgroundColor: colors.cardAlt },
  removeImage: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 3 },
  topicChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'transparent' },
  topicChipActive: { borderColor: colors.primaryText, backgroundColor: dark ? 'rgba(255,95,162,0.18)' : 'rgba(208,46,120,0.11)' },
  topicChipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  comment: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt },
  commentLike: { alignItems: 'center', minWidth: 28, paddingTop: 2, gap: 1 },
  commentLikeText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  commentDelete: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingTop: 2 },
  commentDeleteText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  // The contact note sits inside the sheet's own padding.
  contactNote: { marginHorizontal: 0, marginBottom: 0 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 999, paddingLeft: 14, paddingRight: 4, paddingVertical: 4 },
  commentInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
}));
