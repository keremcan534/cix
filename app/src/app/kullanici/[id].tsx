import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { GiftArt } from '@/components/GiftArt';
import { FollowListSheet, MY_LISTS } from '@/components/follow-list-sheet';
import { Avatar, Button, FramedAvatar, GradientButton, LevelChips, VerifiedBadge, VipBadge, VipTitle } from '@/components/ui';
import { COSMETICS, FAN_LEVELS, cosmeticById, fanLevel, roomLevel } from '@/data/catalog';
import { callPrice } from '@/data/economy';
import { FOLLOWS_ME, INTERESTS, MOMENTS, ROOMS, userById, type Gift, type Moment, type Room, type User } from '@/data/mock';
import { giftById, giftMarkOf, giftShelf, useLiveCatalog } from '@/lib/live/catalog-live';
import { EMPTY_AREA, loadGuardArea, sendGuardCard } from '@/lib/live/guard';
import { GUARD_CARD, guardPoints, type GuardArea } from '@/lib/guard-core';
import { splitInterest } from '@/components/person-showcase';
import {
  CardHead,
  CompletionCard,
  ConnectionCounts,
  EditButton,
  EditShareRow,
  GiftWall,
  GuardWall,
  InfoCard,
  InfoLine,
  InfoTable,
  LineValue,
  LinkCard,
  PCard,
  PChip,
  RelationWall,
  RoomBanner,
  SectionLabel,
  ShowcaseStrip,
  StatBar,
  type GuardEntry,
} from '@/components/profile-design';
import { CoverPhoto } from '@/components/cover-photo';
import { bondDays } from '@/data/bonds';
import { privacyOf } from '@/data/privacy';
import { countryArt } from '@/data/rooms-ui';
import { COUNTRIES } from '@/data/social-ui';
import {
  GIFT_COLLECTIONS,
  collectionProgress,
  displayId,
  giftWallOf,
  publicIdOf,
  guardianOf,
  medalsOf,
  profileCompletion,
  profileExtras,
  titlesOf,
  type ProfileExtras,
  vehiclesOf,
  wealthCharmOf,
} from '@/data/profile';
import { followRoute, presenceOf, type Presence } from '@/data/presence';
import { showAlert } from '@/lib/alert';
import { callsAvailable, liveCalls, liveGift, liveMode, loadRooms, message, toServer } from '@/lib/live';
import { callLabel, callPair, heartOf, usePair } from '@/components/one-on-one-bar';
import { HeartCard, HeartPin } from '@/components/heart-level';
import { loadMyList } from '@/lib/live/follows';
import { splitTies, tieCounts, tiesOf, type TieSide } from '@/lib/follow-ties';
import { agoText, feed as momentFeed } from '@/lib/live/moments';
import { addAlbumPhoto, followOnServer, loadMe, loadPublicProfile, loadShowcase, profilePatch, removeAlbumPhoto, saveMyExtras, saveMyProfile, uploadAvatar, type ProfileEdit, type SocialCounts } from '@/lib/live/profile';
import { lookOf, useLooks } from '@/lib/live/looks';
import { cityDistanceText, distanceOf } from '@/lib/live/distances';
import { MEDAL_HOWTO, TITLE_HOWTO, draftFromExtras, extrasFromServer, noteExtrasRefusal, showcaseView, validateExtras, type ExtrasDraft, type ShowcaseView } from '@/lib/profile-more';
import { ProfileExtrasForm } from '@/components/profile-extras-form';
import { PostSkeleton, Skeletons } from '@/components/fx/skeleton';
import { LoadError } from '@/components/load-error';
import { copyText } from '@/lib/clipboard';
import { goBack } from '@/lib/nav';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { checkInteraction, type Action } from '@/lib/interaction';
import { shareLink } from '@/lib/links';
import { LIMITS, ageFrom, birthShown, formatTrDate, noteProfileRefusal, parseTrDate, validateProfile, type ProfileErrors } from '@/lib/profile-rules';
import { similarity } from '@/lib/similarity';
import { SimilarityCard } from '@/components/similarity';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ProfileGiftSheet } from '@/components/profile-gift-sheet';
import { useGiftStage } from '@/components/fx/gift-stage';
import { FEMALE_FILL, GenderChip, MALE_FILL, useAffiliations, useStaffBadge, type Affiliation } from '@/components/profile-badges';
import { Icon3D } from '@/components/Icon3D';
import { roomLevelArt } from '@/components/RoomArt';
import { useApp, type FanClub } from '@/store';
import { SCRIM, fonts, glass, makeStyles, useTheme } from '@/theme';
import { Art, type ArtName } from '@/components/Art';
import { useReport } from '@/components/report-sheet';
import { BondBadge, BondFrame, BondsTab, shownTopBond, useBonds } from '@/components/bonds';
import { MarkLayer, OwnMarkNote } from '@/components/profile-mark';
import { keepingMarks, keptLine, parseMarkNote } from '@/lib/profile-marks';
import { photoMarksOf } from '@/lib/live/marks-live';
import { serverNow } from '@/lib/sanction-time';
import { VoiceCard, VoiceRecorderSheet } from '@/components/voice-intro';
import { PrivateAlbumCard } from '@/components/private-album';
import { removeVoiceIntro, saveVoiceIntro } from '@/lib/live/voice-intro';
import { dropDemoVoice, keepDemoVoice, useDemoVoice } from '@/lib/voice-intro-store';
import type { VoiceIntro } from '@/lib/voice-intro-core';

// The app's own mark (the sign-in screen's), beside its name in the top bar.
const LOGO = require('../../../assets/brand/logo.png');

const REPORT_REASONS = ['Sahte profil', 'Taciz / hakaret', 'Uygunsuz içerik', 'Dolandırıcılık', 'Reşit değil'];

type Tab = 'profil' | 'dinamik' | 'onur' | 'iliski';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profil', label: 'Profil' },
  { id: 'dinamik', label: 'Anlar' },
  { id: 'onur', label: 'Vitrin' },
  { id: 'iliski', label: 'Bağlar' },
];
type Sheet = 'none' | 'more' | 'report' | 'call' | 'gift';
/** My Takip ettiklerim / Takipçilerim (friends are Mesajlar › Arkadaşlarım). */
type OneWay = Exclude<TieSide, 'friends'>;
// The clock read at render for day counts (react-hooks/purity allows a named helper).
const nowMs = () => Date.now();
const NO_SHOWCASE = showcaseView({ gifts: [], rides: [], entries: [], medals: [], titles: [] });
const BAR_H = 52;
const TAB_H = 48;

