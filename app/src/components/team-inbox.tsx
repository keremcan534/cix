// Mesajlar › SimilarClub Sistem (Similar Ekibi in older apps): everything the management sends (events, updates,
// rewards, rules, announcements, and notices for me alone) and my account's own notices (earnings, rewards, warnings:
// server/api/system-notices.mjs), newest first, 30 a page (server/api/team.mjs). Opening it marks what it shows as seen.
// Nobody can write here: it has no composer, only the server's notices.
// The demo shows a few sample notices.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button, Header, VerifiedBadge } from '@/components/ui';
import { ago } from '@/lib/admin-format';
import { liveMode } from '@/lib/live';
import { TEAM_KIND_LABEL, markTeamSeen, teamPage, type TeamKind, type TeamNotice } from '@/lib/live/team';
import { noticeHref } from '@/lib/notice-links';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { BrandLoader } from '@/components/fx/brand-loader';

const PAGE = 30;
const KIND_ICON: Record<TeamKind, keyof typeof Ionicons.glyphMap> = {
  event: 'calendar',
  update: 'sparkles',
  reward: 'gift',
  rule: 'shield-checkmark',
  notice: 'megaphone',
};

/** SimilarClub Sistem's categories (server/api/auto-chat-rules.mjs NOTICE_CATEGORIES): their symbol and colour. */
const CATEGORY: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  voice_call: { icon: 'call', color: '#0EA5E9', label: 'Sesli arama' },
  video_call: { icon: 'videocam', color: '#7C3AED', label: 'Görüntülü arama' },
  call_paid: { icon: 'receipt', color: '#475569', label: 'Görüşme' },
  message_summary: { icon: 'diamond', color: '#0891B2', label: 'Mesaj kazancı' },
  message_reward: { icon: 'diamond', color: '#0891B2', label: 'Mesaj kazancı' },
  pk: { icon: 'trophy', color: '#D97706', label: 'PK' },
  rocket: { icon: 'rocket', color: '#DB2777', label: 'Roket' },
  event_reward: { icon: 'trophy', color: '#4F46E5', label: 'Etkinlik' },
  bag_gift: { icon: 'gift', color: '#D97706', label: 'Dijital hediye' },
  bonus: { icon: 'gift', color: '#16A34A', label: 'Bonus' },
  performance: { icon: 'warning', color: '#EA580C', label: 'Uyarı' },
  quota: { icon: 'notifications', color: '#64748B', label: 'Bilgi' },
  bond: { icon: 'link', color: '#DB2777', label: 'Bağlar' },
  // VIP aylık değerlendirme (server/api/vip-month.mjs).
  vip: { icon: 'diamond', color: '#B45309', label: 'VIP' },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
/** The demo's Similar Ekibi. */
export const DEMO_TEAM: TeamNotice[] = [
  { id: '4', kind: 'reward', title: 'Hoş geldin hediyen hazır', body: '200 jeton cüzdanına eklendi. Keyifli sohbetler!', imageUrl: null, link: '/cuzdan', personal: true, createdAt: hoursAgo(2) },
  { id: '3', kind: 'event', title: 'Hafta sonu PK turnuvası', body: 'Cumartesi 21:00’de Odalar’da. Haftanın ilk üç odası ödül kazanır.', imageUrl: null, link: '/siralama', personal: false, createdAt: hoursAgo(20) },
  { id: '2', kind: 'rule', title: 'Oda kuralları güncellendi', body: 'Hakaret, reklam ve kişisel bilgi paylaşımı yasaktır. Şikâyetler 24 saat içinde incelenir.', imageUrl: null, link: null, personal: false, createdAt: hoursAgo(50) },
  { id: '1', kind: 'update', title: 'Yeni: Anlar’da yorum beğenme', body: 'Artık yorumları beğenebilir, kendi yorumunu silebilirsin.', imageUrl: null, link: null, personal: false, createdAt: hoursAgo(120) },
];

/** Full screen over Mesajlar; `onUnread` gets what is still new once the shown notices are marked seen. */
export function TeamInbox({ visible, onClose, onUnread }: { visible: boolean; onClose: () => void; onUnread: (n: number) => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && <InboxBody onClose={onClose} onUnread={onUnread} />}
    </Modal>
  );
}

