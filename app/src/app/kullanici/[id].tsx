import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { GiftArt } from '@/components/GiftArt';
import { FollowListSheet } from '@/components/follow-list-sheet';
import { Avatar, Button, FramedAvatar, GradientButton, LevelChips, VerifiedBadge, VipBadge, VipTitle } from '@/components/ui';
import { COSMETICS, FAN_LEVELS, fanLevel, roomLevel, ROOM_LEVEL_ICONS } from '@/data/catalog';
import { callPrice } from '@/data/economy';
import { FOLLOWS_ME, GIFTS, INTERESTS, MOMENTS, ROOMS, USERS, userById, type Gift, type Moment, type Room, type User } from '@/data/mock';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import { privacyOf } from '@/data/privacy';
import { COUNTRIES } from '@/data/social-ui';
import {
  GIFT_COLLECTIONS,
  collectionProgress,
  displayId,
  giftWallOf,
  guardianOf,
  medalsOf,
  profileCompletion,
  profileExtras,
  titlesOf,
  vehiclesOf,
  wealthCharmOf,
} from '@/data/profile';
import { followRoute, presenceOf } from '@/data/presence';
import { showAlert } from '@/lib/alert';
import { callsAvailable, liveGift, liveMode, loadRooms, message, toServer } from '@/lib/live';
import { loadFollowList, type FollowSide } from '@/lib/live/follows';
import { agoText, feed as momentFeed } from '@/lib/live/moments';
import { followOnServer, loadMe, loadPublicProfile, profilePatch, saveMyProfile, uploadAvatar, type ProfileEdit, type SocialCounts } from '@/lib/live/profile';
import { copyText } from '@/lib/clipboard';
import { goBack } from '@/lib/nav';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { checkInteraction, type Action } from '@/lib/interaction';
import { shareLink } from '@/lib/links';
import { LIMITS, ageFrom, formatTrDate, noteProfileRefusal, parseTrDate, validateProfile, type ProfileErrors } from '@/lib/profile-rules';
import { similarity } from '@/lib/similarity';
import { SimilarityCard } from '@/components/similarity';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ProfileGiftSheet } from '@/components/profile-gift-sheet';
import { AffiliationPills, GenderChip, useAffiliations, useStaffBadge, type Affiliation } from '@/components/profile-badges';
import { Icon3D } from '@/components/Icon3D';
import { useApp, type FanClub } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Art } from '@/components/Art';
import { Photo } from '@/components/photo';
import { useReport } from '@/components/report-sheet';
import { BondBadge, BondFrame, BondsTab, shownTopBond, useBonds } from '@/components/bonds';

const REPORT_REASONS = ['Sahte profil', 'Taciz / hakaret', 'Uygunsuz içerik', 'Dolandırıcılık', 'Reşit değil'];

