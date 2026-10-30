// Balkon (people in the room but not on a mic), the room's total counter, the "Odadaki Kullanıcılar" sheet
// with role-based actions, the mic invite prompt for the invited person, and the connection banner.
// Every number and list here comes from one presence model (lib/room-presence deriveView); actions call
// the room, which calls the presence server where they are validated.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Art } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { ROLE_RANK, type RoomRole } from '@/components/room/parts';
import { userById } from '@/data/mock';
import type { MicInvite, RoomLive, RoomView } from '@/lib/room-presence';
import { colors, semantic } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const nameOf = (uid: string) => (uid === 'me' ? 'Sen' : userById(uid).name);

// --- Balkon bar + total counter ----------------------------------------------------------------------
/** Compact strip under the mics: Balkon count with a few faces (left) and the total counter (right). */
export function BalconyBar({ view, stale, onOpen }: { view: RoomView; stale: boolean; onOpen: () => void }) {
  // Fewer faces on narrow phones so the label and count never truncate.
  const { width } = useWindowDimensions();
  const faces = view.balconyIds.slice(0, width < 360 ? 2 : width < 400 ? 4 : 5);
  const more = view.balcony - faces.length;
  return (
    <View style={[s.bar, stale && { opacity: 0.7 }]}>
      <Pressable style={s.balcony} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Balkon, ${view.balcony} kişi. Listeyi aç`}>
        <Text style={s.balconyTitle} numberOfLines={1}>
          Balkon <Text style={s.balconyCount}>· {fmt(view.balcony)} kişi</Text>
        </Text>
        {view.balcony > 0 ? (
          <View style={s.faces}>
            {faces.map((uid, i) => (
              <Image key={uid} source={{ uri: userById(uid).avatar }} style={[s.face, { marginLeft: i ? -7 : 0 }]} />
            ))}
            {more > 0 && (
              <View style={[s.face, s.more, { marginLeft: -7 }]}>
                <Text style={s.moreText}>+{more > 999 ? '999' : more}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={s.dim}>Herkes mikrofonda</Text>
        )}
      </Pressable>
      <Pressable style={s.total} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Odada toplam ${view.total} kişi${stale ? ', bağlantı bekleniyor' : ''}. Odadaki kullanıcıları aç`} hitSlop={6}>
        <Ionicons name={stale ? 'cloud-offline-outline' : 'people'} size={16} color={semantic.actionInk} />
        <Text style={s.totalText}>{fmt(view.total)}</Text>
      </Pressable>
    </View>
  );
}

// --- Participants sheet ----------------------------------------------------------------------------------
type Tab = 'balcony' | 'mic' | 'all';
export type ParticipantActions = {
  invite: (uid: string) => void;
  micMute: (uid: string, muted: boolean) => void;
  silence: (uid: string) => void;
  kick: (uid: string) => void;
  profile: (uid: string) => void;
  gift: (uid: string) => void;
  block: (uid: string) => void;
  report: (uid: string) => void;
};

