// The person card in a room: tapping someone on a mic, on the balcony list or in the chat opens it from the bottom,
// a card of its own, drawn with the designer's picture set (components/person-card-art, person-showcase; the client's
// picture in Güncelleme 7): their photo in their own shop frame, name with their Yankı level on the crowned pill, gender
// and age, their Cömertlik level, VIP level and the heart between us, their profile ID (tap: copied) and country, their
// mic and room role between laurels, agency and Aile, interests, the three walls (İlişki Duvarı, Hediye Duvarı,
// Koruma: each opens that part of their profile), followers and their medals (tap: the profile's Onur tab), and what I
// can do: send a gift, mention them in the chat (@bahset), follow, message, open the full profile. Room staff get
// "Yönet" for their actions on them. Live mode: the follow state, the counts, the levels (a level a VIP hides stays
// hidden), the country, the medals and the heart are the server's (lib/live/profile with `card`, lib/live/one-on-one),
// as on the profile screen; their frame, VIP level and special ID are the ones the room read (lib/live/looks), else
// the profile answer's. Beside the name, the box the owners drew (20 Nov 2026): their room entrance playing round
// (components/room/entry-box, lib/entry-box), what everyone sees when they come in; the levels then stand in a row
// under the photo, as in the design, and on a narrow phone (or with large text) the box is a strip under the head.
// Nobody wearing anything (or someone I blocked, whose entrance the room doesn't show me): no box, the head as before.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { MAX_FONT_SCALE, Text } from '@/components/text';
import { Art } from '@/components/Art';
import { HeartBadge } from '@/components/heart-level';
import { heartOf, usePair } from '@/components/one-on-one-bar';
import { GenderChip } from '@/components/profile-badges';
import { CardArt, CardPanel } from '@/components/person-card-art';
import { EntryBox } from '@/components/room/entry-box';
import { ActionTiles, ClubPills, InterestRow, LevelPill, ManageRow, SHOW, WallLinks, type WallKey } from '@/components/person-showcase';
import { useSheetBottom } from '@/components/room/parts';
import { FramedAvatar, VipBadge, VipTitle, WealthBadge } from '@/components/ui';
import { userById, type User } from '@/data/mock';
import { medalsOf, wealthCharmOf } from '@/data/profile';
import { countryArt } from '@/data/rooms-ui';
import { COUNTRIES } from '@/data/social-ui';
import { showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { CARD_HEAD, ENTRY_BOX, entryBoxPlace } from '@/lib/entry-box';
import { liveMode, message, toServer } from '@/lib/live';
import { lookOf } from '@/lib/live/looks';
import { followOnServer, loadPublicProfile } from '@/lib/live/profile';
import { countryCodeOf, medalsFrom, shownPublicId, type CardLook } from '@/lib/person-card';
import { entryPlanOf } from '@/lib/room-entrance';
import { useSheetMax } from '@/lib/sheet-space';
import { useApp } from '@/store';
import { SCRIM } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** The profile tab each wall opens (the Koruma banner sits on the profile's first tab). */
const WALL_TAB: Record<WallKey, string> = { iliski: 'iliski', hediye: 'onur', koruma: 'profil' };
/** The most medals the card shows; all of them are on the profile's Onur tab. */
const MEDALS_SHOWN = 6;

/** What the card read from the server for this person (GET /api/user with `card`). */
type CardRead = {
  id: string;
  followers: number;
  isFollowing: boolean;
  /** Null: not sent, or a level they hide (a VIP right). */
  wealth: number | null;
  charm: number | null;
  /** My own card: which of my levels others don't see now. */
  hidden?: { wealth: boolean; charm: boolean };
  country: string | null;
  /** Undefined: an older server, which sends none. */
  medals?: string[];
  look: CardLook | null;
};

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
  const { following, toggleFollow, takeServerSocial, blocked, equipped, vipLevel, nobleTier, charmLevel, wealthLevel } = useApp();
  const u = userById(uid);
  const isMe = uid === 'me';
  const live = liveMode();
  const serverId = live ? toServer(uid) : null;
  // Live mode: what the server says of this person (null until read).
  const [counts, setCounts] = useState<CardRead | null>(null);
  const [busy, setBusy] = useState(false);
  // The heart between us (the demo: its sample heart), beside their name once it has a level.
  const { pair } = usePair(uid, !!serverId && !isMe);
  const heart = isMe ? null : heartOf(uid, pair);
  useEffect(() => {
    if (!serverId) return;
    let on = true;
    loadPublicProfile(serverId, isMe, false, true).then(
      (c) =>
        on &&
        setCounts({
          id: serverId,
          followers: c.followers,
          isFollowing: c.isFollowing,
          wealth: c.levels?.wealth ?? null,
          charm: c.levels?.charm ?? null,
          ...(c.levelsHidden && { hidden: c.levelsHidden }),
          country: countryCodeOf(c.extras?.country),
          ...(c.medals && { medals: c.medals }),
          look: c.look ?? null,
        }),
      () => {},
    );
    return () => {
      on = false;
    };
  }, [serverId, isMe]);
  const mine = counts && counts.id === serverId ? counts : null;
  const isFollowing = mine ? mine.isFollowing : following.has(uid);
  const isBlocked = blocked.has(uid);
  // Cömertlik and Yankı: mine from the store (a level I hide from others is hidden here too, as they see it), someone
  // else's from the server (null until read or while they hide it), the demo's sample levels.
  const demo = wealthCharmOf(uid);
  const wealth = isMe ? (mine?.hidden?.wealth ? null : wealthLevel) : serverId ? (mine?.wealth ?? null) : demo.wealth;
  const charm = isMe ? (mine?.hidden?.charm ? null : charmLevel) : serverId ? (mine?.charm ?? null) : demo.charm;
  // Their own shop look: mine from the store; someone else's as the room read it (it hears changes at once), else as
  // their profile answer had it (none until read).
  const theirs: CardLook | undefined = isMe ? undefined : ((serverId ? lookOf(serverId) : undefined) ?? mine?.look ?? undefined);
  const frameId = isMe ? equipped.frame : (theirs?.frame ?? undefined);
  const vip = isMe ? vipLevel : (theirs?.vipLevel ?? 0);
  // Their profile ID (a special ID they wear, else their own number) and country, as their profile shows them.
  const shownId = shownPublicId(live, u, serverId, isMe ? equipped.specialId : theirs?.specialId);
  const countryCode = serverId ? (mine?.country ?? null) : (u.country ?? 'TR');
  const country = countryCode ? COUNTRIES.find((c) => c.code === countryCode && c.code !== 'ALL') : undefined;
  // Their medals: the server's (an older server sends none), the demo's sample ones.
  const medals = (serverId ? medalsFrom(mine?.medals) : medalsOf(uid)).slice(0, MEDALS_SHOWN);
  const paddingBottom = useSheetBottom(18);
  // It stops at the room's Balkon line (lib/sheet-space): who they are scrolls, the buttons stay in sight. The card
  // floats over the navigation bar, so that padding comes off; a busy room on a short phone still leaves it 380 to
  // hold its fixed rows and a part of the list.
  const sheet = useSheetMax(0.9);
  const { width, height, fontScale } = useWindowDimensions();
  // Their entrance (lib/room-entrance): mine from the store, someone else's look as above; the demo's people wear none.
  const entryPlan = isBlocked ? null : entryPlanOf(isMe ? { entry: equipped.entry, ride: equipped.ride, noble: nobleTier, vipLevel } : theirs);
  const place = entryBoxPlace(width, fontScale, MAX_FONT_SCALE);
  const boxed = !!entryPlan && place.beside;
  const entryBox = entryPlan && <EntryBox plan={entryPlan} name={u.name} avatar={u.avatar} w={place.w} h={place.h} />;
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
  const openTab = (tab: string) => {
    onClose();
    router.push({ pathname: '/kullanici/[id]', params: { id: uid, tab } });
  };
  const openWall = (w: WallKey) => openTab(WALL_TAB[w]);
  const copyId = () => {
    if (shownId.id) void copyText(shownId.id, 'ID');
  };

  const levelPill = charm !== null && <LevelPill level={charm} />;
  const badges = (
    <>
      <AgePill user={u} />
      {wealth !== null && <WealthBadge level={wealth} />}
      {vip > 0 ? <VipTitle level={vip} /> : u.vip && <VipBadge />}
      {heart && heart.level > 0 && <HeartBadge level={heart.level} />}
    </>
  );
  const noteRow = !!note && (
    <View style={s.row}>
      <CardArt name="defne-sol" h={20} />
      <Text style={s.note} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {note}
      </Text>
      <CardArt name="defne-sag" h={20} />
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.float, { paddingBottom }]}>
        <CardPanel style={[s.sheet, { maxHeight }]} vip={vip}>
          <View style={[s.head, boxed && s.headBoxed]}>
            <View style={s.avatar}>
              <FramedAvatar uri={u.avatar} size={78} vipLevel={vip} frameId={frameId ?? undefined} artScale={1.6} markUid={uid} />
            </View>
            <View style={s.who}>
              {/* The name with their Yankı level on the crowned pill beside it, as in the design; a long name shrinks first.
                  Beside the entry box the name stands alone (its level goes to the row under the photo). */}
              <View style={[s.row, !boxed && { paddingRight: 26 }]}>
                <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit={boxed} minimumFontScale={0.75}>
                  {u.name}
                </Text>
                {!boxed && levelPill}
              </View>
              {/* Room between wrapped lines: the badges' crowns and sparkles stand above them. */}
              {!boxed && (
                <View style={[s.row, s.wrap]}>
                  {badges}
                </View>
              )}
              {(!!shownId.id || !!country) && (
                <View style={[s.row, s.wrap]}>
                  {!!shownId.id && (
                    <Pressable style={[s.idPill, boxed && s.idPillBoxed]} onPress={copyId} hitSlop={6} accessibilityRole="button" accessibilityLabel={`ID ${shownId.id}, kopyala`}>
                      {/* Beside the entry box a 12-digit ID takes the whole pill, a size smaller (tapping it still copies);
                          a phone draws it smaller still rather than cut it. */}
                      <Text style={[s.idText, boxed && s.idTextBoxed, shownId.special && s.idSpecial]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        ID {shownId.id}
                        {shownId.special ? ' ✦' : ''}
                      </Text>
                      {!boxed && <Ionicons name="copy-outline" size={11} color={SHOW.dim} />}
                    </Pressable>
                  )}
                  {country && (
                    <View style={s.flag} accessibilityLabel={country.name}>
                      <Art name={countryArt(country.code)} size={15} />
                      <Text style={s.flagText}>{country.code}</Text>
                    </View>
                  )}
                </View>
              )}
              {!boxed && noteRow}
            </View>
            {boxed && <View style={s.entryAt}>{entryBox}</View>}
          </View>
          {boxed && (
            <>
              <View style={[s.row, s.wrap]}>
                {levelPill}
                {badges}
              </View>
              {noteRow}
            </>
          )}

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {/* No room beside the name (a narrow phone, large text): their entrance as a strip under the head. */}
            {!place.beside && entryBox}
            <ClubPills user={u} onOpen={onClose} />
            <InterestRow interests={u.interests} />
            <WallLinks onOpen={openWall} />
            {(mine || medals.length > 0) && (
              <View style={s.followRow}>
                {mine ? (
                  <Text style={s.dim}>
                    <Text style={s.strong}>{fmt(mine.followers)}</Text> takipçi
                  </Text>
                ) : (
                  <View />
                )}
                {medals.length > 0 && (
                  <Pressable
                    style={s.medals}
                    onPress={() => openTab('onur')}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Madalyalar: ${medals.map((m) => m.name).join(', ')}`}
                  >
                    {medals.map((m) =>
                      m.art ? (
                        <Art key={m.id} name={m.art} size={24} />
                      ) : (
                        <Text key={m.id} style={s.medalEmoji}>
                          {m.emoji}
                        </Text>
                      ),
                    )}
                    <CardArt name="ok" h={9} />
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>

          <ActionTiles
            tiles={[
              { art: 'hediye', label: 'Hediye', onPress: act(() => onGift(uid)) },
              { art: 'bahset', label: 'Bahset', onPress: act(() => onMention(uid)) },
              { art: 'takip', label: isFollowing ? 'Takiptesin' : 'Takip et', on: isFollowing, disabled: busy, onPress: () => void follow() },
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
  head: { flexDirection: 'row', alignItems: 'center', gap: CARD_HEAD.gap },
  // Beside the entry box: everything from the top, the box as tall as the photo.
  headBoxed: { alignItems: 'flex-start' },
  avatar: { width: CARD_HEAD.avatar, height: CARD_HEAD.avatar, alignItems: 'center', justifyContent: 'center' },
  // 8 from the name; the close button keeps its column to the right of the box, as in the design.
  entryAt: { marginLeft: ENTRY_BOX.gap - CARD_HEAD.gap, marginRight: ENTRY_BOX.closeCol },
  who: { flex: 1, minWidth: 0, gap: 7, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wrap: { flexWrap: 'wrap', rowGap: 10 },
  name: { color: SHOW.text, fontSize: 21, fontWeight: '900', flexShrink: 1 },
  age: { width: AGE_H * 3, height: AGE_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  ageText: { color: '#fff', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  note: { color: SHOW.dim, fontSize: 12.5, flexShrink: 1 },
  close: { position: 'absolute', right: 4, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dim: { color: SHOW.dim, fontSize: 14 },
  strong: { color: SHOW.text, fontWeight: '800' },
  idPill: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minHeight: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: SHOW.tile, borderWidth: 1, borderColor: SHOW.line },
  idPillBoxed: { paddingHorizontal: 7 },
  idTextBoxed: { fontSize: 11 },
  idText: { color: SHOW.dim, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  idSpecial: { color: SHOW.gold },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flagText: { color: SHOW.dim, fontSize: 12, fontWeight: '700' },
  followRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  medals: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minHeight: 32 },
  medalEmoji: { fontSize: 18 },
});