type Tab = 'profil' | 'dinamik' | 'onur' | 'iliski';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profil', label: 'Profil' },
  { id: 'dinamik', label: 'Anlar' },
  { id: 'onur', label: 'Vitrin' },
  { id: 'iliski', label: 'Bağlar' },
];
// Live mode: Anlar and Vitrin (medals, titles, rides, gift wall) have nothing on the server yet.
const LIVE_TABS = TABS.filter((t) => t.id === 'profil' || t.id === 'iliski');
type Sheet = 'none' | 'more' | 'report' | 'call' | 'gift';
const BAR_H = 52;
const TAB_H = 48;

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    me, following, toggleFollow, takeServerSocial, blocked, toggleBlock, createTicket, fanClubs, addFanPoints, myRoom, notify, updateMe, spendCoins, spendBlock, bump, settings, vipLevel, svipLevel, equipped, inventory, giftWall: wallOf, recordGift,
    coins, diamonds, wealthXp, charmXp, wealthLevel, charmLevel, vipDays, stats, logSafety, pendingAvatar, submitAvatar,
  } = useApp();
  // Gifts the owner hid in Canlı ayarlar are not offered here (the wall below still counts every gift).
  const giftChoices = visibleGifts(GIFTS, useLiveCatalog());
  const isMe = id === 'me';
  // Live mode: everything shown comes from the server or is left out; the demo's sample values stay in the demo.
  const live = liveMode();
  // Who this is on the server (my own account for 'me'); null for a sample person, who isn't on the server.
  const serverId = live ? toServer(id) : null;
  // Live mode: the profile is read from the server when it opens (age, city, interests; mine from GET /api/me),
  // with the follower and following counts and my follow state. Kept with the id it is for.
  const [social, setSocial] = useState<{ id: string; counts: SocialCounts } | null>(null);
  const [reloads, setReloads] = useState(0);
  // Live mode, my own profile: my open room as the server has it (null: none open), never the demo's sample room.
  const [myLiveRoom, setMyLiveRoom] = useState<Room | null>(null);
  // Live mode: this person's Anlar posts from the server (null until read).
  const [liveMoments, setLiveMoments] = useState<Moment[] | null>(null);
  useEffect(() => {
    if (!serverId) return;
    let alive = true;
    momentFeed({ user: serverId })
      .then((list) => alive && setLiveMoments(list.map((m) => ({ id: m.id, userId: id, text: m.text, image: m.imageUrl ?? undefined, likes: m.likes, comments: m.comments, time: agoText(m.createdAt) }))))
      .catch(() => alive && setLiveMoments([]));
    return () => {
      alive = false;
    };
  }, [serverId, id]);
  const counts = social && social.id === serverId ? social.counts : null;
  const user = isMe ? me : userById(id);
  const insets = useSafeAreaInsets();
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  // Live mode: a real person's report goes to the moderators (a reason sheet of its own).
  const report = useReport();

  const club = fanClubs[user.id];
  const isBlocked = blocked.has(user.id);
  // Read again after a follow and after a block or unblock: a block ends the follows both ways on the server.
  useEffect(() => {
    if (!serverId) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const read = () =>
      loadPublicProfile(serverId, isMe)
        .then((counts) => {
          if (!alive) return;
          setSocial({ id: serverId, counts });
          // The block (or unblock) just sent may reach the server after this read: read again until it is there.
          if (!isMe && counts.blockedByMe !== isBlocked && tries++ < 3) retry = setTimeout(read, 1000);
        })
        .catch(() => {});
    read();
    if (isMe) {
      loadMe()
        .then((p) => alive && updateMe(p))
        .catch(() => {});
      loadRooms()
        .then((list) => alive && setMyLiveRoom(list.find((r) => r.hostId === 'me') ?? null))
        .catch(() => {});
    }
    return () => {
      alive = false;
      clearTimeout(retry);
    };
    // updateMe is a new function on every render; the profile is read when it opens, after a follow and after a block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, isMe, reloads, isBlocked]);
  // Live mode: the server's follow state once read (a block ends the follow there too).
  const isFollowing = !isBlocked && (counts ? counts.isFollowing : following.has(user.id));
  const extras = profileExtras(user);
  const moments = live ? (liveMoments ?? []) : MOMENTS.filter((m) => m.userId === user.id);
  const photos = moments.filter((m) => m.image).map((m) => m.image!);
  const completion = profileCompletion(user, extras, photos.length);
  // Others: demo values; me: my real Cömertlik (wealth) and Yankı (charm) levels.
  const levels = user.id === 'me' ? { wealth: wealthLevel, charm: charmLevel } : wealthCharmOf(user.id);
  const guardian = guardianOf(user.id);
  const bondState = useBonds(user.id);
  const topBondShown = shownTopBond(bondState, isMe);

  // What this viewer may see and do (profile spec §3, §5). Others' choices come with their profile; mine from Settings.
  const priv = isMe ? { ...privacyOf('me'), showOnline: settings.showOnline, showLastSeen: settings.showLastSeen, showCurrentRoom: settings.showCurrentRoom } : privacyOf(user.id);
  // Like most messengers: hiding your own last seen also hides everyone else's from you.
  const lastSeen = !isMe && !user.online && priv.showLastSeen && settings.showLastSeen ? user.lastSeen : undefined;
  // Live mode: only my own badge, from my server role (never the demo's local roles).
  const staff = useStaffBadge(user.id);
  // The server keeps no country: live mode shows none.
  const country = live ? undefined : COUNTRIES.find((c) => c.code === (user.country ?? 'TR'));
  // Live mode: the server's counts (null = not read yet, shown as "—"). The server has no friend count yet.
  const followers = live ? (counts?.followers ?? null) : (user.age * 37) % 900;
  const followingCount = live ? (counts?.following ?? null) : isMe ? following.size : (user.age * 13) % 200;
  const friends = live ? null : isMe ? USERS.filter((u) => following.has(u.id) && FOLLOWS_ME.has(u.id)).length : (user.age * 7) % 60;
  const can = (a: Action) => checkInteraction(a, user, { blocked, following, myAge: me.age });
  const guard = (a: Action, run: () => void) => {
    const c = can(a);
    if (!c.ok) return showAlert('Şu an yapılamıyor', c.reason);
    run();
  };
  const album = [...(user.photos ?? []), ...MOMENTS.filter((m) => m.userId === user.id && m.image).map((m) => m.image!)];
  const [openedAt] = useState(() => Date.now());
  const vipUntil = vipDays > 0 ? new Date(openedAt + vipDays * 86_400_000).toLocaleDateString('tr-TR') : null;

  const [avatarBusy, setAvatarBusy] = useState(false);
  const pickPhoto = async (forAlbum: boolean) => {
    if (avatarBusy) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: !forAlbum, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (forAlbum) {
      updateMe({ photos: [asset.uri, ...(me.photos ?? [])].slice(0, LIMITS.photos) });
      showAlert('Fotoğraf eklendi', 'Albüm fotoğrafları da topluluk kurallarına göre denetlenir.');
    } else if (live) {
      // Live mode: the photo goes to the server's storage and becomes my avatar there, so other phones see it.
      // This phone shows it only once the server saved it.
      setAvatarBusy(true);
      try {
        updateMe(await uploadAvatar(asset));
        successHaptic();
        showAlert('Profil fotoğrafın güncellendi', 'Yeni fotoğrafın artık profilinde görünüyor.');
      } catch (e) {
        errorHaptic();
        showAlert('Fotoğraf yüklenemedi', message(e));
      } finally {
        setAvatarBusy(false);
      }
    } else {
      submitAvatar(asset.uri);
      showAlert('Fotoğraf incelemede', 'Yeni profil fotoğrafın kısa bir kontrolden sonra herkese görünecek. Bu sırada eski fotoğrafın görünür.');
    }
  };

  const [tab, setTab] = useState<Tab>('profil');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [editOpen, setEditOpen] = useState(false);
  const [sentInvites, setSentInvites] = useState<string[]>([]);
  const [tabY, setTabY] = useState(0);
  const [list, setList] = useState<FollowSide | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Gift wall: my own wall is only what I really received; another user's wall is their simulated
  // history plus every gift I sent them (room, profile, call).
  const received = wallOf[user.id] ?? {};
  const giftWall = giftWallOf(user.id).map((g) => ({ ...g, count: (isMe ? 0 : g.count) + (received[g.id] ?? 0) }));
  const giftTotal = giftWall.reduce((s, g) => s + g.count, 0);

  const followPoints = () => {
    if (!club?.history.some((h) => h.text === 'Takip ettin')) addFanPoints(user.id, 10, 'Takip ettin');
  };
  const [followBusy, setFollowBusy] = useState(false);
  const follow = async () => {
    // Same answer as Mesaj and Hediye: a blocked person can't be followed (the server refuses it too).
    if (isBlocked) return showAlert('Şu an yapılamıyor', `${user.name} kişisini engelledin. Engeli kaldırmadan takip edemezsin.`);
    const on = !isFollowing;
    if (!serverId) {
      toggleFollow(user.id);
      if (on) followPoints();
      return;
    }
    // Live mode: the server decides. The button, my following list and the fan-club points change only once it agreed.
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const now = await followOnServer(serverId, on);
      const next = new Set(following);
      if (now) next.add(user.id);
      else next.delete(user.id);
      takeServerSocial({ following: [...next] });
      setSocial((s) => (s && s.id === serverId && s.counts.isFollowing !== now ? { id: s.id, counts: { ...s.counts, isFollowing: now, followers: Math.max(0, s.counts.followers + (now ? 1 : -1)) } } : s));
      if (now && on) followPoints();
      setReloads((n) => n + 1);
    } catch (e) {
      showAlert('Takip edilemedi', message(e));
    } finally {
      setFollowBusy(false);
    }
  };

  const call = (mode: 'sesli' | 'goruntulu') => guard(mode === 'sesli' ? 'voice' : 'video', () => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode } }));
  const inviteToRoom = () =>
    guard('invite', () => {
      if (sentInvites.includes(`room:${user.id}`)) return showAlert('Davet zaten gönderildi', `${user.name} henüz yanıt vermedi.`);
      setSentInvites((l) => [...l, `room:${user.id}`]);
      notify({ kind: 'social', icon: 'mic', title: 'Oda daveti gönderildi', body: `${user.name} kişisini "${myRoom.title}" odana davet ettin.`, href: '/oda/yeni' });
      showAlert('Davet gönderildi', `${user.name} kabul ederse odana katılır.`);
    });

  // Live mode: only a real person (a server id) can get a gift; a sample person has no Hediye button.
  const giftable = !live || !!serverId;
  /** One gift, no confirmation; true once it went. */
  const deliverGift = async (g: Gift): Promise<boolean> => {
    // Same İnci (SVIP) lock as the room's gift sheet.
    if ((g.minSvip ?? 0) > svipLevel) {
      showAlert('Üyelere özel hediye', `${g.name}, İnci ${g.minSvip} ve üstü için. Senin seviyen: İnci ${svipLevel}.`);
      return false;
    }
    if (live) {
      // Live mode, as in rooms: the server takes the coins at its price, pays the receiver and records the gift
      // (POST /api/gifts/send); the balance it answers with replaces this phone's. Nothing is spent here.
      // The daily limit holds here too; the balance is the server's to check.
      const limited = spendBlock(g.price);
      if (limited && limited !== 'Yetersiz bakiye.') {
        showAlert('Hediye gönderilemedi', limited);
        return false;
      }
      try {
        await liveGift(user.id, g.id, 1, undefined, 'profile');
      } catch (e) {
        errorHaptic();
        showAlert('Hediye gönderilemedi', message(e), [
          { text: 'Tamam', style: 'cancel' },
          { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
        ]);
        return false;
      }
    } else if (!spendCoins(g.price, `Hediye: ${g.name} → ${user.name}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return false;
    }
    recordGift(user.id, g.id, 1);
    bump('giftsSent', 1);
    addFanPoints(user.id, Math.ceil(g.price / 10), `Hediye gönderdin (${g.price} jeton)`);
    successHaptic();
    return true;
  };
  const sendGift = (g: Gift) => {
    const c = can('gift');
    if (!c.ok) {
      showAlert('Şu an yapılamıyor', c.reason);
      return false;
    }
    return deliverGift(g);
  };

  const copyId = () => copyText(displayId(user.id), 'ID');
  const copyUsername = () => user.username && copyText(`@${user.username}`, 'Kullanıcı adı');

  // Blocking also ends the follows both ways (on the server too), so it asks first; unblocking doesn't.
  const blockUser = () => {
    if (isBlocked) return toggleBlock(user.id);
    showAlert(`${user.name} kişisini engellemek istiyor musun?`, 'Birbirinize mesaj atamaz, birbirinizi takip edemezsiniz; aranızdaki takipler de kalkar. Engeli istediğin zaman kaldırabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => toggleBlock(user.id) },
    ]);
  };

  // Live mode: the form starts from my profile as the server has it, not from what this phone remembers.
  const [editLoading, setEditLoading] = useState(false);
  // My age on the server (null: no birth date there yet, so the form may take one, once).
  const [serverAge, setServerAge] = useState<number | null>(null);
  const openEdit = async () => {
    if (!live) return setEditOpen(true);
    if (editLoading) return;
    setEditLoading(true);
    try {
      const mine = await loadMe();
      updateMe(mine);
      setServerAge(mine.age ?? null);
      setEditOpen(true);
    } catch (e) {
      showAlert('Profil açılamadı', message(e));
    } finally {
      setEditLoading(false);
    }
  };
  /** Saves the edit form; true once saved. Live mode: on the server first, and only its answer is shown. */
  const saveEdit = async (e: EditResult): Promise<boolean> => {
    if (live) {
      try {
        // The server never sends the birth date back (only the age): keep the one just set to show it to me.
        updateMe({ ...(await saveMyProfile(e)), ...(e.birthDate && { birthDate: e.birthDate }) });
      } catch (err) {
        errorHaptic();
        showAlert('Profil kaydedilemedi', message(err));
        return false;
      }
    } else {
      const p = profilePatch(e);
      updateMe({
        name: p.name,
        username: p.username ?? '',
        bio: p.bio,
        city: p.city,
        interests: p.interests,
        ...(p.birthDate && { birthDate: p.birthDate, age: ageFrom(p.birthDate) }),
        country: e.country,
        showGender: e.showGender,
        ...(p.gender && { gender: p.gender }),
      });
    }
    setEditOpen(false);
    showAlert('Profil güncellendi', 'Değişikliklerin kaydedildi.');
    return true;
  };

  const barHeight = insets.top + BAR_H;
  const onScroll = (y: number) => {
    const next = tabY > 0 && y >= tabY - barHeight;
    if (next !== collapsed) setCollapsed(next);
  };

  // Room & family
  // Live mode: no sample room for anyone; mine is my open server room (it has no level there, so none is shown).
  const otherRoom = live ? undefined : ROOMS.find((r) => r.hostId === user.id);
  const room: { title: string; desc: string; cover: string; level: number | null; go: () => void } | null = isMe
    ? live
      ? myLiveRoom && {
          title: myLiveRoom.title || 'Odam',
          desc: myLiveRoom.announcement ?? `${myLiveRoom.listeners.toLocaleString('tr-TR')} kişi içeride`,
          cover: myLiveRoom.cover,
          level: null,
          go: () => router.push(`/oda/${myLiveRoom.id}`),
        }
      : { title: myRoom.title, desc: myRoom.announcement, cover: myRoom.cover, level: roomLevel(myRoom.xp), go: () => router.push('/oda/yeni') }
    : otherRoom
      ? { title: otherRoom.title, desc: otherRoom.announcement ?? `${otherRoom.listeners} dinleyici`, cover: otherRoom.cover, level: otherRoom.level ?? 1, go: () => router.push(`/oda/${otherRoom.id}`) }
      : null;
  const { agency, kabile, known } = useAffiliations(user);
  // Live mode: my open room and my agency (once the server answered); nobody else's is on the server yet.
  const showRoom = !live || !!room;
  const showAgency = !live || (isMe && known);

  // Live mode: the tabs and blocks with something real behind them (the rest is sample data in the demo).
  const tabs = live ? LIVE_TABS : TABS;
  const birthday = user.birthDate ? formatTrDate(user.birthDate) : extras.birthday;
  const hasPersonal = extras.height > 0 || extras.weight > 0 || !!extras.job || extras.languages.length > 0 || !!extras.zodiac || (user.interests?.length ?? 0) > 0;
  const showsGender = !!user.gender && (isMe || user.showGender !== false);
  const hasBasics = !live || !!user.username || showsGender || (isMe && !!birthday) || !!user.joinedAt || !!extras.relationship || !!extras.education;

  const presence = priv.showCurrentRoom ? presenceOf(user.id) : null;
  // The collapsed bar is solid background: the light scheme swaps the photo's dark chip for a soft ink one.
  const onBar = collapsed && !dark;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: isMe ? 40 : 110 }}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Cover + header */}
        <View>
          <Photo uri={user.avatar.replace('200', '800')} kind="face" style={styles.cover} />
          <LinearGradient colors={['rgba(8,15,30,0.55)', 'transparent', 'rgba(8,15,30,0.6)']} style={StyleSheet.absoluteFill} />
          {/* The voice intro ("Kayıt") control comes back once recording one exists. */}
        </View>

        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={styles.avatarWrap}>
                {isMe ? (
                  <Pressable onPress={() => pickPhoto(false)} accessibilityLabel="Profil fotoğrafını değiştir">
                    {/* A frame from the store wins over the bond frame. */}
                    <BondFrame bond={equipped.frame ? null : topBondShown} size={96}>
                      <FramedAvatar uri={pendingAvatar ?? user.avatar} size={96} vipLevel={vipLevel} frameId={equipped.frame} artScale={2.2} />
                    </BondFrame>
                    <View style={styles.cameraBadge}>
                      <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                  </Pressable>
                ) : (
                  <BondFrame bond={topBondShown} size={96}>
                    <Avatar uri={user.avatar} size={96} ring={user.vip && !topBondShown} />
                  </BondFrame>
                )}
              </View>
              {isMe && pendingAvatar && <Text style={styles.reviewNote}>⏳ Yeni fotoğraf incelemede · şimdilik yalnızca sen görüyorsun</Text>}
              {isMe && avatarBusy && <Text style={styles.reviewNote}>⏳ Fotoğraf yükleniyor…</Text>}
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={2}>
                  {user.name}
                </Text>
                {country && (
                  <View style={styles.flag} accessibilityLabel={country.name}>
                    <Text style={{ fontSize: 13 }}>{country.flag}</Text>
                    <Text style={styles.flagText}>{country.code}</Text>
                  </View>
                )}
              </View>
              {!!user.username && (
                <Pressable style={styles.row} onPress={copyUsername} hitSlop={6} accessibilityLabel="Kullanıcı adını kopyala">
                  <Text style={styles.handle}>@{user.username}</Text>
                  <Ionicons name="copy-outline" size={13} color={colors.textDim} />
                </Pressable>
              )}
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                <GenderChip user={user} owner={isMe} />
                {/* Live mode: someone else's levels aren't on the server yet. */}
                {(!live || isMe) && (
                  <LevelChips wealth={levels.wealth} charm={levels.charm} hideWealth={isMe && vipDays > 0 && settings.hideWealth} hideCharm={isMe && vipDays > 0 && settings.hideCharm} />
                )}
                {isMe ? <VipTitle level={vipLevel} /> : user.vip && <VipBadge />}
                {staff && (
                  <View style={[styles.staffChip, staff === 'Moderatör' && { backgroundColor: '#1D4ED8' }]} accessibilityLabel={`Resmi ${staff}`}>
                    <Ionicons name="shield-checkmark" size={12} color="#fff" />
                    <Text style={styles.genderText}>{staff}</Text>
                  </View>
                )}
                {user.verified && <VerifiedBadge size={18} />}
                <BondBadge bond={topBondShown} onPress={() => setTab('iliski')} />
              </View>
              <AffiliationPills user={user} />
              <View style={styles.row}>
                {priv.showOnline ? (
                  <>
                    <View style={[styles.dot, { backgroundColor: user.online ? semantic.live : colors.textDim }]} />
                    <Text style={{ color: user.online ? semantic.actionText : colors.textDim, fontSize: 13 }}>
                      {user.online ? 'Çevrimiçi' : lastSeen ? `Son görülme ${lastSeen}` : 'Çevrimdışı'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.meta}>{isMe ? 'Durumun gizli' : 'Durum gizli'}</Text>
                )}
                {!!user.city && (
                  <>
                    <View style={styles.vSep} />
                    <Ionicons name="location-outline" size={14} color={colors.textDim} />
                    <Text style={styles.meta}>
                      {user.city}
                      {/* The server knows cities, not distances. */}
                      {!isMe && !live && settings.cityDiscovery && ` · ${user.distanceKm} km`}
                    </Text>
                  </>
                )}
              </View>
            </View>
            {/* Live mode: the guardian (top fan-club supporter) isn't on the server yet. */}
            {!live && <Guardian guardian={guardian} />}
          </View>

          <Pressable style={[styles.row, { marginTop: 12 }]} disabled={!isMe} onPress={openEdit}>
            <Text style={styles.bio}>{user.bio || (isMe ? 'Kendini birkaç kelimeyle anlat…' : '')}</Text>
            {isMe && (
              <View style={styles.bioEdit}>
                <Ionicons name="pencil" size={13} color={colors.text} />
              </View>
            )}
          </Pressable>

          <View style={styles.stats}>
            <Stat n={followers} label="Takipçi" onPress={serverId ? () => setList('followers') : undefined} />
            <View style={styles.vSep} />
            <Stat n={followingCount} label="Takip" onPress={serverId ? () => setList('following') : undefined} />
            {/* Live mode: no friend count or gift wall on the server yet. */}
            {!live && (
              <>
                <View style={styles.vSep} />
                <Stat n={friends} label="Arkadaş" />
                <View style={styles.vSep} />
                <Stat n={giftTotal} label="Hediye" onPress={() => setTab('onur')} />
              </>
            )}
          </View>
          {isBlocked && <Text style={{ color: colors.red, marginTop: 8 }}>Bu kullanıcıyı engelledin.</Text>}
          {!isMe && priv.status !== 'active' && (
            <Text style={styles.statusNote}>{priv.status === 'restricted' ? '⚠️ Bu hesap geçici olarak kısıtlı: arama, hediye ve oda daveti alamıyor.' : '⛔ Bu hesap askıya alındı.'}</Text>
          )}
          {!isMe && !isBlocked && presence && (
            <Pressable
              style={[styles.presence, presence.kind === 'call' && { borderColor: colors.gold }]}
              disabled={presence.kind !== 'room'}
              onPress={() => presence.kind === 'room' && router.push(followRoute(presence.roomId, user.id))}
              accessibilityLabel="Bulunduğu yere git">
              {presence.kind === 'room' ? <Icon3D name="mic" size={26} /> : <Ionicons name="call" size={20} color={colors.gold} />}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }} numberOfLines={1}>
                  {presence.kind === 'room' ? `Şu an odada: ${presence.title}` : `Şu an ${presence.mode} görüşmede`}
                </Text>
                <Text style={styles.meta}>{presence.kind === 'room' ? (presence.locked ? 'Şifreli oda · girişte şifre sorulur' : 'Dokun, yanına git') : 'Özel görüşmeye katılınamaz'}</Text>
              </View>
              {presence.kind === 'room' && <Text style={styles.presenceGo}>Git</Text>}
            </Pressable>
          )}
        </View>

        <View onLayout={(e) => setTabY(e.nativeEvent.layout.y)}>
          <TabBar tabs={tabs} tab={tab} onChange={setTab} />
        </View>

        {tab === 'profil' && (
          <View>
            {isMe ? (
              <View style={styles.section}>
                <Pressable onPress={openEdit}>
                  <LinearGradient colors={[colors.primary, '#38BDF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rewardCard}>
                    <View style={styles.row}>
                      <Text style={styles.rewardTitle}>Ödül Kazan</Text>
                      <View style={{ flex: 1 }} />
                      <View style={styles.editPill}>
                        <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 13 }}>Profili Düzenle</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.primaryText} />
                      </View>
                    </View>
                    <View style={[styles.row, { marginTop: 10 }]}>
                      <Text style={styles.rewardSub}>Tamamlanma Oranı</Text>
                      <View style={styles.rewardTrack}>
                        <View style={[styles.rewardFill, { width: `${completion}%` }]} />
                      </View>
                      <Text style={styles.rewardPct}>{completion}%</Text>
                    </View>
                  </LinearGradient>
                </Pressable>
                <PrivateStats
                  coins={coins}
                  diamonds={diamonds}
                  vipUntil={vipUntil}
                  wealthXp={wealthXp}
                  charmXp={charmXp}
                  giftsSent={stats.giftsSent}
                  // Live mode: gifts I received aren't all known on this phone (Gelir has them).
                  giftsReceived={live ? null : giftTotal}
                />
              </View>
            ) : (
              <View style={styles.section}>
                <FanClubCard name={user.name} club={club} />
              </View>
            )}
            <Band />

            {/* Live mode: album photos stay on this phone (not on the server), so no album there yet. */}
            {!live && (
              <>
                <View style={styles.section}>
                  <SectionTitle title={`Albüm${isMe ? ` · ${me.photos?.length ?? 0}/${LIMITS.photos}` : ''}`} onPress={() => setTab('dinamik')} />
                  {album.length > 0 || isMe ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {isMe && (me.photos?.length ?? 0) < LIMITS.photos && (
                        <Pressable style={[styles.photo, styles.addPhoto]} onPress={() => pickPhoto(true)} accessibilityLabel="Albüme fotoğraf ekle">
                          <Ionicons name="add" size={30} color={colors.textDim} />
                          <Text style={styles.meta}>Fotoğraf ekle</Text>
                        </Pressable>
                      )}
                      {album.map((p) => (
                        <View key={p}>
                          <Image source={{ uri: p }} style={styles.photo} />
                          {isMe && me.photos?.includes(p) && (
                            <Pressable
                              style={styles.removePhoto}
                              hitSlop={6}
                              onPress={() => updateMe({ photos: (me.photos ?? []).filter((x) => x !== p) })}
                              accessibilityLabel="Fotoğrafı kaldır"
                            >
                              <Ionicons name="close" size={14} color="#fff" />
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <InfoBox icon="image" text={isMe ? 'Serbest paylaş, ama kendi kurallarına göre' : 'Henüz albüm fotoğrafı yok.'} />
                  )}
                </View>
                <Band />
              </>
            )}

            {!isMe && (
              <>
                <View style={styles.section}>
                  <SimilarityCard sim={similarity(me, user)} name={user.name} />
                </View>
                <Band />
              </>
            )}

            {/* Only what is filled in (live mode: the interests; the server keeps no height, job or zodiac). */}
            {hasPersonal && (
              <>
                <View style={styles.section}>
                  <SectionTitle title="Kişisel profil" />
                  <View style={styles.chips}>
                    {extras.height > 0 && <Chip icon="resize-outline" label={`${extras.height}cm`} />}
                    {extras.weight > 0 && <Chip icon="barbell-outline" label={`${extras.weight}kg`} />}
                    {!!extras.job && <Chip icon="briefcase-outline" label={extras.job} />}
                    {extras.languages.length > 0 && <Chip icon="language-outline" label={extras.languages.join('、')} />}
                    {!!extras.zodiac && <Chip icon="star-outline" label={extras.zodiac} />}
                    {user.interests?.map((i) => (
                      <Chip key={i} label={i} />
                    ))}
                  </View>
                </View>
                <Band />
              </>
            )}

            {/* Live mode: no slogan on the server, so no sample one for me either. */}
            {(extras.slogan || (isMe && !live)) && (
              <>
                <View style={styles.section}>
                  <SectionTitle title="Arkadaşlık Sloganı" onPress={isMe ? openEdit : undefined} />
                  <InfoBox icon="heart" text={extras.slogan ?? 'Bir soruyu yanıtla, seninle aynı frekansta olan biriyle tanış.'} />
                </View>
                <Band />
              </>
            )}

            <View style={styles.section}>
              <SectionTitle
                title="Doğrulama"
                onPress={
                  isMe && !user.verified ? () => showAlert('Doğrulama gerekli', 'Selfie ile gerçek kişi doğrulaması yap; profilinde mavi rozet görünür.') : undefined
                }
              />
              <InfoBox
                icon="shield-checkmark"
                text={user.verified ? 'Gerçek kişi doğrulandı · mavi rozet aktif' : isMe ? 'Bir kere doğrula, kalıcı bağlantı' : 'Bu kullanıcı henüz doğrulanmadı.'}
              />
            </View>
            <Band />

            {extras.tags.length > 0 && (
              <>
                <View style={styles.section}>
                  <SectionTitle title="Kişilik Etiketleri" />
                  <View style={styles.chips}>
                    {extras.tags.map((t) => (
                      <Chip key={t.label} emoji={t.emoji} label={t.label} />
                    ))}
                  </View>
                </View>
                <Band />
              </>
            )}

            {hasBasics && (
              <View style={styles.section}>
                <SectionTitle title="Temel Bilgiler" />
                <View style={styles.infoCard}>
                  {/* The 12-digit public ID is made from the demo id; the server has no such number. */}
                  {!live && (
                    <InfoRow icon="person-outline" label="ID">
                      <Pressable style={styles.row} onPress={copyId} hitSlop={6} accessibilityLabel="ID kopyala">
                        <Text selectable style={styles.infoValue}>
                          {displayId(user.id)}
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textDim} />
                      </Pressable>
                    </InfoRow>
                  )}
                  {!!user.username && (
                    <InfoRow icon="at-outline" label="Kullanıcı adı">
                      <Pressable style={styles.row} onPress={copyUsername} hitSlop={6} accessibilityLabel="Kullanıcı adını kopyala">
                        <Text selectable style={styles.infoValue}>
                          @{user.username}
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textDim} />
                      </Pressable>
                    </InfoRow>
                  )}
                  {showsGender && (
                    <InfoRow icon={user.gender === 'Kadın' ? 'female-outline' : 'male-outline'} label="Cinsiyet" hint={user.showGender === false ? 'Gizli · yalnızca sen görüyorsun, diğerleri sadece yaşını görür' : undefined}>
                      <Text style={styles.infoValue}>{user.gender}</Text>
                    </InfoRow>
                  )}
                  {country && (
                    <InfoRow icon="flag-outline" label="Ülke">
                      <Text style={styles.infoValue}>
                        {country.flag} {country.name}
                      </Text>
                    </InfoRow>
                  )}
                  {isMe && !!birthday && (
                    <InfoRow icon="gift-outline" label="Doğum Günü" hint="Yalnızca Sen Görebilirsin · diğerleri sadece yaşını görür">
                      <Text style={styles.infoValue}>{birthday}</Text>
                    </InfoRow>
                  )}
                  {!!user.joinedAt && (
                    <InfoRow icon="calendar-outline" label="Üyelik">
                      <Text style={styles.infoValue}>{new Date(user.joinedAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</Text>
                    </InfoRow>
                  )}
                  {!!extras.relationship && (
                    <InfoRow icon="heart-outline" label="İlişki Durumu">
                      <Text style={styles.infoValue}>{extras.relationship}</Text>
                    </InfoRow>
                  )}
                  {!!extras.education && (
                    <InfoRow icon="school-outline" label="Eğitim">
                      <Text style={styles.infoValue}>{extras.education}</Text>
                    </InfoRow>
                  )}
                </View>
              </View>
            )}
            {hasBasics && (showRoom || showAgency || !live) && <Band />}

            {/* Live mode: someone else's rooms are listed on the home screen; no sample room here. */}
            {showRoom && (
              <View style={styles.section}>
                <SectionTitle title="Oda" />
                {room ? (
                  <Pressable style={styles.roomCard} onPress={room.go}>
                    <Photo uri={room.cover} kind="cover" seed={room.title} style={styles.roomCover} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.roomTitle} numberOfLines={1}>
                        {room.title}
                      </Text>
                      <Text style={styles.meta} numberOfLines={2}>
                        {room.desc}
                      </Text>
                      {room.level !== null && (
                        <View style={styles.lvChip}>
                          <Text style={{ fontSize: 12 }}>{ROOM_LEVEL_ICONS[Math.min(room.level, ROOM_LEVEL_ICONS.length) - 1]}</Text>
                          <Text style={styles.lvText}>Lv.{room.level}</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                  </Pressable>
                ) : (
                  <InfoBox icon="mic" text="Henüz bir odası yok." />
                )}
              </View>
            )}
            {showRoom && (showAgency || !live) && <Band />}

            {/* Live mode: only my own agency, as the server has it; someone else's isn't on the server yet. */}
            {showAgency && <AffiliationSection title="Ajans" item={agency} empty={isMe ? 'Katıl' : 'Ajansı yok'} emptyHref={isMe ? '/ajans' : undefined} />}

            {/* Live mode: no Aile on the server yet. */}
            {!live && (
              <>
                <Band />
                <AffiliationSection title="Aile" item={kabile} empty={isMe ? 'Katıl' : 'Ailesi yok'} emptyHref={isMe ? '/aile' : undefined} />
              </>
            )}
          </View>
        )}

        {tab === 'dinamik' && (
          <View style={{ padding: 16, gap: 12 }}>
            {moments.length > 0 ? (
              moments.map((m) => <MomentItem key={m.id} moment={m} user={user} />)
            ) : (
              <View style={styles.empty}>
                <Art name="maskot-bos-durum-maskotu" size={88} />
                <Text style={styles.meta}>{isMe ? 'Henüz bir an paylaşmadın.' : 'Henüz paylaşım yok.'}</Text>
              </View>
            )}
            {isMe && <GradientButton title="bir an yayınla" icon="add-circle-outline" style={{ marginTop: 12, marginHorizontal: 24 }} onPress={() => router.push('/(tabs)/anlar')} />}
          </View>
        )}

        {tab === 'onur' && (
          <OnurTab
            userId={user.id}
            isMe={isMe}
            giftWall={giftWall}
            myRides={isMe ? COSMETICS.filter((c) => c.kind === 'ride' && inventory.has(c.id)).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })) : null}
          />
        )}

        {tab === 'iliski' && <BondsTab user={user} isMe={isMe} state={bondState} isBlocked={isBlocked} onMeetInvite={() => router.push('/oda/yeni')} />}
      </ScrollView>

      {/* Fixed top bar; collapses into a solid bar with the tabs once scrolled past the header. */}
      <View pointerEvents="box-none" style={[styles.topBar, collapsed && { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={[styles.topRow, { marginTop: insets.top }]}>
          <Pressable onPress={() => goBack()} style={[styles.iconBtn, collapsed && { backgroundColor: 'transparent' }]} accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={24} color={collapsed ? colors.text : '#fff'} />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            {collapsed ? user.name : ''}
          </Text>
          {isMe ? (
            <Pressable onPress={openEdit} style={[styles.iconBtn, onBar && styles.iconBtnBar]} accessibilityLabel="Profili düzenle">
              <Ionicons name="pencil" size={20} color={onBar ? colors.text : '#fff'} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setSheet('more')} style={[styles.iconBtn, onBar && styles.iconBtnBar]} accessibilityLabel="Diğer">
              <Ionicons name="ellipsis-horizontal" size={22} color={onBar ? colors.text : '#fff'} />
            </Pressable>
          )}
        </View>
        {collapsed && <TabBar tabs={tabs} tab={tab} onChange={setTab} />}
      </View>

      {!isMe && (
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          {/* Blocked: stays tappable to say why (like Mesaj and Hediye), but looks off. */}
          <Pressable
            style={[styles.followBtn, isFollowing && styles.followingBtn, (isBlocked || followBusy) && { opacity: 0.4 }]}
            onPress={follow}
            accessibilityLabel={isFollowing ? 'Takibi bırak' : 'Takip et'}
            accessibilityState={{ disabled: isBlocked, busy: followBusy }}
          >
            <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={20} color={isFollowing ? colors.text : '#fff'} />
            <Text style={[styles.followText, isFollowing && styles.followingText]}>{isFollowing ? 'Takipte' : 'Takip et'}</Text>
          </Pressable>
          <BarButton icon="chatbubble-ellipses" label="Mesaj" off={!can('message').ok} onPress={() => guard('message', () => router.push(`/sohbet/${user.id}`))} />
          {callsAvailable() && <BarButton icon="call" label="Ara" off={!can('voice').ok && !can('video').ok} onPress={() => (can('voice').ok || can('video').ok ? setSheet('call') : call('sesli'))} />}
          {giftable && <BarButton icon="gift" label="Hediye" highlight off={!can('gift').ok} onPress={() => guard('gift', () => setSheet('gift'))} />}
        </SafeAreaView>
      )}

      <ActionSheet
        visible={sheet === 'more'}
        title={user.name}
        onClose={() => setSheet('none')}
        options={[
          // Live mode: the server has no room invites yet (and my room there is not the demo's), so no invite that goes nowhere.
          ...(live ? [] : [{ label: 'Odama davet et', icon: 'mic-outline', onPress: inviteToRoom } satisfies SheetOption]),
          { label: 'Profili paylaş', icon: 'share-social-outline', onPress: () => shareLink(`${user.name} Similar Club'da, profiline göz at!`, `kullanici/${user.id}`) },
          // No username chosen yet: nothing to copy (not a bare "@").
          ...(user.username ? [{ label: 'Kullanıcı adını kopyala', icon: 'copy-outline', onPress: copyUsername } satisfies SheetOption] : []),
          {
            label: 'Şikâyet et',
            icon: 'flag-outline',
            onPress: () => report.start({ type: 'user', id: user.id, name: user.name, onBlock: isBlocked ? undefined : () => toggleBlock(user.id) }, () => setTimeout(() => setSheet('report'), 300)),
          },
          { label: isBlocked ? 'Engeli kaldır' : 'Engelle', icon: 'ban-outline', destructive: true, onPress: blockUser },
        ]}
      />
      <ActionSheet
        visible={sheet === 'report'}
        title="Şikayet sebebi"
        onClose={() => setSheet('none')}
        options={REPORT_REASONS.map((r) => ({
          label: r,
          onPress: () => {
            const no = createTicket('Şikâyet', `${user.name} (${user.id}) · ${r}`);
            logSafety('Şikâyet etti', user.id, `${r} · #${no}`);
            showAlert('Şikâyet alındı', `Talep #${no} · "${r}". İnceleme sonucu bildirim olarak gelir; durumu Destek ekranından izleyebilirsin.`);
          },
        }))}
      />
      {report.sheet}
      <ActionSheet
        visible={sheet === 'call'}
        title={`${user.name} ile arama`}
        onClose={() => setSheet('none')}
        options={[
          { label: `📞 Sesli arama · 🪙 ${Math.round(callPrice(user) / 2)}/dk${can('voice').ok ? '' : ' · kapalı'}`, onPress: () => call('sesli') },
          { label: `🎥 Görüntülü arama · 🪙 ${callPrice(user)}/dk${can('video').ok ? '' : ' · kapalı'}`, onPress: () => call('goruntulu') },
        ]}
      />
      {serverId && (
        <FollowListSheet
          visible={list !== null}
          title={list === 'following' ? (isMe ? 'Takip ettiklerin' : 'Takip edilenler') : isMe ? 'Takipçilerin' : 'Takipçiler'}
          empty={list === 'following' ? (isMe ? 'Henüz kimseyi takip etmiyorsun.' : 'Henüz kimseyi takip etmiyor.') : isMe ? 'Henüz takipçin yok.' : 'Henüz takipçisi yok.'}
          load={() => loadFollowList(list ?? 'followers', serverId)}
          onClose={() => setList(null)}
        />
      )}
      {giftable && <ProfileGiftSheet visible={sheet === 'gift'} name={user.name} gifts={giftChoices} coins={coins} svipLevel={svipLevel} onClose={() => setSheet('none')} onSend={sendGift} />}

      {editOpen && <EditSheet user={me} live={live} serverAge={serverAge} photoBusy={avatarBusy} onPhoto={() => pickPhoto(false)} onClose={() => setEditOpen(false)} onSave={saveEdit} />}

    </View>
  );
}

