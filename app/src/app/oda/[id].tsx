import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type HostInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { EmojiPanel } from '@/components/EmojiPanel';
import {
  ContributionModal,
  DiceModal,
  EnvelopeDrop,
  EnvelopeSendModal,
  MusicBar,
  MusicSheet,
  PasswordGate,
  RequestsModal,
  type MusicState,
} from '@/components/room/panels';
import {
  EventsSheet,
  GiftResults,
  GoalCard,
  GoalCreate,
  InviteSheet,
  ModerationSheet,
  PollCard,
  PollCreate,
  QuestionsSheet,
  SoundSheet,
  type Goal,
  type ModLog,
  type Poll,
  type Question,
  type RoomEvent,
} from '@/components/room/community';
import { RoomMenuSheet, type MenuSection } from '@/components/room/menu';
import { BossSeat, RoomInfoSheet, RoomSettingsScreen, bossSeatInfo, type GiftLogRow } from '@/components/room/owner';
import { GiftSheet } from '@/components/room/gift-sheet';
import { LuckyCombo } from '@/components/room/lucky-combo';
import { LuckyResult } from '@/components/room/lucky-result';
import { SeatMenu, type Rect, type SeatMenuItem } from '@/components/room/seat-menu';
import { EntryEffect, type EntryFx, type EntryShow } from '@/components/fx/entry';
import { AnimLayer } from '@/components/fx/anim-layer';
import { WinBanner } from '@/components/fx/win-banner';
import { GiftFlights, type Flight, type Point } from '@/components/fx/gift-flight';
import { GamePanel, type OpenGame } from '@/components/games/game-panel';
import type { CasinoGame } from '@/data/games';
import { ChatLine, GiftAnimation, MicBtn, REACTION_MS, ROLE_RANK, RoundBtn, Seat, type ChatMsg, type RoomRole, type SeatReactionData } from '@/components/room/parts';
import { PkBoard, PkSetupSheet, SoloBoard, TeamArena, type ArenaSlot } from '@/components/room/pk';
import { CrownScreen, PkResultScreen } from '@/components/room/pk-result';
import { BalconyBar, ConnectionBanner, MicInvitePrompt, ParticipantsSheet, type ParticipantActions } from '@/components/room/balcony';
import { ChatFeed } from '@/components/room/chat-feed';
import { Avatar } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { BOSS_SEAT_MIN_COINS, BOSS_SEAT_MIN_LEVEL, MUSIC_CATALOG, adminCapacity, cosmeticById, memberLimit, micCapacity, roomLevel, roomTypeInfo, ROOM_LEVEL_REWARDS, type Track } from '@/data/catalog';
import { FAMILIES, INCOMING_GIFT_POOL, vipTier } from '@/data/economy';
import { GATES, nobleInfo } from '@/data/status';
import { RULES } from '@/data/rules';
import { BOT_LINES, GIFTS, ME, USERS, roomById, userById, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { getAnimations, isLive, newAnimRequestId, sendAnimation, simulateRemoteSend } from '@/lib/animations';
import { casinoAccess, useGames } from '@/lib/games';
import { announceWin, roomTitleOf } from '@/lib/broadcast';
import { getLucky, luckyGift, newLuckyTxId, sendLucky, type LuckyRecord } from '@/lib/lucky';
import { getPk, markPkSeen, modeLabel, pkPointsFor, recordGift, reportMismatch, teamOf, usePk } from '@/lib/pk';
import {
  KICK_BAN_MIN,
  activeBans,
  answerInvite,
  deriveView,
  enterRoom,
  exitRoom,
  forceLeaveSeat,
  getRoom,
  inviteToMic,
  isOnline,
  join as joinPresence,
  kick,
  leave as leavePresence,
  leaveSeat,
  newGuest,
  resize as resizeSeats,
  seatBy,
  seedRoom,
  setBlacklist,
  setBoss,
  setConnection,
  setLocks,
  setMicMute,
  setRoles,
  takeSeat,
  useLatched,
  useRoomLive,
  type InviteStatus,
} from '@/lib/room-presence';
import { kindOf, mergeFeed, type FeedMsg } from '@/lib/chat-feed';
import { shareLink } from '@/lib/links';
import { BUSY_DEVICES, getMedia, leaveRoom, reportRoom, useMedia } from '@/lib/media';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, gradient, semantic } from '@/theme';

const DAILY_DICE = 20;
const BOT_TIPS = [
  'Oda kuralları: saygılı ol, spam ve hakaret yok. Şikâyet için ⋯ menüsünü kullan.',
  'Koltuğa geçmek için boş bir koltuğa dokun; bu odada istekle oturuluyor.',
  'Hediyeler yayıncıya elmas olarak yazılır ve oda seviyesini yükseltir.',
];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const msgId = () => String(Date.now() + Math.random());
/** Arrival time of a room event (called from handlers and effects, never while rendering). */
const stamp = () => Date.now();
const QUESTIONS = ['Türkiye\'nin en kalabalık şehri?', 'En sevdiğiniz film hangisi?', 'Yarın etkinlik var mı?', 'Hangi şarkıyı çalalım?', 'Nasıl yönetici olunur?'];
const clock = () => new Date().toTimeString().slice(0, 5);
const pad = (s: (string | null)[], n: number) => (s.length >= n ? s.slice(0, n) : [...s, ...Array<string | null>(n - s.length).fill(null)]);

/** Actions need the server: while offline nothing is sent, charged or changed. */
const offlineBlocked = () => {
  if (isOnline()) return false;
  showAlert('Bağlantı yok', 'Bu işlem bağlantı geri gelince yapılabilir. Hiçbir şey gönderilmedi, jeton düşülmedi.');
  return true;
};

const BOT_REACTIONS = ['😂', '😍', '👏', '🔥', '😎', '🥳', '❤️', '👍', '😮', '🤣'];
const BOT_ENTRY_FX: EntryFx[] = ['sparkle', 'thunder', 'comet', 'dragon', 'vip'];

