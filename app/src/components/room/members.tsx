// The room's people around the room card: the heart that follows the room (in the room header and on the card), the
// membership button with its state (member, application waiting) and the way out of it, the card's row of members
// and the full member list (Tümü / Odada / Odada değil, and Başvurular for whoever answers them).
// A server room reads the list from the server a page at a time (lib/live/room-follow, server/api/room-members.mjs);
// a sample room builds it from the sample people, so the demo shows the same screens.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtText, ROOM_ICON_ART } from '@/components/RoomArt';
import { RoleMark as StaffBadge } from '@/components/room/role-mark';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { memberLimit } from '@/data/catalog';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { errorHaptic, pressHaptic } from '@/lib/haptics';
import { message as errorText } from '@/lib/live';
import { useRoomFollow, useServerMemberList } from '@/lib/live/room-follow';
import {
  MEMBER_ROLE_LABEL,
  daysAway,
  demoLastSeen,
  filterMemberRows,
  isStaffRole,
  joinButton,
  lastSeenText,
  sortMemberRows,
  type JoinMode,
  type MemberFilter,
  type MemberRole,
  type MemberRow,
  type Membership,
} from '@/lib/room-follow';
import { SCRIM, colors, edge, semantic } from '@/theme';

/** Avatars on the card's row. */
const STRIP = 12;
const ROLE_OF_RANK: MemberRole[] = ['member', 'admin', 'super', 'owner'];

// --- Follow ------------------------------------------------------------------------------------------------------
/**
 * The heart that follows a room: outline until I follow it, filled after, with a light tap on the phone;
 * unfollowing asks once. `label`: the card's wider button with its words; without it, the bare heart of the header.
 */
export function RoomFollowHeart({ roomId, title, label = false }: { roomId: string; title: string; label?: boolean }) {
  const { following, toggle } = useRoomFollow(roomId);
  const run = () => {
    pressHaptic();
    toggle().catch((e) => {
      errorHaptic();
      showAlert(following ? 'Takip bırakılamadı' : 'Oda takip edilemedi', errorText(e));
    });
  };
  const press = () =>
    following
      ? showAlert('Takibi bırak', `"${title}" odasını takip etmeyi bırakırsan oda açıldığında haber almazsın.`, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Takibi bırak', style: 'destructive', onPress: run },
        ])
      : run();
  const heart = <Ionicons name={following ? 'heart' : 'heart-outline'} size={label ? 16 : 19} color={following ? semantic.social : '#fff'} />;
  return (
    <Pressable
      onPress={press}
      hitSlop={label ? 4 : 8}
      style={label ? [styles.followBtn, following && styles.followBtnOn] : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      accessibilityLabel={following ? 'Odayı takip ediyorsun. Takibi bırak' : 'Odayı takip et'}
    >
      {heart}
      {label && <Text style={styles.followText}>{following ? 'Takip ediyorsun' : 'Odayı takip et'}</Text>}
    </Pressable>
  );
}

/** The card's follow line: how many follow the room, and the button for everyone but its owner. */
function FollowLine({ roomId, title, owner }: { roomId: string; title: string; owner: boolean }) {
  const { state } = useRoomFollow(roomId);
  return (
    <View style={styles.followLine}>
      {owner ? <Ionicons name="heart" size={16} color={semantic.social} /> : <RoomFollowHeart roomId={roomId} title={title} label />}
      <Text style={[styles.dim, { flex: 1 }]} numberOfLines={2}>
        {state ? `${state.followers.toLocaleString('tr-TR')} takipçi` : ''}
        {owner ? ' · Odana girdiğinde takipçilerine haber gider.' : ''}
      </Text>
    </View>
  );
}