// --- Header pieces -------------------------------------------------------------

function Guardian({ guardian }: { guardian: { userId: string; points: number } | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const g = guardian ? userById(guardian.userId) : null;
  return (
    <Pressable
      style={styles.guardian}
      onPress={() =>
        g
          ? router.push(`/kullanici/${g.id}`)
          : showAlert('Fener Bekçisi', 'Bu profilin henüz bekçisi yok. Hayran kulübünde en çok destek veren kişi Fener Bekçisi olur.')
      }
      accessibilityLabel="Fener Bekçisi"
    >
      {g ? (
        <View style={styles.guardianRing}>
          <Photo uri={g.avatar} kind="face" style={styles.guardianImg} />
        </View>
      ) : (
        <View style={[styles.guardianRing, { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="person" size={34} color={colors.textDim} />
        </View>
      )}
      <LinearGradient colors={['#FDE68A', '#F59E0B', '#B45309']} style={styles.guardianLabel}>
        <Ionicons name="shield" size={10} color="#5B2A00" />
        <Text style={styles.guardianText}>BEKÇİ</Text>
      </LinearGradient>
      {g && guardian && (
        <Text style={[styles.meta, { fontSize: 12, marginTop: 4 }]} numberOfLines={1}>
          {g.name} · {(guardian.points / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K
        </Text>
      )}
    </Pressable>
  );
}

function TabBar({ tabs, tab, onChange }: { tabs: { id: Tab; label: string }[]; tab: Tab; onChange: (t: Tab) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            <View style={[styles.tabIndicator, !active && { backgroundColor: 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** n null: not known yet (live mode, before the server answered), shown as a dash. */
function Stat({ n, label, onPress }: { n: number | null; label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={onPress} disabled={!onPress} accessibilityLabel={n === null ? label : `${n.toLocaleString('tr-TR')} ${label}`}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{n === null ? '—' : n.toLocaleString('tr-TR')}</Text>
      <Text style={[styles.meta, { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

function BarButton({ icon, label, onPress, highlight, off }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; highlight?: boolean; off?: boolean }) {
  // "off" stays tappable so the reason can be shown, but looks disabled.
  const { colors, gradientDeep } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 2, opacity: off ? 0.4 : 1 }} accessibilityLabel={label} accessibilityState={{ disabled: off }}>
      {highlight ? (
        <LinearGradient colors={gradientDeep} style={styles.roundBtn}>
          <Ionicons name={icon} size={21} color="#fff" />
        </LinearGradient>
      ) : (
        <View style={styles.roundBtn}>
          <Ionicons name={icon} size={21} color={colors.text} />
        </View>
      )}
      <Text style={{ color: colors.textDim, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

// --- Profil tab pieces -----------------------------------------------------------

function Band() {
  const styles = useStyles();
  return <View style={styles.band} />;
}

function AffiliationSection({ title, item, empty, emptyHref }: { title: string; item: Affiliation | null; empty: string; emptyHref?: Href }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!item) return (
    <View style={styles.section}>
      <SectionTitle title={title} right={empty} onPress={emptyHref ? () => router.push(emptyHref) : undefined} />
    </View>
  );
  const go = item.href ? () => router.push(item.href!) : undefined;
  return (
    <View style={styles.section}>
      <SectionTitle title={title} onPress={go} />
      <Pressable style={styles.familyCard} onPress={go} disabled={!go} accessibilityLabel={`${title}: ${item.name}, ${item.sub}`}>
        <View style={styles.familyEmoji}>
          <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.roomTitle}>{item.name}</Text>
          <Text style={styles.meta}>{item.sub}</Text>
        </View>
        {go && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
      </Pressable>
    </View>
  );
}

function SectionTitle({ title, onPress, right }: { title: string; onPress?: () => void; right?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={styles.sectionHead} onPress={onPress} disabled={!onPress}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right && <Text style={[styles.meta, { marginRight: 2 }]}>{right}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
    </Pressable>
  );
}

function InfoBox({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.infoBox}>
      <LinearGradient colors={['#13D9DF', colors.primary]} style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color="#fff" />
      </LinearGradient>
      <Text style={{ color: dark ? '#E9E4FF' : colors.text, flex: 1, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

function Chip({ icon, emoji, label }: { icon?: keyof typeof Ionicons.glyphMap; emoji?: string; label: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.chip}>
      {icon && <Ionicons name={icon} size={15} color={colors.text} />}
      {emoji && <Text style={{ fontSize: 15 }}>{emoji}</Text>}
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, hint, children }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={19} color={colors.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text>
        {hint && (
          <View style={styles.row}>
            <Ionicons name="alert-circle-outline" size={12} color={colors.textDim} />
            <Text style={[styles.meta, { fontSize: 12 }]}>{hint}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function FanClubCard({ name, club }: { name: string; club: FanClub | undefined }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const [showHistory, setShowHistory] = useState(false);
  const points = club?.points ?? 0;
  const fan = fanLevel(points);
  return (
    <View style={styles.fanCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="heart" size={15} color={colors.pink} style={{ marginRight: 6 }} />
        <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>{name} hayran kulübü</Text>
        <Text style={{ color: colors.gold, fontWeight: '800' }}>
          Lv.{fan.index + 1} · {points} puan
        </Text>
      </View>
      <Text style={styles.meta}>
        {fan.current.name} · Ödül: {fan.current.reward}
      </Text>
      <View style={styles.track}>
        <View style={{ height: 6, backgroundColor: semantic.social, width: fan.next ? `${((points - fan.current.min) / (fan.next.min - fan.current.min)) * 100}%` : '100%' }} />
      </View>
      <Text style={styles.meta}>{fan.next ? `Sonraki: ${fan.next.name} (${fan.next.min} puan) → ${fan.next.reward}` : 'En üst kulüp seviyesi'}</Text>
      <Text style={styles.meta}>Puan kazan: takip et (+10), odasına katıl (+5), odada kal (+2/dk), görevler; hediye zorunlu değil.</Text>
      <Pressable onPress={() => setShowHistory((v) => !v)}>
        <Text style={{ color: colors.pink, fontWeight: '700', fontSize: 12 }}>{showHistory ? 'Puan geçmişini gizle' : 'Puan geçmişi'}</Text>
      </Pressable>
      {showHistory &&
        (club?.history.length ? (
          club.history.map((h, i) => (
            <Text key={`${h.time}-${i}`} style={styles.meta}>
              {h.time} · {h.text} · +{h.pts}
            </Text>
          ))
        ) : (
          <Text style={styles.meta}>Henüz puan yok.</Text>
        ))}
      <Text style={[styles.meta, { fontSize: 12 }]}>Seviyeler: {FAN_LEVELS.map((l) => l.name).join(' → ')}</Text>
    </View>
  );
}

function MomentItem({ moment, user }: { moment: Moment; user: User }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.moment}>
      <View style={styles.row}>
        <Avatar uri={user.avatar} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{user.name}</Text>
          <Text style={[styles.meta, { fontSize: 12 }]}>{moment.time}</Text>
        </View>
      </View>
      <Text style={{ color: colors.text, fontSize: 15 }}>{moment.text}</Text>
      {moment.image && <Image source={{ uri: moment.image }} style={styles.momentImg} />}
      <View style={[styles.row, { gap: 16 }]}>
        <View style={styles.row}>
          <Ionicons name="heart-outline" size={16} color={colors.textDim} />
          <Text style={styles.meta}>{moment.likes}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.textDim} />
          <Text style={styles.meta}>{moment.comments}</Text>
        </View>
      </View>
    </View>
  );
}

// --- Vitrin (onur) tab ----------------------------------------------------------------------

function WallBanner({ title, colors: bg, right, onPress, subtitle, children }: { title: string; colors: readonly [ColorValue, ColorValue, ...ColorValue[]]; right: ReactNode; onPress?: () => void; subtitle?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wall}>
        <View style={styles.wallHead}>
          <View style={{ flex: 1 }} />
          <LinearGradient colors={['#FEF3C7', '#FBBF24']} style={styles.wallRibbon}>
            <Text style={styles.wallTitle}>{title}</Text>
          </LinearGradient>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>{right}</View>
        </View>
        {subtitle && <Text style={styles.wallSub}>{subtitle}</Text>}
        {children}
      </LinearGradient>
    </Pressable>
  );
}

function Pedestals({ items, tint }: { items: { id: string; emoji: string; name: string }[]; tint: string }) {
  const styles = useStyles();
  const slots = [0, 1, 2, 3].map((i) => items[i] ?? null);
  return (
    <View style={styles.pedestals}>
      {slots.map((it, i) => (
        <View key={it?.id ?? `empty-${i}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 30, opacity: it ? 1 : 0 }}>{it?.emoji ?? '·'}</Text>
          <View style={[styles.pedestal, { backgroundColor: tint }]} />
          <Text style={styles.pedestalName} numberOfLines={1}>
            {it?.name ?? ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OnurTab({ userId, isMe, giftWall, myRides }: { userId: string; isMe: boolean; giftWall: (Gift & { count: number })[]; myRides: { id: string; emoji: string; name: string }[] | null }) {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  const medals = medalsOf(userId);
  const titles = titlesOf(userId);
  const rides = myRides ?? vehiclesOf(userId).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }));
  const lit = giftWall.filter((g) => g.count > 0).length;
  const gold = medals.filter((m) => m.tier === 'gold').length;
  const collections = GIFT_COLLECTIONS.map((c) => ({ ...c, done: collectionProgress(userId, c) }));
  const doneCollections = collections.filter((c) => c.done >= c.total).length;
  const explain = (title: string, body: string) => () => showAlert(title, body);

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <WallBanner
        title="Madalyalar"
        colors={['#B45309', '#F59E0B', '#92400E']}
        onPress={explain('Madalyalar', isMe ? 'Etkinliklere katılarak ve görevleri tamamlayarak madalya kazan.' : `${medals.length} madalya kazanılmış.`)}
        right={
          <>
            <Text style={styles.wallCount}>🏅 {gold}</Text>
            <Text style={styles.wallCount}> 🥈 {medals.length - gold}</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <Pedestals items={medals} tint="rgba(254,243,199,0.45)" />
      </WallBanner>

      <WallBanner
        title="Unvanlar"
        colors={['#0B3B4A', '#087A80', '#0B3B4A']}
        subtitle="Yalnızca dinamik unvanları göster"
        onPress={explain('Unvanlar', 'Sıralamalarda ve etkinliklerde derece yaparak unvan kazan.')}
        right={
          <>
            <Text style={styles.wallCount}>{titles.length}</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <View style={styles.titleGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const t = titles[i];
            return t ? (
              <LinearGradient key={t.id} colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleSlot}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {t.name}
                </Text>
              </LinearGradient>
            ) : (
              <View key={`slot-${i}`} style={[styles.titleSlot, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
            );
          })}
        </View>
      </WallBanner>

      <WallBanner
        title="Binekler"
        colors={['#7F1D1D', '#DC2626', '#7F1D1D']}
        onPress={() => router.push('/magaza')}
        right={
          <>
            <Text style={styles.wallCount}>Satın al</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <Pedestals items={rides} tint="rgba(254,202,202,0.4)" />
      </WallBanner>

      <View style={[styles.sectionHead, { marginTop: 6 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 18 }]}>Hediye Koleksiyonu</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.meta}>
          Toplanan <Text style={{ color: colors.text, fontWeight: '800' }}>{lit}</Text>/{GIFTS.length}
        </Text>
      </View>
      <View style={styles.giftWall}>
        {giftWall.map((g) => (
          <View key={g.id} style={styles.giftCell}>
            <GiftArt giftId={g.id} emoji={g.emoji} size={34} style={{ opacity: g.count > 0 ? 1 : 0.25 }} textStyle={{ fontSize: 26, opacity: g.count > 0 ? 1 : 0.25 }} />
            <Text style={[styles.meta, { fontSize: 12 }]} numberOfLines={1}>
              {g.name}
            </Text>
            <Text style={{ color: g.count > 0 ? colors.gold : colors.textDim, fontSize: 12, fontWeight: '700' }}>x{g.count}</Text>
          </View>
        ))}
      </View>

      <View style={styles.catalog}>
        <View style={styles.sectionHead}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Hediye Kataloğu</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.meta}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{doneCollections}</Text>/{collections.length}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {collections.map((c) => (
            <LinearGradient key={c.id} colors={c.done > 0 ? c.colors : dark ? ['#3F3A52', '#1F1B2E'] : ['#E9EFF7', '#D5DEEA']} style={styles.collection}>
              <Text style={{ fontSize: 44, opacity: c.done > 0 ? 1 : 0.4 }}>{c.emoji}</Text>
              <Text style={[styles.collectionName, c.done === 0 && styles.collectionNameLocked]} numberOfLines={2}>
                {c.name}
              </Text>
              <View style={styles.collectionBar}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                  {c.done}/{c.total}
                </Text>
              </View>
            </LinearGradient>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// --- Sheets ----------------------------------------------------------------------------

const GENDERS: [User['gender'] | 'hidden', string][] = [
  ['Kadın', 'Kadın'],
  ['Erkek', 'Erkek'],
  ['hidden', 'Belirtmek istemiyorum'],
];
// Live mode: the server keeps Kadın or Erkek (or nothing yet); hiding it is a demo-only choice.
const LIVE_GENDERS = GENDERS.filter(([g]) => g !== 'hidden');

/** What the edit form hands back: what the server takes, plus the demo-only country and gender visibility. */
type EditResult = ProfileEdit & { country: string; showGender: boolean };

function EditSheet({
  user,
  live,
  serverAge,
  photoBusy,
  onSave,
  onClose,
  onPhoto,
}: {
  user: User;
  live: boolean;
  /** Live mode: my age as the server has it; a number means my birth date is already set there. */
  serverAge: number | null;
  photoBusy: boolean;
  /** Saves; true once saved (the caller closes the sheet and says so), false to stay here. */
  onSave: (e: EditResult) => Promise<boolean>;
  onClose: () => void;
  onPhoto: () => void;
}) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username ?? '');
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState(user.city);
  // The birth date is set once (sign-up or here, the first time) and never again: the server refuses a second one.
  const birthLocked = live ? serverAge !== null || !!user.birthDate : !!user.birthDate;
  const [birth, setBirth] = useState(birthLocked ? '' : formatTrDate(user.birthDate));
  const [gender, setGender] = useState<User['gender'] | 'hidden'>(!live && user.showGender === false ? 'hidden' : user.gender);
  const [country, setCountry] = useState(user.country ?? 'TR');
  const [interests, setInterests] = useState<string[]>(user.interests ?? []);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    // Same rules the server applies; nothing is saved while any field is invalid.
    const draft = { name, username, bio, city, birth };
    const e = validateProfile(draft);
    // A birth date already set isn't sent again; one not entered yet stays optional.
    if (birthLocked || !birth.trim()) delete e.birth;
    // Live mode: an account may have no username yet; leaving it empty keeps it that way.
    if (live && !username.trim() && !user.username) delete e.username;
    setErrors(e);
    noteProfileRefusal(draft, e);
    // The contact note can come from several fields; it is said once.
    if (Object.keys(e).length) return showAlert('Profil kaydedilemedi', [...new Set(Object.values(e))].join('\n'));
    setSaving(true);
    const ok = await onSave({
      name,
      username,
      bio,
      city,
      interests,
      country,
      gender: gender === 'hidden' ? undefined : gender,
      showGender: gender !== 'hidden',
      birthDate: birthLocked ? undefined : (parseTrDate(birth) ?? undefined),
    });
    if (!ok) setSaving(false);
  };
  const toggleInterest = (i: string) =>
    setInterests((l) => (l.includes(i) ? l.filter((x) => x !== i) : l.length >= LIMITS.interests ? l : [...l, i]));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Android draws edge to edge: without this the keyboard covers the fields (and the nav bar the buttons). */}
      <KeyboardAvoid style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={[styles.modalSheet, { maxHeight: '88%', paddingBottom: Math.max(34, insets.bottom + 8) }]}>
          <Text style={styles.modalTitle}>Profili düzenle</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <Pressable style={[styles.row, { gap: 12, marginTop: 4 }]} onPress={onPhoto} disabled={photoBusy} accessibilityLabel="Profil fotoğrafını değiştir" accessibilityState={{ busy: photoBusy }}>
              <Avatar uri={user.avatar} size={56} />
              <Text style={{ color: semantic.tonalText, fontWeight: '800' }}>{photoBusy ? 'Fotoğraf yükleniyor…' : 'Fotoğrafı değiştir'}</Text>
            </Pressable>
            <Field label="Görünen ad" error={errors.name}>
              <TextInput value={name} onChangeText={setName} maxLength={LIMITS.name} style={styles.input} placeholder="Adın veya takma adın" placeholderTextColor={colors.textDim} />
            </Field>
            <Field label="Kullanıcı adı" error={errors.username} hint={live ? 'Benzersiz olmalı.' : 'Benzersiz olmalı. ID numaran değişmez.'}>
              <View style={[styles.row, styles.input, { paddingVertical: 0 }]}>
                <Text style={{ color: colors.textDim, fontSize: 15 }}>@</Text>
                <TextInput value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={20} style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 }} placeholder="kullanici.adi" placeholderTextColor={colors.textDim} />
              </View>
            </Field>
            <Field label={`Hakkımda · ${bio.length}/${LIMITS.bio}`} error={errors.bio}>
              <TextInput value={bio} onChangeText={setBio} maxLength={LIMITS.bio} multiline style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Kendini anlat" placeholderTextColor={colors.textDim} />
            </Field>
            {birthLocked ? (
              <Field label="Doğum tarihi" hint="Doğum tarihi bir kez girilir; değiştirmek için destekle iletişime geç. Diğerleri yalnızca yaşını görür.">
                <View style={[styles.row, styles.input]}>
                  <Ionicons name="lock-closed" size={14} color={colors.textDim} />
                  <Text style={{ color: colors.textDim, fontSize: 15 }}>{user.birthDate ? formatTrDate(user.birthDate) : `${serverAge ?? user.age} yaş`}</Text>
                </View>
              </Field>
            ) : (
              <Field label="Doğum tarihi" error={errors.birth} hint="Bir kez girilir, sonra değiştirilemez. Yalnızca sen görürsün; diğerleri sadece yaşını görür.">
                <TextInput value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} placeholder="GG.AA.YYYY" placeholderTextColor={colors.textDim} />
              </Field>
            )}
            <Field label="Cinsiyet (isteğe bağlı)">
              <ChipRow value={gender} options={live ? LIVE_GENDERS : GENDERS} onChange={setGender} />
            </Field>
            {/* Live mode: the server keeps no country. */}
            {!live && (
              <Field label="Ülke">
                <ChipRow value={country} options={COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => [c.code, `${c.flag} ${c.name}`] as [string, string])} onChange={setCountry} />
              </Field>
            )}
            <Field label="Şehir (isteğe bağlı)" error={errors.city} hint="Boş bırakırsan profilinde şehir görünmez.">
              <TextInput value={city} onChangeText={setCity} maxLength={LIMITS.city} style={styles.input} placeholder="Şehir" placeholderTextColor={colors.textDim} />
            </Field>
            <Field label={`İlgi alanları · ${interests.length}/${LIMITS.interests}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {INTERESTS.map((i) => (
                  <Pressable key={i} onPress={() => toggleInterest(i)} style={[styles.editChip, interests.includes(i) && styles.editChipOn]} accessibilityState={{ selected: interests.includes(i) }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>{i}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </ScrollView>
          <View style={[styles.row, { gap: 10, marginTop: 12 }]}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={{ color: colors.textDim, fontWeight: '700' }}>Vazgeç</Text>
            </Pressable>
            <Button title={saving ? 'Kaydediliyor…' : 'Kaydet'} style={{ flex: 1 }} disabled={saving} onPress={save} />
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={[styles.meta, { fontSize: 12, marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

function ChipRow<T extends string | undefined>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.editChip, value === v && styles.editChipOn]}>
          <Text style={{ color: colors.text, fontSize: 13 }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Owner-only numbers: balances, VIP end date and XP never appear on profiles others open. */
/** giftsReceived null: not known on this phone (live mode; Gelir lists them), so only the sent count shows. */
function PrivateStats(p: { coins: number; diamonds: number; vipUntil: string | null; wealthXp: number; charmXp: number; giftsSent: number; giftsReceived: number | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const n = (x: number) => x.toLocaleString('tr-TR');
  return (
    <View style={styles.privateCard}>
      <View style={styles.row}>
        <Ionicons name="lock-closed" size={14} color={colors.textDim} />
        <Text style={[styles.meta, { fontSize: 12 }]}>Yalnızca sen görürsün</Text>
      </View>
      <View style={styles.privateRow}>
        <Pressable style={styles.privateCell} onPress={() => router.push('/cuzdan')} accessibilityLabel="Jeton bakiyesi">
          <Icon3D name="coin" size={26} />
          <Text style={styles.privateValue}>{n(p.coins)}</Text>
          <Text style={styles.meta}>Jeton</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/gelir')} accessibilityLabel="Elmas bakiyesi">
          <Icon3D name="diamond" size={26} />
          <Text style={styles.privateValue}>{n(p.diamonds)}</Text>
          <Text style={styles.meta}>Elmas</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/vip')} accessibilityLabel="VIP durumu">
          <Icon3D name="crown" size={26} />
          <Text style={styles.privateValue} numberOfLines={1}>
            {p.vipUntil ?? 'Yok'}
          </Text>
          <Text style={styles.meta}>{p.vipUntil ? 'VIP bitişi' : 'VIP'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/seviye')} accessibilityLabel="Seviye ve deneyim puanı">
        <Text style={styles.meta}>
          Cömertlik puanı {n(p.wealthXp)} · Yankı puanı {n(p.charmXp)} · Hediye: {n(p.giftsSent)} gönderdin{p.giftsReceived === null ? '' : `, ${n(p.giftsReceived)} aldın`} ›
        </Text>
      </Pressable>
    </View>
  );
}


const useStyles = makeStyles(({ colors, semantic, lift, ink, dark }) => ({
  cover: { width: '100%', height: 240, backgroundColor: colors.card },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -26, paddingHorizontal: 16, paddingBottom: 6 },
  avatarWrap: { marginTop: -48, alignSelf: 'flex-start', borderRadius: 60, borderWidth: 3, borderColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 26, fontWeight: '900', flexShrink: 1 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  flagText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  genderText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vSep: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 4 },
  meta: { color: colors.textDim, fontSize: 13 },
  bio: { color: dark ? '#E9E4FF' : colors.text, fontSize: 16, flexShrink: 1 },
  bioEdit: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, paddingVertical: 10, marginTop: 14, ...lift },
  guardian: { width: 96, alignItems: 'center', paddingTop: 14 },
  guardianRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: semantic.money, overflow: 'hidden' },
  guardianImg: { width: '100%', height: '100%' },
  guardianLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -12, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#FEF3C7' },
  guardianText: { color: '#5B2A00', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', gap: 26, height: TAB_H, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, gap: 5 },
  tabText: { color: colors.textDim, fontSize: 17, fontWeight: '600' },
  tabTextActive: { color: colors.text, fontSize: 19, fontWeight: '900' },
  tabIndicator: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  topTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  iconBtnBar: { backgroundColor: ink(0.06) },
  band: { height: 8, backgroundColor: dark ? 'rgba(0,0,0,0.28)' : ink(0.045) },
  section: { padding: 16, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: colors.textDim, fontSize: 16, fontWeight: '800' },
  rewardCard: { borderRadius: 18, padding: 14 },
  rewardTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  rewardSub: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rewardTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  rewardFill: { height: 6, backgroundColor: '#fff', borderRadius: 3 },
  rewardPct: { color: '#fff', fontWeight: '900', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, ...lift },
  infoIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, ...lift },
  infoCard: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 6, ...lift },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 10, ...lift },
  roomCover: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.cardAlt },
  roomTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  lvChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: dark ? 'rgba(34,197,94,0.18)' : 'rgba(21,128,61,0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lvText: { color: colors.green, fontWeight: '800', fontSize: 12 },
  familyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 12, ...lift },
  familyEmoji: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  fanCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: dark ? 'rgba(255,101,118,0.4)' : 'rgba(200,48,74,0.26)', ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  photo: { width: 110, height: 110, borderRadius: 12 },
  addPhoto: { backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  removePhoto: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(8,15,30,0.75)', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  reviewNote: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  handle: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  staffChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#B91C1C', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  statusNote: { color: colors.gold, fontSize: 13, marginTop: 8 },
  privateCard: { backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, ...(dark ? { borderWidth: 1, borderColor: colors.border } : lift) },
  privateRow: { flexDirection: 'row', gap: 8 },
  privateCell: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 10 },
  privateValue: { color: colors.text, fontWeight: '900', fontSize: 15 },
  fieldError: { color: semantic.danger, fontSize: 12, marginTop: 4, fontWeight: '600' },
  editChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  editChipOn: { borderColor: dark ? semantic.action : semantic.actionText, backgroundColor: dark ? 'rgba(19,217,223,0.18)' : 'rgba(0,140,148,0.11)' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
  moment: { backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, ...lift },
  momentImg: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.cardAlt },
  wall: { borderRadius: 14, padding: 12, paddingTop: 0, borderWidth: 1, borderColor: 'rgba(254,243,199,0.5)', overflow: 'hidden' },
  wallHead: { flexDirection: 'row', alignItems: 'center' },
  wallRibbon: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingHorizontal: 18, paddingVertical: 6 },
  wallTitle: { color: '#78350F', fontWeight: '900', fontSize: 16 },
  wallSub: { color: '#fff', textAlign: 'center', marginTop: 8, fontSize: 13 },
  wallCount: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pedestals: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pedestal: { width: '90%', height: 14, borderRadius: 4 },
  pedestalName: { color: '#fff', fontSize: 11, fontWeight: '600' },
  titleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'space-between' },
  titleSlot: { width: '31%', height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  titleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  giftWall: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card, borderRadius: 16, padding: 8, ...lift },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 8, gap: 1 },
  catalog: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 12, ...lift },
  collection: { width: 120, height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'flex-end', padding: 8, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  collectionName: { color: semantic.money, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  collectionNameLocked: dark ? {} : { color: colors.textDim },
  collectionBar: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  relCard: { borderRadius: 22, padding: 14, ...(dark ? { borderWidth: 1, borderColor: colors.border } : lift) },
  relIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : ink(0.06), alignItems: 'center', justifyContent: 'center' },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: dark ? 'rgba(0,0,0,0.3)' : ink(0.06), borderRadius: 999, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontWeight: '800', fontSize: 15 },
  relRow: { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : colors.card, borderRadius: 16, padding: 12, paddingTop: 22, ...lift },
  relLv: { position: 'absolute', top: 6, left: 8, backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  relLvText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  relPair: { flexDirection: 'row', alignItems: 'center' },
  relName: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: 90 },
  daysPill: { marginTop: -8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  wedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  pendingRow: { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : colors.card, borderRadius: 12, padding: 8, gap: 10, ...lift },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : colors.card, borderRadius: 16, padding: 14, ...lift },
  slotNo: { color: colors.pink, fontSize: 15, fontWeight: '700', width: 16, textAlign: 'center' },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  followBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 23, backgroundColor: semantic.socialFill },
  followingBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  followText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  followingText: { color: colors.text },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...lift },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  inputLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.cardAlt, alignItems: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: dark ? 'rgba(19,217,223,0.15)' : 'rgba(0,140,148,0.09)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: dark ? '#0FB8BE' : 'rgba(0,117,123,0.4)' },
  presenceGo: { color: '#fff', fontWeight: '800', backgroundColor: '#0FB8BE', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, overflow: 'hidden' },
}));