export function ParticipantsSheet({
  visible,
  onClose,
  room,
  view,
  myRole,
  offline,
  inviteSeat,
  silenced,
  blocked,
  hiddenMe,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  room: RoomLive;
  view: RoomView;
  myRole: RoomRole;
  offline: boolean;
  /** Opened from an empty mic's "Davet et": invites go to this mic. */
  inviteSeat: number | null;
  silenced: Set<string>;
  blocked: Set<string>;
  hiddenMe: boolean;
  actions: ParticipantActions;
}) {
  const [tab, setTab] = useState<Tab>('balcony');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const roleOf = (uid: string): RoomRole => (uid === room.ownerId ? 'owner' : room.adminIds.includes(uid) ? 'admin' : 'member');
  const seatOf = (uid: string) => room.seats.indexOf(uid);
  const pending = useMemo(() => new Set(room.invites.filter((i) => i.status === 'pending').map((i) => i.toId)), [room.invites]);
  const base = tab === 'balcony' ? view.balconyIds : tab === 'mic' ? view.micIds : [...view.micIds, ...view.balconyIds];
  const q = query.trim().toLocaleLowerCase('tr-TR');
  // You first, then managers, then join order (the newest at the end), as the presence server keeps them.
  const rank = (uid: string) => (uid === 'me' ? 9 : ROLE_RANK[roleOf(uid)]);
  const list = base.filter((uid) => !q || nameOf(uid).toLocaleLowerCase('tr-TR').includes(q)).sort((a, b) => rank(b) - rank(a));
  const canManage = myRole !== 'member';
  const outranks = (uid: string) => canManage && ROLE_RANK[myRole] > ROLE_RANK[roleOf(uid)];
  const close = () => {
    setOpen(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Kapat" />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.head}>
          <Icon3D name={inviteSeat !== null ? 'userAdd' : 'group'} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title} accessibilityRole="header">
              {inviteSeat !== null ? `${inviteSeat + 1}. mikrofona davet et` : 'Odadaki Kullanıcılar'}
            </Text>
            <Text style={s.sub} accessibilityLabel={`${view.total} kişi, ${view.mic} mikrofonda, ${view.balcony} balkonda`}>
              {fmt(view.total)} kişi · {fmt(view.mic)} mikrofonda · {fmt(view.balcony)} balkonda
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={8} style={s.closeBtn} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        {offline && (
          <View style={s.notice}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.gold} />
            <Text style={[s.dim, { flex: 1, color: '#FDE7C2' }]}>Bağlantı yok: liste son alınan durumu gösteriyor; işlemler bağlantı dönünce yapılabilir.</Text>
          </View>
        )}
        {hiddenMe && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Art name="oda-gizli-giris" size={18} />
            <Text style={[s.dim, { flex: 1 }]}>Gizli girişle Balkon’dasın: diğerlerinin listesinde ve sayısında görünmüyorsun.</Text>
          </View>
        )}
        <View style={s.tabs} accessibilityRole="tablist">
          {(
            [
              ['balcony', 'Balkon', view.balcony],
              ['mic', 'Mikrofonda', view.mic],
              ['all', 'Tümü', view.total],
            ] as const
          ).map(([k, l, n]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" aria-selected={tab === k}>
              <Text style={[s.tabText, tab === k && { color: semantic.actionInk }]}>
                {l} {fmt(n)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={16} color={colors.textDim} />
          <TextInput value={query} onChangeText={setQuery} placeholder="İsimle ara" placeholderTextColor={colors.textDim} style={s.searchInput} accessibilityLabel="Kullanıcı ara" />
        </View>
        <FlatList
          data={list}
          keyExtractor={(u) => u}
          initialNumToRender={14}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[s.dim, { textAlign: 'center', paddingVertical: 24 }]}>{q ? 'Aramaya uyan kimse yok.' : tab === 'balcony' ? 'Balkon boş: odadaki herkes mikrofonda.' : tab === 'mic' ? 'Mikrofonda kimse yok.' : 'Oda boş.'}</Text>}
          renderItem={({ item: uid }) => {
            const u = userById(uid);
            const role = roleOf(uid);
            const seat = seatOf(uid);
            const onBoss = room.boss === uid && seat < 0;
            const onMic = seat >= 0 || onBoss;
            const me = uid === 'me';
            const status = [
              onBoss ? '👑 Patron koltuğu' : onMic ? `${seat + 1}. mikrofon` : 'Balkon',
              onMic && room.micMuted.includes(uid) ? 'mikrofonu kapatıldı' : '',
              pending.has(uid) ? 'davet bekliyor' : '',
              silenced.has(uid) ? 'senin için sessizde' : '',
              blocked.has(uid) ? 'engelledin' : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const canInvite = canManage && !onMic && !me && !pending.has(uid);
            const expanded = open === uid;
            return (
              <View style={[s.row, expanded && s.rowOpen]}>
                <Pressable style={s.rowMain} onPress={() => setOpen(expanded ? null : uid)} accessibilityRole="button" accessibilityLabel={`${me ? 'Sen' : u.name}, ${status}. İşlemler`} aria-expanded={expanded}>
                  <Image source={{ uri: u.avatar }} style={[s.av, blocked.has(uid) && { opacity: 0.45 }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={1}>
                      {me ? 'Sen' : u.name}
                      {role === 'owner' ? ' 👑' : role === 'admin' ? ' 🛡️' : ''}
                    </Text>
                    <Text style={s.dim} numberOfLines={1}>
                      {status}
                    </Text>
                  </View>
                  {inviteSeat !== null && canInvite ? (
                    <Pressable style={[s.inviteBtn, offline && { opacity: 0.45 }]} disabled={offline} onPress={() => actions.invite(uid)} accessibilityLabel={`${u.name} kişisini mikrofona davet et`}>
                      <Text style={s.inviteText}>Davet et</Text>
                    </Pressable>
                  ) : (
                    !me && <Ionicons name={expanded ? 'chevron-up' : 'ellipsis-horizontal'} size={18} color={colors.textDim} />
                  )}
                </Pressable>
                {expanded && !me && (
                  <View style={s.actions}>
                    {canInvite && <Action icon="mic-outline" label="Mikrofona davet et" disabled={offline} onPress={() => actions.invite(uid)} />}
                    {onMic && outranks(uid) && (
                      <Action icon={room.micMuted.includes(uid) ? 'mic-outline' : 'mic-off-outline'} label={room.micMuted.includes(uid) ? 'Mikrofonunu aç' : 'Mikrofonunu sustur'} disabled={offline} onPress={() => actions.micMute(uid, !room.micMuted.includes(uid))} />
                    )}
                    <Action icon={silenced.has(uid) ? 'volume-high-outline' : 'volume-mute-outline'} label={silenced.has(uid) ? 'Sesini benim için aç' : 'Benim için sessize al'} onPress={() => actions.silence(uid)} />
                    <Action icon="person-circle-outline" label="Profil" onPress={() => actions.profile(uid)} />
                    <Action icon="gift-outline" label="Hediye gönder" disabled={offline} onPress={() => actions.gift(uid)} />
                    {outranks(uid) && <Action icon="exit-outline" label="Odadan çıkar" danger disabled={offline} onPress={() => actions.kick(uid)} />}
                    <Action icon="ban-outline" label={blocked.has(uid) ? 'Engeli kaldır' : 'Engelle'} onPress={() => actions.block(uid)} />
                    <Action icon="flag-outline" label="Şikâyet et" onPress={() => actions.report(uid)} />
                  </View>
                )}
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function Action({ icon, label, onPress, danger, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.action, danger && s.actionDanger, disabled && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={label} aria-disabled={disabled}>
      <Ionicons name={icon} size={15} color={danger ? '#FF9AA1' : colors.text} />
      <Text style={[s.actionText, danger && { color: '#FF9AA1' }]}>{label}</Text>
    </Pressable>
  );
}

// --- Invite prompt (the invited person decides) ----------------------------------------------------------
export function MicInvitePrompt({ invite, onAnswer }: { invite: MicInvite; onAnswer: (accept: boolean) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000));
  return (
    <View style={s.prompt} accessibilityLiveRegion="polite" accessibilityLabel={`${nameOf(invite.fromId)} seni mikrofona davet ediyor`}>
      <Icon3D name="userAdd" size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.name} numberOfLines={2}>
          {nameOf(invite.fromId)} seni {invite.seat !== undefined ? `${invite.seat + 1}. ` : ''}mikrofona davet ediyor
        </Text>
        <Text style={s.dim}>Boş bir mikrofona geçersin · {left} sn</Text>
      </View>
      <Pressable style={s.decline} onPress={() => onAnswer(false)} accessibilityLabel="Daveti reddet">
        <Text style={s.declineText}>Reddet</Text>
      </Pressable>
      <Pressable style={s.accept} onPress={() => onAnswer(true)} accessibilityLabel="Daveti kabul et">
        <Text style={s.acceptText}>Kabul</Text>
      </Pressable>
    </View>
  );
}

// --- Connection banner ----------------------------------------------------------------------------------
const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8 },
  balcony: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.24)', borderRadius: 999, paddingLeft: 12, paddingRight: 6, minHeight: 40 },
  balconyTitle: { color: colors.text, fontWeight: '800', fontSize: 13, flexShrink: 0 },
  balconyCount: { color: colors.textDim, fontWeight: '700' },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.card },
  more: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', width: 34 },
  moreText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  total: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 12, minHeight: 40, minWidth: 56, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', boxShadow: '0 4px 14px rgba(19,217,223,0.45)' },
  totalText: { color: semantic.actionInk, fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.55)' },
  sheet: { height: '78%', backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 10, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 -10px 30px rgba(0,0,0,0.45)' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 18 },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(246,189,96,0.14)', borderRadius: 12, padding: 10 },
  tabs: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 999, padding: 4 },
  tab: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  tabOn: { backgroundColor: semantic.action },
  tabText: { color: colors.text, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 14 },
  row: { borderRadius: 14, marginBottom: 4 },
  rowOpen: { backgroundColor: colors.cardAlt },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, minHeight: 56 },
  av: { width: 40, height: 40, borderRadius: 20 },
  name: { color: colors.text, fontWeight: '700', fontSize: 14 },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  inviteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 8 },
  actionDanger: { borderColor: 'rgba(217,58,69,0.7)', backgroundColor: 'rgba(217,58,69,0.12)' },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  prompt: { position: 'absolute', left: 12, right: 12, top: 96, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: semantic.action },
  decline: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9 },
  declineText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  accept: { backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  acceptText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
});
