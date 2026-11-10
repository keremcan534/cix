// Mesajlar › Similar Ekibi: everything the management sends (events, updates, rewards, rules, announcements, and
// notices for me alone), newest first, 30 a page (server/api/team.mjs). Opening it marks what it shows as seen.
// The demo shows a few sample notices.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button, Header } from '@/components/ui';
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
      <Header title="Similar Ekibi" onBack={onClose} />
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
          ListHeaderComponent={<Text style={s.intro}>Etkinlikler, güncellemeler, ödüller ve kurallar: yönetimin sana ve herkese gönderdikleri burada.</Text>}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="megaphone-outline" size={36} color={colors.textDim} />
              <Text style={s.emptyTitle}>Henüz duyuru yok</Text>
              <Text style={s.emptyText}>Yönetim bir şey paylaştığında burada görünecek.</Text>
            </View>
          }
          ListFooterComponent={busy && items.length ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space.md }} /> : undefined}
          renderItem={({ item }) => <NoticeCard n={item} href={noticeHref(item.link ?? undefined, live)} onOpen={open} />}
        />
      )}
    </SafeAreaView>
  );
}

function NoticeCard({ n, href, onOpen }: { n: TeamNotice; href: string | undefined; onOpen: (href: string) => void }) {
  const { semantic } = useTheme();
  const s = useStyles();
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.kind}>
          <Ionicons name={KIND_ICON[n.kind]} size={13} color={semantic.tonalText} />
          <Text style={s.kindText}>{TEAM_KIND_LABEL[n.kind]}</Text>
        </View>
        {n.personal && (
          <View style={[s.kind, s.mine]}>
            <Text style={[s.kindText, s.mineText]}>Sana özel</Text>
          </View>
        )}
        <Text style={s.when}>{ago(n.createdAt)}</Text>
      </View>
      {!!n.imageUrl && <Image source={{ uri: n.imageUrl }} style={s.image} resizeMode="cover" accessibilityIgnoresInvertColors />}
      <Text style={s.title}>{n.title}</Text>
      {!!n.body && <Text style={s.body}>{n.body}</Text>}
      {href && <Button title="Aç" icon="arrow-forward" small variant="tonal" style={{ alignSelf: 'flex-start' }} onPress={() => onOpen(href)} />}
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift }) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl, minHeight: 280 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  intro: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...lift },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: semantic.tonal },
  kindText: { color: semantic.tonalText, fontSize: 12, fontWeight: '800' },
  mine: { backgroundColor: semantic.action },
  mineText: { color: semantic.actionInk },
  when: { marginLeft: 'auto', color: colors.textDim, fontSize: 12 },
  image: { width: '100%', aspectRatio: 2, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
}));