export default function VoiceRoom() {
  const { id, via } = useLocalSearchParams<{ id: string; via?: string }>();
  const isOwn = id === 'yeni';
  const app = useApp();
  const { coins, spendCoins, addCoins, receiveDiamonds, bump, vipLevel, svipLevel, nobleTier, blocked, settings, setSetting, equipped, myRoom, updateMyRoom, addRoomXp, agencyId, createTicket, visitRoom, addFanPoints, following, notify, familyId, ownedAgency } = app;

  const base = isOwn ? null : roomById(id);
  const hostId = isOwn ? 'me' : base!.hostId;
  const title = isOwn ? myRoom.title : base!.title;
  const cover = isOwn ? myRoom.cover : base!.cover;
  const announcement = isOwn ? myRoom.announcement : base!.announcement;
  const password = isOwn ? '' : (base!.password ?? '');
  const level = isOwn ? roomLevel(myRoom.xp) : (base!.level ?? 1);
  const agencyRoom = isOwn ? !!agencyId : !!base!.agency;
  const maxMics = micCapacity(agencyRoom, level);
  const capacity = isOwn ? Math.min(myRoom.micCount, maxMics) : maxMics;
  const theme = isOwn ? myRoom.theme : (base!.theme ?? 'chat');
  const bossOn = isOwn ? myRoom.bossSeat && level >= BOSS_SEAT_MIN_LEVEL : !!base!.bossSeat;
  const micPermission = isOwn ? myRoom.micPermission : (base!.micPermission ?? 'everyone');
  const functionsBy = isOwn ? myRoom.manageFunctions : 'admins';
  const adminIds = isOwn ? myRoom.adminIds : (base!.adminIds ?? []);
  const myRole: RoomRole = isOwn ? 'owner' : adminIds.includes('me') ? 'admin' : 'member';
  const roleOf = (uid: string): RoomRole => (uid === hostId ? 'owner' : adminIds.includes(uid) ? 'admin' : 'member');
  const canManage = myRole !== 'member';
  // "Oda işlevlerini yönet": music, polls, goals, events can be limited to the owner.
  const canFunctions = myRole === 'owner' || (myRole === 'admin' && functionsBy === 'admins');
  const botOn = isOwn ? settings.roomBot : true;
  const invisible = settings.invisibleEntry && GATES.invisibleEntry(nobleTier);
  const roomType = isOwn ? myRoom.roomType : (base!.roomType ?? 'free');
  const typeInfo = roomTypeInfo(roomType);
  // Seat locks: saved for my own room; in rooms I moderate they last for this session.
  const [localLocks, setLocalLocks] = useState<number[]>([]);
  const lockedSeats = isOwn ? myRoom.lockedSeats : localLocks;
  // Personal effect preferences never change the gift transaction itself.
  const showFx = (price: number) => !settings.effectsOff && !settings.reduceMotion && (!isOwn || myRoom.giftEffects) && (!settings.bigGiftsOnly || price >= 100);

  // Entry effect from cosmetics (ride/entry) or VIP level.
  const entryInfo = useMemo(() => {
    const tier = vipTier(vipLevel);
    const entryItem = cosmeticById(equipped.entry);
    const ride = cosmeticById(equipped.ride);
    const noble = nobleInfo(nobleTier);
    if (!entryItem && !ride && !GATES.entryBanner(svipLevel, nobleTier)) return null;
    const who = `${noble ? `${noble.emoji} ${noble.name} ` : ''}${svipLevel ? `SVIP${svipLevel} ` : ''}${ME.name}`;
    const text = `${entryItem?.emoji ?? '✨'} ${ride ? `${ride.emoji} ${ride.name} ile ` : ''}${who} odaya katıldı!`;
    const badge = [noble?.emoji, svipLevel ? `SVIP${svipLevel}` : ''].filter(Boolean).join(' ') || undefined;
    const fx = (entryItem?.fx as EntryFx | undefined) ?? 'vip';
    const show: EntryShow = { name: ME.name, avatar: app.me.avatar, fx, ride: ride?.emoji, colors: entryItem ? undefined : (tier?.color ?? gradient), badge };
    return { text, show };
  }, [vipLevel, svipLevel, nobleTier, equipped.entry, equipped.ride, app.me.avatar]);

  const [unlocked, setUnlocked] = useState(!password);
  // Entering a room while a one-to-one call is live: join as a listener, never on a mic (lib/media).
  const [joinedInCall] = useState(() => !!getMedia().call);
  // Room presence (lib/room-presence): who is in the room and on which mic. One model for the mics, the
  // Balkon and every counter. Seeded the first time the room is opened (silent, before the first read).
  useState(() =>
    seedRoom(id, {
      ownerId: hostId,
      adminIds,
      seats: isOwn ? (joinedInCall ? [] : ['me']) : base!.seatUserIds,
      capacity,
      total: isOwn ? 7 : base!.listeners,
      regulars: USERS.filter((u) => u.id !== hostId).map((u) => u.id).slice(0, isOwn ? 6 : USERS.length),
      blacklist: isOwn ? myRoom.blacklist : [],
    }),
  );
  const { room: live, offline } = useRoomLive(id);
  const view = useMemo(() => deriveView(live), [live]);
  const seats = live.seats;
  const mutedUsers = useMemo(() => new Set(live.micMuted), [live.micMuted]);
  // People who can't be in the room right now (running kick ban or blacklist); expired bans don't count.
  const kicked = new Set(activeBans(live));
  const [micOn, setMicOn] = useState(isOwn && !joinedInCall);
  // Room camera (video seat). Only while seated; turned off when a one-to-one call takes the devices.
  const [camOn, setCamOn] = useState(false);
  // People I muted for myself only: their voice and chat lines are hidden on my screen, nobody else's.
  const [silenced, setSilenced] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  // Entry effects on screen: mine when I join, then other people's (one at a time).
  const [entry, setEntry] = useState<EntryShow | null>(() => (invisible || settings.effectsOff || !entryInfo ? null : entryInfo.show));
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 'w', system: true, text: 'Odaya hoş geldin! Saygılı ol, iyi eğlenceler 💜' },
    ...(announcement ? [{ id: 'ann', system: true, text: `📢 ${announcement}` }] : []),
    ...(botOn ? [{ id: 'bot0', bot: true, text: `Merhaba ${ME.name}! ${BOT_TIPS[0]}` }] : []),
    ...(entryInfo && !invisible ? [{ id: 'vip', system: true, text: entryInfo.text }] : []),
    ...(joinedInCall ? [{ id: 'incall', system: true, text: '📞 Bire bir görüşmedesin; odaya dinleyici olarak katıldın. Görüşme bitince mikrofon isteyebilirsin.' }] : []),
    // Arrived by following someone from a profile / agency / tribe chat.
    ...(via && !invisible ? [{ id: 'via', system: true, text: `👣 ${ME.name}, ${userById(via).name} kişisini takip ederek odaya katıldı` }] : []),
    ...(invisible ? [{ id: 'inv', system: true, text: '👻 Gizli girişle girdin. Diğer kullanıcılar katıldığını görmez; moderasyon kayıtlarında görünürsün.' }] : []),
  ]);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Seat emoji reactions currently playing, by user id.
  const [reactions, setReactions] = useState<Record<string, SeatReactionData>>({});
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const [giftFx, setGiftFx] = useState<Gift | null>(null);
  const [luckyFx, setLuckyFx] = useState<LuckyRecord[] | null>(null);
  // Lucky combo wheel: same gift, same people, one tap per repeat (×1, ×2, ×3 …).
  const [combo, setCombo] = useState<{ giftId: string; to: string[]; count: number; key: number } | null>(null);
  const gameCatalog = useGames();
  const [game, setGame] = useState<OpenGame | null>(null);
  const [gameMin, setGameMin] = useState(false);
  // Gifts flying to seats: seat avatar views by user id, measured when a gift is sent.
  // A mutable map kept in state (never replaced), so ref callbacks can fill it during commit.
  const [seatViews] = useState(() => new Map<string, HostInstance>());
  const [seatSlots] = useState(() => new Map<number, HostInstance>());
  const seatAnchor = (uid: string | null, index: number) => (v: HostInstance | null) => {
    if (v) seatSlots.set(index, v);
    else seatSlots.delete(index);
    if (!uid) return;
    if (v) seatViews.set(uid, v);
    else seatViews.delete(uid);
  };
  const [flights, setFlights] = useState<Flight[]>([]);
  const win = useWindowDimensions();
  const listeners = view.total;
  const [peak, setPeak] = useState(view.total);
  if (view.total > peak) setPeak(view.total);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [seatMenu, setSeatMenu] = useState<{ anchor: Rect; title: string; items: SeatMenuItem[] } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[] } | null>(null);
  const [msgFilter, setMsgFilter] = useState({ joins: true, gifts: true, bot: true });
  const [panel, setPanel] = useState<null | 'menu' | 'msgSettings' | 'info' | 'settings' | 'music' | 'envelope' | 'dice' | 'contrib' | 'requests' | 'poll' | 'goal' | 'events' | 'qa' | 'sound' | 'mod' | 'invite' | 'results'>(null);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [events, setEvents] = useState<RoomEvent[]>(() =>
    roomType === 'event' ? [{ id: 'ev0', title: 'Doğruluk mu Cesaret mi', desc: 'Haftalık oyun gecesi', when: 'Bugün 22:00', type: 'Oyun', by: hostId, going: false, reminder: false, attendees: 37, cancelled: false }] : [],
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [modLog, setModLog] = useState<ModLog[]>([]);
  const [slowMode, setSlowMode] = useState(false);
  const [words, setWords] = useState<string[]>(['spam', 'reklam']);
  const [bans, setBans] = useState<{ userId: string; until: string }[]>([]);
  const [invited, setInvited] = useState<Record<string, 'Davet edildi' | 'Katıldı'>>({});
  const [myQueuePos, setMyQueuePos] = useState<number | null>(null);
  const [giftResults, setGiftResults] = useState<{ userId: string; ok: boolean }[]>([]);
  const [musicRequests, setMusicRequests] = useState<{ track: Track; by: string }[]>([]);
  // PK (lib/pk is the PK server: clock, score and result live there). While the connection is down the
  // room keeps showing the last PK state it received, like the presence data.
  const pkStore = useLatched(usePk(), offline);
  const pk = pkStore.sessions.find((x) => ['invite', 'prep', 'active'].includes(x.status) && (x.roomId === id || x.opponentRoomId === id)) ?? null;
  const lastPk = pkStore.sessions.find((x) => x.roomId === id || x.opponentRoomId === id);
  const [pkSetup, setPkSetup] = useState(false);
  const teamPk = pk?.kind === 'room' && pk.mode === 'team' && pk.status !== 'invite' ? pk : null;
  const teamColorOf = (uid: string | null) => (uid && teamPk ? teamOf(teamPk, uid)?.color : undefined);
  /** PK points under a seat: everyone on a mic in Normal / cross PK, team members in Takım PK. */
  const pkPointsOf = (uid: string | null) => (!uid || !pk || pk.status === 'invite' || (teamPk && !teamOf(teamPk, uid)) ? undefined : pkPointsFor(pk, id, uid));
  // Profiles opened from the PK end screens: hide them while away, show them again on return.
  const [awayFromRoom, setAwayFromRoom] = useState(false);
  useFocusEffect(useCallback(() => setAwayFromRoom(false), []));
  const openProfileFromPk = (uid: string) => {
    setAwayFromRoom(true);
    router.push(`/kullanici/${uid}`);
  };
  // Gifts score in a PK only through the PK server, once per transaction id.
  const scorePk = (txId: string, senderId: string, recipientId: string, giftId: string, coins: number) => {
    const r = recordGift(id, txId, senderId, recipientId, giftId, coins);
    if (!r.ok && !r.duplicate && pk?.status === 'active' && r.reason.includes('aktif değil')) reportMismatch(txId, 'Hediye alındı ama PK puanı yazılamadı');
    return r;
  };
  // Boss-seat rooms start with an existing top gifter so the seat can be competed for.
  const [contrib, setContrib] = useState<Record<string, number>>(() => {
    if (isOwn || !base!.bossSeat) return {};
    const rival = USERS.find((u) => u.id !== hostId && !base!.seatUserIds.includes(u.id));
    return rival ? { [rival.id]: 1_250 } : {};
  });
  const [bossRemoved, setBossRemoved] = useState<Set<string>>(new Set());
  const [membership, setMembership] = useState<'owner' | 'none' | 'pending' | 'member'>(isOwn ? 'owner' : 'none');
  const [memberApps, setMemberApps] = useState<string[]>(() => (isOwn ? ['u2', 'u9', 'u11'] : []));
  const [minutes, setMinutes] = useState(0);
  const [giftLog, setGiftLog] = useState<GiftLogRow[]>([]);
  const [requests, setRequests] = useState<string[]>([]);
  const [envelope, setEnvelope] = useState<{ from: string; amount: number; count: number; seconds: number } | null>(null);
  const [dicePlays, setDicePlays] = useState(DAILY_DICE);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [music, setMusic] = useState<MusicState>(() => {
    const t = MUSIC_CATALOG.find((m) => m.id === base?.track);
    return { queue: t ? [t, ...MUSIC_CATALOG.filter((m) => m.id !== t.id).slice(0, 2)] : [], playing: !!t, position: 0 };
  });
  const xpRef = useRef(myRoom.xp);

  const allSeats = pad(seats, capacity);
  const ranking = Object.entries(contrib).sort((a, b) => b[1] - a[1]);
  const topGifter = ranking.find(([uid]) => !bossRemoved.has(uid) && !kicked.has(uid));
  const bossId = bossOn && topGifter && topGifter[1] >= BOSS_SEAT_MIN_COINS ? topGifter[0] : null;
  // The boss seat is a speaking seat: the presence server counts its holder as on a mic (PK, lists, counts).
  useEffect(() => setBoss(id, bossId), [id, bossId]);
  const mySeat = allSeats.indexOf('me');
  const amSeated = mySeat >= 0 || bossId === 'me';
  const seatedOthers = allSeats.filter((s): s is string => !!s && s !== 'me');

  // --- Mic/camera arbitration with one-to-one calls (Hemen Tanış spec §3–4, lib/media) -----------------
  const media = useMedia();
  const callActive = !!media.call;
  useEffect(() => {
    reportRoom({ roomId: id, title, seated: amSeated, micOn: amSeated && micOn, camOn: amSeated && camOn });
  }, [id, title, amSeated, micOn, camOn]);
  useEffect(() => () => leaveRoom(id), [id]);
  // Enter the room (presence) once past the password, and leave it when the screen closes. Own room: the host takes mic 1.
  useEffect(() => {
    if (!unlocked) return;
    const r = enterRoom(id, 'me', { hidden: invisible });
    if (!r.ok) {
      showAlert('Odaya girilemedi', r.reason);
      router.back();
      return;
    }
    if (isOwn && !joinedInCall && !getRoom(id)?.seats[0]) takeSeat(id, 'me', 0);
    return () => {
      exitRoom(id, 'me');
      setConnection('online');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unlocked]);
  // Keep the presence server's room roles, mic locks and mic count in step with the room settings.
  const adminKey = adminIds.join(',');
  useEffect(() => setRoles(id, hostId, adminKey ? adminKey.split(',') : []), [id, hostId, adminKey]);
  const lockKey = lockedSeats.join(',');
  useEffect(() => setLocks(id, lockKey ? lockKey.split(',').map(Number) : []), [id, lockKey]);
  useEffect(() => resizeSeats(id, capacity), [id, capacity]);
  const blacklistKey = isOwn ? myRoom.blacklist.join(',') : '';
  useEffect(() => {
    if (isOwn) setBlacklist(id, blacklistKey ? blacklistKey.split(',') : []);
  }, [id, isOwn, blacklistKey]);
  // A call takes the devices: get off the mic (the presence server is updated after this render).
  useEffect(() => {
    if (!callActive) return;
    const t = setTimeout(() => leaveSeat(id, 'me'), 0);
    return () => clearTimeout(t);
  }, [callActive, id]);
  // Derived transition when a call starts or ends: I stay in the room, but the call owns mic and camera.
  const [sawCall, setSawCall] = useState(callActive);
  if (callActive !== sawCall) {
    setSawCall(callActive);
    if (callActive) {
      const wasSeated = amSeated;
      const hadCam = camOn;
      if (bossId === 'me') setBossRemoved((b) => new Set(b).add('me'));
      setMicOn(false);
      setCamOn(false);
      setMyQueuePos(null); // the queue must not put me back on a mic during or after the call
      setMessages((m) =>
        mergeFeed(m, [
          {
            id: msgId(),
            system: true,
            at: Date.now(),
            text: `📞 Bire bir görüşmeye geçtin: ${wasSeated ? 'mikrofon koltuğundan indin, ' : ''}${hadCam ? 'oda kameran kapatıldı, ' : ''}odada dinleyici olarak kalıyorsun.`,
          },
        ]),
      );
    } else {
      setMessages((m) => mergeFeed(m, [{ id: msgId(), system: true, at: Date.now(), text: '✅ Görüşme bitti. Hâlâ odadasın; istersen yeniden mikrofon isteyebilir veya kameranı açabilirsin.' }]));
    }
  }
  /** Room mic/seat/camera controls are locked while a call holds the devices. */
  const devicesBusy = () => {
    if (!getMedia().call) return false;
    showAlert('Görüşmedesin', BUSY_DEVICES);
    return true;
  };
  const toggleCam = async () => {
    if (devicesBusy()) return;
    if (!camOn && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return showAlert('Kamera izni gerekli', 'Odada görüntünü paylaşmak için cihaz ayarlarından kamera izni ver.');
    }
    setCamOn((c) => !c);
    addMsg({ system: true, text: camOn ? `${ME.name} kamerasını kapattı` : `📹 ${ME.name} kamerasını açtı` });
  };
  const seatedKey = [...seatedOthers, bossId && bossId !== 'me' ? bossId : ''].join(',');
  // Balkon: people in the room who are not on a mic (from the presence model, never a separate list).
  const audience = useMemo(() => view.balconyIds.filter((u) => u !== 'me' && !blocked.has(u)).map(userById), [view.balconyIds, blocked]);
  const gameEntry = { from: 'room' as const, roomId: id, roomTitle: title };
  // Table seats: me, people on the mics, then listeners (the game's own lobby, separate from room seats).
  const gamePlayers = [{ id: 'me', name: ME.name, avatar: app.me.avatar }, ...[...seatedOthers.map(userById), ...audience].slice(0, 5)];
  const canControlMusic = canFunctions;

  const mask = (text: string) => words.reduce((t, w) => t.replace(new RegExp(w, 'gi'), '***'), text);
  // Room events arrive once by id (lib/chat-feed). While the connection is down they wait in a buffer and
  // are merged, in time order and without duplicates, when it comes back.
  const offlineFeed = useRef<FeedMsg[]>([]);
  const addMsg = (msg: Omit<ChatMsg, 'id'> & { id?: string }) => {
    const m: ChatMsg = { ...msg, text: msg.userId ? mask(msg.text) : msg.text, id: msg.id ?? msgId(), at: stamp() };
    if (!isOnline()) offlineFeed.current.push(m);
    else setMessages((list) => mergeFeed(list, [m]));
  };
  useEffect(() => {
    if (offline) return;
    const t = setTimeout(() => {
      const buffered = offlineFeed.current;
      offlineFeed.current = [];
      if (!buffered.length) return;
      // The server re-sends its latest events on resync; the ones already shown are dropped by id.
      setMessages((list) => mergeFeed(list, [...list.slice(-3), ...buffered, { id: msgId(), system: true, at: Date.now(), text: `🔄 Bağlantı geri geldi · ${buffered.length} olay eşitlendi` }]));
    }, 0);
    return () => clearTimeout(t);
  }, [offline]);
  const dropConnection = () => {
    setConnection('offline');
    setTimeout(() => setConnection('online'), 8000);
  };
  const logMod = (action: string, target: string, reason = '') =>
    setModLog((l) => [{ id: msgId(), time: new Date().toTimeString().slice(0, 5), actor: myRole === 'owner' ? 'Sahip (sen)' : 'Yönetici (sen)', action, target, reason }, ...l]);
  const addContrib = (uid: string, n: number) => setContrib((c) => ({ ...c, [uid]: (c[uid] ?? 0) + n }));
  const logGift = (from: string, to: string, gift: Gift, count: number) =>
    setGiftLog((l) => [{ id: msgId(), from, to, emoji: gift.emoji, name: gift.name, count, coins: gift.price * count, time: clock() }, ...l].slice(0, 100));

  // Room XP for the user's own room. Level-ups are announced once per level.
  const gainXp = (n: number) => {
    if (!isOwn) return;
    const before = roomLevel(xpRef.current);
    xpRef.current += n;
    const after = roomLevel(xpRef.current);
    addRoomXp(n);
    if (after > before) addMsg({ system: true, text: `🎉 Oda seviyesi Lv.${after} oldu! Açılan: ${ROOM_LEVEL_REWARDS[after - 1]}` });
  };


  // Announce a new boss once per change (deferred so it isn't a synchronous effect update).
  const lastBoss = useRef<string | null>(null);
  useEffect(() => {
    if (bossId === lastBoss.current) return;
    lastBoss.current = bossId;
    if (!bossId) return;
    const t = setTimeout(() => {
      addMsg({ system: true, text: `👑 ${bossId === 'me' ? ME.name : userById(bossId).name} patron koltuğuna oturdu!` });
      if (bossId === 'me') setMicOn(true);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossId]);

  // Recent rooms (personalized discovery) and fan-club points for joining.
  useEffect(() => {
    const t = setTimeout(() => {
      visitRoom(id);
      if (!isOwn) addFanPoints(hostId, 5, 'Odaya katıldın');
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Minutes in room: daily task + room XP + fan points.
  useEffect(() => {
    const t = setInterval(() => {
      bump('roomMinutes');
      setMinutes((m) => m + 1);
      gainXp(10);
      if (!isOwn) addFanPoints(hostId, 2, 'Odada 1 dk aktif kaldın');
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Labeled system bot with periodic tips (owner can switch it off).
  useEffect(() => {
    if (!botOn) return;
    const t = setInterval(() => addMsg({ bot: true, text: pick(BOT_TIPS) }), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botOn]);

  // --- Animated reactions / effect gifts (central catalog, lib/animations) ----------------------------
  // Seat position for an animation; listeners send from the bottom of the room.
  const originOf = (uid: string) =>
    new Promise<Point | null>((resolve) => {
      const v = seatViews.get(uid);
      if (!v) return resolve(uid === 'me' ? { x: win.width / 2, y: win.height - 150 } : null);
      v.measureInWindow((x, y, w, h) => resolve(w ? { x: x + w / 2, y: y + h / 2 } : null));
    });
  const sendAnim = (animationId: string) => {
    // Only the id goes to the "server"; price, licence and activity are read from the catalog there.
    const r = sendAnimation(animationId, id, 'me', newAnimRequestId(), { spend: spendCoins, refund: addCoins });
    if (!r.ok) return showAlert('Gönderilemedi', r.reason);
    tapHaptic();
    setEmojiOpen(false);
    const a = getAnimations().catalog.find((x) => x.animation_id === animationId);
    if (a && r.charged) {
      addMsg({ system: true, kind: 'gift', text: `✨ ${ME.name} ${a.name} efekt hediyesi gönderdi (🪙 ${r.charged.toLocaleString('tr-TR')})` });
      bump('giftsSent', 1);
    }
  };
  // Mic effect follows actual talking (polled by the layer; never charges, never sends anything).
  const speakingMe = useRef(false);
  useEffect(() => {
    speakingMe.current = speaking.has('me');
  }, [speaking]);

  // Seat emoji: plays over the sender's avatar, then clears itself (unless replaced by a newer one).
  const react = (uid: string, emoji: string) => {
    const key = Date.now() + Math.random();
    setReactions((r) => ({ ...r, [uid]: { emoji, key } }));
    setTimeout(() => setReactions((r) => (r[uid]?.key === key ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== uid)) : r)), REACTION_MS);
  };
  // Only recipients sitting on a seat get a flight; listeners see the chat line instead.
  const flyGift = (emoji: string, count: number, toIds: string[], from: Point) => {
    if (settings.effectsOff || settings.reduceMotion) return;
    toIds.forEach((uid, i) =>
      seatViews.get(uid)?.measureInWindow((x, y, w, h) => {
        if (!w) return;
        const key = `${Date.now()}-${uid}-${Math.random()}`;
        setFlights((f) => [...f.slice(-11), { key, emoji, count, from, to: { x: x + w / 2, y: y + h / 2 }, delay: i * 90 }]);
      }),
    );
  };
  // Other people on mic send seat emoji now and then (quiet when effects are off).
  const botReactions = !settings.effectsOff;
  useEffect(() => {
    if (!botReactions) return;
    const t = setInterval(() => {
      const seated = seatedKey.split(',').filter(Boolean);
      if (!seated.length || Math.random() > 0.35) return;
      react(pick(seated), pick(BOT_REACTIONS));
    }, 3500);
    return () => clearInterval(t);
  }, [seatedKey, botReactions]);
  // Room PK: people on the Balkon back the competitors with gifts (prototype stand-in for other people's sends).
  const roomPkActive = pk?.kind === 'room' && pk.status === 'active' ? pk.id : null;
  useEffect(() => {
    if (!roomPkActive) return;
    const t = setInterval(() => {
      const cur = getPk().sessions.find((x) => x.id === roomPkActive); // live read, not the render-time copy
      const room = getRoom(id);
      if (!cur || cur.status !== 'active' || !room) return;
      const { micIds, balconyIds } = deriveView(room);
      const targets = micIds.filter((m) => m !== 'me' && (cur.mode === 'solo' || !!teamOf(cur, m)));
      const fans = balconyIds.filter((m) => m !== 'me');
      if (!targets.length || !fans.length || Math.random() > 0.6) return;
      const to = pick(targets);
      const from = userById(pick(fans));
      const g = pick(GIFTS.slice(0, 6));
      const tx = `BOT-${msgId()}`;
      const r = scorePk(tx, from.id, to, g.id, g.price);
      if (r.ok) addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${from.name} → ${userById(to).name} ${g.emoji} ${g.name} · PK +${r.points}`, gift: { fromId: from.id, toIds: [to], emoji: g.emoji, name: g.name, count: 1 } });
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPkActive]);

  // Others also send animated reactions from their seats; they arrive over the same room bus.
  useEffect(() => {
    if (!botReactions) return;
    const t = setInterval(() => {
      const seated = seatedKey.split(',').filter(Boolean);
      const free = getAnimations().catalog.filter((a) => a.display_type === 'reaction' && a.is_free && isLive(a));
      if (!seated.length || !free.length || Math.random() > 0.4) return;
      simulateRemoteSend(id, pick(seated), pick(free).animation_id);
    }, 7000);
    return () => clearInterval(t);
  }, [seatedKey, botReactions, id]);

  // Fake "who is talking".
  useEffect(() => {
    const t = setInterval(() => {
      const next = new Set<string>();
      seatedKey.split(',').forEach((uid) => uid && !mutedUsers.has(uid) && Math.random() < 0.35 && next.add(uid));
      if (amSeated && micOn && Math.random() < 0.5) next.add('me');
      setSpeaking(next);
    }, 900);
    return () => clearInterval(t);
  }, [seatedKey, amSeated, micOn, mutedUsers]);

  // Fake chat, joins, leaves and (in other rooms) other people's gifts. Everyone involved is a real member of
  // the room's presence (read live from the server, not from this render).
  useEffect(() => {
    const t = setInterval(() => {
      const room = getRoom(id);
      if (!room) return;
      const others = room.members.filter((m) => m !== 'me' && !blocked.has(m));
      if (!others.length) return;
      const u = userById(pick(others));
      if (slowMode && Math.random() < 0.6) return;
      const r = Math.random();
      if (r < 0.2) {
        if (isOwn && room.members.length >= myRoom.limit) return;
        const guest = newGuest(id);
        if (!joinPresence(id, guest, { eventId: `join:${guest}` }).ok) return;
        const g = userById(guest);
        addMsg({ system: true, text: `${g.name} odaya katıldı${isOwn && myRoom.joinSounds ? ' 🔔' : ''}` });
        // Some joiners own an entry effect; show it if nothing else is playing.
        if (!settings.effectsOff && Math.random() < 0.4) setEntry((cur) => cur ?? { name: g.name, avatar: g.avatar, fx: pick(BOT_ENTRY_FX), ride: Math.random() < 0.3 ? pick(['🏎️', '🛵', '🛩️']) : undefined, badge: g.vip ? 'VIP' : undefined });
        gainXp(5);
        setGoal((gl) => (gl && gl.kind === 'join' ? { ...gl, progress: gl.progress + 1 } : gl));
      } else if (r < 0.28) {
        // Someone on the Balkon leaves (never the owner or a manager; mics stay as they are).
        const leaving = deriveView(room).balconyIds.filter((m) => m !== 'me' && m !== room.ownerId && !room.adminIds.includes(m));
        if (leaving.length) leavePresence(id, pick(leaving), `leave:${msgId()}`);
      } else if (r < 0.32) {
        setGoal((g) => (g && g.kind === 'like' ? { ...g, progress: g.progress + 1 } : g));
        addMsg({ system: true, text: `❤️ ${u.name} odayı beğendi` });
      } else if (r < 0.37 && !isOwn) {
        const g = pick(GIFTS.slice(0, 5));
        const tx = `BOT-${msgId()}`;
        addContrib(u.id, g.price);
        logGift(u.id, hostId, g, 1);
        addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${u.name} → ${userById(hostId).name} ${g.emoji} ${g.name}`, gift: { fromId: u.id, toIds: [hostId], emoji: g.emoji, name: g.name, count: 1 } });
        scorePk(tx, u.id, hostId, g.id, g.price);
        flyGift(g.emoji, 1, [hostId], { x: 36, y: win.height * 0.72 });
      } else {
        addMsg({ userId: u.id, text: pick(BOT_LINES) });
      }
    }, 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, slowMode, words]);

  // Own room: listeners send gifts (host earns diamonds, room earns XP) and ask to speak.
  useEffect(() => {
    if (!isOwn) return;
    const gifts = setInterval(() => {
      const room = getRoom(id);
      const fans = room ? deriveView(room).balconyIds.filter((m) => m !== 'me') : [];
      if (!fans.length) return;
      const from = userById(pick(fans));
      const gift = GIFTS.find((g) => g.price === pick(INCOMING_GIFT_POOL)) ?? GIFTS[0];
      const tx = `BOT-${msgId()}`;
      receiveDiamonds(gift.price, 'Hediye', from.id);
      // Owner bonus is calculated separately and never reduces the streamer's earnings.
      const ownerBonus = Math.round(gift.price * RULES.roomOwnerBonus);
      if (ownerBonus > 0) receiveDiamonds(ownerBonus, 'Oda sahibi bonusu', from.id);
      gainXp(gift.price);
      addContrib(from.id, gift.price);
      logGift(from.id, 'me', gift, 1);
      flyGift(gift.emoji, 1, ['me'], { x: 36, y: win.height * 0.72 });
      if (gift.price >= 50 && showFx(gift.price)) setGiftFx(gift);
      addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${from.name} sana ${gift.emoji} ${gift.name} gönderdi! (+${gift.price} 💎)`, gift: { fromId: from.id, toIds: ['me'], emoji: gift.emoji, name: gift.name, count: 1 } });
      scorePk(tx, from.id, 'me', gift.id, gift.price);
    }, 6000);
    const reqs = setInterval(() => {
      const room = getRoom(id);
      const pool = room ? deriveView(room).balconyIds.filter((m) => m !== 'me') : [];
      setRequests((r) => {
        if (r.length >= 4) return r;
        const free = pool.filter((x) => !r.includes(x));
        return free.length ? [...r, pick(free)] : r;
      });
    }, 12_000);
    const songs = setInterval(() => {
      if (roomType !== 'music') return;
      setMusicRequests((r) => (r.length >= 3 ? r : [...r, { track: pick(MUSIC_CATALOG), by: pick(USERS).id }]));
    }, 15_000);
    return () => {
      clearInterval(gifts);
      clearInterval(reqs);
      clearInterval(songs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn]);

  // Poll clock + simulated votes.
  const pollOpen = !!poll && !poll.closed;
  useEffect(() => {
    if (!pollOpen) return;
    const t = setInterval(
      () =>
        setPoll((p) => {
          if (!p || p.closed) return p;
          const options = p.options.map((o) => (Math.random() < 0.4 ? { ...o, votes: o.votes + 1 } : o));
          return p.endsIn > 1 ? { ...p, options, endsIn: p.endsIn - 1 } : { ...p, options, endsIn: 0, closed: true };
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [pollOpen]);

  // Goal clock.
  const goalLive = !!goal && goal.endsIn > 0 && goal.progress < goal.target;
  useEffect(() => {
    if (!goalLive) return;
    const t = setInterval(() => setGoal((g) => (g ? { ...g, endsIn: Math.max(0, g.endsIn - 1) } : g)), 1000);
    return () => clearInterval(t);
  }, [goalLive]);

  // Q&A rooms: listeners send questions.
  useEffect(() => {
    if (roomType !== 'qa') return;
    const t = setInterval(() => setQuestions((q) => (q.length > 8 ? q : [...q, { id: msgId(), userId: pick(USERS).id, text: pick(QUESTIONS), picked: false }])), 9000);
    return () => clearInterval(t);
  }, [roomType]);

  // Speaker queue for me in someone else's room: position moves up, then I get a mic if one is free.
  const inQueue = myQueuePos !== null;
  useEffect(() => {
    if (!inQueue) return;
    const t = setInterval(() => setMyQueuePos((p) => (p === null ? p : Math.max(0, p - 1))), 3000);
    return () => clearInterval(t);
  }, [inQueue]);
  const freeSeatIndex = allSeats.findIndex((x, i) => i > 0 && x === null && !lockedSeats.includes(i));
  // My turn came and a mic is free: take it through the presence server.
  const queueReady = myQueuePos === 0 && freeSeatIndex > 0 && !offline;
  useEffect(() => {
    if (!queueReady) return;
    const t = setTimeout(() => {
      const r = takeSeat(id, 'me', freeSeatIndex);
      if (!r.ok) return;
      setMyQueuePos(null);
      setMicOn(true);
      addMsg({ system: true, text: `✅ Sıran geldi: ${freeSeatIndex + 1}. mikrofona geçtin` });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueReady, freeSeatIndex]);

  // Other rooms: the host drops a red envelope after a while.
  useEffect(() => {
    if (isOwn) return;
    const t = setTimeout(() => setEnvelope({ from: hostId, amount: 300, count: 10, seconds: 15 }), 25_000);
    return () => clearTimeout(t);
  }, [isOwn, hostId]);
  const envelopeLive = !!envelope;
  useEffect(() => {
    if (!envelopeLive) return;
    const t = setInterval(() => setEnvelope((e) => (e && e.seconds > 1 ? { ...e, seconds: e.seconds - 1 } : null)), 1000);
    return () => clearInterval(t);
  }, [envelopeLive]);

  // Shared music clock.
  const musicPlaying = musicEnabled && music.playing && music.queue.length > 0;
  useEffect(() => {
    if (!musicPlaying) return;
    const t = setInterval(
      () =>
        setMusic((m) => {
          const track = m.queue[0];
          if (!track) return m;
          if (m.position + 1 < track.seconds) return { ...m, position: m.position + 1 };
          const rest = m.queue.slice(1);
          return { queue: rest, playing: rest.length > 0, position: 0 };
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [musicPlaying]);

  // PK status changes announced in the room chat (derived transition, not an effect).
  const [pkSeenState, setPkSeenState] = useState('');
  const pkKey = lastPk ? `${lastPk.id}:${lastPk.status}` : '';
  if (pkKey !== pkSeenState) {
    setPkSeenState(pkKey);
    if (lastPk) {
      const label = modeLabel(lastPk);
      const text: Partial<Record<typeof lastPk.status, string>> = {
        invite: `📨 ${label} daveti gönderildi · ${lastPk.durationMin} dk`,
        prep: `⏳ ${label} hazırlanıyor · ${lastPk.durationMin} dk`,
        active: lastPk.mode === 'solo' ? `🎤 ${label} başladı! Mikrofondakilere gelen hediyeler kendi puanlarına yazılır.` : `⚔️ ${label} başladı! Hediyeler takımına puan kazandırır.`,
        done: `🏁 ${label} bitti · sonuç sunucuda kesinleşti`,
        cancelled: `✖️ ${label} başlamadı/iptal edildi`,
      };
      // Keyed by PK and status: the same change is announced once.
      if (text[lastPk.status]) setMessages((m) => mergeFeed(m, [{ id: `pk:${pkKey}`, system: true, at: Date.now(), text: text[lastPk.status]! }]));
    }
  }

  // --- Seat actions ------------------------------------------------------------
  // Used for people who asked to speak (their request is their consent); everyone else gets a mic invite.
  const placeOnSeat = (userId: string, target?: number): boolean => {
    if (offlineBlocked()) return false;
    const free = target !== undefined && allSeats[target] === null ? target : allSeats.findIndex((s, i) => i > 0 && s === null && !lockedSeats.includes(i));
    const why = allSeats.includes(userId) ? `${userById(userId).name} zaten mikrofonda.` : free < 0 ? `Boş koltuk yok: bu oda ${capacity} mikrofonlu.` : null;
    const r = why ? { ok: false as const, reason: why } : seatBy(id, 'me', userId, free);
    if (!r.ok) {
      showAlert('Mikrofona alınamadı', r.reason);
      return false;
    }
    addMsg({ system: true, text: `${userById(userId).name} ${free + 1}. koltuğa oturdu` });
    return true;
  };
  const removeFromSeat = (userId: string) => leaveSeat(id, userId);
  const sitMe = (index: number) => {
    if (devicesBusy() || offlineBlocked()) return;
    const r = takeSeat(id, 'me', index);
    if (!r.ok) return showAlert('Bu mikrofona geçilemedi', r.reason);
    setMicOn(true);
    addMsg({ system: true, text: `${ME.name} ${index + 1}. koltuğa geçti` });
  };

  const joinRoom = () => {
    if (membership !== 'none') return;
    setMembership('pending');
    addMsg({ system: true, text: '📝 Oda üyeliği başvurun gönderildi' });
    setTimeout(() => {
      setMembership('member');
      addMsg({ system: true, text: `✅ ${title} odasının üyesi oldun` });
      notify({ kind: 'social', icon: '🏠', title: 'Oda üyeliğin onaylandı', body: title, href: `/oda/${id}` });
    }, 2000);
  };

  const onBossPress = () => {
    const mine = contrib.me ?? 0;
    const top = topGifter?.[1] ?? 0;
    if (bossId && bossId !== 'me') {
      const u = userById(bossId);
      const options: SheetOption[] = [
        { label: '👤 Profili gör', onPress: () => router.push(`/kullanici/${bossId}`) },
        { label: '🎁 Hediye gönder', onPress: () => (setGiftTo(null), setGiftOpen(true)) },
        { label: `ℹ️ Patron ol: 🪙 ${Math.max(0, Math.max(BOSS_SEAT_MIN_COINS, top + 1) - mine).toLocaleString('tr-TR')} daha gönder`, onPress: () => showAlert('👑 Patron Koltuğu', bossSeatInfo(bossId, mine, top)) },
      ];
      if (myRole === 'owner')
        options.push({
          label: '⬇️ Patron koltuğundan indir',
          destructive: true,
          onPress: () => {
            setBossRemoved((s) => new Set(s).add(bossId));
            addMsg({ system: true, text: `${u.name} patron koltuğundan indirildi` });
            logMod('Patron koltuğundan indirdi', u.name);
          },
        });
      setSheet({ title: `👑 Patron · ${u.name} · 🪙 ${top.toLocaleString('tr-TR')}`, options });
      return;
    }
    showAlert('👑 Patron Koltuğu', bossSeatInfo(bossId, mine, top), bossId === 'me' ? undefined : [
      { text: 'Kapat', style: 'cancel' },
      { text: 'Hediye gönder', onPress: () => (setGiftTo(null), setGiftOpen(true)) },
    ]);
  };

  const freeMic = roomType === 'free';
  // --- Seat menu (opens next to the seat). Managers act only on lower roles; every action is logged. ---
  const openSeatMenu = (index: number, title: string, items: SeatMenuItem[]) => {
    const v = seatSlots.get(index);
    if (!v) return setSeatMenu({ anchor: { x: win.width / 2 - 30, y: win.height / 3, w: 60, h: 60 }, title, items });
    v.measureInWindow((x, y, w, h) => setSeatMenu({ anchor: { x, y, w, h }, title, items }));
  };
  const toggleLock = (index: number, lock: boolean) => {
    if (offlineBlocked()) return;
    const next = lock ? [...new Set([...lockedSeats, index])] : lockedSeats.filter((x) => x !== index);
    if (isOwn) updateMyRoom({ lockedSeats: next });
    else setLocalLocks(next);
    logMod(lock ? 'Mikrofonu kilitledi' : 'Mikrofon kilidini açtı', `${index + 1}. koltuk`);
  };
  // Kick: validated by the presence server (role, target), then the person leaves with a short re-entry ban.
  // Not a permanent block: after the ban they can come back under the room's normal rules.
  const kickFromRoom = (uid: string) => {
    if (offlineBlocked()) return;
    const u = userById(uid);
    const r = kick(id, 'me', uid, KICK_BAN_MIN);
    if (!r.ok) {
      logMod('Reddedilen deneme: odadan çıkarma', u.name, r.reason);
      return showAlert('Odadan çıkarılamadı', r.reason);
    }
    setBans((b) => [...b.filter((x) => x.userId !== uid), { userId: uid, until: `${KICK_BAN_MIN} dk` }]);
    addMsg({ system: true, text: `${u.name} odadan çıkarıldı · ${KICK_BAN_MIN} dk giriş yasağı (denetim kaydına yazıldı)` });
    logMod('Odadan çıkardı', u.name, `${KICK_BAN_MIN} dk giriş yasağı`);
  };
  const confirmKick = (uid: string) =>
    showAlert('Odadan çıkarılsın mı?', `${userById(uid).name} odadan çıkarılır ve ${KICK_BAN_MIN} dk tekrar giremez. Bu kalıcı engelleme değildir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Odadan çıkar', style: 'destructive', onPress: () => kickFromRoom(uid) },
    ]);
  const toggleSilence = (uid: string) =>
    setSilenced((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const sendMicInvite = (uid: string, seat?: number) => {
    if (offlineBlocked()) return false;
    const r = inviteToMic(id, 'me', uid, seat);
    if (!r.ok) {
      showAlert('Davet gönderilemedi', r.reason);
      return false;
    }
    logMod('Mikrofona davet etti', userById(uid).name);
    addMsg({ system: true, text: `🎙️ ${userById(uid).name} mikrofona davet edildi · yanıtı bekleniyor` });
    return true;
  };

  const onSeatPress = (index: number) => {
    const uid = allSeats[index];
    // "Koltuk değiştir" mode: the next tap on a free seat moves that person there.
    if (moving) {
      const who = moving;
      setMoving(null);
      if (uid || lockedSeats.includes(index)) return showAlert('Boş koltuk seç', 'Taşımak için kilitli olmayan boş bir koltuğa dokun.');
      if (offlineBlocked()) return;
      const moved = seatBy(id, 'me', who, index);
      if (!moved.ok) return showAlert('Taşınamadı', moved.reason);
      addMsg({ system: true, text: `${userById(who).name} ${index + 1}. koltuğa taşındı` });
      logMod('Koltuk değiştirdi', userById(who).name, `${index + 1}. koltuk`);
      return;
    }
    if (uid === 'me') {
      const items: SeatMenuItem[] = [{ key: 'profile', label: 'Profilim', icon: 'person-circle-outline', onPress: () => router.push('/kullanici/me') }];
      if (!isOwn || index !== 0) items.push({ key: 'leave', label: 'Koltuktan in', icon: 'arrow-down-circle-outline', onPress: () => !offlineBlocked() && removeFromSeat('me') });
      return openSeatMenu(index, `${index + 1}. koltuk · sen`, items);
    }
    if (uid) {
      const u = userById(uid);
      const targetRole = roleOf(uid);
      const outranks = canManage && ROLE_RANK[myRole] > ROLE_RANK[targetRole];
      const items: SeatMenuItem[] = [{ key: 'profile', label: 'Profil', icon: 'person-circle-outline', onPress: () => router.push(`/kullanici/${uid}`) }];
      if (outranks) {
        const muted = mutedUsers.has(uid);
        items.push(
          {
            key: 'down',
            label: 'Mikrodan at',
            icon: 'arrow-down-circle-outline',
            onPress: () => {
              if (offlineBlocked()) return;
              const r = forceLeaveSeat(id, 'me', uid);
              if (!r.ok) return showAlert('Mikrofondan indirilemedi', r.reason);
              addMsg({ system: true, text: `${u.name} mikrofondan indirildi` });
              logMod('Mikrofondan indirdi', u.name);
            },
          },
          {
            key: 'lock',
            label: 'Mikrofonu kilitle',
            icon: 'lock-closed-outline',
            onPress: () => {
              if (offlineBlocked()) return;
              const r = forceLeaveSeat(id, 'me', uid);
              if (!r.ok) return showAlert('Mikrofondan indirilemedi', r.reason);
              toggleLock(index, true);
              addMsg({ system: true, text: `${u.name} mikrofondan indirildi · ${index + 1}. koltuk kilitlendi` });
            },
          },
          { key: 'kick', label: 'Odadan at', icon: 'exit-outline', destructive: true, onPress: () => confirmKick(uid) },
          {
            key: 'move',
            label: 'Koltuk değiştir',
            icon: 'swap-horizontal-outline',
            onPress: () => {
              if (!allSeats.some((x, i) => i > 0 && x === null && !lockedSeats.includes(i))) return showAlert('Boş koltuk yok', 'Taşımak için önce bir koltuğu boşalt veya kilidini aç.');
              setMoving(uid);
            },
          },
          {
            key: 'mute',
            label: muted ? 'Mikrofonunu aç' : 'Mikrofonunu sustur',
            icon: muted ? 'mic-outline' : 'mic-off-outline',
            dividerBefore: true,
            onPress: () => {
              if (offlineBlocked()) return;
              const r = setMicMute(id, 'me', uid, !muted);
              if (!r.ok) return showAlert('Yapılamadı', r.reason);
              logMod(muted ? 'Mikrofonunu açtı' : 'Mikrofonunu susturdu', u.name);
            },
          },
        );
      }
      items.push(
        { key: 'gift', label: 'Hediye gönder', icon: 'gift-outline', dividerBefore: !outranks, onPress: () => (setGiftTo(uid), setGiftOpen(true)) },
        { key: 'dm', label: 'Mesaj gönder', icon: 'chatbubble-outline', onPress: () => router.push(`/sohbet/${uid}`) },
        { key: 'silence', label: silenced.has(uid) ? 'Sesini benim için aç' : 'Benim için sessize al', icon: silenced.has(uid) ? 'volume-high-outline' : 'volume-mute-outline', onPress: () => toggleSilence(uid) },
      );
      if (outranks && myRole === 'owner') {
        const isAdmin = adminIds.includes(uid);
        items.push(
          {
            key: 'admin',
            label: isAdmin ? 'Yöneticilikten al' : 'Yönetici yap',
            icon: 'shield-half-outline',
            dividerBefore: true,
            onPress: () => {
              if (!isAdmin && adminIds.length >= adminCapacity(level)) return showAlert('Yönetici kontenjanı dolu', `Lv.${level} odada en fazla ${adminCapacity(level)} yönetici olabilir.`);
              updateMyRoom({ adminIds: isAdmin ? adminIds.filter((x) => x !== uid) : [...adminIds, uid] });
              logMod(isAdmin ? 'Yöneticilikten aldı' : 'Yönetici atadı', u.name);
              addMsg({ system: true, text: isAdmin ? `${u.name} artık yönetici değil` : `🛡️ ${u.name} oda yöneticisi oldu` });
            },
          },
          {
            key: 'black',
            label: 'Kara listeye ekle',
            icon: 'ban-outline',
            destructive: true,
            onPress: () => {
              if (offlineBlocked()) return;
              const r = kick(id, 'me', uid, null);
              if (!r.ok) return showAlert('Kara listeye eklenemedi', r.reason);
              updateMyRoom({ blacklist: [...new Set([...myRoom.blacklist, uid])], memberIds: myRoom.memberIds.filter((x) => x !== uid) });
              addMsg({ system: true, text: `${u.name} oda kara listesine eklendi` });
              logMod('Kara listeye ekledi', u.name, 'kalıcı');
            },
          },
        );
      }
      if (canManage && !outranks)
        items.push({
          key: 'denied',
          label: 'Yetkin yok (üst rol)',
          icon: 'lock-closed-outline',
          dividerBefore: true,
          onPress: () => {
            logMod('Reddedilen deneme: üst role müdahale', u.name);
            showAlert('Yetki yok', `${targetRole === 'owner' ? 'Oda sahibini' : 'Aynı veya üst rolü'} mikrofondan indiremez, odadan atamaz ya da susturamazsın. Bu deneme denetim kaydına yazıldı.`);
          },
        });
      const roleLabel = targetRole === 'owner' ? 'Oda sahibi' : targetRole === 'admin' ? 'Yönetici' : 'Üye';
      return openSeatMenu(index, `${index + 1}. koltuk · ${u.name} · ${roleLabel}`, items);
    }
    if (index === 0) return isOwn ? sitMe(0) : undefined;
    if (canManage) {
      const locked = lockedSeats.includes(index);
      const items: SeatMenuItem[] = [
        {
          key: 'invite',
          label: 'Davet et',
          icon: 'person-add-outline',
          onPress: () => {
            if (locked) toggleLock(index, false);
            setInviteSeat(index);
            setPeopleOpen(true);
          },
        },
        ...(!locked ? [{ key: 'sit', label: 'Bu koltuğa geç', icon: 'enter-outline' as const, onPress: () => sitMe(index) }] : []),
        { key: 'lock', label: locked ? 'Kilidi aç' : 'Mikrofonu kilitle', icon: locked ? ('lock-open-outline' as const) : ('lock-closed-outline' as const), onPress: () => toggleLock(index, !locked) },
      ];
      return openSeatMenu(index, `${index + 1}. koltuk · ${locked ? 'kilitli' : 'boş'}`, items);
    }
    if (lockedSeats.includes(index)) return showAlert('Bu mikrofon kilitli', 'Oda yönetimi bu koltuğu kilitledi. Boş başka bir koltuk seçebilir veya el kaldırabilirsin.');
    if (myRole === 'member' && micPermission === 'members' && membership !== 'member') {
      showAlert('Mikrofon yalnızca oda üyelerine açık', 'Bu odada mikrofon almak için önce oda üyesi olmalısın.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Oda üyesi ol', onPress: joinRoom },
      ]);
      return;
    }
    if (amSeated || myRole !== 'member') return sitMe(index);
    if (freeMic) return sitMe(index);
    joinQueue();
  };

  // Stage-style rooms: join the speaker queue and see my position.
  const joinQueue = () => {
    if (devicesBusy() || offlineBlocked()) return;
    if (myQueuePos !== null) return showAlert('Sıradasın', `Konumun: ${myQueuePos + 1}. Sıradan çıkmak için menüyü kullan.`);
    const pos = rollDie() % 3 + 1;
    setMyQueuePos(pos);
    addMsg({ system: true, text: `🙋 Konuşmacı kuyruğuna katıldın · sıran: ${pos + 1}` });
  };

  // The big mic button for a listener (Discord Stage style): take a free mic, or raise a hand when all are taken.
  const raiseHand = () => {
    if (devicesBusy()) return;
    if (isOwn && allSeats[0] === null) return sitMe(0);
    if (freeSeatIndex > 0) return isOwn ? sitMe(freeSeatIndex) : onSeatPress(freeSeatIndex);
    if (myRole === 'member' && micPermission === 'members' && membership !== 'member') return onSeatPress(1);
    joinQueue();
  };

  // --- Chat, gifts, games ---------------------------------------------------------
  const send = () => {
    if (!draft.trim()) return;
    if (!isOnline()) {
      // Not sent: kept on my screen only, marked as failed with a retry.
      setMessages((list) => mergeFeed(list, [{ id: msgId(), userId: 'me', text: mask(draft.trim()), status: 'failed', at: Date.now() }]));
      setDraft('');
      return;
    }
    addMsg({ userId: 'me', text: draft.trim() });
    setDraft('');
    setEmojiOpen(false);
    gainXp(2);
  };
  // A failed message is sent again as a new event (its text was already filtered when it was written).
  const retrySend = useCallback((msg: ChatMsg) => {
    if (offlineBlocked()) return;
    setMessages((list) => mergeFeed(list.filter((m) => m.id !== msg.id), [{ id: msgId(), userId: 'me', text: msg.text, at: Date.now() }]));
  }, []);
  const renderChat = useCallback(({ item }: { item: ChatMsg }) => <ChatLine msg={item} bubbleId={equipped.bubble} onRetry={retrySend} />, [equipped.bubble, retrySend]);

  const deliverGifts = (gift: Gift, toIds: string[], count: number) => {
    const each = gift.price * count;
    // Each recipient is a separate, individually recorded transaction; stop charging once the balance runs out.
    const results = toIds.map((uid) => ({ userId: uid, ok: spendCoins(each, `Hediye: ${gift.name} x${count} → ${userById(uid).name}`) }));
    const delivered = results.filter((r) => r.ok);
    if (delivered.length === 0) {
      errorHaptic();
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    successHaptic();
    const total = each * delivered.length;
    delivered.forEach((r) => logGift('me', r.userId, gift, count));
    bump('giftsSent', count * delivered.length);
    addContrib('me', total);
    if (!isOwn) addFanPoints(hostId, Math.ceil(total / 10), `Hediye gönderdin (${total} jeton)`);
    if (showFx(gift.price)) setGiftFx(gift);
    // From the gift button (bottom right) to each recipient's seat.
    flyGift(gift.emoji, count, delivered.map((r) => r.userId), { x: win.width - 60, y: win.height - 48 });
    const sendId = msgId();
    delivered.forEach((r) => scorePk(`GT-${sendId}-${r.userId}`, 'me', r.userId, gift.id, each));
    addMsg({
      id: `gift:GT-${sendId}`,
      system: true,
      text: `🎁 ${ME.name}, ${delivered.length > 1 ? `${delivered.length} kişiye` : `${userById(delivered[0].userId).name} kişisine`} ${gift.emoji} ${gift.name} x${count} gönderdi!`,
      gift: { fromId: 'me', toIds: delivered.map((r) => r.userId), emoji: gift.emoji, name: gift.name, count },
    });
    // Only a partial delivery opens the results panel; a normal send shows no extra message.
    if (delivered.length < toIds.length) {
      setGiftResults(results);
      setPanel('results');
    }
  };

  // Product rule: gifts never ask for confirmation; one tap sends.
  const sendGift = (gift: Gift, toIds: string[], count: number) => {
    setGiftOpen(false);
    if (offlineBlocked()) return;
    deliverGifts(gift, toIds, count);
  };

  // Lucky: one gift, one recipient. The server (lib/lucky) charges, draws and credits; the room only
  // records the normal gift for the recipient and shows the stored result.
  // Lucky: one gift to each person picked, one server draw per person. The room only records the
  // normal gift for each recipient and shows the stored results; wins go out to every room.
  const sendLuckyGift = (giftId: string, toIds: string[]) => {
    setGiftOpen(false);
    if (offlineBlocked()) return;
    const records: LuckyRecord[] = [];
    let error: string | null = null;
    for (const toId of toIds) {
      const r = sendLucky({ txId: newLuckyTxId(), userId: 'me', userAge: app.me.age, roomId: id, giftId, toId, toName: userById(toId).name }, { spend: spendCoins, credit: addCoins });
      if (!r.ok) {
        error = r.reason;
        break;
      }
      records.push(r.record);
    }
    if (!records.length) {
      errorHaptic();
      return showAlert('Lucky gönderilemedi', error ?? 'Gönderilemedi.');
    }
    const cfg = getLucky().config;
    const first = records[0];
    const spent = records.reduce((n, r) => n + r.price, 0);
    const reward = records.reduce((n, r) => n + r.reward, 0);
    const best = records.reduce((a, b) => (b.mult > a.mult ? b : a), first);
    const sentTo = records.map((r) => r.toId);
    successHaptic();
    records.forEach((r) => {
      logGift('me', r.toId, { id: r.giftId, name: r.giftName, emoji: r.emoji, price: r.price }, 1);
      // PK counts the gift value; the reward only when the admin setting says so.
      scorePk(r.txId, 'me', r.toId, r.giftId, r.price + (cfg.pkCountsReward ? r.reward : 0));
    });
    bump('giftsSent', records.length);
    addContrib('me', spent);
    if (!isOwn) addFanPoints(hostId, Math.ceil(spent / 10), `Hediye gönderdin (${spent} jeton)`);
    flyGift(first.emoji, 1, sentTo, { x: win.width - 60, y: win.height - 48 });
    // Combo repeats don't add a chat line each time; the wheel shows the count.
    const repeat = combo?.giftId === giftId && combo.to.join() === toIds.join();
    if (!repeat)
      addMsg({
        id: `gift:${first.txId}`,
        system: true,
        text: `🍀 ${ME.name}, ${sentTo.length > 1 ? `${sentTo.length} kişiye` : `${userById(sentTo[0]).name} kişisine`} ${first.emoji} ${first.giftName} (Lucky) gönderdi`,
        gift: { fromId: 'me', toIds: sentTo, emoji: first.emoji, name: first.giftName, count: 1, lucky: true },
      });
    if (error) addMsg({ system: true, text: `🍀 ${toIds.length - records.length} kişiye gönderilemedi: ${error}` });
    // Every win is announced in all rooms (banner); the user can hide their name in Ayarlar.
    if (reward > 0) {
      const wins = records.filter((r) => r.reward > 0).length;
      announceWin({ userName: ME.name, avatar: app.me.avatar, source: `Lucky › ${first.giftName}`, roomTitle: roomTitleOf(id), mult: best.mult, amount: reward, wins: wins > 1 ? wins : undefined }, { mine: true });
    }
    if (best.mult >= cfg.announceFrom)
      addMsg({
        system: true,
        kind: 'gift',
        text: settings.luckyAnnounce ? `🎉 ${ME.name} Lucky’den ×${best.mult.toLocaleString('tr-TR')} kazandı! +${reward.toLocaleString('tr-TR')} jeton` : `🎉 Bir kullanıcı Lucky’den ×${best.mult.toLocaleString('tr-TR')} kazandı!`,
      });
    setLuckyFx(records);
    const at = Date.now();
    setCombo((c) => (c && c.giftId === giftId && c.to.join() === toIds.join() ? { ...c, count: c.count + 1, key: at } : { giftId, to: toIds, count: 1, key: at }));
  };
  const comboGift = combo ? luckyGift(combo.giftId) : undefined;

  const sendEnvelope = (amount: number, count: number) => {
    setPanel(null);
    if (!spendCoins(amount, 'Oda zarfı dağıtıldı')) return showAlert('Yetersiz jeton');
    addMsg({ system: true, text: `🧧 ${ME.name} ${amount} jetonluk zarf attı! (${count} kişi)` });
    let left = amount;
    const grabbers = [...USERS].sort(() => Math.random() - 0.5).slice(0, Math.min(count, 5));
    grabbers.forEach((u, i) =>
      setTimeout(
        () => {
          const share = i === grabbers.length - 1 ? left : Math.max(1, Math.floor((left / (grabbers.length - i)) * (0.5 + Math.random())));
          left -= share;
          addMsg({ system: true, text: `🧧 ${u.name} zarftan ${share} jeton kaptı` });
        },
        800 * (i + 1),
      ),
    );
  };

  const grabEnvelope = () => {
    if (!envelope) return;
    const share = Math.max(5, Math.floor((envelope.amount / envelope.count) * (0.5 + Math.random())));
    addCoins(share, 'Oda zarfı');
    addMsg({ system: true, text: `🧧 Zarftan ${share} jeton kaptın!` });
    setEnvelope(null);
  };

  const playDice = (bet: number) => {
    if (dicePlays <= 0) {
      showAlert('Günlük limit', 'Bugünkü oyun hakkın bitti.');
      return null;
    }
    if (!spendCoins(bet, 'Zar Düellosu bahis')) {
      showAlert('Yetersiz jeton');
      return null;
    }
    setDicePlays((n) => n - 1);
    const me = rollDie();
    const them = rollDie();
    const opponent = pick(seatedOthers.length ? seatedOthers : USERS.map((u) => u.id));
    if (me > them) addCoins(bet * 2, 'Zar Düellosu kazanç');
    else if (me === them) addCoins(bet, 'Zar Düellosu iade');
    addMsg({ system: true, text: `🎲 ${ME.name} (${me}) vs ${userById(opponent).name} (${them}) → ${me > them ? `${ME.name} kazandı! +${bet * 2}` : me < them ? `${userById(opponent).name} kazandı` : 'berabere'}` });
    return { me, them, opponent };
  };

  const music$ = {
    toggle: () => setMusic((m) => ({ ...m, playing: !m.playing })),
    next: () => setMusic((m) => ({ queue: m.queue.slice(1), playing: m.queue.length > 1, position: 0 })),
    add: (t: Track) => {
      setMusic((m) => ({ ...m, queue: [...m.queue, t], playing: m.queue.length === 0 ? true : m.playing }));
      addMsg({ system: true, text: `🎵 Sıraya eklendi: ${t.title}` });
    },
    remove: (trackId: string) => setMusic((m) => ({ ...m, queue: [m.queue[0], ...m.queue.slice(1).filter((t) => t.id !== trackId)] })),
    suggest: (t: Track) => {
      addMsg({ userId: 'me', text: `🎵 Şarkı önerisi: ${t.title}` });
      setPanel(null);
    },
  };

  const shareRoom = () => shareLink(`Similar Club'da "${title}" odasına gel! 🎙️ Şu an ${listeners} kişi dinliyor.`, `oda/${id}`);

  const report = () => {
    const no = createTicket('Şikâyet', `Oda şikâyeti: ${title} (${id})`);
    showAlert('Şikâyet alındı', `Talep numaran #${no}. Durumu Destek ekranından izleyebilirsin.`);
  };
  // --- Games (Oyun Merkezi spec): opened over the room; never touch seats, mic or membership ------------
  const openRoomGame = (gid: string) => {
    const g = gameCatalog.roomGames.find((x) => x.id === gid);
    if (!g || !g.active) return;
    setPanel(null);
    if (!g.playable) return showAlert(g.name, 'Bu oyun için sağlayıcı entegrasyonu bekleniyor. Katalogda görünür; bağlandığında buradan açılacak.');
    if (g.startBy === 'owner_mod' && myRole === 'member') return showAlert('Masayı oda yönetimi açar', `${g.name} masasını oda sahibi veya yöneticiler başlatır. Açık bir masaya davetle katılabilirsin.`);
    setGame({ kind: 'room', id: g.id });
    setGameMin(false);
    addMsg({ system: true, text: `🎮 ${ME.name} ${g.name} masası açtı · ${g.minPlayers}–${g.maxPlayers} oyuncu` });
  };
  const openCasino = (gid: CasinoGame['id']) => {
    const g = gameCatalog.casino.find((x) => x.id === gid);
    if (!g) return;
    setPanel(null);
    const access = casinoAccess(g, gameEntry, app.wealthLevel);
    if (!access.ok)
      return showAlert(g.name, access.reason, access.needWealth ? [{ text: 'Kapat', style: 'cancel' }, { text: 'Servet Seviyem', onPress: () => router.push('/seviye') }] : undefined);
    setGame({ kind: 'casino', id: g.id });
    setGameMin(false);
  };
  const menuSections: MenuSection[] = [
    {
      title: 'Etkileşimli Oyunlar',
      variant: 'round',
      items: [
        ...(myRole !== 'member' && !pk ? [{ key: 'pk', label: 'PK', emoji: '⚔️', colors: ['#FF6576', '#087A80'] as [string, string], onPress: () => (setPanel(null), setPkSetup(true)) }] : []),
        { key: 'match', label: 'Hemen Tanış', emoji: '⚡', colors: ['#13D9DF', '#0A8F95'], onPress: () => router.push('/eslesme') },
        { key: 'env', label: 'Şanslı çanta', emoji: '🧧', colors: ['#B91C1C', '#F59E0B'], onPress: () => setPanel('envelope') },
        { key: 'tasks', label: 'Merkez görevi', emoji: '📋', colors: ['#0E7C9A', '#13D9DF'], onPress: () => router.push('/gorevler') },
        { key: 'events', label: 'Aktivite', emoji: '🎉', colors: ['#0A8F95', '#FF6576'], onPress: () => setPanel('events') },
        ...(canFunctions
          ? [
              { key: 'poll', label: 'Anket', emoji: '📊', colors: ['#0EA5E9', '#2563EB'] as [string, string], onPress: () => setPanel('poll') },
              { key: 'goal', label: 'Topluluk hedefi', emoji: '🎯', colors: ['#16A34A', '#0D9488'] as [string, string], onPress: () => setPanel('goal') },
            ]
          : []),
        ...(roomType === 'qa' ? [{ key: 'qa', label: 'Sorular', emoji: '❓', colors: ['#F97316', '#DC2626'] as [string, string], onPress: () => setPanel('qa'), badge: questions.filter((q) => !q.picked).length }] : []),
        { key: 'music', label: 'Müzik', emoji: '🎵', colors: ['#C93C4F', '#0A8F95'], onPress: () => setPanel('music') },
      ],
    },
    {
      title: 'Oda Oyunları · ücretsiz',
      variant: 'tile',
      note: 'Herkes oynayabilir · oyun açıkken mikrofonun ve koltuğun aynen kalır',
      items: gameCatalog.roomGames
        .filter((g) => g.active)
        .map((g) => ({ key: `rg-${g.id}`, label: g.name, emoji: g.emoji, colors: ['#0A8F95', '#13D9DF'] as [string, string], badge: g.playable ? undefined : ('NEW' as const), onPress: () => openRoomGame(g.id) })),
    },
    {
      title: 'Casino · Servet Lv.2',
      variant: 'tile',
      note: app.wealthLevel >= 2 ? 'Sonuçlar sunucuda doğrulanır · jeton harcaması günlük limite dahildir' : `Servet Seviyesi 2 ve üzeri üyelere açık · şu an Lv.${app.wealthLevel}`,
      items: gameCatalog.casino
        .filter((g) => g.active && g.fromRoom)
        .map((g) => ({ key: `cg-${g.id}`, label: g.name, emoji: g.emoji, colors: ['#B7832E', '#F6BD60'] as [string, string], onPress: () => openCasino(g.id) })),
    },
    {
      title: 'Oda Araçları',
      variant: 'tool',
      items: [
        { key: 'card', label: 'Oda kartı', icon: 'home-outline', onPress: () => setPanel('info') },
        ...(isOwn ? [{ key: 'settings', label: 'Oda ayarları', icon: 'settings-outline' as const, onPress: () => setPanel('settings') }] : []),
        ...(myRole !== 'member' ? [{ key: 'mod', label: 'Moderasyon', icon: 'shield-checkmark-outline' as const, onPress: () => setPanel('mod') }] : []),
        { key: 'invite', label: 'Arkadaş davet et', icon: 'person-add-outline', onPress: () => setPanel('invite') },
        { key: 'listeners', label: 'Odadakiler', icon: 'people-outline', onPress: () => setPeopleOpen(true) },
        { key: 'contrib', label: 'Katkı sıralaması', icon: 'trophy-outline', onPress: () => setPanel('contrib') },
        ...(myQueuePos !== null ? [{ key: 'queue', label: 'Kuyruktan çık', icon: 'exit-outline' as const, onPress: () => setMyQueuePos(null) }] : []),
        { key: 'report', label: 'Odayı şikâyet et', icon: 'flag-outline', onPress: report },
        // Test: drops this device's realtime connection for 8 s (counters freeze, events buffer, actions wait).
        { key: 'conn', label: offline ? 'Bağlantıyı geri getir' : 'Bağlantı kopması (test)', icon: 'cloud-offline-outline', onPress: () => (setPanel(null), offline ? setConnection('online') : dropConnection()) },
      ],
    },
    {
      title: 'Oda Ayarları',
      variant: 'tool',
      items: [
        { key: 'share', label: 'Paylaş', icon: 'arrow-redo-outline', onPress: shareRoom },
        { key: 'fx', label: 'Efektler', icon: 'sparkles-outline', badge: settings.effectsOff ? 'off' : 'on', onPress: () => setSetting('effectsOff', !settings.effectsOff) },
        { key: 'decor', label: 'Süsler', icon: 'shirt-outline', onPress: () => router.push('/magaza') },
        { key: 'sound', label: 'Ses', icon: 'volume-high-outline', badge: settings.roomMuted ? 'off' : undefined, onPress: () => setPanel('sound') },
        { key: 'denoise', label: 'Mikrofon denoise', icon: 'mic-circle-outline', badge: settings.micDenoise ? 'on' : 'off', onPress: () => setSetting('micDenoise', !settings.micDenoise) },
        { key: 'msg', label: 'Mesaj Ayarları', icon: 'chatbox-ellipses-outline', onPress: () => setPanel('msgSettings') },
      ],
    },
  ];

  // Room card data (members, clan).
  const roomMembers = isOwn ? ['me', ...myRoom.memberIds] : [...(membership === 'member' ? ['me'] : []), ...USERS.filter((u) => !kicked.has(u.id) && !blocked.has(u.id)).slice(0, 10).map((u) => u.id)];
  const memberTotal = isOwn ? roomMembers.length : Math.min(memberLimit(level), Math.round(base!.listeners * 1.8)) + (membership === 'member' ? 1 : 0);
  const ownFamily = FAMILIES.find((f) => f.id === familyId);
  const ownAgencyName = agencyId === 'own' ? ownedAgency?.name : AGENCIES.find((a) => a.id === agencyId)?.name;
  const otherFamily = FAMILIES[(Number(id.replace(/\D/g, '')) || 0) % FAMILIES.length];
  const clan = isOwn
    ? familyId
      ? { label: ownFamily ? `${ownFamily.emoji} ${ownFamily.name}` : '🏰 Ailem', href: '/aile' as const }
      : ownAgencyName
        ? { label: `🏢 ${ownAgencyName}`, href: '/ajans' as const }
        : null
    : base!.agency
      ? { label: '🏢 Ajans odası', href: '/ajans' as const }
      : level >= 5
        ? { label: `${otherFamily.emoji} ${otherFamily.name}`, href: '/aile' as const }
        : null;
  const top3 = ranking.slice(0, 3).map(([uid]) => uid);

  // Mic invites I sent: announce each answer once (accepted, declined, no answer, no free mic left).
  // Invites answered before this visit (the presence server keeps them) are taken as already announced.
  const inviteSeen = useRef<Record<string, InviteStatus> | null>(null);
  useEffect(() => {
    const first = inviteSeen.current === null;
    const seen = inviteSeen.current ?? {};
    const changes = first ? [] : live.invites.filter((i) => i.fromId === 'me' && i.status !== 'pending' && seen[i.id] !== i.status);
    live.invites.forEach((i) => (seen[i.id] = i.status));
    inviteSeen.current = seen;
    if (!changes.length) return;
    const t = setTimeout(() =>
      changes.forEach((i) => {
        const who = userById(i.toId).name;
        const text: Partial<Record<InviteStatus, string>> = {
          accepted: `✅ ${who} mikrofon davetini kabul etti · ${(i.seat ?? 0) + 1}. mikrofona geçti`,
          declined: `${who} mikrofon davetini reddetti`,
          expired: `${who} mikrofon davetine yanıt vermedi`,
          failed: `${who} daveti kabul etti ama boş mikrofon kalmadı; mikrofona alınmadı`,
        };
        if (text[i.status]) addMsg({ id: `inv:${i.id}:${i.status}`, system: true, text: text[i.status]! });
      }),
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.invites]);
  // In someone else's room the host invites me to a mic once per visit while I'm on the Balkon (simulated).
  const onBalcony = unlocked && !isOwn && !amSeated && view.balconyIds.includes('me');
  const hostInvited = useRef(false);
  useEffect(() => {
    if (!onBalcony || hostInvited.current) return;
    const t = setTimeout(() => {
      hostInvited.current = true;
      inviteToMic(id, hostId, 'me');
    }, 40_000);
    return () => clearTimeout(t);
  }, [onBalcony, id, hostId]);
  const myInvite = live.invites.find((i) => i.toId === 'me' && i.status === 'pending');
  const answerMyInvite = (accept: boolean) => {
    if (!myInvite || offlineBlocked() || (accept && devicesBusy())) return;
    const r = answerInvite(id, myInvite.id, 'me', accept);
    if (!r.ok) return showAlert('Mikrofona geçilemedi', r.reason);
    if (!accept) return addMsg({ system: true, text: 'Mikrofon davetini reddettin' });
    setMyQueuePos(null);
    setMicOn(true);
    addMsg({ system: true, text: `${ME.name} davetle ${(r.seat ?? 0) + 1}. mikrofona geçti` });
  };

  // Chat: personal mutes hide that person's lines on my screen; message settings apply to the Tümü tab.
  const feed = useMemo(() => (silenced.size ? messages.filter((m) => !(m.userId && silenced.has(m.userId) && kindOf(m) === 'chat')) : messages), [messages, silenced]);
  const visibleInAll = useCallback(
    (m: FeedMsg) => (msgFilter.bot || !m.bot) && (msgFilter.joins || !(m.system && m.text.includes('odaya katıldı'))) && (msgFilter.gifts || kindOf(m) !== 'gift'),
    [msgFilter],
  );

  const peopleActions: ParticipantActions = {
    invite: (uid) => {
      if (!sendMicInvite(uid, inviteSeat ?? undefined) || inviteSeat === null) return;
      setInviteSeat(null);
      setPeopleOpen(false);
    },
    micMute: (uid, muted) => {
      if (offlineBlocked()) return;
      const r = setMicMute(id, 'me', uid, muted);
      if (!r.ok) return showAlert('Yapılamadı', r.reason);
      logMod(muted ? 'Mikrofonunu susturdu' : 'Mikrofonunu açtı', userById(uid).name);
    },
    silence: toggleSilence,
    kick: confirmKick,
    profile: (uid) => {
      setPeopleOpen(false);
      router.push(`/kullanici/${uid}`);
    },
    gift: (uid) => {
      setPeopleOpen(false);
      setGiftTo(uid);
      setGiftOpen(true);
    },
    block: (uid) => app.toggleBlock(uid),
    report: (uid) => {
      const no = createTicket('Şikâyet', `Kullanıcı şikâyeti: ${userById(uid).name} (${uid}) · oda ${title} (${id})`);
      showAlert('Şikâyet alındı', `Talep numaran #${no}. Durumu Destek ekranından izleyebilirsin.`);
    },
  };

  // PK end: the result once per viewer, then the crown screen (cancelled PKs have no crowns).
  const pkEnded = lastPk && (lastPk.status === 'done' || lastPk.status === 'cancelled') ? lastPk : null;
  const showPkResult = !!pkEnded && !awayFromRoom && !pkStore.seen.includes(pkEnded.id);
  const showCrowns = !!pkEnded && !awayFromRoom && pkEnded.status === 'done' && pkStore.seen.includes(pkEnded.id) && !pkStore.seen.includes(`${pkEnded.id}:crowns`);
  const closePkResult = () => {
    if (!pkEnded) return;
    markPkSeen(pkEnded.id);
    if (pkEnded.status !== 'done') markPkSeen(`${pkEnded.id}:crowns`);
  };

  const small = capacity > 10;
  const renderSeat = (i: number, extra?: { host?: boolean; compact?: boolean; slot?: ArenaSlot }) => {
    const uid = allSeats[i];
    return (
      <Seat
        key={i}
        index={i}
        userId={uid}
        host={extra?.slot ? false : (extra?.host ?? i === 0)}
        small={small}
        vipLevel={uid === 'me' ? vipLevel : 0}
        frameId={uid === 'me' ? equipped.frame : undefined}
        speaking={!!uid && speaking.has(uid) && !silenced.has(uid)}
        muted={uid === 'me' ? !micOn : !!uid && mutedUsers.has(uid)}
        role={uid ? roleOf(uid) : i === 0 && extra?.host ? 'owner' : undefined}
        locked={!uid && i > 0 && (lockedSeats.includes(i) || (myRole === 'member' && !amSeated && !freeMic))}
        compact={extra?.compact}
        reaction={uid ? reactions[uid] : undefined}
        still={settings.reduceMotion}
        anchorRef={seatAnchor(uid, i)}
        camera={uid === 'me' && camOn}
        teamColor={teamColorOf(uid)}
        pkPoints={pkPointsOf(uid)}
        silenced={!!uid && silenced.has(uid)}
        avatarSize={extra?.slot?.size}
        slotWidth={extra?.slot?.width}
        onPress={() => onSeatPress(i)}
      />
    );
  };

  if (!unlocked) return <PasswordGate title={title} password={password} onPass={() => setUnlocked(true)} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} blurRadius={25} />
      <LinearGradient colors={['rgba(8,15,30,0.55)', 'rgba(8,15,30,0.97)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Pressable onPress={() => setPanel('info')} accessibilityLabel="Oda kartı" hitSlop={4}>
              <Avatar uri={userById(hostId).avatar} size={36} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Pressable onPress={() => setPanel('info')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {password ? '🔒 ' : ''}
                  {title}
                </Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>Lv.{level}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setPeopleOpen(true)} accessibilityLabel={`${listeners} kişi, ${capacity} mikrofon. Odadaki kullanıcıları aç`}>
                <Text style={styles.sub} numberOfLines={1}>
                  {typeInfo.emoji} {typeInfo.name} · 👥 {listeners} · 🎙️ {capacity}
                  {agencyRoom ? ' · 🏢 Ajans odası' : ''}
                  {myRole === 'owner' ? ' · Sahibi' : myRole === 'admin' ? ' · 🛡️ Yönetici' : ''}
                  {invisible ? ' · 👻' : ''}
                </Text>
              </Pressable>
            </View>
            {isOwn && (
              <Pressable onPress={() => setPanel('requests')} accessibilityLabel="Konuşma istekleri" hitSlop={6}>
                <Text style={{ fontSize: 20 }}>🙋</Text>
                {requests.length > 0 && (
                  <View style={styles.reqBadge}>
                    <Text style={styles.reqBadgeText}>{requests.length}</Text>
                  </View>
                )}
              </Pressable>
            )}
            {top3.length > 0 && (
              <Pressable onPress={() => setPanel('contrib')} style={{ flexDirection: 'row' }} accessibilityLabel="İlk 3 katkı">
                {top3.map((uid, i) => (
                  <View key={uid} style={[styles.topAvatar, { marginLeft: i ? -8 : 0, borderColor: ['#FBBF24', '#CBD5E1', '#F59E0B'][i] }]}>
                    <Avatar uri={userById(uid).avatar} size={24} />
                  </View>
                ))}
              </Pressable>
            )}
            <Pressable onPress={() => setPanel('contrib')} accessibilityLabel="Katkı sıralaması" hitSlop={6}>
              <Ionicons name="trophy" size={20} color={colors.gold} />
            </Pressable>
            {isOwn && (
              <Pressable onPress={() => setPanel('settings')} accessibilityLabel="Oda ayarları" hitSlop={6}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Odadan çık">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {/* Stage: boards and mics. Capped so the Balkon and the chat always keep their space on small phones; scrolls when taller. */}
          <ScrollView style={{ flexGrow: 0, maxHeight: Math.round(win.height * 0.58) }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
            {musicEnabled && <MusicBar music={music} canControl={canControlMusic} onOpen={() => setPanel('music')} onToggle={music$.toggle} onNext={music$.next} />}
            {offline && <ConnectionBanner onReconnect={() => setConnection('online')} />}
            {pk?.kind === 'cross' && <PkBoard pk={pk} viewerRoomId={id} canManage={canManage && !offline} />}
            {pk?.kind === 'room' && pk.mode === 'solo' && <SoloBoard pk={pk} canManage={canManage && !offline} />}
            {pk?.kind === 'room' && pk.mode === 'team' && pk.status === 'invite' && <PkBoard pk={pk} viewerRoomId={id} canManage={canManage && !offline} />}
            {callActive && (
              <Pressable style={styles.callBanner} onPress={() => router.push(media.call?.kind === 'match' ? '/tanis' : { pathname: '/arama/[id]', params: { id: media.call!.peerId } })} accessibilityLabel="Görüşmeye dön">
                <Ionicons name="call" size={16} color={semantic.successInk} />
                <Text style={styles.callBannerText} numberOfLines={1}>
                  {media.call?.kind === 'match' ? 'Hemen Tanış' : 'Bire bir'} görüşmedesin · odada dinleyicisin
                </Text>
                <Text style={styles.callBannerGo}>Dön</Text>
              </Pressable>
            )}
            {settings.roomMuted && <Text style={styles.mutedChip}>🔇 Oda sesi senin için kapalı · Ses ayarlarından açabilirsin</Text>}
            {myQueuePos !== null && <Text style={styles.queueChip}>🙋 Konuşmacı kuyruğundasın · sıran: {myQueuePos + 1}{freeSeatIndex < 0 ? ' · mikrofonlar dolu, bekleme listesindesin' : ''}</Text>}
            {roomType === 'event' && events.filter((e) => !e.cancelled)[0] && (
              <Pressable style={styles.eventBanner} onPress={() => setPanel('events')}>
                <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  📅 {events.filter((e) => !e.cancelled)[0].title} · {events.filter((e) => !e.cancelled)[0].when}
                </Text>
                <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 12 }}>{events.filter((e) => !e.cancelled)[0].going ? '✓ Katılıyorsun' : 'Katıl →'}</Text>
              </Pressable>
            )}
            {questions.find((q) => q.picked) && <Text style={styles.queueChip}>🎤 Seçilen soru: {questions.filter((q) => q.picked).slice(-1)[0].text}</Text>}
            {poll && (
              <PollCard
                poll={poll}
                canManage={myRole !== 'member'}
                onVote={(i) => setPoll((p) => (p ? { ...p, myVote: i, options: p.options.map((o, j) => (j === i ? { ...o, votes: o.votes + 1 } : o)) } : p))}
                onClose={() => {
                  setPoll((p) => (p ? { ...p, closed: true, endsIn: 0 } : p));
                  logMod('Anketi kapattı', poll.question);
                }}
              />
            )}
            {goal && <GoalCard goal={goal} />}

            {teamPk ? (
              <>
                {bossOn && (
                  <View style={[styles.topRow, { marginTop: 6 }]}>
                    <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
                  </View>
                )}
                <TeamArena pk={teamPk} seats={allSeats} boss={bossId} width={win.width} canManage={canManage && !offline} renderSeat={(i, slot) => renderSeat(i, { slot })} />
              </>
            ) : (
              <View style={styles.seatGrid}>
                {bossOn && (
                  <View style={styles.topRow}>
                    {renderSeat(0, { host: true, compact: true })}
                    <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
                  </View>
                )}
                {allSeats.map((_, i) => (bossOn && i === 0 ? null : renderSeat(i)))}
              </View>
            )}
          </ScrollView>
          <BalconyBar
            view={view}
            stale={offline}
            onOpen={() => {
              setInviteSeat(null);
              setPeopleOpen(true);
            }}
          />

          <ChatFeed messages={feed} visible={visibleInAll} renderItem={renderChat} />

          {emojiOpen && (
            <EmojiPanel
              onAnimate={sendAnim}
              hint={amSeated ? 'Seçtiğin emoji koltuğundaki avatarının üzerinde oynar.' : 'Koltukta değilsin: emoji mesajına eklenir. Mikrofona geçince avatarının üzerinde oynar.'}
              onPick={(e) => {
                if (amSeated) {
                  tapHaptic();
                  react('me', e);
                  setEmojiOpen(false);
                } else setDraft((d) => d + e);
              }}
            />
          )}
          <View style={styles.bottom}>
            <RoundBtn label="Menü" icon="ellipsis-horizontal" onPress={() => setPanel('menu')} />
            <View style={styles.inputWrap}>
              <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel={amSeated ? 'Emoji gönder' : 'Emoji ekle'} hitSlop={8}>
                <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={24} color={colors.textDim} />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={send}
                placeholder="Bir şey söyle..."
                placeholderTextColor={colors.textDim}
                style={styles.input}
                returnKeyType="send"
              />
            </View>
            {roomType === 'qa' && <RoundBtn label="Sorular" icon="help" onPress={() => setPanel('qa')} badge={questions.filter((q) => !q.picked).length} />}
            {amSeated && <RoundBtn label={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'} icon={camOn ? 'videocam' : 'videocam-off'} onPress={toggleCam} />}
            {amSeated ? (
              <MicBtn state={micOn ? 'on' : 'off'} onPress={() => !devicesBusy() && setMicOn((m) => !m)} />
            ) : (
              <MicBtn state={myQueuePos !== null ? 'queued' : 'hand'} queuePos={myQueuePos ?? undefined} onPress={raiseHand} />
            )}
            <RoundBtn
              label="Hediye"
              icon="gift"
              gift
              onPress={() => {
                setGiftTo(null);
                setGiftOpen(true);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {envelope && <EnvelopeDrop from={envelope.from} seconds={envelope.seconds} onGrab={grabEnvelope} />}

      <GiftSheet
        key={giftOpen ? `gift-open-${giftTo}` : 'gift-closed'}
        visible={giftOpen}
        onClose={() => setGiftOpen(false)}
        seated={allSeats.flatMap((s, i) => (s && s !== 'me' ? [{ id: s, seat: i + 1 }] : []))}
        listeners={audience.map((u) => u.id)}
        initialTo={giftTo}
        coins={coins}
        onSend={sendGift}
        onSendLucky={sendLuckyGift}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <ParticipantsSheet
        visible={peopleOpen}
        onClose={() => {
          setPeopleOpen(false);
          setInviteSeat(null);
        }}
        room={live}
        view={view}
        myRole={myRole}
        offline={offline}
        inviteSeat={inviteSeat}
        silenced={silenced}
        blocked={blocked}
        hiddenMe={invisible && !amSeated}
        actions={peopleActions}
      />
      <RoomInfoSheet
        key={panel === 'info' ? 'info-open' : 'info-closed'}
        visible={panel === 'info'}
        onClose={() => setPanel(null)}
        roomId={id}
        title={title}
        cover={cover}
        theme={theme}
        level={level}
        xp={isOwn ? myRoom.xp : null}
        owner={isOwn}
        clan={clan}
        members={roomMembers}
        memberTotal={memberTotal}
        applications={memberApps}
        canManageMembers={isOwn}
        autoRemoveDays={isOwn ? myRoom.autoRemoveDays : 0}
        membership={membership}
        onJoin={joinRoom}
        onApprove={(uid) => {
          if (roomMembers.length >= memberLimit(level)) return showAlert('Üye kapasitesi dolu', `Lv.${level} oda en fazla ${memberLimit(level)} üye alabilir.`);
          setMemberApps((l) => l.filter((x) => x !== uid));
          updateMyRoom({ memberIds: [...myRoom.memberIds, uid] });
          addMsg({ system: true, text: `🏠 ${userById(uid).name} oda üyesi oldu` });
        }}
        onReject={(uid) => setMemberApps((l) => l.filter((x) => x !== uid))}
        onRemoveMember={(uid) => {
          updateMyRoom({ memberIds: myRoom.memberIds.filter((x) => x !== uid) });
          logMod('Oda üyeliğinden çıkardı', userById(uid).name);
        }}
        stats={{ coins: Object.entries(contrib).reduce((sum, [uid, v]) => (uid === 'me' && isOwn ? sum : sum + v), 0), peak, minutes }}
        giftLog={giftLog}
        announcement={announcement ?? ''}
        onSave={(p) => updateMyRoom(p)}
        onSettings={() => setPanel('settings')}
        onShare={shareRoom}
        onInvite={() => setPanel('invite')}
      />
      {isOwn && (
        <RoomSettingsScreen
          visible={panel === 'settings'}
          onClose={() => setPanel(null)}
          room={myRoom}
          update={(p) => {
            updateMyRoom(p);
            const keys = Object.keys(p).filter((k) => k !== 'password');
            if (keys.length) logMod('Oda ayarını değiştirdi', keys.join(', '));
          }}
          level={level}
          vipLevel={GATES.roomLock(nobleTier) ? 1 : 0}
          maxMics={maxMics}
          modLog={modLog}
          bans={bans}
          botOn={settings.roomBot}
          setBot={(v) => setSetting('roomBot', v)}
        />
      )}
      <MusicSheet
        visible={panel === 'music'}
        onClose={() => setPanel(null)}
        music={music}
        canControl={canControlMusic}
        onAdd={music$.add}
        onSuggest={music$.suggest}
        onToggle={music$.toggle}
        onNext={music$.next}
        onRemove={music$.remove}
        enabled={musicEnabled}
        setEnabled={setMusicEnabled}
        requests={musicRequests}
        onApprove={(i) => {
          const r = musicRequests[i];
          setMusicRequests((l) => l.filter((_, j) => j !== i));
          if (r) music$.add(r.track);
        }}
        onReject={(i) => setMusicRequests((l) => l.filter((_, j) => j !== i))}
      />
      <EnvelopeSendModal visible={panel === 'envelope'} onClose={() => setPanel(null)} onSend={sendEnvelope} coins={coins} />
      <DiceModal visible={panel === 'dice'} onClose={() => setPanel(null)} onPlay={playDice} playsLeft={dicePlays} />
      <ContributionModal visible={panel === 'contrib'} onClose={() => setPanel(null)} data={contrib} locked={isOwn && level < 3} />
      <RequestsModal
        visible={panel === 'requests'}
        onClose={() => setPanel(null)}
        requests={requests}
        freeSeats={allSeats.filter((x, i) => i > 0 && x === null && !lockedSeats.includes(i)).length}
        onAccept={(uid) => {
          if (placeOnSeat(uid)) setRequests((r) => r.filter((x) => x !== uid));
        }}
        onReject={(uid) => {
          setRequests((r) => r.filter((x) => x !== uid));
          addMsg({ system: true, text: `${userById(uid).name} adlı kullanıcının konuşma isteği reddedildi` });
        }}
      />
      <PollCreate
        visible={panel === 'poll'}
        onClose={() => setPanel(null)}
        onCreate={(question, opts, seconds, live) => {
          setPoll({ id: msgId(), question, options: opts.map((text) => ({ text, votes: 0 })), myVote: null, endsIn: seconds, live, closed: false });
          setPanel(null);
          addMsg({ system: true, text: `📊 Anket başladı: ${question}` });
        }}
      />
      <GoalCreate
        visible={panel === 'goal'}
        onClose={() => setPanel(null)}
        onCreate={(g) => {
          setGoal({ ...g, id: msgId(), progress: 0 });
          setPanel(null);
          addMsg({ system: true, text: `🎯 Topluluk hedefi: ${g.title} (10 dk)` });
        }}
      />
      <EventsSheet
        visible={panel === 'events'}
        onClose={() => setPanel(null)}
        events={events}
        canManage={myRole !== 'member'}
        onCreate={(e) => {
          setEvents((l) => [...l, { ...e, id: msgId(), by: isOwn ? 'me' : hostId, going: true, reminder: true, attendees: 0, cancelled: false }]);
          addMsg({ system: true, text: `📅 Yeni etkinlik: ${e.title} · ${e.when}` });
        }}
        onToggleGoing={(eid) => setEvents((l) => l.map((e) => (e.id === eid ? { ...e, going: !e.going } : e)))}
        onToggleReminder={(eid) => {
          const e = events.find((x) => x.id === eid);
          setEvents((l) => l.map((x) => (x.id === eid ? { ...x, reminder: !x.reminder } : x)));
          // One reminder per event (no duplicates); respects the user's notification choices.
          if (e && !e.reminder) notify({ kind: 'social', icon: '⏰', title: `Hatırlatma kuruldu: ${e.title}`, body: `${e.when} · ${title}`, href: `/oda/${id}` });
        }}
        onCancel={(eid) => {
          const e = events.find((x) => x.id === eid);
          setEvents((l) => l.map((x) => (x.id === eid ? { ...x, cancelled: true } : x)));
          if (e) {
            addMsg({ system: true, text: `❌ Etkinlik iptal edildi: ${e.title} — katılımcılara bildirildi` });
            logMod('Etkinliği iptal etti', e.title);
          }
        }}
      />
      <QuestionsSheet
        visible={panel === 'qa'}
        onClose={() => setPanel(null)}
        questions={questions}
        canManage={myRole !== 'member'}
        onAsk={(text) => setQuestions((q) => [...q, { id: msgId(), userId: 'me', text, picked: false }])}
        onPick={(qid) => {
          const q = questions.find((x) => x.id === qid);
          setQuestions((l) => l.map((x) => (x.id === qid ? { ...x, picked: true } : x)));
          if (q) addMsg({ system: true, text: `🎤 Seçilen soru (${userById(q.userId).name}): ${q.text}` });
        }}
      />
      <SoundSheet
        visible={panel === 'sound'}
        onClose={() => setPanel(null)}
        settings={settings}
        set={setSetting}
        isOwner={isOwn}
        roomFx={{ giftEffects: myRoom.giftEffects, joinSounds: myRoom.joinSounds }}
        setRoomFx={updateMyRoom}
      />
      <ModerationSheet visible={panel === 'mod'} onClose={() => setPanel(null)} log={modLog} slowMode={slowMode} setSlowMode={(v) => { setSlowMode(v); logMod(v ? 'Yavaş modu açtı' : 'Yavaş modu kapattı', 'Oda'); }} words={words} setWords={setWords} bans={bans} />
      <InviteSheet
        visible={panel === 'invite'}
        onClose={() => setPanel(null)}
        friends={USERS.filter((u) => following.has(u.id))}
        invited={invited}
        onInvite={(uid) => {
          setInvited((m) => ({ ...m, [uid]: 'Davet edildi' }));
          setTimeout(() => {
            setInvited((m) => ({ ...m, [uid]: 'Katıldı' }));
            addMsg({ system: true, text: `📨 ${userById(uid).name} davetinle odaya katıldı` });
          }, 2500);
        }}
      />
      <RoomMenuSheet visible={panel === 'menu'} onClose={() => setPanel(null)} sections={menuSections} />
      <ActionSheet
        visible={panel === 'msgSettings'}
        title="Mesaj ayarları (sadece senin ekranın)"
        onClose={() => setPanel(null)}
        options={[
          { label: `${msgFilter.joins ? '✅' : '⬜'} Giriş mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, joins: !f.joins })) },
          { label: `${msgFilter.gifts ? '✅' : '⬜'} Hediye mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, gifts: !f.gifts })) },
          { label: `${msgFilter.bot ? '✅' : '⬜'} Bot mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, bot: !f.bot })) },
        ]}
      />
      <GiftResults visible={panel === 'results'} onClose={() => setPanel(null)} results={giftResults} />
      <AnimLayer
        roomId={id}
        originOf={originOf}
        lite={settings.lowData}
        off={settings.effectsOff}
        micEffect={{ animationId: app.micFx, active: amSeated && micOn && !callActive, isSpeaking: () => speakingMe.current }}
      />
      <PkSetupSheet key={pkSetup ? 'pk-open' : 'pk-closed'} visible={pkSetup} roomId={id} starterId="me" micUsers={view.micIds} offline={offline} onClose={() => setPkSetup(false)} />
      {showPkResult && pkEnded && (
        <PkResultScreen
          pk={pkEnded}
          viewerRoomId={id}
          still={settings.reduceMotion || settings.effectsOff}
          onContinue={closePkResult}
          onProfile={openProfileFromPk}
          onNew={
            canManage
              ? () => {
                  markPkSeen(pkEnded.id);
                  markPkSeen(`${pkEnded.id}:crowns`);
                  setPkSetup(true);
                }
              : undefined
          }
        />
      )}
      {showCrowns && pkEnded && <CrownScreen pk={pkEnded} still={settings.reduceMotion || settings.effectsOff} onClose={() => markPkSeen(`${pkEnded.id}:crowns`)} onProfile={openProfileFromPk} />}
      {myInvite && !offline && <MicInvitePrompt key={myInvite.id} invite={myInvite} onAnswer={answerMyInvite} />}
      <SeatMenu anchor={seatMenu?.anchor ?? null} title={seatMenu?.title} items={seatMenu?.items ?? []} onClose={() => setSeatMenu(null)} />
      {moving && (
        <Pressable style={styles.moveBanner} onPress={() => setMoving(null)} accessibilityLabel="Koltuk değiştirmeyi iptal et">
          <Text style={styles.moveText}>{userById(moving).name} için boş bir koltuğa dokun · iptal için buraya dokun</Text>
        </Pressable>
      )}
      {flights.length > 0 && <GiftFlights flights={flights} onDone={(k) => setFlights((f) => f.filter((x) => x.key !== k))} />}
      {game && (
        <GamePanel
          open={game}
          entry={gameEntry}
          players={gamePlayers}
          hidden={gameMin}
          voice={{ seated: amSeated, micOn, onToggleMic: () => !devicesBusy() && setMicOn((m) => !m) }}
          onSwitch={setGame}
          onMinimize={() => setGameMin(true)}
          onClose={() => setGame(null)}
          onInvite={(name) => addMsg({ system: true, text: `🎮 ${ME.name} herkesi ${name} masasına davet ediyor! Katılmak için Menü › Oda Oyunları` })}
        />
      )}
      {game && gameMin && (
        <Pressable style={styles.gameChip} onPress={() => setGameMin(false)} accessibilityLabel="Oyuna dön">
          <Text style={styles.gameChipText}>🎮 Oyun devam ediyor · aç</Text>
        </Pressable>
      )}
      {giftFx && <GiftAnimation gift={giftFx} onDone={() => setGiftFx(null)} />}
      {combo && comboGift && (
        <LuckyCombo
          key={`${combo.giftId}-${combo.to.join()}`}
          emoji={comboGift.emoji}
          name={comboGift.name}
          price={comboGift.price * combo.to.length}
          count={combo.count}
          restartKey={combo.key}
          onPress={() => sendLuckyGift(combo.giftId, combo.to)}
          onExpire={() => setCombo(null)}
        />
      )}
      {luckyFx && <LuckyResult key={luckyFx[0].txId} records={luckyFx} still={settings.effectsOff || settings.reduceMotion} onDone={() => setLuckyFx(null)} />}
      {/* Platform-wide win announcements (every room shows every win). */}
      <WinBanner top={110} still={settings.reduceMotion} />
      {entry && <EntryEffect key={`${entry.name}-${entry.fx}-${entry.avatar}`} show={entry} still={settings.reduceMotion} onDone={() => setEntry(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  sub: { color: colors.textDim, fontSize: 12 },
  levelBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  levelText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  reqBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: colors.red, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  reqBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  moveBanner: { position: 'absolute', left: 12, right: 12, top: 110, backgroundColor: semantic.action, borderRadius: 12, padding: 10, zIndex: 35 },
  moveText: { color: semantic.actionInk, fontWeight: '800', textAlign: 'center', fontSize: 13 },
  gameChip: { position: 'absolute', right: 12, bottom: 96, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, zIndex: 30 },
  gameChipText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
  callBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: semantic.success, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  callBannerText: { color: semantic.successInk, fontWeight: '800', flex: 1, fontSize: 13 },
  callBannerGo: { color: semantic.successInk, fontWeight: '900' },
  topRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28 },
  topAvatar: { borderWidth: 2, borderRadius: 14 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 8, rowGap: 10 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mutedChip: { color: colors.gold, fontSize: 12, textAlign: 'center', marginTop: 4 },
  queueChip: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(19,217,223,0.35)', marginHorizontal: 12, marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  inputWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingLeft: 10, height: 48 },
  input: { flex: 1, minWidth: 0, color: '#fff', paddingRight: 14, paddingVertical: 10, fontSize: 15 },
});