// --- The card's section ------------------------------------------------------------------------------------------
export type RoomMembersProps = {
  roomId: string;
  title: string;
  /** A server room: the full list is the server's; otherwise it is built from `members` (the demo). */
  live: boolean;
  level: number;
  /** I own the room. */
  owner: boolean;
  membership: Membership;
  joinMode: JoinMode;
  /** The room's members (local ids). A server room: as many as the card's row needs. */
  members: string[];
  memberTotal: number;
  /** Who asked to join (local ids), for whoever answers them. */
  applications: string[];
  canManage: boolean;
  autoRemoveDays: number;
  /** The room's staff, the owner first (local ids): they lead the row and the list. */
  staffIds: string[];
  /** 3 owner, 2 Süper Yönetici, 1 Yönetici, 0 anyone else. */
  rankOf: (id: string) => number;
  /** Who is in the room now (local ids): the demo's "Odada". A server room asks the server. */
  inRoomIds: string[];
  /** Changes whenever the room's members were read again (a server room): the open list follows. */
  refreshKey?: unknown;
  onJoin: () => void;
  /** Leaves the members, or takes the application back. */
  onLeave: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRemove: (id: string) => void;
  /** Before a profile opens: the room card closes. */
  onNavigate: () => void;
};

export function RoomMembersSection(p: RoomMembersProps) {
  const [open, setOpen] = useState(false);
  // Read when the list opens, so "son giriş" is counted from then.
  const [now, setNow] = useState(() => Date.now());
  const cap = memberLimit(p.level);
  // The row: the room's staff first, then its members, each once; the bubble after it counts the members it left out.
  const strip = [...new Set([...p.staffIds, ...p.members])].slice(0, STRIP);
  const extra = Math.max(0, p.memberTotal - strip.filter((id) => p.members.includes(id)).length);
  const join = joinButton(p.joinMode, p.memberTotal, cap);
  const pendingCount = p.canManage ? p.applications.length : 0;
  const show = () => {
    setNow(Date.now());
    setOpen(true);
  };
  const leave = () =>
    showAlert('Üyelikten ayrıl', `"${p.title}" odasının üyeliğinden ayrılmak istiyor musun? Yeniden üye olman gerekir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: p.onLeave },
    ]);
  const profile = (id: string) => {
    setOpen(false);
    p.onNavigate();
    router.push(`/kullanici/${id}`);
  };

  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`Oda üyeleri, ${p.memberTotal} / ${cap}. Listeyi aç`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[styles.h2, { flex: 1 }]}>
            Oda üyeleri ({p.memberTotal.toLocaleString('tr-TR')} / {cap.toLocaleString('tr-TR')})
          </Text>
          {pendingCount > 0 && (
            <View style={styles.bell}>
              <Ionicons name="notifications" size={11} color="#fff" />
              <Text style={styles.bellText}>{pendingCount}</Text>
            </View>
          )}
          <Text style={styles.all}>Tümü</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {strip.map((id) => (
            <View key={id} style={{ alignItems: 'center', width: 58 }}>
              <View>
                <Avatar uri={userById(id).avatar} name={userById(id).name} size={52} />
                <RoleMark role={ROLE_OF_RANK[p.rankOf(id)] ?? 'member'} />
              </View>
              <Text style={styles.tiny} numberOfLines={1}>
                {id === 'me' ? 'Sen' : userById(id).name}
              </Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={styles.more}>
              <Text style={styles.moreText}>+{extra > 999 ? '999' : extra}</Text>
            </View>
          )}
        </ScrollView>
      </Pressable>

      {p.membership === 'none' && (
        <View style={{ gap: 6 }}>
          <Pressable style={[styles.joinBtn, join.disabled && { opacity: 0.45 }]} onPress={p.onJoin} disabled={join.disabled} accessibilityRole="button" accessibilityLabel={join.label} accessibilityState={{ disabled: join.disabled }}>
            <ArtText art={ROOM_ICON_ART.join} size={24} style={styles.joinText}>
              {join.label}
            </ArtText>
          </Pressable>
          <Text style={[styles.dim, { textAlign: 'center' }]}>{join.hint}</Text>
        </View>
      )}
      {p.membership === 'pending' && (
        <View style={styles.state}>
          <Ionicons name="hourglass-outline" size={20} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stateTitle}>Başvurun onay bekliyor</Text>
            <Text style={styles.dim}>Oda sahibi veya yöneticiler yanıtlayınca üye olursun.</Text>
          </View>
          <Pressable style={styles.stateBtn} onPress={p.onLeave} hitSlop={6} accessibilityRole="button" accessibilityLabel="Başvuruyu geri çek">
            <Text style={styles.stateBtnText}>Geri çek</Text>
          </Pressable>
        </View>
      )}
      {p.membership === 'member' && (
        <View style={styles.state}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={[styles.stateTitle, { flex: 1 }]}>Bu odanın üyesisin</Text>
          <Pressable style={styles.stateBtn} onPress={leave} hitSlop={6} accessibilityRole="button" accessibilityLabel="Üyelikten ayrıl">
            <Text style={styles.stateBtnText}>Ayrıl</Text>
          </Pressable>
        </View>
      )}

      <FollowLine roomId={p.roomId} title={p.title} owner={p.owner} />

      <MemberListSheet {...p} visible={open} onClose={() => setOpen(false)} now={now} cap={cap} onProfile={profile} />
    </View>
  );
}

/** The mark on a staff avatar (components/room/role-mark): the owner's crown, a Süper Yönetici's star, a Yönetici's shield. */
const RoleMark = ({ role }: { role: MemberRole }) => <StaffBadge mark={role === 'owner' || role === 'super' || role === 'admin' ? role : null} />;

// --- The full list -----------------------------------------------------------------------------------------------
const FILTERS: { key: MemberFilter; label: string; empty: string }[] = [
  { key: 'all', label: 'Tümü', empty: 'Bu odanın henüz üyesi yok.' },
  { key: 'in', label: 'Odada', empty: 'Şu an odada üye yok.' },
  { key: 'out', label: 'Odada değil', empty: 'Bütün üyeler şu an odada.' },
  { key: 'pending', label: 'Başvurular', empty: 'Bekleyen başvuru yok.' },
];

function MemberListSheet(p: RoomMembersProps & { visible: boolean; onClose: () => void; now: number; cap: number; onProfile: (id: string) => void }) {
  const [filter, setFilter] = useState<MemberFilter>('all');
  const { bottom } = useSafeAreaInsets();
  const server = useServerMemberList(p.roomId, p.live && p.visible, filter, p.refreshKey);

  // The demo's rows: the room's staff and members from the sample people, who is in the room from its own model.
  const here = new Set(p.inRoomIds);
  const local: MemberRow[] = p.live
    ? []
    : sortMemberRows(
        [...new Set([...p.staffIds, ...p.members])].map((id) => ({
          id,
          name: userById(id).name,
          avatar: userById(id).avatar,
          role: ROLE_OF_RANK[p.rankOf(id)] ?? 'member',
          inRoom: here.has(id),
          lastSeen: id === 'me' ? p.now : demoLastSeen(id, p.now),
        })),
      );
  const localPending: MemberRow[] = p.live ? [] : p.applications.map((id) => ({ id, name: userById(id).name, avatar: userById(id).avatar, role: 'pending', inRoom: here.has(id), lastSeen: null }));
  const counts: Record<MemberFilter, number> | null = p.live
    ? server.counts
    : { all: local.length, in: local.filter((r) => r.inRoom).length, out: local.filter((r) => !r.inRoom).length, pending: localPending.length };
  const rows = p.live ? server.rows : filter === 'pending' ? localPending : filterMemberRows(local, filter);
  const filters = FILTERS.filter((f) => f.key !== 'pending' || p.canManage);
  // Sample rooms count more members than the sample people there are to list.
  const unlisted = !p.live && filter === 'all' ? Math.max(0, p.memberTotal - p.members.length) : 0;

  const remove = (row: MemberRow) =>
    showAlert('Üyelikten çıkar', `${row.name} oda üyeliğinden çıkarılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkar', style: 'destructive', onPress: () => p.onRemove(row.id) },
    ]);

  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={styles.backdrop} onPress={p.onClose} accessibilityLabel="Üye listesini kapat" />
      <View style={[styles.sheet, { paddingBottom: Math.max(24, bottom + 8) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.sheetTitle, { flex: 1 }]}>
            Oda üyeleri ({p.memberTotal.toLocaleString('tr-TR')} / {p.cap.toLocaleString('tr-TR')})
          </Text>
          <Pressable onPress={p.onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips} accessibilityRole="tablist">
          {filters.map((f) => {
            const on = f.key === filter;
            const n = counts?.[f.key];
            return (
              <Pressable key={f.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {f.label}
                  {n === undefined ? '' : ` ${n.toLocaleString('tr-TR')}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {server.failed ? (
          <View style={styles.empty}>
            <Text style={styles.dim}>Liste yüklenemedi. Bağlantını kontrol et.</Text>
            <Pressable style={styles.stateBtn} onPress={server.retry} accessibilityRole="button">
              <Text style={styles.stateBtnText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : rows === null ? (
          <View style={styles.empty}>
            <Text style={styles.dim}>Üyeler yükleniyor…</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled"
            onEndReached={p.live && server.hasMore ? server.more : undefined}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.dim}>{FILTERS.find((f) => f.key === filter)?.empty}</Text>
              </View>
            }
            ListFooterComponent={
              server.loadingMore ? (
                <Text style={[styles.dim, styles.footer]}>Yükleniyor…</Text>
              ) : unlisted > 0 ? (
                <Text style={[styles.dim, styles.footer]}>+{unlisted.toLocaleString('tr-TR')} üye daha</Text>
              ) : undefined
            }
            renderItem={({ item }) => (
              <MemberLine
                row={item}
                now={p.now}
                // Members only: the room's staff are taken off by the owner in Oda ayarları, never from here.
                canRemove={p.canManage && item.role === 'member' && item.id !== 'me'}
                canAnswer={p.canManage && item.role === 'pending'}
                warnDays={p.canManage && item.role === 'member' && item.id !== 'me' ? p.autoRemoveDays : 0}
                onOpen={() => p.onProfile(item.id)}
                onApprove={() => p.onApprove(item.id)}
                onReject={() => p.onReject(item.id)}
                onRemove={() => remove(item)}
              />
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function MemberLine({
  row,
  now,
  canRemove,
  canAnswer,
  warnDays,
  onOpen,
  onApprove,
  onReject,
  onRemove,
}: {
  row: MemberRow;
  now: number;
  canRemove: boolean;
  canAnswer: boolean;
  /** The room drops members who stay away this many days (0: never): a member past it is marked. */
  warnDays: number;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
}) {
  const me = row.id === 'me';
  const away = daysAway(row, now);
  const due = warnDays > 0 && away !== null && away >= warnDays;
  const seen = due ? `${away} gündür girmedi · otomatik çıkarılacak` : lastSeenText(row, now);
  const role = MEMBER_ROLE_LABEL[row.role];
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`${me ? 'Sen' : row.name}, ${role}${seen ? `, ${seen}` : ''}. Profili aç`}>
      <View>
        <Avatar uri={row.avatar} name={row.name} size={42} online={row.inRoom} />
        <RoleMark role={row.role} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {me ? 'Sen' : row.name}
        </Text>
        <Text style={styles.dim} numberOfLines={1}>
          <Text style={isStaffRole(row.role) ? styles.staff : undefined}>{role}</Text>
          {seen ? <Text style={due ? { color: colors.gold } : row.inRoom ? { color: colors.green } : undefined}>{` · ${seen}`}</Text> : null}
        </Text>
      </View>
      {canAnswer && (
        <>
          <Pressable style={[styles.pill, { backgroundColor: semantic.successFill }]} onPress={onApprove} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${row.name} başvurusunu onayla`}>
            <Text style={styles.pillText}>Onayla</Text>
          </Pressable>
          <Pressable style={[styles.pill, { backgroundColor: colors.cardAlt }]} onPress={onReject} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${row.name} başvurusunu reddet`}>
            <Text style={styles.pillText}>Reddet</Text>
          </Pressable>
        </>
      )}
      {canRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${row.name} üyelikten çıkar`}>
          <Text style={styles.remove}>Çıkar</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: '#24232B', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '80%', minHeight: 300, gap: 10, ...edge.sheet },
  sheetTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  h2: { color: '#fff', fontWeight: '800', fontSize: 17 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  tiny: { color: '#fff', fontSize: 12, marginTop: 4, maxWidth: 58 },
  all: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  bell: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
  bellText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  more: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  // Bottom left: the bottom right is where a list row's "in the room" dot sits.
  joinBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  joinText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  stateTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stateBtn: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 12, paddingVertical: 6 },
  stateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  followLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 12, paddingVertical: 7 },
  followBtnOn: { borderColor: 'rgba(255,101,118,0.55)', backgroundColor: 'rgba(255,101,118,0.12)' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: semantic.action },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: semantic.actionInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  staff: { color: colors.primaryText, fontWeight: '700' },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  remove: { color: semantic.danger, fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  footer: { textAlign: 'center', paddingVertical: 10 },
});
