// The person card in a room: tapping someone on a mic, on the balcony list or in the chat opens it from the bottom.
// Who they are (photo, name, age, agency, Aile, followers) and what I can do: send a gift, mention them in the
// chat (@bahset), follow, message, open the full profile. Room staff get "Yönet" for their actions on them.
// Live mode: the follow state and the counts are the server's (lib/live/profile), as on the profile screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { AffiliationPills, GenderChip } from '@/components/profile-badges';
import { useSheetBottom } from '@/components/room/parts';
import { Avatar, VipBadge } from '@/components/ui';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { liveMode, message, toServer } from '@/lib/live';
import { followOnServer, loadPublicProfile } from '@/lib/live/profile';
import { useApp } from '@/store';
import { SCRIM, colors, edge } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

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
  const { following, toggleFollow, takeServerSocial, blocked } = useApp();
  const u = userById(uid);
  const serverId = liveMode() ? toServer(uid) : null;
  // Live mode: the server's counts for this person (null until read).
  const [counts, setCounts] = useState<{ id: string; followers: number; isFollowing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!serverId) return;
    let on = true;
    loadPublicProfile(serverId).then(
      (c) => on && setCounts({ id: serverId, followers: c.followers, isFollowing: c.isFollowing }),
      () => {},
    );
    return () => {
      on = false;
    };
  }, [serverId]);
  const mine = counts && counts.id === serverId ? counts : null;
  const isFollowing = mine ? mine.isFollowing : following.has(uid);
  const isBlocked = blocked.has(uid);
  const paddingBottom = useSheetBottom(18);

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

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom }]}>
        <View style={s.handle} />
        <View style={s.head}>
          <Avatar uri={u.avatar} name={u.name} size={64} ring={u.vip} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {u.name}
              </Text>
              {u.vip && <VipBadge />}
            </View>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <GenderChip user={u} />
              {!!u.username && <Text style={s.dim}>@{u.username}</Text>}
            </View>
            {!!note && (
              <Text style={s.dim} numberOfLines={1}>
                {note}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        <AffiliationPills user={u} />
        {!!u.bio && (
          <Text style={s.bio} numberOfLines={2}>
            {u.bio}
          </Text>
        )}
        {mine && (
          <Text style={s.dim}>
            <Text style={s.strong}>{fmt(mine.followers)}</Text> takipçi
          </Text>
        )}

        <View style={s.actions}>
          <Action icon="gift" label="Hediye" tint={colors.gold} onPress={act(() => onGift(uid))} />
          <Action icon="at" label="Bahset" onPress={act(() => onMention(uid))} />
          <Action icon={isFollowing ? 'person-remove-outline' : 'person-add'} label={isFollowing ? 'Takiptesin' : 'Takip et'} on={isFollowing} disabled={busy} onPress={() => void follow()} />
          <Action icon="chatbubble-ellipses" label="Mesaj" onPress={act(() => router.push(`/sohbet/${uid}`))} />
        </View>
        <View style={s.links}>
          <Link icon="person-circle-outline" label="Profili gör" onPress={act(() => router.push(`/kullanici/${uid}`))} />
          {onManage && <Link icon="shield-half-outline" label="Yönet" onPress={act(onManage)} />}
          <Link icon="flag-outline" label="Şikâyet et" onPress={act(() => onReport(uid))} />
        </View>
      </View>
    </Modal>
  );
}

function Action({ icon, label, onPress, tint, on, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tint?: string; on?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={[s.action, on && s.actionOn, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={tint ?? colors.text} />
      <Text style={s.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Link({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={s.link} onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={colors.textDim} />
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 12, ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  dim: { color: colors.textDim, fontSize: 13 },
  strong: { color: colors.text, fontWeight: '800' },
  bio: { color: colors.text, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  actionOn: { borderColor: colors.primary },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  links: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 8 },
  linkText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
});