function InboxBody({ onClose, onUnread }: { onClose: () => void; onUnread: (n: number) => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  const live = liveMode();
  const [items, setItems] = useState<TeamNotice[] | null>(live ? null : DEMO_TEAM);
  const [failed, setFailed] = useState(false);
  const [end, setEnd] = useState(!live);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  // The parent's setter, read when an answer comes back (a new one doesn't reload the list).
  const told = useRef(onUnread);
  useEffect(() => {
    told.current = onUnread;
  });

  useEffect(() => {
    if (!live) {
      told.current(0);
      return;
    }
    let alive = true;
    teamPage()
      .then((r) => {
        if (!alive) return;
        setItems(r.notices);
        setEnd(r.notices.length < PAGE);
        setFailed(false);
        if (r.notices.length) markTeamSeen(r.notices[0].id).then((n) => told.current(n), () => {});
        else told.current(r.unread);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setRefreshing(false));
    return () => {
      alive = false;
    };
  }, [live, tick]);

  const more = () => {
    if (!live || end || busy || !items?.length) return;
    setBusy(true);
    teamPage(items[items.length - 1].id)
      .then((r) => {
        setItems((xs) => [...(xs ?? []), ...r.notices.filter((n) => !xs?.some((x) => x.id === n.id))]);
        setEnd(r.notices.length < PAGE);
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const open = (href: string) => {
    onClose();
    router.push(href as Href);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="SimilarClub Sistem"
        onBack={onClose}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Resmî SimilarClub hesabı">
            <VerifiedBadge />
          </View>
        }
      />
      {items === null ? (
        failed ? (
          <View style={s.center}>
            <Text style={s.emptyTitle}>Duyurular yüklenemedi</Text>
            <Text style={s.emptyText}>İnternetini kontrol edip tekrar dene.</Text>
            <Button title="Tekrar dene" icon="refresh" small variant="tonal" onPress={() => setTick((t) => t + 1)} />
          </View>
        ) : (
          <View style={s.center}>
            <BrandLoader size={26} />
          </View>
        )
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}
          onEndReached={more}
          onEndReachedThreshold={0.4}
          refreshControl={
            live ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  setTick((t) => t + 1);
                }}
                tintColor={colors.textDim}
              />
            ) : undefined
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="megaphone-outline" size={36} color={colors.textDim} />
              <Text style={s.emptyTitle}>Henüz duyuru yok</Text>
            </View>
          }
          ListFooterComponent={busy && items.length ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space.md }} /> : undefined}
          renderItem={({ item }) => <NoticeCard n={item} href={noticeHref(item.link ?? undefined, live)} onOpen={open} />}
        />
      )}
      {/* One-way: only the server writes here. */}
      <View style={s.closed}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textDim} />
        <Text style={s.closedText}>Bu resmî bildirim sohbetine mesaj gönderilemez.</Text>
      </View>
    </SafeAreaView>
  );
}

/** Each kind's colour (the Odalar banner's, components/room-banners): its symbol sits on it. */
const KIND_COLOR: Record<TeamKind, string> = { event: '#4F46E5', update: '#0891B2', notice: '#DB2777', reward: '#D97706', rule: '#0F766E' };

/** One notice: the kind's symbol, the title and the time on one line, the words, its picture; a tap opens its link. */
function NoticeCard({ n, href, onOpen }: { n: TeamNotice; href: string | undefined; onOpen: (href: string) => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  const cat = n.category ? CATEGORY[n.category] : undefined;
  const color = cat?.color ?? KIND_COLOR[n.kind] ?? KIND_COLOR.notice;
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && href ? { opacity: 0.85 } : null]}
      disabled={!href}
      onPress={href ? () => onOpen(href) : undefined}
      accessibilityRole={href ? 'button' : undefined}
      accessibilityLabel={`${cat?.label ?? TEAM_KIND_LABEL[n.kind] ?? 'Duyuru'}${n.personal ? ', sana özel' : ''}: ${n.title}`}
    >
      <View style={s.head}>
        <View style={[s.badge, { backgroundColor: color }]}>
          <Ionicons name={cat?.icon ?? KIND_ICON[n.kind] ?? 'megaphone'} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>
            {n.title}
          </Text>
          <Text style={s.meta}>
            {cat ? `${cat.label} · ` : n.personal ? 'Sana özel · ' : `${TEAM_KIND_LABEL[n.kind] ?? 'Duyuru'} · `}
            {ago(n.createdAt)}
          </Text>
        </View>
        {href && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
      </View>
      {!!n.body && <Text style={s.body}>{n.body}</Text>}
      {!!n.imageUrl && <Image source={{ uri: n.imageUrl }} style={s.image} resizeMode="cover" accessibilityIgnoresInvertColors />}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, lift }) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl, minHeight: 280 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, gap: space.sm, ...lift },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  image: { width: '100%', aspectRatio: 2, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  title: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  closed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  closedText: { color: colors.textDim, fontSize: 12 },
}));