export default function UserProfile() {
  // `tab`: the part a wall link opens (the room's person card: Bağlar, Vitrin).
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const {
    me, following, toggleFollow, takeServerSocial, blocked, toggleBlock, createTicket, fanClubs, addFanPoints, myRoom, notify, updateMe, spendCoins, spendBlock, bump, settings, vipLevel, svipLevel, equipped, inventory, giftWall: wallOf, recordGift,
    coins, diamonds, wealthXp, charmXp, wealthLevel, charmLevel, vipDays, vipSubUntil, stats, logSafety, pendingAvatar, submitAvatar,
  } = useApp();
  // Gifts the owner hid in Canlı ayarlar are not offered here (the wall below still counts every gift).
  const giftChoices = giftShelf(useLiveCatalog());
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
  // Ses tanıtımı: live, the server's (absent from an older server: no card, no invitation); the demo keeps mine here.
  const demoVoice = useDemoVoice();
  const voice = live ? (counts?.voice ?? null) : isMe ? demoVoice : null;
  const voiceShown = live ? counts?.voice !== undefined : isMe;
  const [voiceOpen, setVoiceOpen] = useState(false);
  const setLiveVoice = (v: VoiceIntro | null) => setSocial((x) => (x && x.id === serverId ? { ...x, counts: { ...x.counts, voice: v } } : x));
  const saveVoice = async (uri: string, ms: number) => (live ? setLiveVoice(await saveVoiceIntro(uri)) : keepDemoVoice(uri, ms));
  const removeVoice = async () => (live ? setLiveVoice(await removeVoiceIntro()) : dropDemoVoice());
  const user = isMe ? me : userById(id);
  const insets = useSafeAreaInsets();
  const { colors, semantic } = useTheme();
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
      loadPublicProfile(serverId, isMe, true)
        .then((counts) => {
          if (!alive) return;
          setSocial({ id: serverId, counts });
          // The block (or unblock) just sent may reach the server after this read: read again until it is there.
          if (!isMe && counts.blockedByMe !== isBlocked && tries++ < 3) retry = setTimeout(read, 1000);
        })
        .catch(() => {});
    read();
    if (isMe) {
      // My own profile: a sign-up photo the server never got goes up now (lib/live/profile loadMe).
      loadMe(me.avatar)
        .then((p) => alive && updateMe(p))
        .catch(() => {});
    }
    // Their open room: mine always; someone else's only when its owner shows it on the profile (Oda ayarları).
    loadRooms()
      .then((list) => alive && setMyLiveRoom(list.find((r) => (isMe ? r.hostId === 'me' : r.hostId === id && r.rules?.profileVisible !== false)) ?? null))
      .catch(() => {});
    return () => {
      alive = false;
      clearTimeout(retry);
    };
    // updateMe is a new function on every render; the profile is read when it opens, after a follow and after a block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, isMe, reloads, isBlocked]);
  // Live mode: the server's follow state once read (a block ends the follow there too).
  const isFollowing = !isBlocked && (counts ? counts.isFollowing : following.has(user.id));
  // Live mode: what the person filled in, as the server has it (none until read); the demo's sample values offline.
  const extras = live ? extrasFromServer(counts?.extras) : profileExtras(user);
  const moments = live ? (liveMoments ?? []) : MOMENTS.filter((m) => m.userId === user.id);
  const photos = moments.filter((m) => m.image).map((m) => m.image!);
  // Live mode: the album is on the server (with ids, to remove one of mine).
  const livePhotos = counts?.photos ?? [];
  const completion = profileCompletion(user, extras, photos.length + (live ? livePhotos.length : 0));
  // Me: my real Cömertlik (wealth) and Yankı (charm) levels. Others: the server's (live; none until read, null for one
  // they hide) or the demo's.
  const levels: { wealth: number | null; charm: number | null } | null = user.id === 'me' ? { wealth: wealthLevel, charm: charmLevel } : live ? (counts?.levels ?? null) : wealthCharmOf(user.id);
  // "Seviyeyi Gizle" on my own profile: live, what the server hides from others now; the demo's local VIP choice.
  const myHidden = live ? { wealth: !!counts?.levelsHidden?.wealth, charm: !!counts?.levelsHidden?.charm } : { wealth: vipDays > 0 && settings.hideWealth, charm: vipDays > 0 && settings.hideCharm };
  const guardian = guardianOf(user.id);
  const bondState = useBonds(user.id);
  const topBondShown = shownTopBond(bondState, isMe);

  // What this viewer may see and do (profile spec §3, §5). Others' choices come with their profile; mine from Settings.
  const priv = isMe ? { ...privacyOf('me'), showOnline: settings.showOnline, showLastSeen: settings.showLastSeen, showCurrentRoom: settings.showCurrentRoom } : privacyOf(user.id);
  // Like most messengers: hiding your own last seen also hides everyone else's from you.
  const lastSeen = !isMe && !user.online && priv.showLastSeen && settings.showLastSeen ? user.lastSeen : undefined;
  // Live mode: from server roles only (mine from my account, theirs from their profile), never the demo's local roles.
  const staff = useStaffBadge(user.id, counts?.staff);
  // Live mode: the country they chose (none until read or when not given).
  const countryCode = live ? (counts?.extras?.country ?? null) : (user.country ?? 'TR');
  const country = countryCode ? COUNTRIES.find((c) => c.code === countryCode) : undefined;
  // Live mode: how far they are from me by our two cities, as the server sent it (none when unknown or private).
  const distanceText = live && serverId && !isMe ? cityDistanceText(distanceOf(serverId)) : null;
  // Takipçi, Takip and Arkadaş counted as the owner's three lists are (lib/follow-ties): one-way follows, and the
  // people who follow each other apart, as friends. Live: the server's (null = not read yet, shown as "—"); demo, my
  // own: the sample people, as on the Ben tab. Only mine open a list: someone else's are theirs alone.
  const ties = counts ? tieCounts(counts) : null;
  const myDemo = isMe && !live ? splitTies(tiesOf(following, FOLLOWS_ME, blocked)) : null;
  const followers = live ? (ties?.followers ?? null) : myDemo ? myDemo.followers.length : (user.age * 37) % 900;
  const followingCount = live ? (ties?.following ?? null) : myDemo ? myDemo.following.length : (user.age * 13) % 200;
  const friends = live ? (ties?.friends ?? null) : myDemo ? myDemo.friends.length : (user.age * 7) % 60;
  const loadList = (side: OneWay) =>
    live ? loadMyList(side) : (myDemo?.[side] ?? []).map(({ id: uid }) => { const u = userById(uid); return { id: u.id, name: u.name, avatarUrl: u.avatar || null }; });
  // Live mode: their public ID, the one their own Ben tab shows: a special ID they wear, else their own number from
  // the server (an older server: the one made from their server id, data/profile publicIdOf), which agency invites,
  // the room search and the panel take. Someone else's look is read here.
  useLooks(serverId && !isMe ? [serverId] : [], live);
  // Live mode: someone else's look (their frame, VIP level and special ID).
  const look = live && !isMe ? lookOf(serverId) : undefined;
  const special = live ? cosmeticById(isMe ? equipped.specialId : look?.specialId) : undefined;
  const publicId = !live ? displayId(user.id) : special?.kind === 'specialId' ? special.name.replace('ID ', '') : publicIdOf(user, serverId);
  const can = (a: Action) => checkInteraction(a, user, { blocked, following, myAge: me.age });
  const guard = (a: Action, run: () => void) => {
    const c = can(a);
    if (!c.ok) return showAlert('Şu an yapılamıyor', c.reason);
    run();
  };
  // The album is its own photos only, so its count and what it shows agree (the package's '0/6 with a photo'):
  // moment photos are in Anlar. Live mode: the album is on the server (with ids, to remove one of mine).
  const album = live ? livePhotos.map((p) => p.url) : (user.photos ?? []);
  // How many album photos of mine count towards the limit (moment photos don't).
  const myAlbumCount = live ? livePhotos.length : (me.photos?.length ?? 0);
  const albumIdOf = (url: string) => livePhotos.find((p) => p.url === url)?.id;
  const [openedAt] = useState(() => Date.now());
  // Live mode: the Abonelik's end as the server has it; the demo counts its days from now.
  const vipUntil = vipSubUntil ? new Date(vipSubUntil).toLocaleDateString('tr-TR') : vipDays > 0 && !live ? new Date(openedAt + vipDays * 86_400_000).toLocaleDateString('tr-TR') : null;

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [albumBusy, setAlbumBusy] = useState(false);
  /** Live mode: my album as the server answered (after an add or a remove). */
  const takePhotos = (list: NonNullable<SocialCounts['photos']>) => setSocial((s) => (s && s.id === serverId ? { id: s.id, counts: { ...s.counts, photos: list } } : s));
  const pickPhoto = async (forAlbum: boolean) => {
    if (avatarBusy || albumBusy) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: !forAlbum, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (forAlbum && live) {
      // Live mode: the photo goes to the server's storage and into my album there; shown once the server has it.
      setAlbumBusy(true);
      try {
        takePhotos(await addAlbumPhoto(asset));
        successHaptic();
        showAlert('Fotoğraf eklendi');
      } catch (e) {
        errorHaptic();
        showAlert('Fotoğraf yüklenemedi', message(e));
      } finally {
        setAlbumBusy(false);
      }
    } else if (forAlbum) {
      updateMe({ photos: [asset.uri, ...(me.photos ?? [])].slice(0, LIMITS.photos) });
      showAlert('Fotoğraf eklendi');
    } else if (live) {
      // Live mode: the photo goes to the server's storage and becomes my avatar there, so other phones see it.
      // This phone shows it only once the server saved it.
      setAvatarBusy(true);
      try {
        updateMe(await uploadAvatar(asset));
        successHaptic();
        showAlert('Profil fotoğrafın güncellendi');
      } catch (e) {
        errorHaptic();
        showAlert('Fotoğraf yüklenemedi', message(e));
      } finally {
        setAvatarBusy(false);
      }
    } else {
      submitAvatar(asset.uri);
      showAlert('Fotoğraf incelemede', 'Kısa bir kontrolden sonra görünecek.');
    }
  };

  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t.id === tabParam)?.id ?? 'profil');
  const [sheet, setSheet] = useState<Sheet>('none');
  // A live build: what the two of us are on the server (1v1): the heart between us, and (with calls in this build)
  // what a call costs and which are open. Read again after a gift.
  const { pair, reload: reloadPair } = usePair(id, !isMe && !!serverId);
  // The heart between us (the demo: its sample heart): a card under the numbers, and from the beat look on a heart
  // beating on their photo (components/heart-level). Not on my own profile, nor with someone I blocked.
  const heart = isMe || isBlocked ? null : heartOf(id, pair);
  const [editOpen, setEditOpen] = useState(false);
  const [sentInvites, setSentInvites] = useState<string[]>([]);
  const [tabY, setTabY] = useState(0);
  const [list, setList] = useState<OneWay | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Live mode: the Vitrin as the server has it (gift wall, rides, entry effects, medals, titles), read when the profile
  // opens (the Hediye Duvarı banner shows it), again when its tab opens and after a gift; kept with the id it is for.
  // 'failed': no answer (Tekrar dene).
  const [showcase, setShowcase] = useState<{ id: string; view: ShowcaseView | 'failed' } | null>(null);
  const vitrinOpen = tab === 'onur';
  const [showcaseTry, setShowcaseTry] = useState(0);
  useEffect(() => {
    if (!serverId) return;
    let alive = true;
    loadShowcase(serverId)
      .then((view) => alive && setShowcase({ id: serverId, view }))
      // A read that fails keeps what was shown before; with nothing shown yet it says so.
      .catch(() => alive && setShowcase((s) => (s && s.id === serverId && s.view !== 'failed' ? s : { id: serverId, view: 'failed' })));
    return () => {
      alive = false;
    };
  }, [serverId, vitrinOpen, reloads, showcaseTry]);
  // Nobody on the server to read (a sample person, or me before sign-in): an empty Vitrin, never the demo's.
  const liveShowcase = !serverId ? NO_SHOWCASE : showcase && showcase.id === serverId ? showcase.view : null;

  // Gift wall: my own wall is only what I really received; another user's wall is their simulated
  // history plus every gift I sent them (room, profile, call).
  const received = wallOf[user.id] ?? {};
  const giftWall = giftWallOf(user.id).map((g) => ({ ...g, count: (isMe ? 0 : g.count) + (received[g.id] ?? 0) }));
  const giftTotal = giftWall.reduce((s, g) => s + g.count, 0);
  // Live mode: the catalog gifts they received, counted by the server (null until read).
  const giftCount = live ? (counts?.giftsReceived ?? null) : giftTotal;

  // Live mode: the Koruma area (server/api/guards.mjs): their top guardian over their threshold, whom they guard
  // most, and my own Koruma of them; kept with the id it is for. A sample person has none.
  const [guardRead, setGuardRead] = useState<{ id: string; area: GuardArea } | null>(null);
  useEffect(() => {
    if (!serverId) return;
    let alive = true;
    loadGuardArea(id).then(
      (area) => alive && setGuardRead({ id: serverId, area }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [serverId, id, reloads]);
  const guardArea = guardRead && guardRead.id === serverId ? guardRead.area : EMPTY_AREA;
  // Everyone the Koruma area has, not one fixed person. Live: the server's top guardian and whom they guard most; the
  // demo: its sample supporter (data/profile guardianOf).
  const demoGuardian = !live && guardian ? userById(guardian.userId) : null;
  const guardPeople: GuardEntry[] = live
    ? [
        ...(guardArea.guardian ? [{ person: guardArea.guardian, label: 'Koruma' }] : []),
        ...(guardArea.ward && guardArea.ward.id !== guardArea.guardian?.id ? [{ person: guardArea.ward, label: 'Koruduğu' }] : []),
      ]
    : demoGuardian && guardian
      ? [{ person: { id: demoGuardian.id, name: demoGuardian.name, avatarUrl: demoGuardian.avatar, points: guardian.points }, label: 'Koruma' }]
      : [];
  const openPerson = (pid: string) => router.push(`/kullanici/${pid}`);
  const cardPrice = giftById(GUARD_CARD)?.price ?? null;
  const sendCard = async () => {
    try {
      await sendGuardCard(id);
      setReloads((n) => n + 1);
      showAlert('Koruma başladı', `Artık ${user.name} kişisinin koruyucususun. Ona gönderdiğin her hediye koruma puanı getirir.`);
    } catch (e) {
      showAlert('Gönderilemedi', message(e));
    }
  };
  // The Koruma banner: mine opens Benim Koruma; someone else's shows my Koruma of them or offers the card.
  const openGuard = () => {
    if (isMe) return router.push('/koruma');
    if (!serverId) return showAlert('Koruma', 'Koruma canlı sunucuda çalışır.');
    const rules = { text: 'Kurallar', onPress: () => router.push('/koruma/kurallar') };
    const mine = guardArea.mine;
    if (mine) return showAlert('Koruma', `${user.name} kişisini ${mine.days} gündür koruyorsun · ${guardPoints(mine.points)} puan. Ona gönderdiğin her hediye puan getirir.`, [rules, { text: 'Benim Koruma', onPress: () => router.push('/koruma') }, { text: 'Tamam', style: 'cancel' }]);
    if (guardArea.off) return showAlert('Koruma kapalı', `${user.name} korumayı kapatmış: kimse yeni koruyucusu olamaz.`, [rules, { text: 'Tamam', style: 'cancel' }]);
    if (isBlocked) return showAlert('Şu an yapılamıyor', `${user.name} kişisini engelledin.`);
    showAlert('Koruma Kartı', `${user.name} kişisine Koruma Kartı gönder${cardPrice ? ` (${cardPrice.toLocaleString('tr-TR')} jeton)` : ''}: onun koruyucusu olursun, kartın jetonu ilk koruma puanın olur.`, [
      rules,
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gönder', onPress: () => void sendCard() },
    ]);
  };
  // İlişki Duvarı: their top bond's partner and its days; Hediye Duvarı: the gifts they received most, and how many
  // kinds (live: once the Vitrin is read).
  const bondPartner = topBondShown ? userById(topBondShown.partnerId) : null;
  const bondDaysNow = topBondShown ? bondDays(topBondShown.since, nowMs()) : 0;
  const wallAll = live ? (liveShowcase && liveShowcase !== 'failed' ? liveShowcase.giftWall : null) : giftWall;
  const wallTop = (wallAll ?? []).filter((g) => g.count > 0).sort((a, b) => b.count - a.count).slice(0, 3).map((g) => ({ giftId: g.id, emoji: g.emoji }));
  const wallLit = wallAll ? wallAll.filter((g) => g.count > 0).length : null;

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
  // My gift's animation plays here once it went (components/fx/gift-stage).
  const giftStage = useGiftStage();
  /** One gift, no confirmation; true once it went. */
  const deliverGift = async (g: Gift): Promise<boolean> => {
    let keptNote: string | null = null;
    // Same VIP (SVIP) lock as the room's gift sheet.
    if ((g.minSvip ?? 0) > svipLevel) {
      showAlert('Üyelere özel hediye', `${g.name}, VIP ${g.minSvip} ve üstü için. Senin seviyen: VIP ${svipLevel}.`);
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
        // Profil izleri: a mark gift to someone whose photo already shows another kind's mark goes as a plain gift; the
        // server's sentence says so once it went.
        keptNote = parseMarkNote(((await liveGift(user.id, g.id, 1, undefined, 'profile', g.price)) as { markNote?: unknown }).markNote);
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
    // Live mode: their gift count, Vitrin and our heart are read again from the server, which now has this gift.
    if (live) {
      setReloads((n) => n + 1);
      reloadPair();
    }
    bump('giftsSent', 1);
    addFanPoints(user.id, Math.ceil(g.price / 10), `Hediye gönderdin (${g.price} jeton)`);
    successHaptic();
    giftStage.play(g, me.name, user.name, 1);
    if (keptNote) showAlert('Hediye gönderildi', keptNote);
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

  const copyId = () => publicId && copyText(publicId, 'ID');
  // Mine names my server id, so the other phone opens me and not itself; the demo's own profile has no link to give.
  const shareProfile = () => {
    if (isMe && !serverId) return showAlert('Profili paylaş', 'Profil bağlantısı canlı sunucuda çalışır.');
    shareLink(isMe ? `${user.name} Similar Club'da, profilime göz at!` : `${user.name} Similar Club'da, profiline göz at!`, `kullanici/${isMe ? serverId : user.id}`);
  };
  /** Live mode: takes a photo out of my album on the server (its file goes too). */
  const removeFromAlbum = (photoId: number) =>
    removeAlbumPhoto(photoId)
      .then(takePhotos)
      .catch((e) => showAlert('Fotoğraf kaldırılamadı', message(e)));
  const copyUsername = () => user.username && copyText(`@${user.username}`, 'Kullanıcı adı');

  // Blocking also ends the follows both ways (on the server too), so it asks first; unblocking doesn't.
  const blockUser = () => {
    if (isBlocked) return toggleBlock(user.id);
    showAlert(`${user.name} kişisini engellemek istiyor musun?`, 'Birbirinize yazamaz, takip edemezsiniz; takipler kalkar.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => toggleBlock(user.id) },
    ]);
  };

  // Live mode: the form starts from my profile as the server has it, not from what this phone remembers.
  const [editLoading, setEditLoading] = useState(false);
  // My age on the server (null: no birth date there yet, so the form may take one, once).
  const [serverAge, setServerAge] = useState<number | null>(null);
  // Live mode: my extras as the server has them when the form opens (null: an older server that keeps none, so the
  // form doesn't offer them). Read fresh, so a save never sends empty fields over ones not read yet.
  const [serverExtras, setServerExtras] = useState<ProfileExtras | null>(null);
  const openEdit = async () => {
    if (!live) return setEditOpen(true);
    if (editLoading) return;
    setEditLoading(true);
    try {
      const [mine, now] = await Promise.all([loadMe(), serverId ? loadPublicProfile(serverId, true) : Promise.resolve(null)]);
      updateMe(mine);
      setServerAge(mine.age ?? null);
      if (now && serverId) setSocial({ id: serverId, counts: now });
      setServerExtras(now?.extras ? extrasFromServer(now.extras) : null);
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
        // The extras first (with the country and the gender's visibility), so my profile answer below has them.
        if (e.extras) {
          const x = await saveMyExtras(e.extras, e.country || null, !e.showGender);
          setSocial((s) => (s && s.id === serverId ? { id: s.id, counts: { ...s.counts, extras: x } } : s));
        }
        // The server never sends the birth date back (only the age): keep the one just set to show it to me.
        updateMe({ ...(await saveMyProfile(e)), ...(e.birthDate && { birthDate: e.birthDate }) });
        setReloads((n) => n + 1);
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
  // Bağlar: its İlişki Duvarı row scrolls down to the bonds (where they are in the page: the tab's body, then the list).
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [bodyY, setBodyY] = useState(0);
  const [bondsY, setBondsY] = useState(0);
  const toBonds = () => scroller.current?.scrollTo({ y: Math.max(0, bodyY + bondsY - barHeight - TAB_H - 16), animated: true });
  // Scrolled past the header, another tab starts at its own top, just under the tabs (not deep in the page).
  const pickTab = (t: Tab) => {
    setTab(t);
    if (collapsed) scroller.current?.scrollTo({ y: Math.max(0, tabY - barHeight), animated: false });
  };

  // Room & family
  // Live mode: no sample room for anyone; mine is my open server room (it has no level there, so none is shown).
  const otherRoom = live ? undefined : ROOMS.find((r) => r.hostId === user.id);
  const room: { title: string; line: string | null; people: number | null; cover: string; level: number | null; go: () => void } | null = isMe || live
    ? live
      ? myLiveRoom && {
          title: myLiveRoom.title || 'Odam',
          line: myLiveRoom.announcement || null,
          people: myLiveRoom.listeners,
          cover: myLiveRoom.cover,
          level: null,
          go: () => router.push(`/oda/${myLiveRoom.id}`),
        }
      : { title: myRoom.title, line: myRoom.announcement || null, people: null, cover: myRoom.cover, level: roomLevel(myRoom.xp), go: () => router.push('/oda/yeni') }
    : otherRoom
      ? { title: otherRoom.title, line: otherRoom.announcement || null, people: otherRoom.listeners, cover: otherRoom.cover, level: otherRoom.level ?? 1, go: () => router.push(`/oda/${otherRoom.id}`) }
      : null;
  const { agency, kabile, known } = useAffiliations(user);
  // Live mode: my open room; the agency and Aile once the server answered for this profile.
  const showRoom = !live || !!room;
  const showAgency = !live || known;

  // Live mode: every tab has the server's data behind it (Anlar: their posts; Vitrin: profiles.mjs showcase).
  const tabs = TABS;
  // Live mode: my date only when it gives the age the server has (lib/profile-rules birthShown).
  const myBirth = live ? birthShown(user.birthDate, user.age || null) : user.birthDate;
  const birthday = myBirth ? formatTrDate(myBirth) : extras.birthday;
  const hasPersonal = extras.height > 0 || extras.weight > 0 || !!extras.job || extras.languages.length > 0 || !!extras.zodiac || (user.interests?.length ?? 0) > 0;
  const showsGender = !!user.gender && (isMe || user.showGender !== false);
  const hasBasics = !live || publicId !== null || !!user.username || showsGender || !!country || (isMe && !!birthday) || !!user.joinedAt || !!extras.relationship || !!extras.education;
  // The interests in Hakkımda (the first four); all of them are in Vitrin › Kişisel Profil.
  const aboutInterests = (user.interests ?? []).slice(0, 4).map(splitInterest);
  // A bio that only names interests ("🎧 Müzik 🎮 Oyun") says what the interests line says: one line is enough.
  const bioWords = (user.bio ?? '').toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+/gu) ?? [];
  const interestWords = new Set(aboutInterests.flatMap((x) => x.label.toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+/gu) ?? []));
  const aboutBio = user.bio && aboutInterests.length > 0 && bioWords.length > 0 && bioWords.every((w) => interestWords.has(w)) ? '' : (user.bio ?? '');
  // A purchased frame (mine, or theirs in a live build) reaches past the photo.
  const framed = isMe ? !!equipped.frame : !!look?.frame;

  // Live mode: the room the server says they are in now (their "Bulunduğum odayı göster", blocks and the room's door
  // already applied; one-to-one calls never shown); the demo: its sample rooms and calls.
  const here = live ? counts?.room : null;
  const presence: Presence = live ? (here ? { kind: 'room', roomId: here.id, title: here.title, locked: here.locked } : null) : priv.showCurrentRoom ? presenceOf(user.id) : null;
  const openFriends = () => router.push({ pathname: '/(tabs)/mesajlar', params: { tab: 'friends' } });
  // My own Koruma of them, unless I am the guardian already shown.
  const myGuard = !isMe && guardArea.mine && guardArea.guardian?.id !== 'me' ? guardArea.mine : null;
  const partner = bondPartner && { uri: bondPartner.avatar, name: bondPartner.name };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ paddingBottom: (isMe ? 40 : 110) + insets.bottom }}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* One identity area for every tab (the client's profile package, Nov 2026): the photo as a wide cover, the
            framed avatar over its edge with the name, handle and status beside it, and the badges (the interests are in Hakkımda). The
            tabs follow at once and stay at the top once scrolled; nothing of this is repeated inside a tab. */}
        <View style={[styles.hero, { paddingTop: insets.top + BAR_H + 4 }]}>
          <View style={styles.cover}>
            {/* No photo yet: a light portrait silhouette (the face fallback's dark disc would break the glass). */}
            {(isMe && pendingAvatar) || user.avatar ? (
              <CoverPhoto uri={(isMe && pendingAvatar) || user.avatar} />
            ) : (
              <View style={styles.coverEmpty} accessibilityLabel="Fotoğraf yok">
                <Ionicons name="person" size={84} color="#F2B5D0" style={{ marginBottom: -12 }} />
              </View>
            )}
          </View>
          {/* A purchased frame reaches past the photo: kept on screen and painted over the cover. */}
          <View style={[styles.idRow, framed && { zIndex: 2 }]}>
            <View style={[styles.avatarWrap, framed && { marginLeft: 12 }]}>
              {isMe ? (
                <Pressable onPress={() => pickPhoto(false)} accessibilityLabel="Profil fotoğrafını değiştir">
                  {/* A frame from the store wins over the bond frame. */}
                  <BondFrame bond={equipped.frame ? null : topBondShown} size={96}>
                    <FramedAvatar uri={pendingAvatar ?? user.avatar} size={96} vipLevel={vipLevel} frameId={equipped.frame} artScale={2.2} markUid="me" />
                  </BondFrame>
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </Pressable>
              ) : (
                <>
                  <BondFrame bond={look?.frame ? null : topBondShown} size={96}>
                    {live ? (
                      // Live: the frame and VIP level they wear (their look), with their Profil izleri under it.
                      <FramedAvatar uri={user.avatar} size={96} vipLevel={look?.vipLevel ?? 0} frameId={look?.frame ?? undefined} artScale={2.2} markUid={id} />
                    ) : (
                      <View>
                        <Avatar uri={user.avatar} size={96} ring={user.vip && !topBondShown} />
                        {/* Profil izleri: on the photo, under the bond frame (components/profile-mark). */}
                        <MarkLayer uid={id} size={96} />
                      </View>
                    )}
                  </BondFrame>
                  {heart && <HeartPin level={heart.level} style={styles.heartPin} />}
                </>
              )}
            </View>
            <View style={styles.idText}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {user.name}
                </Text>
                {country && (
                  <View style={styles.flag} accessibilityLabel={country.name}>
                    <Art name={countryArt(country.code)} size={16} />
                    <Text style={styles.flagText}>{country.code}</Text>
                  </View>
                )}
              </View>
              {!!user.username && (
                <Pressable style={styles.handleRow} onPress={copyUsername} hitSlop={8} accessibilityLabel="Kullanıcı adını kopyala">
                  <Text style={styles.handle} numberOfLines={1}>
                    @{user.username}
                  </Text>
                  <Ionicons name="copy-outline" size={15} color={colors.textDim} />
                </Pressable>
              )}
              <View style={styles.status}>
                {priv.showOnline ? (
                  <>
                    <View style={[styles.dot, { backgroundColor: user.online ? semantic.live : colors.textDim }]} />
                    <Text style={[styles.statusText, user.online && styles.statusOn]}>{user.online ? 'Çevrimiçi' : lastSeen ? `Son görülme ${lastSeen}` : 'Çevrimdışı'}</Text>
                  </>
                ) : (
                  <Text style={styles.statusText}>{isMe ? 'Durumun gizli' : 'Durum gizli'}</Text>
                )}
                {!!user.city && (
                  // No room beside "Son görülme …" on a narrow phone: the place takes a second line instead of being cut.
                  <View style={styles.statusPlace}>
                    <Text style={styles.statusText}>·</Text>
                    <Ionicons name="location-outline" size={14} color={colors.textDim} />
                    <Text style={[styles.statusText, { flexShrink: 1 }]} numberOfLines={1}>
                      {user.city}
                      {/* Live: the server's distance by city ("Aynı şehir", "350 km"); the demo's sample one. */}
                      {!isMe && settings.cityDiscovery && (live ? (distanceText ? ` · ${distanceText}` : null) : ` · ${user.distanceKm} km`)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {isMe && pendingAvatar && <Text style={styles.reviewNote}>⏳ Yeni fotoğraf incelemede · şimdilik yalnızca sen görüyorsun</Text>}
          {isMe && avatarBusy && <Text style={styles.reviewNote}>⏳ Fotoğraf yükleniyor…</Text>}

          {/* Every status keeps its badge: age and gender, levels, VIP, staff, verified and the bond (Çift Lv.N). */}
          <View style={styles.badges}>
            <GenderChip user={user} owner={isMe} size="md" />
            {/* Live mode: someone else's levels once the server sent them. */}
            {levels && (
              <LevelChips
                size="sm"
                wealth={levels.wealth ?? 0}
                charm={levels.charm ?? 0}
                hideWealth={levels.wealth === null || (isMe && myHidden.wealth)}
                hideCharm={levels.charm === null || (isMe && myHidden.charm)}
              />
            )}
            {isMe ? <VipTitle level={vipLevel} /> : look?.vipLevel ? <VipTitle level={look.vipLevel} /> : user.vip && <VipBadge />}
            {staff && (
              <View style={[styles.staffChip, staff === 'Moderatör' && { backgroundColor: '#1D4ED8' }]} accessibilityLabel={`Resmi ${staff}`}>
                <Ionicons name="shield-checkmark" size={13} color="#fff" />
                <Text style={styles.staffText}>{staff}</Text>
              </View>
            )}
            {user.verified && <VerifiedBadge size={24} />}
            <BondBadge bond={topBondShown} onPress={() => setTab('iliski')} />
          </View>

          {/* Profil izleri: my own mark, who left it, how long it stays and what cleans it. */}
          {isMe && <OwnMarkNote textColor={glass.deep} />}
          {isBlocked && <Text style={styles.blockedNote}>Bu kullanıcıyı engelledin.</Text>}
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
                <Text style={styles.presenceTitle} numberOfLines={1}>
                  {presence.kind === 'room' ? `Şu an odada: ${presence.title}` : `Şu an ${presence.mode} görüşmede`}
                </Text>
                <Text style={styles.glassMeta}>{presence.kind === 'room' ? (presence.locked ? 'Şifreli oda · girişte şifre sorulur' : 'Dokun, yanına git') : 'Özel görüşmeye katılınamaz'}</Text>
              </View>
              {presence.kind === 'room' && <Text style={styles.presenceGo}>Git</Text>}
            </Pressable>
          )}
        </View>

        <View onLayout={(e) => setTabY(e.nativeEvent.layout.y)}>
          <TabBar tabs={tabs} tab={tab} onChange={pickTab} />
        </View>

        <View style={styles.body} onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
          {tab === 'profil' && (
            // Profil: the numbers and my one strong action, the three walls, then who they are (about, slogan,
            // verification, basics), and what only I see. Someone else's empty parts stay out instead of saying "none".
            <>
              <StatBar
                stats={[
                  // Someone else's numbers open nothing: who follows them and whom they follow is theirs alone.
                  { n: followers, label: 'Takipçi', onPress: isMe ? () => setList('followers') : undefined },
                  { n: followingCount, label: 'Takip', onPress: isMe ? () => setList('following') : undefined },
                  { n: friends, label: 'Arkadaş', onPress: isMe ? openFriends : undefined },
                  { n: giftCount, label: 'Hediye', onPress: () => pickTab('onur') },
                ]}
              />
              {isMe && <EditShareRow onEdit={openEdit} onShare={shareProfile} busy={editLoading} />}
              {heart && heart.level > 0 && <HeartCard heart={heart} me={{ uri: me.avatar, name: me.name }} them={{ uri: user.avatar, name: user.name }} />}
              {/* No reward is given for a full profile, so the card doesn't promise one. */}
              {isMe && <CompletionCard percent={completion} onPress={openEdit} />}
              {/* Ses tanıtımı: their clip to play; mine to change, or an invitation to record one. */}
              {voiceShown && <VoiceCard voice={voice} mine={isMe} onEdit={isMe ? () => setVoiceOpen(true) : undefined} />}
              <RelationWall owner={user.avatar} partner={partner} days={bondDaysNow || null} onPress={() => pickTab('iliski')} />
              <GuardWall people={guardPeople} mine={myGuard} off={guardArea.off} onPress={openGuard} onOpen={openPerson} />
              <GiftWall top={wallTop} lit={wallLit} total={wallAll?.length ?? null} received={giftCount} onPress={() => pickTab('onur')} />

              {/* The bio, and under it the interests in the same small type (the first four; all of them are in Vitrin › Kişisel Profil). */}
              {(isMe || !!user.bio || aboutInterests.length > 0) && (
                <InfoCard
                  icon="chatbubble-ellipses-outline"
                  tone="soft"
                  title="Hakkımda"
                  text={aboutBio || (isMe && aboutInterests.length === 0 ? 'Kendini birkaç kelimeyle anlat…' : undefined)}
                  more={aboutInterests.length > 0 ? aboutInterests.map((x) => `${x.emoji} ${x.label}`.trim()).join('  ') : undefined}
                  quiet={!aboutBio}
                  label={[aboutBio ? `Hakkımda: ${aboutBio}` : 'Hakkımda', aboutInterests.length > 0 ? `İlgi alanları: ${aboutInterests.map((x) => x.label).join(', ')}` : ''].filter(Boolean).join('. ')}
                  onPress={isMe ? openEdit : undefined}
                />
              )}
              {/* Live mode: their slogan from the server; mine, when I have none, is an invitation to write one (no sample). */}
              {(extras.slogan || (isMe && (!live || counts?.extras !== undefined))) && (
                <InfoCard
                  icon="pencil-outline"
                  tone="soft"
                  title="Arkadaşlık Sloganı"
                  text={extras.slogan ?? (live ? 'Bir slogan yaz; seninle aynı frekanstakiler seni bulsun.' : 'Bir soruyu yanıtla, seninle aynı frekansta olan biriyle tanış.')}
                  quiet={!extras.slogan}
                  onPress={isMe ? openEdit : undefined}
                />
              )}
              <InfoCard
                icon={user.verified ? 'checkmark-circle' : 'shield-checkmark-outline'}
                tone="blue"
                title="Doğrulama"
                text={user.verified ? 'Gerçek kişi doğrulandı · mavi rozet aktif' : isMe ? 'Selfie ile doğrula, mavi rozet al' : 'Bu kullanıcı henüz doğrulanmadı.'}
                onPress={isMe && !user.verified ? () => showAlert('Doğrulama gerekli', 'Selfie ile gerçek kişi doğrulaması yap; profilinde mavi rozet görünür.') : undefined}
              />

              {hasBasics && (
                <InfoTable>
                  {/* The public ID their own Ben tab shows (live: a special ID they wear, else their own number). */}
                  {publicId !== null && (
                    <InfoLine icon="keypad-outline" label="ID" onCopy={copyId} copyLabel="ID kopyala">
                      <LineValue accent={special?.kind === 'specialId' ? '#975A16' : undefined}>{special?.kind === 'specialId' ? `${publicId} ✦` : publicId}</LineValue>
                    </InfoLine>
                  )}
                  {!!user.username && (
                    <InfoLine icon="at-outline" label="Kullanıcı adı" onCopy={copyUsername} copyLabel="Kullanıcı adını kopyala">
                      <LineValue>@{user.username}</LineValue>
                    </InfoLine>
                  )}
                  {showsGender && (
                    <InfoLine icon={user.gender === 'Kadın' ? 'female-outline' : 'male-outline'} label="Cinsiyet" hint={user.showGender === false ? 'Gizli · yalnızca sen görüyorsun, diğerleri sadece yaşını görür' : undefined}>
                      <View style={styles.row}>
                        <Ionicons name={user.gender === 'Kadın' ? 'female' : 'male'} size={17} color={user.gender === 'Kadın' ? FEMALE_FILL : MALE_FILL} />
                        <LineValue>{user.gender}</LineValue>
                      </View>
                    </InfoLine>
                  )}
                  {country && (
                    <InfoLine icon="flag-outline" label="Ülke">
                      <LineValue>
                        {country.flag} {country.name}
                      </LineValue>
                    </InfoLine>
                  )}
                  {/* The full date is mine alone; others see only the age (the badge). */}
                  {isMe && !!birthday && (
                    <InfoLine icon="calendar-outline" label="Doğum Günü" hint="Yalnızca Sen Görebilirsin · diğerleri sadece yaşını görür">
                      <LineValue>{birthday}</LineValue>
                    </InfoLine>
                  )}
                  {!!user.joinedAt && (
                    <InfoLine icon="ribbon-outline" label="Üyelik">
                      <LineValue>{new Date(user.joinedAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</LineValue>
                    </InfoLine>
                  )}
                  {!!extras.relationship && (
                    <InfoLine icon="heart-outline" label="İlişki Durumu">
                      <LineValue>{extras.relationship}</LineValue>
                    </InfoLine>
                  )}
                  {!!extras.education && (
                    <InfoLine icon="school-outline" label="Eğitim">
                      <LineValue>{extras.education}</LineValue>
                    </InfoLine>
                  )}
                </InfoTable>
              )}

              {isMe ? (
                <PrivateStats
                  coins={coins}
                  diamonds={diamonds}
                  vipUntil={vipUntil}
                  wealthXp={wealthXp}
                  charmXp={charmXp}
                  giftsSent={stats.giftsSent}
                  // Live mode: the catalog gifts I received, as the server counts them (null until read).
                  giftsReceived={giftCount}
                />
              ) : (
                <>
                  <SimilarityCard sim={similarity(me, user)} name={user.name} glassy />
                  <FanClubCard name={user.name} club={club} />
                </>
              )}
              {isMe && <EditButton onPress={openEdit} busy={editLoading} />}
            </>
          )}

          {tab === 'dinamik' && (
            // Anlar: their posts as before (the package has no Anlar screen), on the profile's cards.
            <>
              {/* Live mode: their posts are still coming from the server. */}
              {live && !!serverId && liveMoments === null ? (
                <Skeletons count={2}>
                  <PostSkeleton />
                </Skeletons>
              ) : moments.length > 0 ? (
                moments.map((m) => <MomentItem key={m.id} moment={m} user={user} />)
              ) : (
                <PCard style={styles.empty}>
                  <Art name="maskot-bos-durum-maskotu" size={88} />
                  <Text style={styles.glassMeta}>{isMe ? 'Henüz bir an paylaşmadın.' : 'Henüz paylaşım yok.'}</Text>
                </PCard>
              )}
              {isMe && <GradientButton title="bir an yayınla" icon="add-circle-outline" style={{ marginTop: 4, marginHorizontal: 24 }} onPress={() => router.push('/(tabs)/anlar')} />}
            </>
          )}

          {tab === 'onur' && (
            // Vitrin: completion (mine), the album, personal details, the room, then everything they show off.
            <>
              {isMe && <CompletionCard percent={completion} onPress={openEdit} button />}

              {/* Live mode: the album is on the server (profiles.mjs). Only album photos, so the count and the photos
                  agree; moment photos are in Anlar. */}
              {(!live || counts?.photos !== undefined) && (album.length > 0 || isMe) && (
                <PCard style={{ gap: 12 }}>
                  <CardHead icon="images-outline" tone="pink" small title={`Albüm${isMe ? ` · ${myAlbumCount}/${LIMITS.photos}` : ''}`} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
                    {isMe && myAlbumCount < LIMITS.photos && (
                      <Pressable
                        style={[styles.photo, styles.addPhoto]}
                        onPress={() => pickPhoto(true)}
                        disabled={albumBusy}
                        accessibilityLabel="Albüme fotoğraf ekle"
                        accessibilityState={{ busy: albumBusy }}
                      >
                        <Ionicons name={albumBusy ? 'hourglass-outline' : 'add'} size={30} color={glass.deep} />
                        <Text style={styles.addPhotoText}>{albumBusy ? 'Yükleniyor…' : 'Fotoğraf Ekle'}</Text>
                      </Pressable>
                    )}
                    {album.map((p, i) => {
                      const liveId = live ? albumIdOf(p) : undefined;
                      return (
                        <View key={`${i}-${p}`}>
                          <Image source={{ uri: p }} style={styles.photo} />
                          {isMe && (live ? liveId !== undefined : me.photos?.includes(p)) && (
                            <Pressable
                              style={styles.removePhoto}
                              hitSlop={11}
                              onPress={() => (liveId !== undefined ? removeFromAlbum(liveId) : updateMe({ photos: (me.photos ?? []).filter((x) => x !== p) }))}
                              accessibilityLabel="Fotoğrafı kaldır"
                            >
                              <Ionicons name="close" size={14} color="#fff" />
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  {isMe && album.length === 0 && <Text style={styles.glassMeta}>Henüz fotoğraf eklenmedi.</Text>}
                </PCard>
              )}

              {/* Özel albüm (live mode): an approved agency streamer's photos others open with coins; mine to fill. */}
              {live && serverId && <PrivateAlbumCard key={serverId} serverId={serverId} ownerName={user.name} />}

              {/* Only what is filled in (live mode: the interests and the extras the server keeps). Mine opens the form. */}
              {(hasPersonal || extras.tags.length > 0 || isMe) && (
                <PCard onPress={isMe ? openEdit : undefined} label="Kişisel profil · düzenle" style={{ gap: 10 }}>
                  <CardHead icon="flame-outline" tone="pink" small title="Kişisel Profil" chevron={isMe} />
                  {hasPersonal || extras.tags.length > 0 ? (
                    <View style={styles.chips}>
                      {extras.height > 0 && <PChip icon="resize-outline" label={`${extras.height}cm`} />}
                      {extras.weight > 0 && <PChip icon="barbell-outline" label={`${extras.weight}kg`} />}
                      {!!extras.job && <PChip icon="briefcase-outline" label={extras.job} />}
                      {extras.languages.length > 0 && <PChip icon="language-outline" label={extras.languages.join(', ')} />}
                      {!!extras.zodiac && <PChip icon="star-outline" label={extras.zodiac} />}
                      {(user.interests ?? []).map(splitInterest).map((x) => (
                        <PChip key={x.label} emoji={x.emoji} label={x.label} />
                      ))}
                      {extras.tags.map((t) => (
                        <PChip key={`tag-${t.label}`} emoji={t.emoji} art={t.art ? <Art name={t.art} size={20} /> : undefined} label={t.label} />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.glassMeta}>İlgi alanlarını ve kişilik etiketlerini ekle; seninle aynı şeyleri sevenler seni bulsun.</Text>
                  )}
                </PCard>
              )}

              {/* Live mode: someone else's room only when they show it on their profile; no sample room. */}
              {showRoom && room && (
                <PCard style={{ gap: 10 }}>
                  <CardHead icon="headset-outline" tone="pink" small title="Oda" />
                  <RoomBanner
                    cover={room.cover}
                    title={room.title}
                    line={room.line}
                    people={room.people}
                    onPress={room.go}
                    level={
                      room.level !== null && (
                        <View style={styles.lvChip}>
                          <Image source={roomLevelArt(room.level)} style={{ width: 16, height: 16 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                          <Text style={styles.lvText}>Lv.{room.level}</Text>
                        </View>
                      )
                    }
                  />
                </PCard>
              )}

              <PCard style={{ gap: 10 }}>
                <CardHead icon="gift-outline" tone="purple" small title="Vitrin Öğeleri" right={wallLit !== null && wallAll ? <Text style={styles.cardCount}>{`${wallLit}/${wallAll.length}`}</Text> : undefined} />
                <ShowcaseStrip top={wallTop} />
              </PCard>

              {!live ? (
                <OnurTab
                  userId={user.id}
                  isMe={isMe}
                  giftWall={giftWall}
                  myRides={isMe ? COSMETICS.filter((c) => c.kind === 'ride' && inventory.has(c.id)).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })) : null}
                />
              ) : liveShowcase && liveShowcase !== 'failed' ? (
                <OnurTab userId={user.id} isMe={isMe} giftWall={liveShowcase.giftWall} myRides={null} server={liveShowcase} />
              ) : liveShowcase === 'failed' ? (
                <LoadError text="Vitrin şu an yüklenemedi." onRetry={() => setShowcaseTry((n) => n + 1)} />
              ) : (
                <Skeletons count={3}>
                  <PostSkeleton />
                </Skeletons>
              )}
            </>
          )}

          {tab === 'iliski' && (
            // Bağlar: Koruma, the top bond, agency and Aile, the connections, then every bond (components/bonds).
            <>
              <GuardWall hero people={guardPeople} mine={myGuard} off={guardArea.off} onPress={openGuard} onOpen={openPerson} />
              <RelationWall compact owner={user.avatar} partner={partner} days={bondDaysNow || null} onPress={toBonds} />
              {showAgency && <AffiliationBlock title="Ajans" icon="business" item={agency} empty="Henüz bir ajansa katılmadın" emptyHref={isMe ? '/ajans' : undefined} />}
              {showAgency && <AffiliationBlock title="Aile" icon="people" item={kabile} empty="Henüz bir aileye katılmadın" emptyHref={isMe ? '/aile' : undefined} />}
              <SectionLabel icon="link" title="Bağlantılar" />
              <ConnectionCounts
                items={[
                  { icon: 'people-outline', label: 'Arkadaş', n: friends, onPress: isMe ? openFriends : undefined },
                  { icon: 'person-add-outline', label: 'Takipçi', n: followers, onPress: isMe ? () => setList('followers') : undefined },
                  { icon: 'person-outline', label: 'Takip', n: followingCount, onPress: isMe ? () => setList('following') : undefined },
                ]}
              />
              <View style={{ gap: 12 }} onLayout={(e) => setBondsY(e.nativeEvent.layout.y)}>
                <SectionLabel icon="heart-circle-outline" title="Bağlar" />
                <BondsTab user={user} isMe={isMe} state={bondState} isBlocked={isBlocked} onMeetInvite={() => router.push('/oda/yeni')} />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Fixed glass buttons over the page with the app's name between them; scrolled past the header, a glass pill
          with the person's name and the tabs below it. */}
      <View pointerEvents="box-none" style={[styles.topBar, collapsed && { backgroundColor: colors.bg }]}>
        {/* The page never scrolls under the clock and the status icons. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }} />
        <View style={[styles.topRow, collapsed && styles.topRowOn, { marginTop: insets.top + (collapsed ? 3 : 0) }]}>
          <Pressable hitSlop={6} onPress={() => goBack()} style={[styles.iconBtn, !collapsed && styles.iconBtnLift]} accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={22} color={glass.ink} />
          </Pressable>
          {collapsed ? (
            <Text style={styles.topTitle} numberOfLines={1}>
              {user.name}
            </Text>
          ) : (
            // The app's name floats over the page on glass, like the buttons beside it.
            <View style={styles.brand} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.brandPill}>
                <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
                <Text style={styles.brandText}>SimilarClub</Text>
              </View>
            </View>
          )}
          {isMe ? (
            <Pressable hitSlop={6} onPress={openEdit} style={[styles.iconBtn, !collapsed && styles.iconBtnLift]} accessibilityLabel="Profili düzenle">
              <Ionicons name="pencil" size={18} color={glass.ink} />
            </Pressable>
          ) : (
            <Pressable hitSlop={6} onPress={() => setSheet('more')} style={[styles.iconBtn, !collapsed && styles.iconBtnLift]} accessibilityLabel="Diğer">
              <Ionicons name="ellipsis-horizontal" size={20} color={glass.ink} />
            </Pressable>
          )}
        </View>
        {collapsed && <TabBar tabs={tabs} tab={tab} onChange={pickTab} />}
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
          {liveCalls() && pair && !blocked.has(user.id) && <BarButton icon="call" label="Ara" off={!pair.calls.voice.open && !pair.calls.video.open} onPress={() => setSheet('call')} />}
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
          { label: 'Profili paylaş', icon: 'share-social-outline', onPress: shareProfile },
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
            showAlert('Şikâyet alındı', `Talep #${no}. Sonuç bildirim olarak gelir.`);
          },
        }))}
      />
      {report.sheet}
      <ActionSheet
        visible={sheet === 'call'}
        title={`${user.name} ile arama`}
        onClose={() => setSheet('none')}
        options={
          pair
            ? [
                { label: callLabel(pair, 'voice'), icon: 'call-outline', onPress: () => callPair(user.id, pair, 'voice') },
                { label: callLabel(pair, 'video'), icon: 'videocam-outline', onPress: () => callPair(user.id, pair, 'video') },
              ]
            : [
                { label: `📞 Sesli arama · 🪙 ${Math.round(callPrice(user) / 2)}/dk${can('voice').ok ? '' : ' · kapalı'}`, onPress: () => call('sesli') },
                { label: `🎥 Görüntülü arama · 🪙 ${callPrice(user)}/dk${can('video').ok ? '' : ' · kapalı'}`, onPress: () => call('goruntulu') },
              ]
        }
      />
      {isMe && <VoiceRecorderSheet visible={voiceOpen} current={voice} onClose={() => setVoiceOpen(false)} save={saveVoice} remove={removeVoice} />}
      {isMe && <FollowListSheet visible={list !== null} {...MY_LISTS[list ?? 'followers']} load={() => loadList(list ?? 'followers')} onClose={() => setList(null)} />}
      {giftable && (
        <ProfileGiftSheet
          visible={sheet === 'gift'}
          name={user.name}
          gifts={giftChoices}
          coins={coins}
          svipLevel={svipLevel}
          onClose={() => setSheet('none')}
          onSend={sendGift}
          // Profil izleri: a mark gift to a photo that shows another kind's mark goes as a plain gift; said before the tap.
          noteOf={(g) => (keepingMarks(giftMarkOf(g.id), [user.id], photoMarksOf, serverNow()).length ? keptLine(g, [user.id], () => user.name, 1) : null)}
        />
      )}

      {editOpen && (
        <EditSheet
          user={me}
          live={live}
          serverAge={serverAge}
          extras={serverExtras}
          myCountry={counts?.extras?.country ?? null}
          photoBusy={avatarBusy}
          onPhoto={() => pickPhoto(false)}
          onClose={() => setEditOpen(false)}
          onSave={saveEdit}
        />
      )}
      {giftStage.node}
    </View>
  );
}

// --- Header pieces -------------------------------------------------------------

/** Profil, Anlar, Vitrin, Bağlar on a white bar: the chosen one raised, bold and underlined in pink. */
function TabBar({ tabs, tab, onChange }: { tabs: { id: Tab; label: string }[]; tab: Tab; onChange: (t: Tab) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {tabs.map((t, i) => {
        const active = t.id === tab;
        // A hairline between two tabs, except beside the chosen one (its raised pill is the edge there).
        const line = i > 0 && !active && tabs[i - 1].id !== tab;
        return (
          <View key={t.id} style={styles.tabCell}>
            <View style={[styles.tabSep, !line && { backgroundColor: 'transparent' }]} />
            <Pressable onPress={() => onChange(t.id)} style={[styles.tabItem, active && styles.tabItemOn]} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label}>
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t.label}
              </Text>
              <View style={[styles.tabIndicator, !active && { backgroundColor: 'transparent' }]} />
            </Pressable>
          </View>
        );
      })}
    </View>
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

// --- Bağlar tab pieces -----------------------------------------------------------

/**
 * Ajans or Aile: its label and a card (its emblem, name and role). Mine, when I'm in none, invites me to join;
 * someone else's, when they're in none, stays out.
 */
function AffiliationBlock({ title, icon, item, empty, emptyHref }: { title: string; icon: keyof typeof Ionicons.glyphMap; item: Affiliation | null; empty: string; emptyHref?: Href }) {
  if (!item && !emptyHref) return null;
  const go = item ? (item.href ? () => router.push(item.href!) : undefined) : () => router.push(emptyHref!);
  return (
    <>
      <SectionLabel icon={icon} title={title} />
      <LinkCard
        emblem={item?.emoji}
        icon={title === 'Aile' ? 'heart' : icon}
        title={item ? item.name : empty}
        sub={item?.sub}
        empty={!item}
        onPress={go}
        label={item ? `${title}: ${item.name}, ${item.sub}` : `${empty}. ${title === 'Ajans' ? 'Ajansa' : 'Aileye'} katıl`}
      />
    </>
  );
}

// --- Profil tab pieces -----------------------------------------------------------

function FanClubCard({ name, club }: { name: string; club: FanClub | undefined }) {
  const { semantic } = useTheme();
  const styles = useStyles();
  const [showHistory, setShowHistory] = useState(false);
  const points = club?.points ?? 0;
  const fan = fanLevel(points);
  return (
    <PCard style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="heart" size={15} color={glass.pink} style={{ marginRight: 6 }} />
        <Text style={{ color: glass.ink, fontWeight: '800', flex: 1 }}>{name} hayran kulübü</Text>
        <Text style={{ color: glass.deep, fontWeight: '800' }}>
          Lv.{fan.index + 1} · {points} puan
        </Text>
      </View>
      <Text style={styles.glassMeta}>
        {fan.current.name} · Ödül: {fan.current.reward}
      </Text>
      <View style={styles.track}>
        <View style={{ height: 6, backgroundColor: semantic.social, width: fan.next ? `${((points - fan.current.min) / (fan.next.min - fan.current.min)) * 100}%` : '100%' }} />
      </View>
      <Text style={styles.glassMeta}>{fan.next ? `Sonraki: ${fan.next.name} (${fan.next.min} puan) → ${fan.next.reward}` : 'En üst kulüp seviyesi'}</Text>
      <Text style={styles.glassMeta}>Puan kazan: takip et (+10), odasına katıl (+5), odada kal (+2/dk), görevler; hediye zorunlu değil.</Text>
      <Pressable onPress={() => setShowHistory((v) => !v)} hitSlop={{ top: 14, bottom: 14 }}>
        <Text style={{ color: glass.deep, fontWeight: '700', fontSize: 12 }}>{showHistory ? 'Puan geçmişini gizle' : 'Puan geçmişi'}</Text>
      </Pressable>
      {showHistory &&
        (club?.history.length ? (
          club.history.map((h, i) => (
            <Text key={`${h.time}-${i}`} style={styles.glassMeta}>
              {h.time} · {h.text} · +{h.pts}
            </Text>
          ))
        ) : (
          <Text style={styles.glassMeta}>Henüz puan yok.</Text>
        ))}
      <Text style={[styles.glassMeta, { fontSize: 12 }]}>Seviyeler: {FAN_LEVELS.map((l) => l.name).join(' → ')}</Text>
    </PCard>
  );
}

function MomentItem({ moment, user }: { moment: Moment; user: User }) {
  const styles = useStyles();
  return (
    <PCard style={{ gap: 10 }}>
      <View style={styles.row}>
        <Avatar uri={user.avatar} size={36} name={user.name} />
        <View style={{ flex: 1 }}>
          <Text style={styles.momentName} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={[styles.glassMeta, { fontSize: 12 }]}>{moment.time}</Text>
        </View>
      </View>
      {!!moment.text && <Text style={styles.momentText}>{moment.text}</Text>}
      {moment.image && <Image source={{ uri: moment.image }} style={styles.momentImg} />}
      <View style={[styles.row, { gap: 16 }]}>
        <View style={styles.row} accessibilityLabel={`${moment.likes} beğeni`}>
          <Ionicons name="heart-outline" size={16} color={glass.plum} />
          <Text style={styles.glassMeta}>{moment.likes}</Text>
        </View>
        <View style={styles.row} accessibilityLabel={`${moment.comments} yorum`}>
          <Ionicons name="chatbubble-outline" size={15} color={glass.plum} />
          <Text style={styles.glassMeta}>{moment.comments}</Text>
        </View>
      </View>
    </PCard>
  );
}

// --- Vitrin (onur) tab ----------------------------------------------------------------------

function Pedestals({ items }: { items: { id: string; emoji: string; name: string; art?: ArtName }[] }) {
  const styles = useStyles();
  const slots = [0, 1, 2, 3].map((i) => items[i] ?? null);
  return (
    <View style={styles.pedestals}>
      {slots.map((it, i) => (
        <View key={it?.id ?? `empty-${i}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={styles.pedestalArt}>{it ? it.art ? <Art name={it.art} size={34} /> : <Text style={{ fontSize: 28 }}>{it.emoji}</Text> : null}</View>
          <View style={[styles.pedestal, !it && { opacity: 0.45 }]} />
          <Text style={styles.pedestalName} numberOfLines={1}>
            {it?.name ?? ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** `server`: live mode, the Vitrin as the server has it (only what was earned or bought; no gift collections). */
function OnurTab({
  userId,
  isMe,
  giftWall,
  myRides,
  server,
}: {
  userId: string;
  isMe: boolean;
  giftWall: (Gift & { count: number })[];
  myRides: { id: string; emoji: string; name: string }[] | null;
  server?: ShowcaseView;
}) {
  const { dark } = useTheme();
  const styles = useStyles();
  const medals = server ? server.medals : medalsOf(userId);
  const titles = server ? server.titles : titlesOf(userId);
  const rides = server ? server.rides : (myRides ?? vehiclesOf(userId).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })));
  const lit = giftWall.filter((g) => g.count > 0).length;
  const gold = medals.filter((m) => m.tier === 'gold').length;
  const collections = GIFT_COLLECTIONS.map((c) => ({ ...c, done: collectionProgress(userId, c) }));
  const doneCollections = collections.filter((c) => c.done >= c.total).length;
  const explain = (title: string, body: string) => () => showAlert(title, body);
  const count = (text: string) => <Text style={styles.cardCount}>{text}</Text>;

  return (
    <>
      <PCard
        style={{ gap: 4 }}
        label="Madalyalar"
        onPress={explain('Madalyalar', server ? `${isMe ? '' : `${medals.length} madalya kazanılmış. `}${MEDAL_HOWTO}` : isMe ? 'Etkinliklere katılarak ve görevleri tamamlayarak madalya kazan.' : `${medals.length} madalya kazanılmış.`)}
      >
        <CardHead icon="medal-outline" tone="soft" small title="Madalyalar" right={count(`🏅 ${gold} · 🥈 ${medals.length - gold}`)} chevron />
        <Pedestals items={medals} />
      </PCard>

      <PCard style={{ gap: 4 }} label="Unvanlar" onPress={explain('Unvanlar', server ? TITLE_HOWTO : 'Sıralamalarda ve etkinliklerde derece yaparak unvan kazan.')}>
        <CardHead icon="ribbon-outline" tone="soft" small title="Unvanlar" sub="Yalnızca dinamik unvanlar" right={count(String(titles.length))} chevron />
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
              <View key={`slot-${i}`} style={[styles.titleSlot, styles.titleEmpty]} />
            );
          })}
        </View>
      </PCard>

      <PCard style={{ gap: 4 }} label="Binekler · mağazada satın al" onPress={() => router.push('/magaza')}>
        <CardHead icon="car-sport-outline" tone="soft" small title="Binekler" right={count('Satın al')} chevron />
        <Pedestals items={rides} />
      </PCard>

      {/* Live mode: the entry effects they own on the server, beside the rides. */}
      {server && (
        <PCard style={{ gap: 4 }} label="Giriş efektleri · mağazada satın al" onPress={() => router.push('/magaza')}>
          <CardHead icon="sparkles-outline" tone="soft" small title="Giriş Efektleri" right={count('Satın al')} chevron />
          <Pedestals items={server.entries} />
        </PCard>
      )}

      <PCard style={{ gap: 8 }}>
        <CardHead icon="gift-outline" tone="purple" small title="Hediye Koleksiyonu" right={count(`Toplanan ${lit}/${giftWall.length}`)} />
        <View style={styles.giftWall}>
          {giftWall.map((g) => (
            <View key={g.id} style={styles.giftCell}>
              <GiftArt giftId={g.id} emoji={g.emoji} size={34} style={{ opacity: g.count > 0 ? 1 : 0.25 }} textStyle={{ fontSize: 26, opacity: g.count > 0 ? 1 : 0.25 }} />
              <Text style={[styles.glassMeta, { fontSize: 12 }]} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={{ color: g.count > 0 ? glass.deep : glass.plum, fontSize: 12, fontWeight: '800' }}>x{g.count}</Text>
            </View>
          ))}
        </View>
      </PCard>

      {/* The gift collections are the demo's sample progress: live mode has none on the server. */}
      {!server && (
        <PCard style={{ gap: 12 }}>
          <CardHead icon="albums-outline" tone="soft" small title="Hediye Kataloğu" right={count(`${doneCollections}/${collections.length}`)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {collections.map((c) => (
              <LinearGradient key={c.id} colors={c.done > 0 ? c.colors : dark ? ['#3F3A52', '#1F1B2E'] : ['#F6E9EF', '#EBD5DF']} style={styles.collection}>
                {c.art ? <Art name={c.art} size={56} style={{ opacity: c.done > 0 ? 1 : 0.4 }} /> : <Text style={{ fontSize: 44, opacity: c.done > 0 ? 1 : 0.4 }}>{c.emoji}</Text>}
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
        </PCard>
      )}
    </>
  );
}

// --- Sheets ----------------------------------------------------------------------------

const GENDERS: [User['gender'] | 'hidden', string][] = [
  ['Kadın', 'Kadın'],
  ['Erkek', 'Erkek'],
  ['hidden', 'Belirtmek istemiyorum'],
];
// Live mode against a server that keeps no extras: Kadın or Erkek (or nothing yet), no hiding. With them, "Gizli"
// keeps the gender for matching and stops it showing to others (server/api/profiles.mjs genderHidden).
const LIVE_GENDERS = GENDERS.filter(([g]) => g !== 'hidden');

/**
 * What the edit form hands back: what PATCH /api/me takes, the country and whether the gender shows, and (live
 * mode, when the server keeps them) the personal extras.
 */
type EditResult = ProfileEdit & { country: string; showGender: boolean; extras?: ExtrasDraft };

function EditSheet({
  user,
  live,
  serverAge,
  extras,
  myCountry,
  photoBusy,
  onSave,
  onClose,
  onPhoto,
}: {
  user: User;
  live: boolean;
  /** Live mode: my age as the server has it; a number means my birth date is already set there. */
  serverAge: number | null;
  /** Live mode: my extras as the server has them; null when it keeps none (no extras, country or "Gizli" then). */
  extras: ProfileExtras | null;
  /** Live mode: my country on the server (null: none chosen). */
  myCountry: string | null;
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
  const [username] = useState(user.username ?? '');
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState(user.city);
  // The birth date is set once (sign-up or here, the first time) and never again: the server refuses a second one.
  // Live mode: only the server's age says it is set. A date this phone remembers from elsewhere (the demo's sample
  // date) neither locks the field nor shows (owners, 22 Nov 2026: a field locked on a date never entered).
  const birthLocked = live ? serverAge !== null : !!user.birthDate;
  const shownBirth = live ? birthShown(user.birthDate, serverAge) : user.birthDate;
  // Live mode: an open field starts empty (a date this phone remembers was never sent).
  const [birth, setBirth] = useState(birthLocked || live ? '' : formatTrDate(user.birthDate));
  // Live mode: the extras, the country and "Gizli" only when the server keeps them.
  const withExtras = !live || !!extras;
  const [gender, setGender] = useState<User['gender'] | 'hidden'>(withExtras && user.showGender === false ? 'hidden' : user.gender);
  const [country, setCountry] = useState(live ? (myCountry ?? '') : (user.country ?? 'TR'));
  const [interests, setInterests] = useState<string[]>(user.interests ?? []);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [extrasDraft, setExtrasDraft] = useState<ExtrasDraft | null>(() => (live && extras ? draftFromExtras(extras) : null));
  const [extrasErrors, setExtrasErrors] = useState<ReturnType<typeof validateExtras>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    // Same rules the server applies; nothing is saved while any field is invalid.
    const draft = { name, username, bio, city, birth };
    const e = validateProfile(draft);
    // A birth date already set isn't sent again; one not entered yet stays optional.
    if (birthLocked || !birth.trim()) delete e.birth;
    // The username can't be changed for now (USERNAME_SOON): the one held goes back unchanged, unchecked.
    delete e.username;
    setErrors(e);
    const xe = extrasDraft ? validateExtras(extrasDraft) : {};
    setExtrasErrors(xe);
    // One refusal counted per save, as the server counts one per request.
    if (Object.keys(e).length) noteProfileRefusal(draft, e);
    else if (extrasDraft) noteExtrasRefusal(extrasDraft, xe);
    // The contact note can come from several fields; it is said once.
    const all = [...Object.values(e), ...Object.values(xe)];
    if (all.length) return showAlert('Profil kaydedilemedi', [...new Set(all)].join('\n'));
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
      ...(extrasDraft && { extras: extrasDraft }),
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
            {/* Choosing or changing a username will be a paid feature (owners, 22 Nov 2026): locked for everyone, "Yakında". */}
            <Field label="Kullanıcı adı" hint={USERNAME_SOON}>
              <View style={[styles.row, styles.input]} accessible accessibilityLabel={`Kullanıcı adı ${username ? `@${username}` : 'yok'}. ${USERNAME_SOON}`}>
                <Ionicons name="lock-closed" size={14} color={colors.textDim} />
                <Text style={{ flex: 1, color: colors.textDim, fontSize: 15 }} numberOfLines={1}>
                  {username ? `@${username}` : 'Kullanıcı adı yok'}
                </Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: semantic.tonal }}>
                  <Text style={{ color: semantic.tonalText, fontSize: 11, fontWeight: '800' }}>Yakında</Text>
                </View>
              </View>
            </Field>
            <Field label={`Hakkımda · ${bio.length}/${LIMITS.bio}`} error={errors.bio}>
              <TextInput value={bio} onChangeText={setBio} maxLength={LIMITS.bio} multiline style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Kendini anlat" placeholderTextColor={colors.textDim} />
            </Field>
            {birthLocked ? (
              <Field label="Doğum tarihi" hint="Değiştirmek için Destek'e yaz. Diğerleri yalnız yaşını görür.">
                <View style={[styles.row, styles.input]}>
                  <Ionicons name="lock-closed" size={14} color={colors.textDim} />
                  <Text style={{ color: colors.textDim, fontSize: 15 }}>{shownBirth ? formatTrDate(shownBirth) : `${serverAge ?? user.age} yaş`}</Text>
                </View>
              </Field>
            ) : (
              <Field label="Doğum tarihi" error={errors.birth} hint="Bir kez girilir. Diğerleri yalnız yaşını görür.">
                <TextInput value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} placeholder="GG.AA.YYYY" placeholderTextColor={colors.textDim} />
              </Field>
            )}
            <Field label="Cinsiyet (isteğe bağlı)" hint={withExtras && gender === 'hidden' && live ? 'Cinsiyetin eşleşme için kalır; diğerleri yalnızca yaşını görür.' : undefined}>
              <ChipRow value={gender} options={withExtras ? GENDERS : LIVE_GENDERS} onChange={setGender} />
            </Field>
            {/* Live mode: only when the server keeps it (an older one doesn't); it may be left out there. */}
            {withExtras && (
              <Field label="Ülke">
                <ChipRow
                  value={country}
                  options={[...(live ? [['', 'Belirtme'] as [string, string]] : []), ...COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => [c.code, `${c.flag} ${c.name}`] as [string, string])]}
                  onChange={setCountry}
                />
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
            {extrasDraft && <ProfileExtrasForm draft={extrasDraft} errors={extrasErrors} onChange={setExtrasDraft} />}
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

/** The username field's note: choosing or changing one opens later, as a paid feature (server social.mjs USERNAME_OPEN). */
const USERNAME_SOON = 'Kullanıcı adı değiştirme yakında açılacak.';

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
  const styles = useStyles();
  const n = (x: number) => x.toLocaleString('tr-TR');
  return (
    <View style={styles.privateCard}>
      <View style={styles.row}>
        <Ionicons name="lock-closed" size={14} color={glass.plum} />
        <Text style={[styles.glassMeta, { fontSize: 12 }]}>Yalnızca sen görürsün</Text>
      </View>
      <View style={styles.privateRow}>
        <Pressable style={styles.privateCell} onPress={() => router.push('/cuzdan')} accessibilityLabel="Jeton bakiyesi">
          <Icon3D name="coin" size={26} />
          <Text style={styles.privateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {n(p.coins)}
          </Text>
          <Text style={styles.glassMeta}>Jeton</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/gelir')} accessibilityLabel="Elmas bakiyesi">
          <Icon3D name="diamond" size={26} />
          <Text style={styles.privateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {n(p.diamonds)}
          </Text>
          <Text style={styles.glassMeta}>Elmas</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/vip')} accessibilityLabel="VIP durumu">
          <Icon3D name="crown" size={26} />
          <Text style={styles.privateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {p.vipUntil ?? 'Yok'}
          </Text>
          <Text style={styles.glassMeta}>{p.vipUntil ? 'VIP bitişi' : 'VIP'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/seviye')} accessibilityLabel="Seviye ve deneyim puanı">
        <Text style={styles.glassMeta}>
          Cömertlik puanı {n(p.wealthXp)} · Yankı puanı {n(p.charmXp)} · Hediye: {n(p.giftsSent)} gönderdin{p.giftsReceived === null ? '' : `, ${n(p.giftsReceived)} aldın`} ›
        </Text>
      </Pressable>
    </View>
  );
}

const AVATAR_UP = 52;

const useStyles = makeStyles(({ colors, semantic, lift, dark, edge }) => ({
  // The header (the client's profile package): light glass, the same in either scheme.
  hero: { paddingHorizontal: 16, paddingBottom: 4, gap: 10 },
  cover: { height: 150, borderRadius: 24, overflow: 'hidden', backgroundColor: glass.well, borderWidth: 1.5, borderColor: glass.rim, boxShadow: glass.shadow },
  coverEmpty: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: glass.well },
  // The avatar rises over the cover's lower edge; the name block starts just under the cover.
  idRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: -AVATAR_UP - 10, paddingLeft: 6 },
  avatarWrap: { alignSelf: 'flex-start', borderRadius: 52, boxShadow: glass.shadow },
  cameraBadge: { position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: glass.pink, borderWidth: 2, borderColor: glass.white, alignItems: 'center', justifyContent: 'center' },
  heartPin: { position: 'absolute', right: -4, bottom: -2 },
  idText: { flex: 1, minWidth: 0, paddingTop: AVATAR_UP + 14, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 27, fontFamily: fonts.display, flexShrink: 1 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flagText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 26 },
  handle: { color: colors.textDim, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, rowGap: 2 },
  statusPlace: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, maxWidth: '100%' },
  statusText: { color: colors.textDim, fontSize: 14 },
  statusOn: { color: colors.text, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  reviewNote: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, rowGap: 6 },
  staffChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 25, borderRadius: 13, paddingHorizontal: 10, backgroundColor: '#B91C1C' },
  staffText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  blockedNote: { color: colors.red, textAlign: 'center' },
  statusNote: { color: colors.gold, fontSize: 13, textAlign: 'center' },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: glass.white, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'rgba(184,31,102,0.4)', boxShadow: glass.shadow },
  presenceTitle: { color: glass.ink, fontWeight: '800' },
  presenceGo: { color: '#fff', fontWeight: '800', backgroundColor: glass.pink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, overflow: 'hidden' },
  // The tabs: a white bar, the chosen tab raised on it.
  tabBar: { flexDirection: 'row', alignItems: 'center', height: TAB_H, marginHorizontal: 16, marginVertical: 6, padding: 4, borderRadius: TAB_H / 2, backgroundColor: glass.fill, borderWidth: 1.5, borderColor: glass.rim, boxShadow: glass.shadow },
  tabCell: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  tabSep: { width: 1, height: 20, backgroundColor: glass.line },
  tabItem: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, gap: 3, borderRadius: (TAB_H - 8) / 2 },
  tabItemOn: { backgroundColor: glass.white, boxShadow: '0 2px 6px rgba(120,20,70,0.14)' },
  tabText: { color: glass.plum, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: glass.ink, fontSize: 16, fontFamily: fonts.display },
  tabIndicator: { width: 26, height: 3, borderRadius: 2, backgroundColor: glass.pink },
  // A tab's cards: 16 from the edges, 12 apart.
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: colors.textDim, fontSize: 13 },
  /** Secondary text on the light glass (readable in either scheme). */
  glassMeta: { color: glass.plum, fontSize: 13 },
  cardCount: { color: glass.deep, fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 4 },
  photo: { width: 104, height: 104, borderRadius: 16 },
  addPhoto: { backgroundColor: glass.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: glass.line, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addPhotoText: { color: glass.plum, fontSize: 13 },
  removePhoto: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(22,14,18,0.75)', alignItems: 'center', justifyContent: 'center' },
  lvChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lvText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: glass.well, overflow: 'hidden' },
  momentName: { color: glass.ink, fontWeight: '700' },
  momentText: { color: glass.ink, fontSize: 15 },
  momentImg: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: glass.well },
  pedestals: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pedestalArt: { height: 38, alignItems: 'center', justifyContent: 'flex-end' },
  pedestal: { width: '90%', height: 10, borderRadius: 4, backgroundColor: glass.tint },
  pedestalName: { color: glass.plum, fontSize: 11, fontWeight: '600' },
  titleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'space-between' },
  titleSlot: { width: '31%', height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  titleEmpty: { backgroundColor: glass.well, borderWidth: 1, borderStyle: 'dashed', borderColor: glass.line },
  titleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  giftWall: { flexDirection: 'row', flexWrap: 'wrap' },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 8, gap: 1 },
  collection: { width: 120, height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'flex-end', padding: 8, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  collectionName: { color: semantic.money, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  collectionNameLocked: dark ? {} : { color: colors.textDim },
  collectionBar: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  // The fixed top bar: glass buttons and the app's name; scrolled, a glass pill with the person's name.
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  // Scrolled: the row becomes a glass pill (BAR_H tall with its margins, so the page's threshold stays the same).
  topRowOn: { height: BAR_H - 6, marginBottom: 3, marginHorizontal: 12, paddingHorizontal: 4, borderRadius: (BAR_H - 6) / 2, backgroundColor: glass.fill, borderWidth: 1.5, borderColor: glass.rim, boxShadow: glass.shadow },
  topTitle: { flex: 1, color: glass.ink, fontSize: 17, fontFamily: fonts.displayBold, textAlign: 'center' },
  brand: { flex: 1, alignItems: 'center' },
  brandPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 8, paddingRight: 14, borderRadius: 20, backgroundColor: glass.fill, borderWidth: 1.5, borderColor: glass.rim, boxShadow: glass.shadow },
  brandLogo: { width: 26, height: 26 },
  brandText: { color: glass.ink, fontSize: 18, fontFamily: fonts.display },
  iconBtn: { borderRadius: 999, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconBtnLift: { backgroundColor: glass.fill, borderWidth: 1.5, borderColor: glass.rim, boxShadow: glass.shadow },
  // Owner-only numbers.
  privateCard: { backgroundColor: glass.white, borderRadius: 20, padding: 14, gap: 10, borderWidth: 1, borderColor: glass.line, boxShadow: glass.shadow },
  privateRow: { flexDirection: 'row', gap: 8 },
  privateCell: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: glass.well, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4 },
  privateValue: { color: glass.ink, fontFamily: fonts.display, fontSize: 15 },
  // Someone else's profile: Takip et, Mesaj, Ara, Hediye along the bottom.
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  followBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 22, backgroundColor: semantic.socialFill },
  followingBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  followText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  followingText: { color: colors.text },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...lift },
  // The edit form.
  backdrop: { flex: 1, backgroundColor: SCRIM },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, ...edge.sheet },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  inputLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  fieldError: { color: semantic.danger, fontSize: 12, marginTop: 4, fontWeight: '600' },
  editChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  editChipOn: { borderColor: dark ? semantic.action : semantic.actionText, backgroundColor: dark ? 'rgba(255,95,162,0.18)' : 'rgba(208,46,120,0.11)' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.cardAlt, alignItems: 'center' },
}));
