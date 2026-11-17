// The person card in a room: tapping someone on a mic, on the balcony list or in the chat opens it from the bottom.
// The designer's card (components/person-showcase): their photo in their own shop frame, name with their Yankı level
// and the heart between us, gender and age, their mic and room role, agency and Aile, interests, the three walls
// (İlişki Duvarı, Hediye Duvarı, Koruma: each opens that part of their profile), followers, and what I can do: send a
// gift, mention them in the chat (@bahset), follow, message, open the full profile. Room staff get "Yönet" for their
// actions on them. Live mode: the follow state, the counts, the levels and the heart are the server's
// (lib/live/profile, lib/live/one-on-one), as on the profile screen; their frame is the one the room read
// (lib/live/looks).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { HeartBadge } from '@/components/heart-level';
import { heartOf, usePair } from '@/components/one-on-one-bar';
import { GenderChip } from '@/components/profile-badges';
import { ActionTiles, ClubPills, InterestRow, LevelPill, ManageRow, SHOW, WallLinks, type WallKey } from '@/components/person-showcase';
import { useSheetBottom } from '@/components/room/parts';
import { FramedAvatar, VipBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { wealthCharmOf } from '@/data/profile';
import { showAlert } from '@/lib/alert';
import { liveMode, message, toServer } from '@/lib/live';
import { lookOf } from '@/lib/live/looks';
import { followOnServer, loadPublicProfile } from '@/lib/live/profile';
import { useSheetMax } from '@/lib/sheet-space';
import { useApp } from '@/store';
import { SCRIM, edge } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** The profile tab each wall opens (the Koruma banner sits on the profile's first tab). */
const WALL_TAB: Record<WallKey, string> = { iliski: 'iliski', hediye: 'onur', koruma: 'profil' };

export type PersonCardProps = {
  uid: string;
  /** One line under the name: their mic, room role, how alike we are. */
  note?: string;
  onClose: () => void;
  onGift: (uid: string) => void;
  onMention: (uid: string) => void;
  onReport: (uid: string) => void;
  /** Room staff with actions on this person: opens them (the card closes first). */
  onManage?: () => void;
};

export function PersonCard({ uid, note, onClose, onGift, onMention, onReport, onManage }: PersonCardProps) {
  const { following, toggleFollow, takeServerSocial, blocked, equipped, vipLevel, charmLevel } = useApp();
  const u = userById(uid);
  const isMe = uid === 'me';
  const serverId = liveMode() ? toServer(uid) : null;
  // Live mode: the server's counts and Yankı level for this person (null until read; a level they hide stays null).
  const [counts, setCounts] = useState<{ id: string; followers: number; isFollowing: boolean; charm: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  // The heart between us (the demo: its sample heart), beside their name once it has a level.
  const { pair } = usePair(uid, !!serverId && !isMe);
  const heart = isMe ? null : heartOf(uid, pair);
  useEffect(() => {
    if (!serverId) return;
    let on = true;
    loadPublicProfile(serverId).then(
      (c) => on && setCounts({ id: serverId, followers: c.followers, isFollowing: c.isFollowing, charm: c.levels?.charm ?? null }),
      () => {},
    );
    return () => {
      on = false;
    };
  }, [serverId]);
  const mine = counts && counts.id === serverId ? counts : null;
  const isFollowing = mine ? mine.isFollowing : following.has(uid);
  const isBlocked = blocked.has(uid);
  const charm = isMe ? charmLevel : serverId ? (mine?.charm ?? null) : wealthCharmOf(uid).charm;
  // Their own shop frame: mine from the store, someone else's as the room read it (none until read).
  const look = !isMe && serverId ? lookOf(serverId) : undefined;
  const frameId = isMe ? equipped.frame : (look?.frame ?? undefined);
  const vip = isMe ? vipLevel : (look?.vipLevel ?? 0);
  const paddingBottom = useSheetBottom(18);
  // It stops at the room's Balkon line (lib/sheet-space): who they are scrolls, the buttons stay in sight.
  const maxHeight = useSheetMax(0.9);

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const follow = async () => {
    if (isBlocked) return showAlert('Şu an yapılamıyor', `${u.name} kişisini engelledin. Engeli kaldırmadan takip edemezsin.`);
    const on = !isFollowing;
    if (!serverId) return toggleFollow(uid);
    if (busy) return;
    setBusy(true);
    try {
      const now = await followOnServer(serverId, on);
      const next = new Set(following);
      if (now) next.add(uid);
      else next.delete(uid);
      takeServerSocial({ following: [...next] });
      setCounts((c) => (c && c.id === serverId && c.isFollowing !== now ? { ...c, isFollowing: now, followers: Math.max(0, c.followers + (now ? 1 : -1)) } : c));
    } catch (e) {
      showAlert('Takip edilemedi', message(e));
    } finally {
      setBusy(false);
    }
  };
  const openWall = (w: WallKey) => {
    onClose();
    router.push({ pathname: '/kullanici/[id]', params: { id: uid, tab: WALL_TAB[w] } });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <LinearGradient colors={['#3A1638', SHOW.panel, SHOW.bg]} style={[s.sheet, { maxHeight, paddingBottom }]}>
        <View style={s.handle} />
        <View style={s.head}>
          <View style={s.avatar}>
            <FramedAvatar uri={u.avatar} size={78} vipLevel={vip} frameId={frameId ?? undefined} artScale={1.6} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {u.name}
              </Text>
              {charm !== null && <LevelPill level={charm} />}
            </View>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <GenderChip user={u} size="md" />
              {u.vip && <VipBadge />}
              {heart && heart.level > 0 && <HeartBadge level={heart.level} />}
            </View>
            {!!note && (
              <View style={s.row}>
                <Ionicons name="leaf" size={13} color={SHOW.gold} style={{ transform: [{ scaleX: -1 }] }} />
                <Text style={s.note} numberOfLines={1}>
                  {note}
                </Text>
                <Ionicons name="leaf" size={13} color={SHOW.gold} />
              </View>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={s.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={26} color={SHOW.dim} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <ClubPills user={u} onOpen={onClose} />
          <InterestRow interests={u.interests} />
          <WallLinks onOpen={openWall} />
          {mine && (
            <Text style={s.dim}>
              <Text style={s.strong}>{fmt(mine.followers)}</Text> takipçi
            </Text>
          )}
        </ScrollView>

        <ActionTiles
          tiles={[
            { icon: 'gift', label: 'Hediye', tint: SHOW.gold, onPress: act(() => onGift(uid)) },
            { icon: 'at', label: 'Bahset', onPress: act(() => onMention(uid)) },
            { icon: isFollowing ? 'person-remove-outline' : 'person-add-outline', label: isFollowing ? 'Takiptesin' : 'Takip et', on: isFollowing, disabled: busy, onPress: () => void follow() },
            { icon: 'chatbubble-ellipses', label: 'Mesaj', onPress: act(() => router.push(`/sohbet/${uid}`)) },
          ]}
        />
        <ManageRow
          items={[
            { icon: 'person-circle-outline', label: 'Profili gör', onPress: act(() => router.push(`/kullanici/${uid}`)) },
            ...(onManage ? [{ icon: 'shield-half-outline' as const, label: 'Yönet', onPress: act(onManage) }] : []),
            { icon: 'flag-outline', label: 'Şikâyet et', onPress: act(() => onReport(uid)) },
          ]}
        />
      </LinearGradient>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 8, gap: 14, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,212,117,0.45)', ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: SHOW.text, fontSize: 22, fontWeight: '900', flexShrink: 1 },
  note: { color: SHOW.dim, fontSize: 14, flexShrink: 1 },
  close: { alignSelf: 'flex-start', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  dim: { color: SHOW.dim, fontSize: 15 },
  strong: { color: SHOW.text, fontWeight: '800' },
});
