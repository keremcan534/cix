// The person card in a room: tapping someone on a mic, on the balcony list or in the chat opens it from the bottom,
// a card of its own, drawn with the designer's picture set (components/person-card-art, person-showcase): their photo
// in their own shop frame, name with their Yankı level
// and the heart between us, gender and age, their mic and room role, agency and Aile, interests, the three walls
// (İlişki Duvarı, Hediye Duvarı, Koruma: each opens that part of their profile), followers, and what I can do: send a
// gift, mention them in the chat (@bahset), follow, message, open the full profile. Room staff get "Yönet" for their
// actions on them. Live mode: the follow state, the counts, the levels and the heart are the server's
// (lib/live/profile, lib/live/one-on-one), as on the profile screen; their frame is the one the room read
// (lib/live/looks).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/text';
import { HeartBadge } from '@/components/heart-level';
import { heartOf, usePair } from '@/components/one-on-one-bar';
import { GenderChip } from '@/components/profile-badges';
import { CardArt, CardPanel } from '@/components/person-card-art';
import { ActionTiles, ClubPills, InterestRow, LevelPill, ManageRow, SHOW, WallLinks, type WallKey } from '@/components/person-showcase';
import { useSheetBottom } from '@/components/room/parts';
import { FramedAvatar, VipBadge } from '@/components/ui';
import { userById, type User } from '@/data/mock';
import { wealthCharmOf } from '@/data/profile';
import { showAlert } from '@/lib/alert';
import { liveMode, message, toServer } from '@/lib/live';
import { lookOf } from '@/lib/live/looks';
import { followOnServer, loadPublicProfile } from '@/lib/live/profile';
import { useSheetMax } from '@/lib/sheet-space';
import { useApp } from '@/store';
import { SCRIM } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** The profile tab each wall opens (the Koruma banner sits on the profile's first tab). */
const WALL_TAB: Record<WallKey, string> = { iliski: 'iliski', hediye: 'onur', koruma: 'profil' };

/** A woman's age on the set's pink pill; every other case is the app's usual chip. */
function AgePill({ user }: { user: User }) {
  if (user.gender !== 'Kadın' || user.showGender === false || !(user.age > 0)) return <GenderChip user={user} size="md" />;
  return (
    <View style={s.age} accessibilityLabel={`${user.gender}, ${user.age} yaş`}>
      <View style={StyleSheet.absoluteFill}>
        <CardArt name="yas-rozet" h={AGE_H} />
      </View>
      <Ionicons name="female" size={13} color="#fff" />
      <Text style={s.ageText}>{user.age}</Text>
    </View>
  );
}

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
  // It stops at the room's Balkon line (lib/sheet-space): who they are scrolls, the buttons stay in sight. The card
  // floats over the navigation bar, so that padding comes off; a busy room on a short phone still leaves it 380 to
  // hold its fixed rows and a part of the list.
  const sheet = useSheetMax(0.9);
  const { height } = useWindowDimensions();
  const maxHeight = typeof sheet === 'number' ? Math.min(Math.round(height * 0.9) - paddingBottom, Math.max(sheet - paddingBottom, 380)) : sheet;

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
      <View style={[s.float, { paddingBottom }]}>
        <CardPanel style={[s.sheet, { maxHeight }]}>
          <View style={s.head}>
            <View style={s.avatar}>
              <FramedAvatar uri={u.avatar} size={78} vipLevel={vip} frameId={frameId ?? undefined} artScale={1.6} />
            </View>
            <View style={s.who}>
              <View style={[s.row, { paddingRight: 26 }]}>
                <Text style={s.name} numberOfLines={1}>
                  {u.name}
                </Text>
              </View>
              <View style={[s.row, { flexWrap: 'wrap' }]}>
                <AgePill user={u} />
                {charm !== null && <LevelPill level={charm} />}
                {u.vip && <VipBadge />}
                {heart && heart.level > 0 && <HeartBadge level={heart.level} />}
              </View>
              {!!note && (
                <View style={s.row}>
                  <CardArt name="defne-sol" h={20} />
                  <Text style={s.note} numberOfLines={2}>
                    {note}
                  </Text>
                  <CardArt name="defne-sag" h={20} />
                </View>
              )}
            </View>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
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
              { art: 'hediye', label: 'Hediye', onPress: act(() => onGift(uid)) },
              { art: 'bahset', label: 'Bahset', onPress: act(() => onMention(uid)) },
              { art: 'takip', label: isFollowing ? 'Takipte' : 'Takip et', on: isFollowing, disabled: busy, onPress: () => void follow() },
              { art: 'sohbet', label: 'Mesaj', onPress: act(() => router.push(`/sohbet/${uid}`)) },
            ]}
          />
          <ManageRow
            items={[
              { art: 'kisi', label: 'Profili gör', onPress: act(() => router.push(`/kullanici/${uid}`)) },
              ...(onManage ? [{ art: 'yonet' as const, label: 'Yönet', onPress: act(onManage) }] : []),
              { art: 'sikayet', label: 'Şikâyet et', onPress: act(() => onReport(uid)) },
            ]}
          />
          <Pressable onPress={onClose} hitSlop={6} style={s.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <CardArt name="kapat" h={14} />
          </Pressable>
        </CardPanel>
      </View>
    </Modal>
  );
}

const AGE_H = 22;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  float: { position: 'absolute', left: 8, right: 8, bottom: 0 },
  sheet: { flexShrink: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  who: { flex: 1, minWidth: 0, gap: 7, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: SHOW.text, fontSize: 21, fontWeight: '900', flexShrink: 1 },
  age: { width: AGE_H * 3, height: AGE_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  ageText: { color: '#fff', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  note: { color: SHOW.dim, fontSize: 13, flexShrink: 1 },
  close: { position: 'absolute', right: 4, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dim: { color: SHOW.dim, fontSize: 14 },
  strong: { color: SHOW.text, fontWeight: '800' },
});
