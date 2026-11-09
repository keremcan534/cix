import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type HostInstance } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { useKeyboardOpen } from '@/lib/keyboard-open';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { useReport } from '@/components/report-sheet';
import { useRoomMute } from '@/components/room/room-mute';
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
  ModerationSheet,
  PollCard,
  PollCreate,
  QuestionsSheet,
  ShareRoomSheet,
  EffectsSheet,
  type Goal,
  type ModLog,
  type Poll,
  type Question,
  type RoomEvent,
} from '@/components/room/community';
import { RoomMenuSheet, type MenuSection } from '@/components/room/menu';
import { BossSeat, RoomInfoSheet, RoomSettingsScreen, bossSeatInfo, type GiftLogRow, type SettingsSection } from '@/components/room/owner';
import { GiftSheet } from '@/components/room/gift-sheet';
import { LuckyCombo } from '@/components/room/lucky-combo';
import { LuckyResult } from '@/components/room/lucky-result';
import { LuckyBagCard, LuckyBagFloat, LuckyBagRain, LuckyBagSheet, bagWhat } from '@/components/room/lucky-bag';
import { SeatMenu, type Rect, type SeatMenuItem } from '@/components/room/seat-menu';
import { PersonCard } from '@/components/room/person-card';
import { insertMention, mentionPicks, mentionQuery, mentions, stripMentions } from '@/lib/room-mention';
import { EntryEffect, type EntryFx, type EntryShow } from '@/components/fx/entry';
import { storeArtOf } from '@/components/StoreArt';
import { ArtText, ROOM_ICON_ART } from '@/components/RoomArt';
import { gameArtOf, gameHueOf } from '@/components/GameArt';
import { Art, artSource } from '@/components/Art';
import { AnimLayer } from '@/components/fx/anim-layer';
import { WinBanner } from '@/components/fx/win-banner';
import { GiftFlights, type Flight, type Point } from '@/components/fx/gift-flight';
import { GiftShowFx, type GiftShowPlay } from '@/components/fx/gift-show';
import { giftShowOf } from '@/data/gift-shows';
import { GamePanel, type OpenGame } from '@/components/games/game-panel';
import type { CasinoGame } from '@/data/games';
import { ChatLine, GiftAnimation, MicBtn, REACTION_MS, RoomSoundBtn, RoundBtn, Seat, type ChatMsg, type RoomRole, type SeatReactionData } from '@/components/room/parts';
import { PkBoard, PkSetupSheet, SoloBoard, TeamArena, type ArenaSlot } from '@/components/room/pk';
import { CrownScreen, PkResultScreen } from '@/components/room/pk-result';
import { BalconyBar, MicInvitePrompt, ParticipantsSheet, type ParticipantActions } from '@/components/room/balcony';
import { SessionBanner, SessionTestSheet, closeRoomScreen } from '@/components/room/session-ui';
import { ChatFeed } from '@/components/room/chat-feed';
import { getChatShare, isLargeChat } from '@/lib/room-chat-size';
import { InboxSheet, useInboxUnread } from '@/components/room/inbox-sheet';
import { LayoutPickerSheet } from '@/components/room/layout-picker';
import { RoomScreen } from '@/components/room/room-screen';
import { StageBackdrop } from '@/components/room/stage-backdrop';
import { StageLayout } from '@/components/room/stage-layout';
import { useRoomBonds } from '@/components/room/room-bonds';
import { BOND_KINDS, bondTint, bubbleBondOf, jointEntries, micLinkOf, type JointState, type RoomBond } from '@/data/bonds';
import { Avatar } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { BOSS_SEAT_MIN_COINS, BOSS_SEAT_MIN_LEVEL, COSMETICS, MUSIC_CATALOG, STANDARD_EMOJI, STICKER_PACKS, adminCapacity, cosmeticById, djCapacity, memberLimit, micCapacity, roomLevel, roomTypeInfo, ROOM_LEVEL_REWARDS, type RoomTheme, type Track } from '@/data/catalog';
import { FAMILIES, INCOMING_GIFT_POOL, vipTier } from '@/data/economy';
import { GATES, nobleInfo } from '@/data/status';
import { LUCKY_RECIPIENT_SHARE, RULES, luckyHostDiamonds, pct } from '@/data/rules';
import { BOT_LINES, GIFTS, ME, USERS, roomById, userById, type Gift } from '@/data/mock';
import * as api from '@/lib/api';
import { isLiveRoom, isLockedRoom, liveGift, liveMode, liveRoomAnimation, message as errorText, myServerId, oneOnOneOpen, refreshServerRoom, rememberUser, toLocal, toServer, updateServerRoom } from '@/lib/live';
import { useLiveRoomSync } from '@/lib/live/room';
import { onServerRoom, sendSignal, useLivePeers, type LuckySignal, type RoomSignal } from '@/lib/live/room-bus';
import { refreshRoomPkSoon, useRoomPkSync } from '@/lib/live/pk';
import { useRoomBags, type Bag } from '@/lib/live/lucky-bags';
import { banLeft, roomBan, roomQueue, roomSeat, roomSetAdmin, roomSetDj, roomUnban, useRoomStaff, type QueueAction, type SeatAction } from '@/lib/live/room-staff';
import { roomMusicAction, type MusicAction } from '@/lib/live/music';
import { LiveMusicSheet, useRoomMusicPlayer } from '@/components/room/room-music';
import { roomUnmute } from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { checkText, messageRefusal, noteSent, refusalTitle } from '@/lib/contact-filter';
import { ContactNote } from '@/components/contact-note';
import { animById, getAnimations, isLive, newAnimRequestId, playRoomAnim, sendAnimation, simulateRemoteSend } from '@/lib/animations';
import { loadLooks, lookOf, useLooks, type Look } from '@/lib/live/looks';
import { casinoAccess, casinoVisible, gamblingLevelOk, playDuel, useGames } from '@/lib/games';
import { announceWin, roomTitleOf } from '@/lib/broadcast';
import { getLucky, luckyGift, luckyPkPoints, sendLuckyBatch, type LuckyRecord } from '@/lib/lucky';
import { liveLuckySend, refreshLucky } from '@/lib/live/lucky';
import { getPk, markPkSeen, modeLabel, pkPointsFor, recordGift, reportMismatch, teamOf, usePk } from '@/lib/pk';
import {
  KICK_BAN_MIN,
  activeBans,
  answerInvite,
  deriveView,
  enterRoom,
  exitRoom,
  forceLeaveSeat,
  freeSeat,
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
  setMutedList,
  setRoles,
  setServerBans,
  takeSeat,
  useLatched,
  useRoomLive,
  type InviteStatus,
} from '@/lib/room-presence';
import { kindOf, mergeFeed, type FeedMsg } from '@/lib/chat-feed';
import { blockedFeature } from '@/lib/remote-control';
import { ALL_FEATURES, applyServerStage, changeLayout, layoutById, modeById, seedStage, setClassicCapacity, setStageInfo, slotStates, stagePermission, useStages, type StageInfo } from '@/lib/room-modes';
import { MIC_BLOCK_LABEL, endRoom, getSession, micBlock, micSending, reportRoomState, setMicWant, setNoiseSuppression, setPlaybackVolume, useRoomSession, type MicBlock } from '@/lib/room-session';
import { shareLink } from '@/lib/links';
import { balconyOnly, canInviteFollowers, defaultMicQueue, followerCount, knownFollowers, roomInviteText, seatAccess } from '@/lib/room-invites';
import { BUSY_DEVICES, getMedia, leaveRoom, reportRoom, useMedia } from '@/lib/media';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { stickerIdOf, stickerToken } from '@/lib/stickers';
import { useApp, type MyRoom } from '@/store';
import { similarity } from '@/lib/similarity';
import { colors, gradient, semantic } from '@/theme';
import { MuteBanner, useStopped } from '@/components/sanction-screen';
import { refreshSanctions, showSanction } from '@/lib/sanctions';

const DAILY_DICE = 20;
const BOT_TIPS = [
  'Oda kuralları: saygılı ol, spam ve hakaret yok. Şikâyet için ⋯ menüsünü kullan.',
  'Koltuğa geçmek için boş bir koltuğa dokun; bu odada istekle oturuluyor.',
  'Hediyeler yayıncıya elmas olarak yazılır ve oda seviyesini yükseltir.',
];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const msgId = () => String(Date.now() + Math.random());
const nowMs = () => Date.now();
const reactionKey = () => Date.now() + Math.random();
/** A server room's slow mode: one chat line per 10 seconds for everyone but its staff (server/api/room-rules.mjs). */
const SLOW_MS = 10_000;
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

// Bots mix free Temel stickers with standard emoji.
const BOT_REACTIONS = [stickerToken('temel-kahkaha'), stickerToken('temel-asik'), stickerToken('oda-alkis'), '🔥', '😎', '🥳', '❤️', stickerToken('temel-begendim'), stickerToken('oda-saskin'), '🤣'];
const BOT_ENTRY_FX: EntryFx[] = ['sparkle', 'thunder', 'comet', 'dragon', 'vip'];
const NO_BONDS: RoomBond[] = [];
/** Someone's entry show in a server room, from their shop look (entry effect, ride, noble rank); null: none. */
function entryShowOf(look: Look | undefined, name: string, avatar: string): EntryShow | null {
  if (!look) return null;
  const entryItem = cosmeticById(look.entry ?? undefined);
  const ride = cosmeticById(look.ride ?? undefined);
  const noble = look.noble ? nobleInfo(look.noble) : undefined;
  if (!entryItem && !ride && !noble) return null;
  const tier = vipTier(look.vipLevel);
  return { name, avatar, fx: (entryItem?.fx as EntryFx | undefined) ?? 'vip', ride: ride?.emoji, rideArt: storeArtOf(ride?.id), colors: entryItem ? undefined : (tier?.color ?? gradient), badge: noble?.emoji };
}
// What another phone may put over its seat: the emoji panel's own emoji and stickers (no free text, no unknown art).
const SEAT_EMOJI = new Set(STANDARD_EMOJI.flatMap((g) => g.emojis));
const STICKER_IDS = new Set(STICKER_PACKS.flatMap((p) => p.stickers.map((x) => x.id)));
const seatEmojiOk = (e: string) => {
  const sticker = stickerIdOf(e);
  return sticker ? STICKER_IDS.has(sticker) : SEAT_EMOJI.has(e);
};
/** Lv8 joint entrance banner: both photos, the bond named ("Çift Lv8"); me first when I am one of the two. */
function jointShowOf(b: RoomBond, myAvatar: string): EntryShow {
  const [x, y] = b.b === 'me' ? [b.b, b.a] : [b.a, b.b];
  const face = (uid: string) => (uid === 'me' ? myAvatar : userById(uid).avatar);
  const [, c2] = bondTint(b.kind);
  return {
    name: userById(x).name,
    avatar: face(x),
    partner: { name: userById(y).name, avatar: face(y) },
    fx: 'bond',
    colors: b.kind === 'cift' ? undefined : ['#0E1F4D', c2],
    badge: `${BOND_KINDS[b.kind].label} Lv${b.level}`,
  };
}
const BOT_RIDES = COSMETICS.filter((c) => c.kind === 'ride');

/** Short mic-button captions for a mic that is on but not sending (lib/room-session micBlock). */
const HELD_CAPTION: Record<Exclude<MicBlock, null>, string> = {
  not_seated: 'KAPALI',
  sanctioned: 'SUSTURMA',
  mod_muted: 'SUSTURULDU',
  in_app_call: 'GÖRÜŞMEDE',
  permission: 'İZİN YOK',
  phone_call: 'ARAMADA',
  focus_loss: 'DURAKLADI',
  background: 'DURAKLADI',
  connection: 'BAĞLANTI',
};

/** Reads a server room again and puts its layout and classic mic count (as the server keeps them) on this phone. */
const syncServerStage = (id: string) =>
  refreshServerRoom(id).then((r) => {
    const max = micCapacity(!!r.agency, r.level ?? 1);
    applyServerStage(id, { layoutId: r.layoutId ?? null, classicCapacity: Math.min(r.micCount ?? max, max) });
  });

/**
 * The live room. Rendered once by RoomHost for the session's room and kept mounted while the user is
 * elsewhere in the app (`full` false): the chat, mic, PK and timers keep going, but nothing is drawn,
 * no sheet stays open and no visual-only loop runs. Connection, mic and leaving belong to lib/room-session.
 */
/** Room menu items that only switch something on or off (or leave the room): nothing to come back from. */
const MENU_TOGGLES = new Set(['queue']);

export function LiveRoom({ id, via, full }: { id: string; via?: string; full: boolean }) {
  const isOwn = id === 'yeni';
  // A room on our server (live mode, lib/live): real people only, no demo bots or demo gifts.
  const real = isLiveRoom(id);
  // Server room moderation (lib/live/room-staff): admins, bans and voice mutes as the server keeps them; locked
  // mics, layout, mic count and the mic queue from the LiveKit room's metadata, which only the server writes.
  const staff = useRoomStaff(id, real);
  const roomMeta = useLivePeers(id);
  const liveState = roomMeta.state;
  const app = useApp();
  // Live mode: reporting a real room or person goes to the moderators (components/report-sheet).
  const reporting = useReport();
  const { coins, spendCoins, spendBlock, addCoins, receiveDiamonds, bump, vipLevel, svipLevel, nobleTier, blocked, settings, setSetting, equipped, myRoom, updateMyRoom, addRoomXp, agencyId, createTicket, visitRoom, addFanPoints, following, notify, familyId, ownedAgency, conversations, sendMessage, followerInvites, markFollowerInvite } = app;

  const base = isOwn ? null : roomById(id);
  const [, setRoomEdits] = useState(0);
  // A server room's activities (server/api/room-events.mjs): read on entry and whenever the server says the room
  // changed; reminders are this phone's own.
  const [serverEvents, setServerEvents] = useState<api.ServerRoomEvent[] | null>(null);
  const [reminders, setReminders] = useState<number[]>([]);
  const hostId = isOwn ? 'me' : base!.hostId;
  const title = isOwn ? myRoom.title : base!.title;
  const cover = isOwn ? myRoom.cover : base!.cover;
  const announcement = isOwn ? myRoom.announcement : base!.announcement;
  const password = isOwn ? '' : (base!.password ?? '');
  // The classic grid's mic count (room settings; a server room: as the server keeps it, none = the level's most);
  // a selected layout (lib/room-modes) replaces it. A server room takes it from the voice room's metadata first:
  // it reaches every phone the moment it changes, while the room read can be older.
  const roomMics = isOwn ? myRoom.micCount : real && liveState ? liveState.micCount : base!.micCount;
  const level = isOwn ? roomLevel(myRoom.xp) : (base!.level ?? 1);
  const agencyRoom = isOwn ? !!agencyId : !!base!.agency;
  const maxMics = micCapacity(agencyRoom, level);
  const theme = isOwn ? myRoom.theme : (base!.theme ?? 'chat');
  const bossOn = isOwn ? myRoom.bossSeat && level >= BOSS_SEAT_MIN_LEVEL : !!base!.bossSeat;
  const micPermission = isOwn ? myRoom.micPermission : (base!.micPermission ?? 'everyone');
  // The locked mics as the room read has them (read here, as text, so nothing later can touch the room read).
  const readLocks = base?.lockedSeats?.join(',') ?? null;
  // "Mikrofon kuyruğu" (room settings): on = members ask for a mic and the owner/admins approve. A server room:
  // as the server keeps it (the room metadata says it at once, the room read is the fallback).
  const micQueue = isOwn ? myRoom.micQueue : real ? (liveState?.micQueue ?? !!base!.micQueue) : (base!.micQueue ?? defaultMicQueue(base!.roomType));
  // Who waits in a server room's mic queue (local ids, first asked first).
  const serverQueue = useMemo(() => (real ? (liveState?.queue ?? []).map(toLocal) : []), [real, liveState]);
  // A server room's rules (Oda ayarları, Moderasyon), kept on the server and the same on every phone.
  const liveRules = real ? (base!.rules ?? null) : null;
  const functionsBy = isOwn ? myRoom.manageFunctions : (liveRules?.manageFunctions ?? 'admins');
  // What the stage server (lib/room-modes) is told: my room's own choice; a server room's tools are checked here.
  const stageFunctionsBy = isOwn ? myRoom.manageFunctions : 'admins';
  const adminIds = isOwn ? myRoom.adminIds : real ? staff.admins : (base!.adminIds ?? []);
  // What the stage server knows about the room: level, theme, who manages room functions, the classic mic count.
  const stageInfo: StageInfo = useMemo(
    () => ({ level, theme, manageFunctions: stageFunctionsBy, classicCapacity: Math.min(roomMics ?? maxMics, maxMics), classicMax: maxMics, features: ALL_FEATURES }),
    [level, theme, stageFunctionsBy, roomMics, maxMics],
  );
  const classicCapacity = stageInfo.classicCapacity;
  const myRole: RoomRole = hostId === 'me' ? 'owner' : adminIds.includes('me') ? 'admin' : 'member';
  const roleOf = (uid: string): RoomRole => (uid === hostId ? 'owner' : adminIds.includes(uid) ? 'admin' : 'member');
  // Ranks (the server checks them, server/api/rooms.mjs): owner 3 > Süper Yönetici 2 > Yönetici 1 > member 0.
  // Nobody acts on their own rank or higher; the Süper Yönetici also edits the name, bulletin and events.
  const superIds = real ? staff.superAdmins : [];
  // DJs (server rooms, server/api/music.mjs): the owner names them; they play music in the room and nothing else.
  const djIds = real ? staff.djs : [];
  const rankOf = (uid: string) => (uid === hostId ? 3 : superIds.includes(uid) ? 2 : adminIds.includes(uid) ? 1 : 0);
  const myRank = rankOf('me');
  const rankLabel = (uid: string) => ['Üye', 'Yönetici', 'Süper Yönetici', 'Oda sahibi'][rankOf(uid)];
  const canManage = myRole !== 'member';
  // "Oda işlevlerini yönet": music, polls, goals, events can be limited to the owner.
  const canFunctions = myRole === 'owner' || (myRole === 'admin' && functionsBy === 'admins');
  const botOn = real ? !!liveRules?.bot : isOwn ? settings.roomBot : true;
  const invisible = settings.invisibleEntry && GATES.invisibleEntry(nobleTier);
  const roomType = isOwn ? myRoom.roomType : (base!.roomType ?? 'free');
  const typeInfo = roomTypeInfo(roomType);
  // Seat locks: saved for my own room; in a server room the server keeps them; in other rooms I moderate they
  // last for this session.
  const [localLocks, setLocalLocks] = useState<number[]>([]);
  // Before the voice connection reads the metadata (or from an older server), the room read has the locks.
  const metaLocks = roomMeta.lockedSeats;
  const liveLocks = useMemo(() => (liveState || readLocks === null ? metaLocks : readLocks.split(',').filter(Boolean).map(Number)), [liveState, readLocks, metaLocks]);
  const lockedSeats = isOwn ? myRoom.lockedSeats : real ? liveLocks : localLocks;
  // Personal effect preferences never change the gift transaction itself.
  // The owner can turn gift effects off for the whole room (my room: here; a server room: on the server, for every phone).
  const roomGiftFx = isOwn ? myRoom.giftEffects : !real || base!.giftEffects !== false;
  const showFx = (price: number) => !settings.effectsOff && settings.giftFx && !settings.reduceMotion && roomGiftFx && (!settings.bigGiftsOnly || price >= 100);
  // Entry banners (mine, a bond pair's, a joiner's): Efekt ayarları › Giriş efektleri.
  const entryOn = !settings.effectsOff && settings.entryFx;

  // Entry effect from cosmetics (ride/entry) or VIP level.
  const entryInfo = useMemo(() => {
    const tier = vipTier(vipLevel);
    const entryItem = cosmeticById(equipped.entry);
    const ride = cosmeticById(equipped.ride);
    const noble = nobleInfo(nobleTier);
    if (!entryItem && !ride && !GATES.entryBanner(svipLevel, nobleTier)) return null;
    const who = `${noble ? `${noble.emoji} ${noble.name} ` : ''}${svipLevel ? `İnci ${svipLevel} · ` : ''}${ME.name}`;
    const text = `${entryItem?.emoji ?? '✨'} ${ride ? `${ride.emoji} ${ride.name} ile ` : ''}${who} odaya girdi!`;
    const badge = [noble?.emoji, svipLevel ? `İnci ${svipLevel}` : ''].filter(Boolean).join(' ') || undefined;
    const fx = (entryItem?.fx as EntryFx | undefined) ?? 'vip';
    const show: EntryShow = { name: ME.name, avatar: app.me.avatar, fx, ride: ride?.emoji, rideArt: storeArtOf(ride?.id), colors: entryItem ? undefined : (tier?.color ?? gradient), badge };
    return { text, show };
  }, [vipLevel, svipLevel, nobleTier, equipped.entry, equipped.ride, app.me.avatar]);

  const [unlocked, setUnlocked] = useState(!password);
  // Entering a room while a one-to-one call is live: join as a listener, never on a mic (lib/media).
  const [joinedInCall] = useState(() => !!getMedia().call);
  // Room stage (lib/room-modes): mode, mic layout and the shared YouTube player. Seeded once, like the presence;
  // it is module state, so minimizing the room or opening the Balkon never resets it.
  useState(() => seedStage(id, { layoutId: isOwn ? myRoom.layoutId : base!.layoutId, info: stageInfo }));
  useEffect(() => setStageInfo(id, stageInfo), [id, stageInfo]);
  const stages = useStages();
  const stage = stages.stages[id];
  const layout = layoutById(stage?.layoutId);
  const capacity = layout ? layout.microphoneCapacity : classicCapacity;
  // Room presence (lib/room-presence): who is in the room and on which mic. One model for the mics, the
  // Balkon and every counter. Seeded the first time the room is opened (silent, before the first read).
  useState(() =>
    seedRoom(id, {
      ownerId: hostId,
      adminIds,
      seats: isOwn ? (joinedInCall ? [] : ['me']) : real ? [] : base!.seatUserIds,
      capacity,
      total: isOwn ? 7 : real ? 0 : base!.listeners,
      regulars: real ? [] : USERS.filter((u) => u.id !== hostId).map((u) => u.id).slice(0, isOwn ? 6 : USERS.length),
      blacklist: isOwn ? myRoom.blacklist : [],
    }),
  );
  const { room: live, offline } = useRoomLive(id);
  const view = useMemo(() => deriveView(live), [live]);
  // Roles come from the presence server (seeded above), so this reads the real role from the first render on.
  const stageDeny = stagePermission(id, 'me');
  const canStage = stageDeny === null;
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  // "Mikrofon denoise" (menu): the voice engine captures the mic with or without the phone's noise suppression.
  useEffect(() => setNoiseSuppression(settings.micDenoise), [settings.micDenoise]);
  // "Oda sesini kapat" / "Konuşma sesi" (Ses ayarları): how loud the others play on this phone.
  useEffect(() => setPlaybackVolume(settings.roomMuted ? 0 : settings.voiceVolume), [settings.roomMuted, settings.voiceVolume]);
  // My own room keeps its layout across app restarts (saved with the room settings).
  const stageLayoutId = stage?.layoutId ?? null;
  useEffect(() => {
    if (isOwn && stageLayoutId !== myRoom.layoutId) updateMyRoom({ layoutId: stageLayoutId });
  }, [isOwn, stageLayoutId, myRoom.layoutId, updateMyRoom]);
  // A server room's level, mics and layout live on the server: read once on entry and again whenever the server
  // says they changed (the owner or an admin picked a layout, a gift raised the level), so every phone matches.
  useEffect(() => {
    if (!real) return;
    const sync = () => {
      api.roomEvents(id).then((list) => setServerEvents(list), () => {});
      return syncServerStage(id)
        .then(() => setRoomEdits((n) => n + 1))
        .catch(() => {});
    };
    sync();
    // A lost packet can't leave a phone behind for long: read again every minute too.
    const every = setInterval(sync, 60_000);
    const off = onServerRoom(id, sync);
    return () => (clearInterval(every), off());
  }, [id, real]);
  // The voice room's metadata (the server writes it on every change; it arrives the moment it changes and on
  // joining) also carries the layout and mic count: every phone switches at once, without reading the room.
  const metaLayout = liveState?.layoutId ?? null;
  const metaMics = liveState?.micCount ?? null;
  useEffect(() => {
    if (!real || !liveState) return;
    applyServerStage(id, { layoutId: metaLayout, classicCapacity: Math.min(metaMics ?? maxMics, maxMics) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, real, !!liveState, metaLayout, metaMics, maxMics]);
  const seats = live.seats;
  const mutedUsers = useMemo(() => new Set(live.micMuted), [live.micMuted]);
  // People who can't be in the room right now (running kick ban or blacklist); expired bans don't count.
  const kicked = new Set(activeBans(live));
  // The mic is the session's (lib/room-session): what the user asked for, and whether audio really goes out.
  const sessionNow = useRoomSession().session;
  const session = sessionNow?.roomId === id ? sessionNow : null;
  const micOn = session?.micWant ?? false;
  const setMicOn = (v: boolean | ((m: boolean) => boolean)) => setMicWant(typeof v === 'function' ? v(getSession().session?.micWant ?? false) : v);
  const sending = micSending(session);
  const block = micOn ? micBlock(session) : null;
  // Mutes from the server (lib/sanctions): a server room only; the voice token already enforces them.
  const textStopped = useStopped('room_text', id);
  const voiceStopped = useStopped('room_voice', id);
  const chatMuted = real ? textStopped : null;
  const voiceMuted = real ? voiceStopped : null;
  const sanctionMic = session?.sanctionMuted ?? false;
  const sanctionChat = session?.sanctionChat ?? false;
  // The connection's own word counts too, before the list has loaded.
  const chatBlocked = !!chatMuted || (real && sanctionChat);
  // Ask the server again when the room opens and whenever it changes what this connection may do.
  useEffect(() => {
    if (real) void refreshSanctions().catch(() => {});
  }, [real, id, sanctionMic, sanctionChat]);
  // A voice mute turns my mic off on this phone too, not only through the voice server's permission.
  useEffect(() => {
    if (voiceMuted && getSession().session?.micWant) setMicWant(false);
  }, [voiceMuted]);
  // Visual-only work (talk indicators, seat reactions, effects) runs only while the room is on screen.
  const visible = full && session?.appState !== 'background';
  // Read by the room's timers, which outlive a single render.
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  // Room camera. Only on a video seat of the layout: on when I take one, off when I leave it or a one-to-one
  // call takes the devices; I can still switch it off from my own seat's menu.
  const [camOn, setCamOn] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxUnread = useInboxUnread();
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  // Entry effects on screen: mine when I join, then other people's (one at a time).
  const [entry, setEntry] = useState<EntryShow | null>(() => (invisible || !entryOn || !entryInfo ? null : entryInfo.show));
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 'w', system: true, text: 'Odaya hoş geldin! Saygılı ol, iyi eğlenceler.' },
    ...(announcement ? [{ id: 'ann', system: true, text: `📢 ${announcement}` }] : []),
    ...(botOn ? [{ id: 'bot0', bot: true, text: `Merhaba ${ME.name}! ${BOT_TIPS[0]}` }] : []),
    ...(entryInfo && !invisible ? [{ id: 'vip', system: true, text: entryInfo.text }] : []),
    ...(joinedInCall ? [{ id: 'incall', system: true, text: '📞 Bire bir görüşmedesin; odaya dinleyici olarak katıldın. Görüşme bitince mikrofon isteyebilirsin.' }] : []),
    // Arrived by following someone from a profile / agency / tribe chat.
    ...(via && !invisible ? [{ id: 'via', system: true, text: `👣 ${ME.name}, ${userById(via).name} kişisini takip ederek odaya girdi` }] : []),
    ...(invisible ? [{ id: 'inv', system: true, text: '👻 Gizli girişle girdin. Diğer kullanıcılar katıldığını görmez; moderasyon kayıtlarında görünürsün.' }] : []),
  ]);
  const [draft, setDraft] = useState('');
  // Why the line in the input did not go out (contact details, lib/contact-filter); cleared when it is edited.
  const [chatRefused, setChatRefused] = useState<string | null>(null);
  const editDraft = (next: string | ((d: string) => string)) => {
    setDraft(next);
    setChatRefused(null);
  };
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Typing in the room chat: the keyboard is up for this field (not for a sheet's field over the room). The
  // window does not shrink on edge-to-edge Android, so the stage folds away and the chat takes its place;
  // otherwise the seats keep their height and the chat is squeezed down to its tabs.
  const [inputFocused, setInputFocused] = useState(false);
  const typing = useKeyboardOpen() && inputFocused;
  // Seat emoji reactions currently playing, by user id.
  const [reactions, setReactions] = useState<Record<string, SeatReactionData>>({});
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const [giftFx, setGiftFx] = useState<GiftShowPlay | null>(null);
  /** The big effect for a gift: who sent it to whom goes on the full-screen show's banner. */
  const playGiftFx = (gift: Gift, fromName: string, toIds: string[], count: number) =>
    setGiftFx({ key: `${Date.now()}-${gift.id}`, gift, fromName, toText: toIds.length > 1 ? `${toIds.length} kişi` : toIds[0] === 'me' ? ME.name : userById(toIds[0]).name, count });
  const [luckyFx, setLuckyFx] = useState<LuckyRecord[] | null>(null);
  // Lucky combo wheel: same gift, same people, same count, one tap per repeat (×1, ×2, ×3 …).
  const [combo, setCombo] = useState<{ giftId: string; to: string[]; each: number; count: number; key: number } | null>(null);
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
  // The person card (components/room/person-card): someone tapped on a mic, on the balcony list or in the chat.
  // `manage`: room staff's actions on them (the seat menu), when there are any.
  const [person, setPerson] = useState<{ uid: string; note?: string; manage?: () => void } | null>(null);
  const openPerson = useCallback((uid: string) => {
    if (uid !== 'me') setPerson({ uid });
  }, [setPerson]);
  const [moving, setMoving] = useState<string | null>(null);
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[] } | null>(null);
  const [msgFilter, setMsgFilter] = useState({ joins: true, gifts: true, bot: true });
  const [panel, setPanel] = useState<null | 'menu' | 'msgSettings' | 'info' | 'settings' | 'music' | 'envelope' | 'bag' | 'dice' | 'contrib' | 'requests' | 'poll' | 'goal' | 'events' | 'qa' | 'effects' | 'mod' | 'invite' | 'results' | 'session'>(null);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [events, setEvents] = useState<RoomEvent[]>(() =>
    roomType === 'event' ? [{ id: 'ev0', title: 'Doğruluk mu Cesaret mi', desc: 'Haftalık oyun gecesi', when: 'Bugün 22:00', type: 'Oyun', by: hostId, going: false, reminder: false, attendees: 37, cancelled: false }] : [],
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const loadEvents = () => {
    if (real) api.roomEvents(id).then((list) => setServerEvents(list), () => {});
  };
  const shownEvents: RoomEvent[] = real
    ? (serverEvents ?? []).map((e) => ({ id: String(e.id), title: e.title, desc: e.desc, when: e.when, type: e.type, by: toLocal(e.by.id), going: e.going, reminder: reminders.includes(e.id), attendees: e.attendees, cancelled: e.cancelled }))
    : events;
  const [modLog, setModLog] = useState<ModLog[]>([]);
  const [slowMode, setSlowMode] = useState(false);
  const [words, setWords] = useState<string[]>(['spam', 'reklam']);
  const [bans, setBans] = useState<{ userId: string; until: string }[]>([]);
  // Friends I sent the room to during this visit (Paylaş).
  const [sharedTo, setSharedTo] = useState<Set<string>>(() => new Set());
  const [localQueuePos, setMyQueuePos] = useState<number | null>(null);
  // A server room: my place in its mic queue as the server keeps it (null = not waiting).
  const myQueuePos = real ? (serverQueue.includes('me') ? serverQueue.indexOf('me') : null) : localQueuePos;
  const [giftResults, setGiftResults] = useState<{ rows: { userId: string; ok: boolean }[]; reason: string | null }>({ rows: [], reason: null });
  const [musicRequests, setMusicRequests] = useState<{ track: Track; by: string }[]>([]);
  // PK (lib/pk is the PK server: clock, score and result live there). While the connection is down the
  // room keeps showing the last PK state it received, like the presence data.
  const pkStore = useLatched(usePk(), offline);
  const pk = pkStore.sessions.find((x) => ['invite', 'prep', 'active'].includes(x.status) && (x.roomId === id || x.opponentRoomId === id)) ?? null;
  const lastPk = pkStore.sessions.find((x) => x.roomId === id || x.opponentRoomId === id);
  const [pkSetup, setPkSetup] = useState(false);
  // Something opened from the room menu (a panel, a game, a list) goes back to the menu when it is closed
  // (back, X or a tap outside), not straight to the room. The same for a sheet opened from the room settings or
  // the room card, at any depth: card → settings → Moderasyon goes back to the settings, then to the card. A stack:
  // each opener pushes where to return, each close pops one; cleared once nothing is open.
  const menuReturn = useRef<('menu' | 'settings' | 'info')[]>([]);
  const backToMenu = () => {
    const to = menuReturn.current.pop();
    if (!to) return;
    setPanel(to);
  };
  const closePanel = () => (menuReturn.current.length ? backToMenu() : setPanel(null));
  useEffect(() => {
    if (panel === null && !layoutsOpen && !peopleOpen && !pkSetup && !game && !sheet) menuReturn.current = [];
  }, [panel, layoutsOpen, peopleOpen, pkSetup, game, sheet]);
  // A menu, card or settings item that opens another screen (Günlük görev, Hemen Tanış, Süsler, a profile): back on
  // the room, the sheet it was opened from opens again (kept when the room leaves the screen, used when it returns).
  const [reopenOnReturn, setReopenOnReturn] = useState<null | 'menu' | 'settings' | 'info'>(null);
  const teamPk = pk?.kind === 'room' && pk.mode === 'team' && pk.status !== 'invite' ? pk : null;
  const teamColorOf = (uid: string | null) => (uid && teamPk ? teamOf(teamPk, uid)?.color : undefined);
  /**
   * PK points under a seat, only for people in the PK: team members in Takım PK, everyone on a mic in Normal /
   * cross PK. A server room's Normal PK scores only the people it started with (server/api/pk.mjs), so a mic taken
   * after the start shows no count instead of a 0 that never moves.
   */
  const pkPointsOf = (uid: string | null) => {
    if (!uid || !pk || pk.status === 'invite') return undefined;
    if (teamPk) return teamOf(teamPk, uid) ? pkPointsFor(pk, id, uid) : undefined;
    if (real && pk.kind === 'room' && pk.mode === 'solo' && !pk.participants.includes(uid)) return undefined;
    return pkPointsFor(pk, id, uid);
  };
  // Profiles opened from the PK end screens: the room minimizes while away and shows them again on return.
  const openProfileFromPk = (uid: string) => router.push(`/kullanici/${uid}`);
  // Gifts score in a PK only through the PK server, once per transaction id. In a server room the server scored
  // the gift when it was paid (server/api/pk.mjs): read the new score.
  const scorePk = (txId: string, senderId: string, recipientId: string, giftId: string, coins: number) => {
    if (real) {
      if (pk) refreshRoomPkSoon(id);
      return null;
    }
    const r = recordGift(id, txId, senderId, recipientId, giftId, coins);
    if (!r.ok && !r.duplicate && pk?.status === 'active' && r.reason.includes('aktif değil')) reportMismatch(txId, 'Hediye alındı ama PK puanı yazılamadı');
    return r;
  };
  // Boss-seat rooms start with an existing top gifter so the seat can be competed for.
  const [contrib, setContrib] = useState<Record<string, number>>(() => {
    if (isOwn || real || !base!.bossSeat) return {};
    const rival = USERS.find((u) => u.id !== hostId && !base!.seatUserIds.includes(u.id));
    return rival ? { [rival.id]: 1_250 } : {};
  });
  const [bossRemoved, setBossRemoved] = useState<Set<string>>(new Set());
  const [membership, setMembership] = useState<'owner' | 'none' | 'pending' | 'member'>(isOwn ? 'owner' : 'none');
  const [memberApps, setMemberApps] = useState<string[]>(() => (isOwn ? ['u2', 'u9', 'u11'] : []));
  // A server room's members (server/api/rooms.mjs): read when the room opens and again after each change.
  const [serverMembers, setServerMembers] = useState<{ ids: string[]; total: number; canManage: boolean } | null>(null);
  // The room owner's family (their profile: server/api families.mjs familyOf), read when the room card opens.
  const [ownerFamily, setOwnerFamily] = useState<{ id: string; name: string } | null>(null);
  const hostServerId = real ? toServer(hostId) : null;
  const infoOpen = panel === 'info';
  useEffect(() => {
    if (!infoOpen || !hostServerId) return;
    let on = true;
    api.userProfile(hostServerId).then(
      (p) => on && setOwnerFamily(p.family ? { id: p.family.id, name: p.family.name } : null),
      () => undefined,
    );
    return () => {
      on = false;
    };
  }, [infoOpen, hostServerId]);
  const loadMembers = useCallback(() => {
    if (!real) return;
    api.roomMembers(id).then(
      (r) => {
        r.members.forEach((m) => rememberUser(m));
        r.pending.forEach((m) => rememberUser(m));
        setServerMembers({ ids: r.members.map((m) => toLocal(m.id)), total: r.total, canManage: r.canManage });
        setMemberApps(r.pending.map((m) => toLocal(m.id)));
        setMembership(r.mine === 'owner' ? 'owner' : r.mine === 'member' ? 'member' : r.mine === 'pending' ? 'pending' : 'none');
      },
      () => {},
    );
  }, [real, id]);
  useEffect(() => loadMembers(), [loadMembers]);
  const [minutes, setMinutes] = useState(0);
  const [giftLog, setGiftLog] = useState<GiftLogRow[]>([]);
  const [requests, setRequests] = useState<string[]>([]);
  const [envelope, setEnvelope] = useState<{ from: string; amount: number; count: number; seconds: number } | null>(null);
  const [dicePlays, setDicePlays] = useState(DAILY_DICE);
  // Room music on this phone: on/off and how loud (a server room plays its music here, components/room/room-music).
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.65);
  const [music, setMusic] = useState<MusicState>(() => {
    const t = MUSIC_CATALOG.find((m) => m.id === base?.track);
    return { queue: t ? [t, ...MUSIC_CATALOG.filter((m) => m.id !== t.id).slice(0, 2)] : [], playing: !!t, position: 0 };
  });
  const xpRef = useRef(myRoom.xp);

  const allSeats = pad(seats, capacity);
  const ranking = Object.entries(contrib).sort((a, b) => b[1] - a[1]);
  const topGifter = ranking.find(([uid]) => !bossRemoved.has(uid) && !kicked.has(uid));
  // A server room: the server names the holder (its top gifter of the last 24 hours), so every phone shows the same.
  const bossId = real ? (bossOn && base!.bossId ? toLocal(base!.bossId) : null) : bossOn && topGifter && topGifter[1] >= BOSS_SEAT_MIN_COINS ? topGifter[0] : null;
  // The boss seat is a speaking seat: the presence server counts its holder as on a mic (PK, lists, counts).
  useEffect(() => setBoss(id, bossId), [id, bossId]);
  const mySeat = allSeats.indexOf('me');
  const amSeated = mySeat >= 0 || bossId === 'me';
  const seatedOthers = allSeats.filter((s): s is string => !!s && s !== 'me');
  // "%82 benzer" for everyone else on a mic: the bead ring around their seat and the seat menu title
  // (a handful of small set lookups, cheap enough to redo each render). Not in a server room: the server keeps
  // no interests, so everyone would get about the same score.
  const simScores = new Map(real ? [] : seatedOthers.map((u) => [u, similarity(app.me, userById(u)).score]));

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
      endRoom('denied');
      return;
    }
    reportRoomState(id, { joined: true });
    // Own room: the host takes mic 1 with the mic on, except after a restart (the mic always starts off then).
    if (hostId === 'me' && !joinedInCall && !getRoom(id)?.seats[0]) {
      takeSeat(id, 'me', 0);
      if (!getSession().session?.recovered) setMicWant(true);
    }
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
  // Server room: mics a room voice mute switched off, as the server lists them for the owner and admins.
  const voiceMuteKey = real ? [...staff.voiceMutes.keys()].sort().join(',') : '';
  const memberKey = real ? live.members.join(',') : '';
  useEffect(() => {
    if (!real) return;
    const here = new Set(memberKey.split(','));
    setMutedList(id, voiceMuteKey ? voiceMuteKey.split(',').filter((uid) => here.has(uid)) : []);
  }, [real, id, voiceMuteKey, memberKey]);
  // Server room, owner and admins: who is kept out follows the server's list (a lifted ban lets them show again).
  const serverBans = real ? staff.bans : null;
  useEffect(() => {
    if (serverBans) setServerBans(id, serverBans);
  }, [id, serverBans]);
  useEffect(() => resizeSeats(id, capacity), [id, capacity]);
  const blacklistKey = isOwn ? myRoom.blacklist.join(',') : '';
  useEffect(() => {
    if (isOwn) setBlacklist(id, blacklistKey ? blacklistKey.split(',') : []);
  }, [id, isOwn, blacklistKey]);
  // A call takes the devices: get off the mic (the presence server is updated after this render).
  useEffect(() => {
    if (!callActive) return;
    const t = setTimeout(() => {
      leaveSeat(id, 'me');
      setMicWant(false);
    }, 0);
    return () => clearTimeout(t);
  }, [callActive, id]);
  // The session learns what only the room knows: am I on a mic, muted by the room, in a call.
  const modMuted = live.micMuted.includes('me');
  useEffect(() => {
    reportRoomState(id, { seated: amSeated, modMuted, inAppCall: callActive });
  }, [id, amSeated, modMuted, callActive]);
  // Removed from the room by its managers (the presence server dropped me): the session ends, it says why.
  const joined = !!session?.joined;
  const inRoom = live.members.includes('me');
  useEffect(() => {
    if (joined && !inRoom && !offline) endRoom('kicked');
  }, [joined, inRoom, offline]);
  // Derived transition when a call starts or ends: I stay in the room, but the call owns mic and camera.
  const [sawCall, setSawCall] = useState(callActive);
  if (callActive !== sawCall) {
    setSawCall(callActive);
    if (callActive) {
      const wasSeated = amSeated;
      const hadCam = camOn;
      if (bossId === 'me') setBossRemoved((b) => new Set(b).add('me'));
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
  const cameraAllowed = async () => {
    if (Platform.OS === 'web') return true;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) showAlert('Kamera izni gerekli', 'Video odasında görüntünü paylaşmak için cihaz ayarlarından kamera izni ver.');
    return perm.granted;
  };
  const toggleCam = async () => {
    if (devicesBusy()) return;
    if (!camOn && !(await cameraAllowed())) return;
    setCamOn((c) => !c);
    addMsg({ system: true, text: camOn ? `${ME.name} kamerasını kapattı` : `📹 ${ME.name} kamerasını açtı` });
  };
  // A video seat (görüntülü yuva) of the active layout turns the camera on; leaving it, or a layout without
  // that slot, switches the camera off in the same render.
  const camAllowed = mySeat >= 0 && layout?.layoutSchema.slots.find((x) => x.index === mySeat)?.kind === 'video';
  const [sawCamAllowed, setSawCamAllowed] = useState(camAllowed);
  if (camAllowed !== sawCamAllowed) {
    setSawCamAllowed(camAllowed);
    if (!camAllowed) setCamOn(false);
  }
  const seatedKey = [...seatedOthers, bossId && bossId !== 'me' ? bossId : ''].join(',');
  // Balkon: people in the room who are not on a mic (from the presence model, never a separate list).
  const audience = useMemo(() => view.balconyIds.filter((u) => u !== 'me' && !blocked.has(u)).map(userById), [view.balconyIds, blocked]);
  // A server room: everyone's shop look (frame, bubble, mic effect, entry) from the server, for the people shown.
  const lookIds = real ? [...seatedOthers, ...audience.map((u) => u.id), ...(bossId && bossId !== 'me' ? [bossId] : [])].map((u) => toServer(u) ?? '').filter(Boolean) : [];
  const looksVersion = useLooks(lookIds, real);
  const lookFor = (uid: string): Look | undefined => (real && uid !== 'me' ? lookOf(toServer(uid)) : undefined);

  const gameEntry = { from: 'room' as const, roomId: id, roomTitle: title };
  // Table seats: me, people on the mics, then listeners (the game's own lobby, separate from room seats).
  const gamePlayers = [{ id: 'me', name: ME.name, avatar: app.me.avatar }, ...[...seatedOthers.map(userById), ...audience].slice(0, 5)];
  // A server room: the owner, its admins and its DJs play (the server checks it); the demo keeps the functions rule.
  const canControlMusic = real ? myRole !== 'member' || djIds.includes('me') : canFunctions;
  // A server room's music, as the room metadata has it, played on this phone at the room's clock.
  const liveMusic = real ? (liveState?.music ?? null) : null;
  const nowMusic = useRoomMusicPlayer(liveMusic, real && musicEnabled, musicVolume);
  const shownMusic: MusicState = real
    ? {
        queue: nowMusic && liveMusic ? liveMusic.tracks.slice(nowMusic.index).map((t) => ({ id: t.key, title: t.title, artist: t.byName || 'Oda müziği', seconds: t.seconds })) : [],
        playing: !!nowMusic && !nowMusic.paused,
        position: nowMusic?.position ?? 0,
      }
    : music;

  // The room's forbidden words become *** (a server room's own list, the same on every phone; the server keeps only
  // letters, digits and spaces in it, so a word is safe in a pattern).
  // (Kept as plain values: the rules object itself must not travel into the voice hooks below.)
  const liveWords = real ? (base!.wordsText ?? '') : null;
  const liveSlow = real && !!liveRules?.slowMode;
  // The room's staff as plain text, for the voice handlers (slow mode never holds back the owner or admins).
  const staffIdsKey = [hostId, ...superIds, ...adminIds].join('\n');
  // @bahset: the names of the people in the room and mine, so a mention of one of them is no @handle to the contact
  // filter (lib/room-mention stripMentions), on the way out and on the way in. Any other "@word" is still refused.
  const roomNamesKey = [...new Set([...view.micIds, ...view.balconyIds])]
    .filter((u) => u !== 'me')
    .map((u) => userById(u).name)
    .concat(app.me.name)
    .join('\n');
  const mask = (text: string) => (liveWords !== null ? (liveWords ? liveWords.split('\n') : []) : words).reduce((t, w) => t.replace(new RegExp(w, 'gi'), '***'), text);
  // Room events arrive once by id (lib/chat-feed). While the connection is down they wait in a buffer and
  // are merged, in time order and without duplicates, when it comes back.
  const offlineFeed = useRef<FeedMsg[]>([]);
  const addMsg = (msg: Omit<ChatMsg, 'id'> & { id?: string }) => {
    const m: ChatMsg = { ...msg, text: msg.userId ? mask(msg.text) : msg.text, id: msg.id ?? msgId(), at: stamp() };
    if (!isOnline()) offlineFeed.current.push(m);
    else setMessages((list) => mergeFeed(list, [m]));
  };
  // A room note after a server call went through (so online), straight into the feed.
  const sysNote = (text: string) => setMessages((list) => mergeFeed(list, [{ system: true, text, id: msgId(), at: stamp() }]));
  // Room staff's timed mutes (server room only); the note shows on my screen.
  const roomMute = useRoomMute(id, myRole === 'owner', (text) => {
    addMsg({ system: true, text });
    staff.reload();
  });
  // Server room: people, mics, talking rings, chat lines and gifts come from the other phones (lib/live/room).
  // Server room: who switched their own mic off, from the voice connection (drawn like my own mic-off badge).
  const peersMicOff = useLiveRoomSync(id, real && unlocked, mySeat >= 0 ? mySeat : null, {
    onJoin: (uid, name) => {
      addMsg({ system: true, text: `${name} odaya girdi` });
      // Their entry effect and ride (their shop look from the server), once it is read.
      const sid = toServer(uid);
      if (!entryOn || !sid) return;
      void loadLooks([sid]).then(() => {
        const show = entryShowOf(lookOf(sid), name, userById(uid).avatar);
        if (!show) return;
        if (entry) setEntryQueue((q) => [...q, show].slice(-3));
        else setEntry(show);
      });
    },
    onLeave: (_uid, name) => addMsg({ system: true, text: `${name} odadan ayrıldı` }),
    setSpeaking: (ids) => setSpeaking((prev) => (prev.size === ids.size && [...ids].every((u) => prev.has(u)) ? prev : ids)),
    onSignal: (from, msg: RoomSignal) => {
      if (blocked.has(from)) return;
      // Room chat goes phone to phone and the server never reads it, so a line with contact details from an older
      // or modified app is dropped here. Not counted: the refusal would be mine, and I only received it.
      if (msg.t === 'chat') {
        if (!checkText(stripMentions(msg.text, roomNamesKey.split('\n'))).ok) return;
        // Slow mode: a line from someone who isn't staff, sooner than the room allows after their last one, is dropped.
        if (liveSlow && !staffIdsKey.split('\n').includes(from)) {
          if (nowMs() - (lastLineFrom.current.get(from) ?? 0) < SLOW_MS - 1_500) return;
          lastLineFrom.current.set(from, nowMs());
        }
        return addMsg({ userId: from, text: mask(msg.text) });
      }
      // An emoji over their seat: only one from this phone's own emoji and sticker lists (never free text).
      if (msg.t === 'react') return seatEmojiOk(msg.emoji) ? react(from, msg.emoji) : undefined;
      // Another phone's Hareketli: only a free one (a paid one comes from the server as 'fx').
      if (msg.t === 'anim') {
        if (animById(msg.animationId)?.is_free && freeAnimOk(from)) playRoomAnim(id, from, msg.animationId, `p:${from}:${msgId()}`);
        return;
      }
      if (msg.t === 'fx') {
        const a = animById(msg.animationId);
        if (a && playRoomAnim(id, from, msg.animationId, `fx:${msg.eventId}`)) addMsg({ id: `fx:${msg.eventId}`, system: true, kind: 'gift', text: `✨ ${userById(from).name} ${a.name} efekt hediyesi gönderdi` });
        return;
      }
      // Soru-cevap: anyone's question (never with contact details), a pick only from the room's staff.
      if (msg.t === 'q') {
        if (!checkText(stripMentions(msg.text, roomNamesKey.split('\n'))).ok) return;
        return setQuestions((l) => (l.some((x) => x.id === msg.id) ? l : [...l.slice(-49), { id: msg.id, userId: from, text: msg.text, picked: false }]));
      }
      if (msg.t === 'qpick') {
        if (!staffIdsKey.split('\n').includes(from)) return;
        const q = questions.find((x) => x.id === msg.id);
        setQuestions((l) => l.map((x) => (x.id === msg.id ? { ...x, picked: true } : x)));
        if (q) addMsg({ id: `qpick:${msg.id}`, system: true, text: `🎤 Seçilen soru (${userById(q.userId).name}): ${q.text}` });
        return;
      }
      const to = msg.to.map((t) => (t === myServerId() ? 'me' : t));
      if (msg.t === 'lucky') return showLuckyFrom(from, to, msg);
      const gift = GIFTS.find((g) => g.id === msg.giftId);
      if (gift) showGift(from, to, gift, msg.count);
    },
    onServerSeat: (seat) => addMsg({ system: true, text: seat === null ? 'Oda yönetimi seni mikrofondan indirdi' : `Oda yönetimi seni ${seat + 1}. mikrofona taşıdı` }),
  });
  // Oda içi PK in a server room: the server's PK, read into lib/pk (start, cancel, score and result are its).
  useRoomPkSync(id, real && unlocked, pk);
  // Şanslı çanta in a server room (lib/live/lucky-bags): the room's open bags; a new one gets a line in the chat.
  // A bag dropped while I'm in the room (not one that was already there) also gets its show (LuckyBagRain).
  const [bagRain, setBagRain] = useState<Bag | null>(null);
  const bags = useRoomBags(id, real && unlocked, (b, fresh) => {
    if (b.mine || blocked.has(b.from.id)) return;
    sysNote(`🧧 ${b.from.name} Şanslı çanta attı: ${bagWhat(b)} · ${b.packets} pay`);
    if (fresh) setBagRain(b);
  });
  const [bagOpen, setBagOpen] = useState<Bag | null>(null);
  // Bağlar in the room: Lv4 mic line, Lv8 joint entrance, Lv10 chat bubble (components/room/room-bonds).
  const roomBondsNow = useRoomBonds(live.members, real);
  const roomBonds = roomBondsNow ?? NO_BONDS;
  const [entryQueue, setEntryQueue] = useState<EntryShow[]>([]);
  const [joint, setJoint] = useState<{ list: RoomBond[] | null; state: JointState | null }>({ list: null, state: null });
  if (roomBondsNow && joint.list !== roomBondsNow) {
    // Derived transition: a new answer about the room's bonds; announce pairs that just came in together.
    const r = jointEntries(roomBondsNow, new Set(live.members), joint.state);
    setJoint({ list: roomBondsNow, state: r.state });
    const shows = invisible || !entryOn ? [] : r.show.filter((b) => !blocked.has(b.a) && !blocked.has(b.b)).map((b) => jointShowOf(b, app.me.avatar));
    if (shows.length) {
      if (entry) setEntryQueue((q) => [...q, ...shows].slice(-3));
      else {
        setEntry(shows[0]);
        if (shows.length > 1) setEntryQueue((q) => [...q, ...shows.slice(1)].slice(-3));
      }
    }
  }
  const nextEntry = () => {
    setEntry(entryQueue[0] ?? null);
    setEntryQueue((q) => q.slice(1));
  };  // Taking a video seat turns the camera on (after the permission prompt on phones).
  useEffect(() => {
    if (!camAllowed || getMedia().call) return;
    let live = true;
    (Platform.OS === 'web' ? Promise.resolve(true) : ImagePicker.requestCameraPermissionsAsync().then((p) => p.granted)).then((ok) => {
      if (!live) return;
      if (!ok) return addMsg({ system: true, text: '📹 Kamera izni verilmedi; koltukta sesli devam ediyorsun.' });
      setCamOn(true);
      addMsg({ system: true, text: `📹 Video koltuğuna çıktın, ${ME.name} kamerasını açtı` });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camAllowed]);
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
  const logMod = (action: string, target: string, reason = '') =>
    setModLog((l) => [{ id: msgId(), time: new Date().toTimeString().slice(0, 5), actor: `${rankLabel('me').replace('Oda sahibi', 'Sahip')} (sen)`, action, target, reason }, ...l]);
  // Mode / layout ("Yayına Katılma Modu"): only the stage server decides; its refusal goes back to the sheet as is.
  const pickLayout = (layoutId: string | null) => {
    const changed = (stage?.layoutId ?? null) !== layoutId;
    const r = changeLayout(id, 'me', layoutId);
    if (!r.ok) {
      errorHaptic();
      return r;
    }
    if (changed) {
      // A server room: the server keeps the layout and tells the other phones; a refusal puts its layout back.
      if (real)
        updateServerRoom(id, { layoutId })
          .catch((e) => {
            showAlert(refusalTitle(e, 'Düzen kaydedilemedi'), errorText(e));
            return syncServerStage(id);
          })
          .catch(() => {});
      const l = layoutById(layoutId);
      const name = l ? `${modeById(l.modeId).name} · ${l.name}` : `Klasik düzen · ${classicCapacity} mikrofon`;
      logMod('Oda düzenini değiştirdi', name);
      addMsg({ system: true, text: `🎛️ Oda düzeni değişti: ${name}` });
      successHaptic();
    }
    return r;
  };
  const layoutSheet = (open: boolean, onClose: () => void) => (
    <LayoutPickerSheet
      visible={open}
      onClose={onClose}
      layoutId={stage?.layoutId ?? null}
      modeId={stage?.modeId ?? null}
      info={stageInfo}
      classicLabel={`Klasik düzen · ${classicCapacity} mikrofon`}
      onPick={pickLayout}
    />
  );
  const setClassicMics = (n: number) => {
    const r = setClassicCapacity(id, 'me', n);
    if (!r.ok) return r;
    // A server room: the server keeps the count and tells the other phones; a refusal puts its count back.
    if (real)
      updateServerRoom(id, { micCount: n })
        .catch((e) => {
          showAlert(refusalTitle(e, 'Mikrofon sayısı kaydedilemedi'), errorText(e));
          return syncServerStage(id);
        })
        .catch(() => {});
    else updateMyRoom({ micCount: n, lockedSeats: myRoom.lockedSeats.filter((i) => i < n) });
    return r;
  };
  // A server room I run (owner or admin): the lock (owner only) and the mic queue are set there; the password
  // is checked when someone asks to join, the queue reaches every phone with the room metadata.
  const liveSettings = real && myRank >= 1
    ? {
        locked: isLockedRoom(id),
        canLock: myRank === 3,
        micQueue,
        setMicQueue: (on: boolean) => {
          if (offlineBlocked()) return;
          updateServerRoom(id, { micQueue: on }).then(
            () => {
              setRoomEdits((n) => n + 1);
              sysNote(on ? '✋ Mikrofon kuyruğu açıldı: boş mikrofon için el kaldır' : 'Mikrofon kuyruğu kapandı');
              logMod(on ? 'Mikrofon kuyruğunu açtı' : 'Mikrofon kuyruğunu kapattı', 'Oda');
            },
            (e: unknown) => showAlert(refusalTitle(e, 'Kaydedilemedi'), errorText(e)),
          );
        },
        ...(myRank === 3 && { theme, setTheme: (t: RoomTheme) => saveLook({ theme: t }, 'Oda temasını değiştirdi') }),
        owner: myRank === 3,
        unban: (uid: string) => {
          const user = toServer(uid);
          if (!user || offlineBlocked()) return;
          staffAction('Yasak kaldırılamadı', () => roomUnban(id, user), () => {
            staff.reload();
            logMod('Kara listeden çıkardı', userById(uid).name);
          });
        },
        setPassword: (password: string | null) =>
          updateServerRoom(id, { password }).then(
            () => {
              setRoomEdits((n) => n + 1);
              successHaptic();
              showAlert(password ? 'Oda kilitlendi' : 'Kilit kaldırıldı', password ? 'Yeni girenler odaya şifreyle girer. Odadakiler kalır.' : 'Oda artık herkese açık.');
            },
            (e: unknown) => {
              errorHaptic();
              showAlert(refusalTitle(e, 'Kaydedilemedi'), errorText(e));
              throw e;
            },
          ),
      }
    : undefined;
  // A server room's look (cover, theme, gift effects): saved on the server, which tells every phone in the room.
  function saveLook(patch: api.RoomPatch, what: string) {
    if (offlineBlocked()) return;
    updateServerRoom(id, patch).then(
      () => {
        setRoomEdits((n) => n + 1);
        logMod(what, 'Oda');
      },
      (e: unknown) => showAlert(refusalTitle(e, 'Kaydedilemedi'), errorText(e)),
    );
  }
  // Oda ayarları in a server room: the settings screen's changes go to the server as rules (or the room type).
  function saveRules(p: Partial<MyRoom>) {
    const rules: Partial<api.RoomRules> = {};
    if (p.micPermission !== undefined) rules.micPermission = p.micPermission;
    if (p.bossSeat !== undefined) rules.bossSeat = p.bossSeat;
    if (p.joinMode !== undefined) rules.joinMode = p.joinMode;
    if (p.manageMembers !== undefined) rules.manageMembers = p.manageMembers;
    if (p.manageFunctions !== undefined) rules.manageFunctions = p.manageFunctions;
    if (p.autoRemoveDays !== undefined) rules.autoRemoveDays = p.autoRemoveDays;
    if (p.limit !== undefined) rules.limit = p.limit;
    if (p.profileVisible !== undefined) rules.profileVisible = p.profileVisible;
    if (p.videoPrivacy !== undefined) rules.videoPrivacy = p.videoPrivacy;
    const patch: api.RoomPatch = { ...(Object.keys(rules).length > 0 && { rules }), ...(p.roomType !== undefined && { roomType: p.roomType }) };
    if (Object.keys(patch).length) saveLook(patch, 'Oda ayarını değiştirdi');
  }
  const addContrib = (uid: string, n: number) => setContrib((c) => ({ ...c, [uid]: (c[uid] ?? 0) + n }));
  const logGift = (from: string, to: string, gift: Gift, count: number) =>
    setGiftLog((l) => [{ id: msgId(), from, to, emoji: gift.emoji, name: gift.name, count, coins: gift.price * count, time: clock(), giftId: gift.id }, ...l].slice(0, 100));

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
      addMsg({ system: true, text: `${bossId === 'me' ? ME.name : userById(bossId).name} dümen koltuğuna oturdu!` });
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
    if (real) return void sendLiveAnim(animationId);
    const a = getAnimations().catalog.find((x) => x.animation_id === animationId);
    // Live mode: a sample room's people are not real, and real coins never go to it.
    if (liveMode() && a && !a.is_free) return showAlert('Gönderilemedi', 'Bu örnek odada ücretli animasyon gönderilemez. Gerçek odalarda gönderebilirsin.');
    // Only the id goes to the "server"; price, licence and activity are read from the catalog there.
    const r = sendAnimation(animationId, id, 'me', newAnimRequestId(), { spend: spendCoins, refund: addCoins });
    if (!r.ok) return showAlert('Gönderilemedi', r.reason);
    tapHaptic();
    setEmojiOpen(false);
    if (a && r.charged) {
      addMsg({ system: true, kind: 'gift', text: `✨ ${ME.name} ${a.name} efekt hediyesi gönderdi (🪙 ${r.charged.toLocaleString('tr-TR')})` });
      bump('giftsSent', 1);
    }
  };
  // Server room: a paid one is taken on the server at its price, and the server tells everyone in the room
  // (server/api/room-fx.mjs); this phone draws it once the server said it was paid. A free one goes from this
  // phone to the others like a chat line (lib/live/room-bus 'anim').
  const sendLiveAnim = async (animationId: string) => {
    const a = getAnimations().catalog.find((x) => x.animation_id === animationId);
    if (!a || !isLive(a)) return showAlert('Gönderilemedi', 'Bu animasyon şu an kullanılamıyor.');
    if (a.is_free) {
      const r = sendAnimation(animationId, id, 'me', newAnimRequestId(), { spend: spendCoins, refund: addCoins });
      if (!r.ok) return showAlert('Gönderilemedi', r.reason);
      sendSignal({ t: 'anim', animationId });
      tapHaptic();
      setEmojiOpen(false);
      return;
    }
    // The daily limit holds here too (the balance is the server's to check).
    const limited = spendBlock(a.coin_price);
    if (limited && limited !== 'Yetersiz bakiye.') return showAlert('Gönderilemedi', limited);
    try {
      const r = await liveRoomAnimation(id, animationId);
      playRoomAnim(id, 'me', animationId, `fx:${r.eventId}`);
      tapHaptic();
      setEmojiOpen(false);
      addMsg({ system: true, kind: 'gift', text: `✨ ${ME.name} ${a.name} efekt hediyesi gönderdi (🪙 ${r.price.toLocaleString('tr-TR')})` });
      bump('giftsSent', 1);
    } catch (e) {
      errorHaptic();
      showAlert('Gönderilemedi', errorText(e), [
        { text: 'Tamam', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
  };
  // Slow mode: when I last wrote, and when each other person's last line came (theirs too fast are dropped).
  const lastLineAt = useRef(0);
  const lastLineFrom = useRef(new Map<string, number>());
  // Another phone's free Hareketli: at most one a second from each person, so nobody can flood the room.
  const freeAnimAt = useRef(new Map<string, number>());
  const freeAnimOk = (from: string) => {
    const now = nowMs();
    if (now - (freeAnimAt.current.get(from) ?? 0) < 1000) return false;
    freeAnimAt.current.set(from, now);
    return true;
  };
  // Others' mic effects in a server room: while they talk on a mic, their effect (their shop look) plays at their seat.
  const othersMicFx = real && !settings.effectsOff && settings.micAnim && !settings.reduceMotion && visible;
  const talkingKey = real ? [...speaking].filter((u) => u !== 'me' && (seatedOthers.includes(u) || u === bossId)).sort().join(',') : '';
  useEffect(() => {
    if (!othersMicFx || !talkingKey) return;
    const play = () => {
      for (const uid of talkingKey.split(',')) {
        const fx = lookOf(toServer(uid))?.micfx;
        if (fx) playRoomAnim(id, uid, fx, `mic:${uid}:${nowMs()}`);
      }
    };
    play();
    const t = setInterval(play, 1_800);
    return () => clearInterval(t);
  }, [othersMicFx, talkingKey, id]);
  // Mic effect follows actual talking (polled by the layer; never charges, never sends anything).
  const speakingMe = useRef(false);
  useEffect(() => {
    speakingMe.current = speaking.has('me');
  }, [speaking]);

  // Seat emoji: plays over the sender's avatar, then clears itself (unless replaced by a newer one).
  const react = (uid: string, emoji: string) => {
    const key = reactionKey();
    setReactions((r) => ({ ...r, [uid]: { emoji, key } }));
    setTimeout(() => setReactions((r) => (r[uid]?.key === key ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== uid)) : r)), REACTION_MS);
  };
  // Only recipients sitting on a seat get a flight; listeners see the chat line instead.
  const flyGift = (emoji: string, count: number, toIds: string[], from: Point, giftId?: string) => {
    if (!visibleRef.current || settings.effectsOff || !settings.giftFx || settings.reduceMotion) return;
    toIds.forEach((uid, i) =>
      seatViews.get(uid)?.measureInWindow((x, y, w, h) => {
        if (!w) return;
        const key = `${Date.now()}-${uid}-${Math.random()}`;
        setFlights((f) => [...f.slice(-11), { key, emoji, count, from, to: { x: x + w / 2, y: y + h / 2 }, delay: i * 90, giftId }]);
      }),
    );
  };
  // Other people on mic send seat emoji now and then (quiet when effects are off).
  const botReactions = !real && !settings.effectsOff && visible;
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
  // Demo only: in live mode these would be made-up gifts from real people.
  const roomPkActive = pk?.kind === 'room' && pk.status === 'active' && !liveMode() ? pk.id : null;
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
      if (r?.ok) addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${from.name} → ${userById(to).name} ${g.emoji} ${g.name} · PK +${r.points}`, gift: { fromId: from.id, toIds: [to], emoji: g.emoji, name: g.name, count: 1, giftId: g.id } });
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

  // Fake "who is talking" (only drawn while the room is on screen; my ring follows audio really going out).
  useEffect(() => {
    // Server rooms: the talking rings come from the voice connection (useLiveRoomSync).
    if (!visible || real) return;
    const t = setInterval(() => {
      const next = new Set<string>();
      seatedKey.split(',').forEach((uid) => uid && !mutedUsers.has(uid) && Math.random() < 0.35 && next.add(uid));
      if (amSeated && sending && Math.random() < 0.5) next.add('me');
      // Same talkers as last tick (often nobody): keep the old Set so the whole room doesn't re-render.
      setSpeaking((prev) => (prev.size === next.size && [...next].every((u) => prev.has(u)) ? prev : next));
    }, 900);
    return () => clearInterval(t);
  }, [seatedKey, amSeated, sending, mutedUsers, visible, real]);

  // Fake chat, joins, leaves and (in other rooms) other people's gifts. Everyone involved is a real member of
  // the room's presence (read live from the server, not from this render).
  useEffect(() => {
    if (real) return;
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
        addMsg({ system: true, text: `${g.name} odaya girdi${isOwn && myRoom.joinSounds ? ' 🔔' : ''}` });
        // Some joiners own an entry effect; show it if nothing else is playing.
        if (visibleRef.current && entryOn && Math.random() < 0.4) {
          const ride = Math.random() < 0.3 ? pick(BOT_RIDES) : undefined;
          setEntry((cur) => cur ?? { name: g.name, avatar: g.avatar, fx: pick(BOT_ENTRY_FX), ride: ride?.emoji, rideArt: storeArtOf(ride?.id), badge: g.vip ? 'VIP' : undefined });
        }
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
        addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${u.name} → ${userById(hostId).name} ${g.emoji} ${g.name}`, gift: { fromId: u.id, toIds: [hostId], emoji: g.emoji, name: g.name, count: 1, giftId: g.id } });
        scorePk(tx, u.id, hostId, g.id, g.price);
        flyGift(g.emoji, 1, [hostId], { x: 36, y: win.height * 0.72 }, g.id);
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
      const tx = `BOT-${msgId()}`;
      // Now and then a fan sends a Lucky gift: I earn 20 % of its value (no owner bonus) and PK scores the same.
      const lk = Math.random() < 0.25 ? pick(getLucky().config.gifts.filter((g) => g.enabled && g.price <= 100)) : undefined;
      if (lk) {
        const earned = luckyHostDiamonds(lk.price);
        receiveDiamonds(earned, 'Hediye', from.id, { id: lk.id, name: lk.name, emoji: lk.emoji, count: 1, lucky: true });
        gainXp(lk.price);
        addContrib(from.id, lk.price);
        logGift(from.id, 'me', { id: lk.id, name: lk.name, emoji: lk.emoji, price: lk.price }, 1);
        flyGift(lk.emoji, 1, ['me'], { x: 36, y: win.height * 0.72 }, lk.id);
        addMsg({ id: `gift:${tx}`, system: true, text: `🍀 ${from.name} sana ${lk.emoji} ${lk.name} (Uğurlu) gönderdi! (+${earned} 💎 · değerin ${pct(LUCKY_RECIPIENT_SHARE)}’si)`, gift: { fromId: from.id, toIds: ['me'], emoji: lk.emoji, name: lk.name, count: 1, lucky: true, giftId: lk.id } });
        scorePk(tx, from.id, 'me', lk.id, luckyPkPoints(lk));
        return;
      }
      const gift = GIFTS.find((g) => g.price === pick(INCOMING_GIFT_POOL)) ?? GIFTS[0];
      receiveDiamonds(gift.price, 'Hediye', from.id, { id: gift.id, name: gift.name, emoji: gift.emoji, count: 1 });
      // Owner bonus is calculated separately and never reduces the streamer's earnings.
      const ownerBonus = Math.round(gift.price * RULES.roomOwnerBonus);
      if (ownerBonus > 0) receiveDiamonds(ownerBonus, 'Oda sahibi bonusu', from.id);
      gainXp(gift.price);
      addContrib(from.id, gift.price);
      logGift(from.id, 'me', gift, 1);
      flyGift(gift.emoji, 1, ['me'], { x: 36, y: win.height * 0.72 }, gift.id);
      if (gift.price >= 50 && showFx(gift.price) && visibleRef.current) playGiftFx(gift, from.name, ['me'], 1);
      addMsg({ id: `gift:${tx}`, system: true, text: `🎁 ${from.name} sana ${gift.emoji} ${gift.name} gönderdi! (+${gift.price} 💎)`, gift: { fromId: from.id, toIds: ['me'], emoji: gift.emoji, name: gift.name, count: 1, giftId: gift.id } });
      scorePk(tx, from.id, 'me', gift.id, gift.price);
    }, 6000);
    const songs = setInterval(() => {
      if (roomType !== 'music') return;
      setMusicRequests((r) => (r.length >= 3 ? r : [...r, { track: pick(MUSIC_CATALOG), by: pick(USERS).id }]));
    }, 15_000);
    return () => {
      clearInterval(gifts);
      clearInterval(songs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn]);

  // People on the Balkon want a mic now and then. Queue on: they ask, and the owner/admins approve in
  // "Konuşmacı kuyruğu". Queue off: they take a free mic themselves (one is always left for others).
  useEffect(() => {
    if (real) return;
    const t = setInterval(() => {
      const room = getRoom(id);
      if (!room || !isOnline()) return;
      const pool = deriveView(room).balconyIds.filter((m) => m !== 'me');
      if (micQueue) {
        if (!canManage) return;
        setRequests((r) => {
          if (r.length >= 4) return r;
          const free = pool.filter((x) => !r.includes(x));
          return free.length ? [...r, pick(free)] : r;
        });
        return;
      }
      const seat = freeSeat(room);
      const spare = room.seats.filter((s, i) => i > 0 && !s && !room.locked.includes(i)).length;
      if (seat < 0 || spare < 2 || !pool.length || Math.random() > 0.4) return;
      const uid = pick(pool);
      if (takeSeat(id, uid, seat).ok) addMsg({ system: true, text: `🎙️ ${userById(uid).name} ${seat + 1}. mikrofona çıktı` });
    }, 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, micQueue, canManage]);
  // Speak requests only for people still on the Balkon: whoever got a mic or left the room drops out.
  const balconyQueue = balconyOnly(requests, view);
  if (balconyQueue.length !== requests.length) setRequests(balconyQueue);
  // A server room: the people the server has in its queue, minus anyone already on a mic.
  const queue = real ? serverQueue.filter((uid) => !view.micIds.includes(uid)) : balconyQueue;

  // Poll clock + simulated votes.
  const pollOpen = !!poll && !poll.closed;
  useEffect(() => {
    if (!pollOpen || real) return;
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
  }, [pollOpen, real]);

  // Goal clock.
  const goalLive = !!goal && goal.endsIn > 0 && goal.progress < goal.target;
  useEffect(() => {
    if (!goalLive) return;
    const t = setInterval(() => setGoal((g) => (g ? { ...g, endsIn: Math.max(0, g.endsIn - 1) } : g)), 1000);
    return () => clearInterval(t);
  }, [goalLive]);

  // Q&A rooms: listeners send questions.
  useEffect(() => {
    if (roomType !== 'qa' || real) return;
    const t = setInterval(() => setQuestions((q) => (q.length > 8 ? q : [...q, { id: msgId(), userId: pick(USERS).id, text: pick(QUESTIONS), picked: false }])), 9000);
    return () => clearInterval(t);
  }, [roomType, real]);

  // Speaker queue for me in someone else's room: position moves up, then I get a mic if one is free.
  const inQueue = myQueuePos !== null;
  useEffect(() => {
    if (!inQueue || real) return;
    const t = setInterval(() => setMyQueuePos((p) => (p === null ? p : Math.max(0, p - 1))), 3000);
    return () => clearInterval(t);
  }, [inQueue, real]);
  const freeSeatIndex = allSeats.findIndex((x, i) => i > 0 && x === null && !lockedSeats.includes(i));
  // My turn came and a mic is free: the room's host approves the request and seats me (presence server).
  const queueReady = myQueuePos === 0 && freeSeatIndex > 0 && !offline;
  useEffect(() => {
    if (!queueReady || real) return;
    const t = setTimeout(() => {
      const r = seatBy(id, hostId, 'me', freeSeatIndex);
      if (!r.ok) return;
      setMyQueuePos(null);
      setMicOn(true);
      addMsg({ system: true, text: `✅ Oda yönetimi mikrofon isteğini onayladı: ${freeSeatIndex + 1}. mikrofona geçtin` });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueReady, freeSeatIndex]);

  // Other rooms: the host drops a red envelope after a while.
  useEffect(() => {
    if (isOwn || real || liveMode()) return;
    const t = setTimeout(() => setEnvelope({ from: hostId, amount: 300, count: 10, seconds: 15 }), 25_000);
    return () => clearTimeout(t);
  }, [isOwn, real, hostId]);
  const envelopeLive = !!envelope;
  useEffect(() => {
    if (!envelopeLive) return;
    const t = setInterval(() => setEnvelope((e) => (e && e.seconds > 1 ? { ...e, seconds: e.seconds - 1 } : null)), 1000);
    return () => clearInterval(t);
  }, [envelopeLive]);

  // Shared music clock.
  const musicPlaying = !real && musicEnabled && music.playing && music.queue.length > 0;
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

  // Room membership: a server room asks the server (open: at once; apply: the owner or admins answer).
  const joinRoom = () => {
    if (real) {
      if (membership !== 'none' || offlineBlocked()) return;
      return staffAction('Üye olunamadı', () => api.joinRoomMembers(id), (r) => {
        setMembership(r.status);
        addMsg({ system: true, text: r.status === 'member' ? `✅ ${title} odasının üyesi oldun` : '📝 Oda üyeliği başvurun gönderildi' });
        loadMembers();
      });
    }
    if (membership !== 'none') return;
    setMembership('pending');
    addMsg({ system: true, text: '📝 Oda üyeliği başvurun gönderildi' });
    setTimeout(() => {
      setMembership('member');
      addMsg({ system: true, text: `✅ ${title} odasının üyesi oldun` });
      notify({ kind: 'social', icon: 'home', title: 'Oda üyeliğin onaylandı', body: title, href: `/oda/${id}` });
    }, 2000);
  };

  const onBossPress = () => {
    const mine = contrib.me ?? 0;
    const top = topGifter?.[1] ?? 0;
    if (bossId && bossId !== 'me') {
      const u = userById(bossId);
      const options: SheetOption[] = [
        { label: 'Profili gör', icon: 'person-outline', onPress: () => router.push(`/kullanici/${bossId}`) },
        { label: 'Hediye gönder', icon: 'gift-outline', onPress: () => (setGiftTo(null), setGiftOpen(true)) },
        { label: `Dümene geç: ${Math.max(0, Math.max(BOSS_SEAT_MIN_COINS, top + 1) - mine).toLocaleString('tr-TR')} jeton daha gönder`, icon: 'information-circle-outline', onPress: () => showAlert('Dümen Koltuğu', bossSeatInfo(bossId, mine, top)) },
      ];
      if (myRole === 'owner')
        options.push({
          label: 'Dümen koltuğundan indir',
          icon: 'arrow-down-circle-outline',
          destructive: true,
          onPress: () => {
            setBossRemoved((s) => new Set(s).add(bossId));
            addMsg({ system: true, text: `${u.name} dümen koltuğundan indirildi` });
            logMod('Dümen koltuğundan indirdi', u.name);
          },
        });
      setSheet({ title: `Dümen · ${u.name} · 🪙 ${top.toLocaleString('tr-TR')}`, options });
      return;
    }
    showAlert('Dümen Koltuğu', bossSeatInfo(bossId, mine, top), bossId === 'me' ? undefined : [
      { text: 'Kapat', style: 'cancel' },
      { text: 'Hediye gönder', onPress: () => (setGiftTo(null), setGiftOpen(true)) },
    ]);
  };

  // --- Seat menu (opens next to the seat). Managers act only on lower roles; every action is logged. ---
  const openSeatMenu = (index: number, title: string, items: SeatMenuItem[]) => {
    const v = seatSlots.get(index);
    if (!v) return setSeatMenu({ anchor: { x: win.width / 2 - 30, y: win.height / 3, w: 60, h: 60 }, title, items });
    v.measureInWindow((x, y, w, h) => setSeatMenu({ anchor: { x, y, w, h }, title, items }));
  };
  // Server room: a staff action goes to the server first (lib/live/room-staff), which checks the roles and
  // carries it out on the voice connection; this phone shows it once the server said yes.
  const staffAction = <T,>(failTitle: string, run: () => Promise<T>, then: (r: T) => void) =>
    void run().then(then, (e) => {
      errorHaptic();
      showAlert(failTitle, errorText(e));
    });
  const seatCall = (failTitle: string, body: SeatAction, then: () => void) => staffAction(failTitle, () => roomSeat(id, body), then);
  // A member change in a server room: then the list is read again (and a line in the chat, if any).
  const memberCall = <T,>(failTitle: string, run: () => Promise<T>, line?: string, then?: () => void) => {
    if (offlineBlocked()) return;
    staffAction(failTitle, run, () => {
      if (line) addMsg({ system: true, text: line });
      then?.();
      loadMembers();
    });
  };
  // The mic queue of a server room; the room metadata then shows every phone who waits.
  const queueCall = (failTitle: string, body: QueueAction, then: (queue: string[]) => void) => {
    if (offlineBlocked()) return;
    staffAction(failTitle, () => roomQueue(id, body), (r) => then(r.queue));
  };
  const leaveQueue = () => (real ? queueCall('Kuyruktan çıkılamadı', { action: 'leave' }, () => sysNote('Mikrofon kuyruğundan çıktın')) : setMyQueuePos(null));
  const toggleLock = (index: number, lock: boolean) => {
    if (offlineBlocked()) return;
    if (real)
      return seatCall(lock ? 'Mikrofon kilitlenemedi' : 'Kilit açılamadı', { action: lock ? 'lock' : 'unlock', seat: index }, () =>
        logMod(lock ? 'Mikrofonu kilitledi' : 'Mikrofon kilidini açtı', `${index + 1}. koltuk`),
      );
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
    const user = real ? toServer(uid) : null;
    if (real) {
      if (!user) return;
      return staffAction('Odadan çıkarılamadı', () => roomBan(id, user, KICK_BAN_MIN), () => {
        // The server took them out of the voice room; the short ban here keeps them off this screen meanwhile.
        kick(id, 'me', uid, KICK_BAN_MIN);
        staff.reload();
        addMsg({ system: true, text: `${u.name} odadan çıkarıldı · ${KICK_BAN_MIN} dk giriş yasağı (denetim kaydına yazıldı)` });
        logMod('Odadan çıkardı', u.name, `${KICK_BAN_MIN} dk giriş yasağı`);
      });
    }
    const r = kick(id, 'me', uid, KICK_BAN_MIN);
    if (!r.ok) {
      logMod('Reddedilen deneme: odadan çıkarma', u.name, r.reason);
      return showAlert('Odadan çıkarılamadı', r.reason);
    }
    setBans((b) => [...b.filter((x) => x.userId !== uid), { userId: uid, until: `${KICK_BAN_MIN} dk` }]);
    addMsg({ system: true, text: `${u.name} odadan çıkarıldı · ${KICK_BAN_MIN} dk giriş yasağı (denetim kaydına yazıldı)` });
    logMod('Odadan çıkardı', u.name, `${KICK_BAN_MIN} dk giriş yasağı`);
  };
  // Test panel: the host removes me, as the server would, so the session ends for a reason I didn't choose.
  const kickMeTest = () => {
    if (myRole === 'owner') return showAlert('Kendi odandasın', 'Oda sahibini kimse odadan çıkaramaz. "Sunucu odayı kapatsın" ile oturumun bitişini deneyebilirsin.');
    const r = kick(id, hostId, 'me', KICK_BAN_MIN);
    if (!r.ok) showAlert('Yapılamadı', r.reason);
  };
  const confirmKick = (uid: string) =>
    showAlert('Odadan çıkarılsın mı?', `${userById(uid).name} odadan çıkarılır ve ${KICK_BAN_MIN} dk tekrar giremez. Bu kalıcı engelleme değildir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Odadan çıkar', style: 'destructive', onPress: () => kickFromRoom(uid) },
    ]);
  // Server room: switching someone's mic off is a room voice mute the server enforces (components/room/room-mute,
  // asks for how long); switching it back on lifts that mute.
  const serverMicMute = (uid: string, name: string, mute: boolean) => {
    if (mute) return void roomMute.start(uid, name, 'voice');
    const sanction = staff.voiceMutes.get(uid);
    if (!sanction) return showAlert('Susturma kaldırılamadı', 'Bu susturma şu an bulunamadı. Biraz sonra tekrar dene.');
    staffAction('Susturma kaldırılamadı', () => roomUnmute(sanction), () => {
      staff.reload();
      addMsg({ system: true, text: `${name} mikrofonda yeniden konuşabilir` });
      logMod('Mikrofonunu açtı', name);
    });
  };
  // Server room: the people kept out (a kick or the blacklist), as the server lists them; staff let them back in.
  const openBans = () => {
    setPanel(null);
    const list = staff.bans ?? [];
    if (!list.length) return showAlert('Giriş yasağı yok', 'Bu odada şu an giriş yasağı olan kimse yok.');
    setSheet({
      title: 'Giriş yasakları',
      options: list.map((b) => ({
        label: `${b.name} · ${b.until === null ? 'kara liste' : `${banLeft(b.until)} kaldı`} · yasağı kaldır`,
        icon: 'lock-open-outline' as const,
        onPress: () => {
          const user = toServer(b.uid);
          if (!user || offlineBlocked()) return;
          staffAction('Yasak kaldırılamadı', () => roomUnban(id, user), () => {
            staff.reload();
            addMsg({ system: true, text: `${b.name} odaya yeniden girebilir` });
            logMod('Giriş yasağını kaldırdı', b.name);
          });
        },
      })),
    });
  };
  // Server room: the admins and their rank, as the server lists them. The owner changes a rank or takes it away.
  const openAdmins = () => {
    setPanel(null);
    const list = staff.admins;
    if (!list.length) return showAlert('Yönetici yok', myRank === 3 ? 'Koltuktaki birine dokunup "Yönetici yap" diyebilirsin.' : 'Bu odanın henüz yöneticisi yok.');
    const label = (uid: string) => `${userById(uid).name} · ${superIds.includes(uid) ? 'Süper Yönetici' : 'Yönetici'}`;
    setSheet({
      title: 'Oda yöneticileri',
      options: list.map((uid) => ({
        label: label(uid),
        icon: superIds.includes(uid) ? ('star-outline' as const) : ('shield-half-outline' as const),
        onPress: () => {
          const target = toServer(uid);
          if (myRank !== 3 || !target) return;
          const name = userById(uid).name;
          const isSuper = superIds.includes(uid);
          // ActionSheet calls onClose (back to the settings) and then this: the person's sheet replaces the list
          // instead, and closing it goes back to the settings.
          setPanel(null);
          menuReturn.current.push('settings');
          setSheet({
            title: label(uid),
            options: [
              {
                label: isSuper ? 'Süper Yöneticilikten al' : 'Süper Yönetici yap',
                icon: 'star-half-outline' as const,
                onPress: () =>
                  !offlineBlocked() &&
                  staffAction('Yetki değişmedi', () => roomSetAdmin(id, target, true, !isSuper), () => {
                    staff.reload();
                    logMod(isSuper ? 'Süper Yöneticilikten aldı' : 'Süper Yönetici yaptı', name);
                  }),
              },
              {
                label: 'Yöneticilikten al',
                icon: 'remove-circle-outline' as const,
                onPress: () =>
                  !offlineBlocked() &&
                  staffAction('Yönetici değişmedi', () => roomSetAdmin(id, target, false), () => {
                    staff.reload();
                    logMod('Yöneticilikten aldı', name);
                    addMsg({ system: true, text: `${name} artık yönetici değil` });
                  }),
              },
            ],
          });
        },
      })),
    });
  };
  // Server room, owner only: make someone DJ or take it back. The level's DJ count is checked here and on the server.
  const setDj = (uid: string, on: boolean) => {
    const target = toServer(uid);
    if (!target || offlineBlocked()) return;
    const name = userById(uid).name;
    if (on && djIds.length >= djCapacity(level)) return showAlert('DJ kontenjanı dolu', `Lv.${level} odada en fazla ${djCapacity(level)} DJ olabilir. Oda seviyesi yükseldikçe artar.`);
    staffAction('DJ değişmedi', () => roomSetDj(id, target, on), () => {
      staff.reload();
      logMod(on ? 'DJ yaptı' : 'DJ’likten aldı', name);
      addMsg({ system: true, text: on ? `🎧 ${name} odanın DJ’i oldu` : `${name} artık DJ değil` });
    });
  };
  // Server room, owner: the DJs (take it back), and someone in the room to make DJ.
  const openDjs = () => {
    setPanel(null);
    const max = djCapacity(level);
    const inRoom = [...new Set([...seatedOthers, ...audience.map((u) => u.id)])].filter((uid) => !!toServer(uid) && uid !== hostId && !adminIds.includes(uid) && !djIds.includes(uid));
    const pickNew = () => {
      setPanel(null);
      menuReturn.current.push('settings');
      if (!inRoom.length) return showAlert('Odada uygun kimse yok', 'DJ yapmak istediğin kişi odada olmalı. Yöneticiler zaten müzik çalabilir.');
      setSheet({ title: 'Kimi DJ yapalım?', options: inRoom.slice(0, 30).map((uid) => ({ label: userById(uid).name, icon: 'person-add-outline' as const, onPress: () => setDj(uid, true) })) });
    };
    setSheet({
      title: `DJ’ler · ${djIds.length}/${max}`,
      options: [
        ...djIds.map((uid) => ({ label: `${userById(uid).name} · DJ’likten al`, icon: 'remove-circle-outline' as const, onPress: () => setDj(uid, false) })),
        ...(djIds.length < max ? [{ label: 'DJ ekle (odadakilerden)', icon: 'add-circle-outline' as const, onPress: pickNew }] : []),
      ],
    });
  };
  const sendMicInvite = (uid: string, seat?: number) => {
    if (offlineBlocked()) return false;
    // A mic invite isn't carried to the other phone in a server room yet: say so instead of a pending invite.
    if (real) {
      showAlert('Davet gönderilemedi', 'Bu odada mikrofon daveti henüz yok. Davet etmek istediğin kişi boş bir koltuğa dokunarak mikrofona geçebilir.');
      return false;
    }
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
      const whoServer = real ? toServer(who) : null;
      if (real) {
        if (!whoServer) return;
        return seatCall('Taşınamadı', { action: 'move', user: whoServer, seat: index }, () => {
          seatBy(id, 'me', who, index);
          addMsg({ system: true, text: `${userById(who).name} ${index + 1}. koltuğa taşındı` });
          logMod('Koltuk değiştirdi', userById(who).name, `${index + 1}. koltuk`);
        });
      }
      const moved = seatBy(id, 'me', who, index);
      if (!moved.ok) return showAlert('Taşınamadı', moved.reason);
      addMsg({ system: true, text: `${userById(who).name} ${index + 1}. koltuğa taşındı` });
      logMod('Koltuk değiştirdi', userById(who).name, `${index + 1}. koltuk`);
      return;
    }
    if (uid === 'me') {
      const items: SeatMenuItem[] = [{ key: 'profile', label: 'Profilim', icon: 'person-circle-outline', onPress: () => router.push('/kullanici/me') }];
      if (camAllowed) items.push({ key: 'cam', label: camOn ? 'Kamerayı kapat' : 'Kamerayı aç', icon: camOn ? 'videocam-off-outline' : 'videocam-outline', onPress: toggleCam });
      if (!isOwn || index !== 0) items.push({ key: 'leave', label: 'Koltuktan in', icon: 'arrow-down-circle-outline', onPress: () => !offlineBlocked() && removeFromSeat('me') });
      return openSeatMenu(index, `${index + 1}. koltuk · sen`, items);
    }
    if (uid) {
      const u = userById(uid);
      const targetRole = roleOf(uid);
      // Server room: the person's server id for the staff actions (lib/live/room-staff).
      const target = real ? toServer(uid) : null;
      // Owner > Süper Yönetici > Yönetici > everyone else: nobody acts on their own rank or higher.
      const outranks = canManage && myRank > rankOf(uid);
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
              if (real)
                return target
                  ? seatCall('Mikrofondan indirilemedi', { action: 'remove', user: target }, () => {
                      forceLeaveSeat(id, 'me', uid);
                      addMsg({ system: true, text: `${u.name} mikrofondan indirildi` });
                      logMod('Mikrofondan indirdi', u.name);
                    })
                  : undefined;
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
              if (real)
                return target
                  ? seatCall('Mikrofondan indirilemedi', { action: 'remove', user: target }, () => {
                      forceLeaveSeat(id, 'me', uid);
                      toggleLock(index, true);
                      addMsg({ system: true, text: `${u.name} mikrofondan indirildi` });
                    })
                  : undefined;
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
              if (real) return serverMicMute(uid, u.name, !muted);
              const r = setMicMute(id, 'me', uid, !muted);
              if (!r.ok) return showAlert('Yapılamadı', r.reason);
              logMod(muted ? 'Mikrofonunu açtı' : 'Mikrofonunu susturdu', u.name);
            },
          },
        );
        // Server room: a timed mute the server keeps and enforces (components/room/room-mute).
        if (real && toServer(uid))
          items.push({ key: 'sanction', label: 'Süreli sustur', icon: 'timer-outline', onPress: () => roomMute.start(uid, u.name) });
      }
      items.push(
        { key: 'gift', label: 'Hediye gönder', icon: 'gift-outline', dividerBefore: !outranks, onPress: () => (setGiftTo(uid), setGiftOpen(true)) },
        { key: 'dm', label: 'Mesaj gönder', icon: 'chatbubble-outline', onPress: () => router.push(`/sohbet/${uid}`) },
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
              const done = () => {
                logMod(isAdmin ? 'Yöneticilikten aldı' : 'Yönetici atadı', u.name);
                addMsg({ system: true, text: isAdmin ? `${u.name} artık yönetici değil` : `🛡️ ${u.name} oda yöneticisi oldu` });
              };
              if (real) {
                if (offlineBlocked() || !target) return;
                return staffAction('Yönetici değişmedi', () => roomSetAdmin(id, target, !isAdmin), () => {
                  staff.reload();
                  done();
                });
              }
              updateMyRoom({ adminIds: isAdmin ? adminIds.filter((x) => x !== uid) : [...adminIds, uid] });
              done();
            },
          },
          // Süper Yönetici (server rooms): an admin I trust with the room's name, bulletin and activities.
          ...(real && isAdmin && target
            ? [
                {
                  key: 'super',
                  label: superIds.includes(uid) ? 'Süper Yöneticilikten al' : 'Süper Yönetici yap',
                  icon: 'star-half-outline' as const,
                  onPress: () => {
                    if (offlineBlocked()) return;
                    const on = !superIds.includes(uid);
                    staffAction('Yetki değişmedi', () => roomSetAdmin(id, target, true, on), () => {
                      staff.reload();
                      logMod(on ? 'Süper Yönetici yaptı' : 'Süper Yöneticilikten aldı', u.name);
                      addMsg({ system: true, text: on ? `⭐ ${u.name} Süper Yönetici oldu` : `${u.name} artık Süper Yönetici değil` });
                    });
                  },
                },
              ]
            : []),
          // DJ (server rooms): plays music in the room, nothing else; an admin already can.
          ...(real && !isAdmin && target
            ? [
                {
                  key: 'dj',
                  label: djIds.includes(uid) ? 'DJ’likten al' : 'DJ yap',
                  icon: 'musical-notes-outline' as const,
                  onPress: () => setDj(uid, !djIds.includes(uid)),
                },
              ]
            : []),
          {
            key: 'black',
            label: 'Kara listeye ekle',
            icon: 'ban-outline',
            destructive: true,
            onPress: () => {
              if (offlineBlocked()) return;
              if (real)
                return target
                  ? staffAction('Kara listeye eklenemedi', () => roomBan(id, target, null), () => {
                      kick(id, 'me', uid, null);
                      staff.reload();
                      addMsg({ system: true, text: `${u.name} oda kara listesine eklendi` });
                      logMod('Kara listeye ekledi', u.name, 'kalıcı');
                    })
                  : undefined;
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
      // Plain members need no role word; the match fits in the menu's one-line title instead.
      const sim = simScores.get(uid);
      const parts = [`${index + 1}. koltuk`, u.name, rankOf(uid) > 0 && rankLabel(uid), sim !== undefined && `%${sim} benzer`].filter(Boolean);
      // Everyone gets the person card; what only staff can do stays in the seat menu behind its "Yönet".
      const manage = items.filter((it) => !['profile', 'gift', 'dm'].includes(it.key)).map((it, i) => (i === 0 ? { ...it, dividerBefore: false } : it));
      const note = [`${index + 1}. koltuk`, rankOf(uid) > 0 && rankLabel(uid), sim !== undefined && `%${sim} benzer`].filter(Boolean).join(' · ');
      return setPerson({ uid, note, manage: manage.length ? () => openSeatMenu(index, parts.join(' · '), manage) : undefined });
    }
    if (index === 0) return isOwn ? sitMe(0) : undefined;
    if (canManage) {
      const locked = lockedSeats.includes(index);
      const items: SeatMenuItem[] = [
        // A server room has no mic invites yet (sendMicInvite): the empty seat offers what works.
        ...(!real
          ? [
              {
                key: 'invite',
                label: 'Davet et',
                icon: 'person-add-outline' as const,
                onPress: () => {
                  if (locked) toggleLock(index, false);
                  setInviteSeat(index);
                  setPeopleOpen(true);
                },
              },
            ]
          : []),
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
    if (amSeated || seatAccess(micQueue, myRole) === 'direct') return sitMe(index);
    joinQueue();
  };

  // Mic queue on: ask the room's managers for a mic and see my position until they approve.
  const joinQueue = () => {
    if (devicesBusy() || offlineBlocked()) return;
    if (myQueuePos !== null) return showAlert('Sıradasın', `Konumun: ${myQueuePos + 1}. Sıradan çıkmak için menüyü kullan.`);
    if (real)
      return queueCall('El kaldırılamadı', { action: 'join' }, (q) => {
        const pos = q.indexOf(myServerId() ?? '');
        addMsg({ system: true, text: `🙋 Mikrofon isteğin oda yönetimine gitti${pos >= 0 ? ` · sıran: ${pos + 1}` : ''} · onay bekleniyor` });
      });
    const pos = rollDie() % 3 + 1;
    setMyQueuePos(pos);
    addMsg({ system: true, text: `🙋 Mikrofon isteğin oda yönetimine gönderildi · sıran: ${pos + 1} · onay bekleniyor` });
  };

  // The big mic button for a listener: take a free mic, or raise a hand when all are taken.
  const raiseHand = () => {
    if (devicesBusy()) return;
    if (isOwn && allSeats[0] === null) return sitMe(0);
    if (freeSeatIndex > 0) return isOwn ? sitMe(freeSeatIndex) : onSeatPress(freeSeatIndex);
    if (myRole === 'member' && micPermission === 'members' && membership !== 'member') return onSeatPress(1);
    joinQueue();
  };

  // --- Chat, gifts, games ---------------------------------------------------------
  // `sticker` (a sticker token) goes out on its own and leaves the typed draft alone.
  const send = (sticker?: string) => {
    const text = sticker ?? draft.trim();
    if (!text) return;
    if (chatBlocked) return chatMuted ? showSanction(chatMuted) : undefined;
    // No phone numbers, IBANs, e-mails, links or social media accounts (lib/contact-filter). The server never
    // sees room chat, so this is the check on the way out: refused, and the line stays in the input.
    const thread = `room:${id}`;
    // A mention of someone in the room ("@Ayşe") is no social media handle: checked as the plain name.
    const checked = sticker ? text : stripMentions(text, roomNamesKey.split('\n'));
    const refusal = sticker ? null : messageRefusal(thread, checked, 'room.chat');
    if (refusal) return setChatRefused(refusal);
    // A server room in slow mode: one line per 10 seconds for everyone but its staff.
    if (liveSlow && myRank === 0) {
      const wait = Math.ceil((lastLineAt.current + SLOW_MS - nowMs()) / 1000);
      if (wait > 0) return setChatRefused(`Yavaş mod açık: ${wait} saniye sonra yazabilirsin.`);
      lastLineAt.current = nowMs();
    }
    if (!sticker) noteSent(thread, checked);
    if (!sticker) setDraft('');
    // Server room: the line goes out over the voice connection, which may still be joining or have dropped.
    if (!isOnline() || (real && !sendSignal({ t: 'chat', text: mask(text) }))) {
      // Not sent: kept on my screen only, marked as failed with a retry.
      setMessages((list) => mergeFeed(list, [{ id: msgId(), userId: 'me', text: mask(text), status: 'failed', at: Date.now() }]));
      return;
    }
    addMsg({ userId: 'me', text });
    setEmojiOpen(false);
    gainXp(2);
  };
  // A failed message is sent again as a new event (its text was already filtered when it was written).
  const retrySend = useCallback((msg: ChatMsg) => {
    if (offlineBlocked()) return;
    // Server room: it goes out again over the voice connection; while that is still down the line stays failed.
    if (real && !sendSignal({ t: 'chat', text: msg.text })) return;
    setMessages((list) => mergeFeed(list.filter((m) => m.id !== msg.id), [{ id: msgId(), userId: 'me', text: msg.text, at: Date.now() }]));
  }, [real]);
  // A line naming me (@bahset) stands out; a tap on someone's photo or name opens their person card.
  const myName = app.me.name;
  // Someone else's chat bubble in a server room: their shop look (it changes when new looks arrive: looksVersion).
  const bubbleOf = useCallback((uid: string) => (real && looksVersion >= 0 && uid !== 'me' ? (lookOf(toServer(uid))?.bubble ?? undefined) : undefined), [real, looksVersion]);
  const renderChat = useCallback(
    ({ item }: { item: ChatMsg }) => (
      <ChatLine
        msg={item}
        bubbleId={equipped.bubble}
        bubbleOf={bubbleOf}
        bond={item.userId && !item.system && !item.bot ? bubbleBondOf(roomBonds, item.userId) : null}
        onRetry={retrySend}
        mentionsMe={!!item.userId && item.userId !== 'me' && mentions(item.text, myName)}
        onPerson={openPerson}
      />
    ),
    [equipped.bubble, bubbleOf, retrySend, roomBonds, myName, openPerson],
  );
  // @bahset: "@" in the line offers the people on the mics and the balcony; a pick (or the card's Bahset) writes "@Name ".
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const mention = (uid: string) => {
    editDraft((d) => insertMention(d, userById(uid).name));
    setTimeout(() => inputRef.current?.focus(), 300);
  };
  const mentionQ = typing ? mentionQuery(draft) : null;
  const mentionPeople =
    mentionQ === null
      ? []
      : mentionPicks(
          [...new Set([...view.micIds, ...view.balconyIds])].filter((u) => u !== 'me' && !blocked.has(u)).map(userById),
          mentionQ,
        );

  /** True when at least one recipient got the gift. */
  const deliverGifts = (gift: Gift, toIds: string[], count: number): boolean => {
    // Demo rooms only: a live build never pays the demo's people (spendCoins would take real server coins).
    if (liveMode()) return false;
    const each = gift.price * count;
    // Each recipient is a separate, individually recorded transaction; stop charging once the balance
    // or the daily spending limit runs out, and remember which of the two it was.
    let reason: string | null = null;
    const results = toIds.map((uid) => {
      const why = each > 0 ? spendBlock(each) : null;
      if (why) reason = why;
      return { userId: uid, ok: !why && spendCoins(each, `Hediye: ${gift.name} x${count} → ${userById(uid).name}`) };
    });
    const delivered = results.filter((r) => r.ok);
    if (delivered.length === 0) {
      errorHaptic();
      if (reason && reason !== 'Yetersiz bakiye.') showAlert('Günlük harcama limiti', reason);
      else
        showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
        ]);
      return false;
    }
    successHaptic();
    const total = each * delivered.length;
    delivered.forEach((r) => {
      logGift('me', r.userId, gift, count);
      app.recordGift(r.userId, gift.id, count);
    });
    bump('giftsSent', count * delivered.length);
    addContrib('me', total);
    if (!isOwn) addFanPoints(hostId, Math.ceil(total / 10), `Hediye gönderdin (${total} jeton)`);
    if (showFx(gift.price)) playGiftFx(gift, ME.name, delivered.map((r) => r.userId), count);
    // From the gift button (bottom right) to each recipient's seat.
    flyGift(gift.emoji, count, delivered.map((r) => r.userId), { x: win.width - 60, y: win.height - 48 }, gift.id);
    const sendId = msgId();
    delivered.forEach((r) => scorePk(`GT-${sendId}-${r.userId}`, 'me', r.userId, gift.id, each));
    addMsg({
      id: `gift:GT-${sendId}`,
      system: true,
      text: `🎁 ${ME.name}, ${delivered.length > 1 ? `${delivered.length} kişiye` : `${userById(delivered[0].userId).name} kişisine`} ${gift.emoji} ${gift.name} x${count} gönderdi!`,
      gift: { fromId: 'me', toIds: delivered.map((r) => r.userId), emoji: gift.emoji, name: gift.name, count, giftId: gift.id },
    });
    // Only a partial delivery opens the results panel; a normal send shows no extra message.
    if (delivered.length < toIds.length) {
      setGiftResults({ rows: results, reason });
      setPanel('results');
    }
    return true;
  };

  // Product rule: gifts never ask for confirmation; one tap sends.
  const sendGift = (gift: Gift, toIds: string[], count: number) => {
    setGiftOpen(false);
    if (offlineBlocked() || blockedFeature('gifts')) return false;
    if (real) {
      void deliverLiveGifts(gift, toIds, count);
      return true;
    }
    // Live mode: a sample room's people are not real, and real coins never go to them (no spendCoins here).
    if (liveMode()) {
      showAlert('Hediye gönderilemedi', 'Bu örnek odada hediye gönderilemez. Hediyeleri gerçek odalarda gönderebilirsin.');
      return false;
    }
    return deliverGifts(gift, toIds, count);
  };

  // Server room: each gift is paid on the server (its price, my real balance; the recipient's diamonds and
  // Gelir lock are written there). The server itself announces it to the other phones in the room
  // (server/api/gifts.mjs); this phone draws its own gift once the server said it was paid.
  const deliverLiveGifts = async (gift: Gift, toIds: string[], count: number) => {
    const sent: string[] = [];
    let error: string | null = null;
    for (const uid of toIds) {
      // The daily limit holds here too (the balance is the server's to check); each answer counts toward it.
      const limited = spendBlock(gift.price * count);
      if (limited && limited !== 'Yetersiz bakiye.') {
        error = limited;
        break;
      }
      try {
        await liveGift(uid, gift.id, count, id);
        sent.push(uid);
      } catch (e) {
        error = errorText(e);
        break;
      }
    }
    if (!sent.length) {
      errorHaptic();
      return showAlert('Hediye gönderilemedi', error ?? 'Gönderilemedi.', [
        { text: 'Tamam', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
    successHaptic();
    showGift('me', sent, gift, count);
    sent.forEach((uid) => app.recordGift(uid, gift.id, count));
    bump('giftsSent', count * sent.length);
    if (error) showAlert('Bazı hediyeler gönderilemedi', `${sent.length} kişiye gitti. ${error}`);
  };
  /** A Lucky send another phone made (the server announced it): the gift lines, the flight and a big win. */
  const showLuckyFrom = (from: string, toIds: string[], s: LuckySignal) => {
    const fromName = userById(from).name;
    const price = luckyGift(s.giftId)?.price ?? 0;
    toIds.forEach((to) => logGift(from, to, { id: s.giftId, name: s.name, emoji: s.emoji, price }, s.count));
    if (price) addContrib(from, price * s.count * toIds.length);
    flyGift(s.emoji, s.count, toIds, { x: 36, y: win.height * 0.72 }, s.giftId);
    const toText = toIds.length > 1 ? `${toIds.length} kişiye` : toIds[0] === 'me' ? 'sana' : `${userById(toIds[0]).name} kişisine`;
    addMsg({
      id: `gift:${s.eventId}`,
      system: true,
      text: `🍀 ${fromName}, ${toText} ${s.emoji} ${s.name}${s.count > 1 ? ` x${s.count}` : ''} (Uğurlu) gönderdi`,
      gift: { fromId: from, toIds, emoji: s.emoji, name: s.name, count: s.count, lucky: true, giftId: s.giftId },
    });
    // The sender may hide their name on wins (Ayarlar), and the server doesn't know it: the line names no one.
    if (s.bigWin > 0) addMsg({ system: true, kind: 'gift', text: `🎉 Uğurlu hediyeden ×${s.best.toLocaleString('tr-TR')} kazanıldı!` });
  };
  /** A gift line, the seat flight and the big effect (mine or one another phone announced). */
  const showGift = (from: string, toIds: string[], gift: Gift, count: number) => {
    const fromName = from === 'me' ? ME.name : userById(from).name;
    toIds.forEach((to) => logGift(from, to, gift, count));
    addContrib(from, gift.price * count * toIds.length);
    if (showFx(gift.price) && visibleRef.current) playGiftFx(gift, fromName, toIds, count);
    const origin = from === 'me' ? { x: win.width - 60, y: win.height - 48 } : { x: 36, y: win.height * 0.72 };
    flyGift(gift.emoji, count, toIds, origin, gift.id);
    const toText = toIds.length > 1 ? `${toIds.length} kişiye` : toIds[0] === 'me' ? 'sana' : `${userById(toIds[0]).name} kişisine`;
    addMsg({ system: true, text: `🎁 ${fromName}, ${toText} ${gift.emoji} ${gift.name} x${count} gönderdi!`, gift: { fromId: from, toIds, emoji: gift.emoji, name: gift.name, count, giftId: gift.id } });
  };

  // Lucky: `count` gifts to each person picked, one draw per gift; no send cap beyond the balance.
  // Server room: the server takes the price, gives each recipient their 20 % as diamonds, draws and pays the rewards
  // in game coins, then tells the room (server/api/lucky.mjs). Offline demo: lib/lucky plays it on this phone.
  const sendLuckyGift = (giftId: string, picked: string[], count = 1) => {
    setGiftOpen(false);
    if (offlineBlocked()) return;
    // Live mode: a sample room's people are not real, and real coins never go to them.
    if (liveMode() && !real) {
      setCombo(null);
      return showAlert('Uğurlu hediye gönderilemedi', 'Bu örnek odada hediye gönderilemez. Hediyeleri gerçek odalarda gönderebilirsin.');
    }
    // The combo wheel repeats a stored list: drop anyone who has left the room since (never charge for them).
    const inRoom = new Set([...seatedOthers, ...audience.map((u) => u.id)]);
    const toIds = picked.filter((t) => inRoom.has(t));
    if (!toIds.length) {
      setCombo(null);
      return showAlert('Uğurlu hediye gönderilemedi', 'Seçtiğin kişiler artık odada değil.');
    }
    if (real) return void deliverLiveLucky(giftId, toIds, count);
    // One wallet charge (and at most one reward and one refund row) for the whole send; each gift still draws apart.
    const { records, error } = sendLuckyBatch(
      { userId: 'me', userAge: app.me.age, roomId: id, giftId, to: toIds.map((t) => ({ id: t, name: userById(t).name })), count },
      { spend: spendCoins, credit: addCoins, blocked: spendBlock },
    );
    if (!records.length) {
      errorHaptic();
      setCombo(null);
      return showAlert('Uğurlu hediye gönderilemedi', error ?? 'Gönderilemedi.');
    }
    // PK scores the recipient's 20 % share of the gift value, never the reward (the server does it in a server room).
    records.forEach((r) => scorePk(r.txId, 'me', r.toId, r.giftId, luckyPkPoints(r)));
    const spent = records.reduce((n, r) => n + r.price, 0);
    if (!isOwn) addFanPoints(hostId, Math.ceil(spent / 10), `Hediye gönderdin (${spent} jeton)`);
    showLuckySend(records, toIds, count, error);
  };
  const deliverLiveLucky = async (giftId: string, toIds: string[], count: number) => {
    const g = luckyGift(giftId);
    // The daily limit holds here too (the balance is the server's to check).
    const limited = g ? spendBlock(g.price * count * toIds.length) : null;
    if (limited && limited !== 'Yetersiz bakiye.') {
      errorHaptic();
      setCombo(null);
      return showAlert('Uğurlu hediye gönderilemedi', limited);
    }
    try {
      const { records } = await liveLuckySend(giftId, toIds, count, id);
      if (records.length) showLuckySend(records, toIds, count, null);
    } catch (e) {
      errorHaptic();
      setCombo(null);
      const text = errorText(e);
      showAlert('Uğurlu hediye gönderilemedi', text, /Yetersiz/i.test(text) ? [{ text: 'Tamam', style: 'cancel' }, { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') }] : undefined);
      // A closed package or the day's limit: the sheet shows it from now on.
      void refreshLucky().catch(() => {});
    }
  };
  /** What a Lucky send I made shows: the gift lines, the flight, the results and the win news. */
  const showLuckySend = (records: LuckyRecord[], toIds: string[], count: number, error: string | null) => {
    const cfg = getLucky().config;
    const first = records[0];
    const giftId = first.giftId;
    const spent = records.reduce((n, r) => n + r.price, 0);
    const reward = records.reduce((n, r) => n + r.reward, 0);
    const best = records.reduce((a, b) => (b.mult > a.mult ? b : a), first);
    const sentTo = [...new Set(records.map((r) => r.toId))];
    successHaptic();
    records.forEach((r) => {
      logGift('me', r.toId, { id: r.giftId, name: r.giftName, emoji: r.emoji, price: r.price }, 1);
      app.recordGift(r.toId, r.giftId, 1);
    });
    bump('giftsSent', records.length);
    addContrib('me', spent);
    flyGift(first.emoji, count, sentTo, { x: win.width - 60, y: win.height - 48 }, first.giftId);
    // Combo repeats don't add a chat line each time; the wheel shows the count.
    const repeat = combo?.giftId === giftId && combo.to.join() === toIds.join() && combo.each === count;
    if (!repeat)
      addMsg({
        id: `gift:${first.txId}`,
        system: true,
        text: `🍀 ${ME.name}, ${sentTo.length > 1 ? `${sentTo.length} kişiye` : `${userById(sentTo[0]).name} kişisine`} ${first.emoji} ${first.giftName}${count > 1 ? ` x${count}` : ''} (Uğurlu) gönderdi`,
        gift: { fromId: 'me', toIds: sentTo, emoji: first.emoji, name: first.giftName, count, lucky: true, giftId: first.giftId },
      });
    if (error) addMsg({ system: true, text: `🍀 ${toIds.length * count - records.length} Uğurlu hediye gönderilemedi (jetonu iade edildi): ${error}` });
    // Every win is announced in all rooms (banner); the user can hide their name in Ayarlar.
    if (reward > 0) {
      const wins = records.filter((r) => r.reward > 0).length;
      announceWin({ userName: ME.name, avatar: app.me.avatar, source: `Uğurlu › ${first.giftName}`, roomTitle: roomTitleOf(id), mult: best.mult, amount: reward, wins: wins > 1 ? wins : undefined }, { mine: true });
    }
    if (best.mult >= cfg.announceFrom)
      addMsg({
        system: true,
        kind: 'gift',
        text: settings.luckyAnnounce ? `🎉 ${ME.name} Uğurlu hediyeden ×${best.mult.toLocaleString('tr-TR')} kazandı! +${reward.toLocaleString('tr-TR')} jeton` : `🎉 Bir kullanıcı Uğurlu hediyeden ×${best.mult.toLocaleString('tr-TR')} kazandı!`,
      });
    setLuckyFx(records);
    // Restarts the combo wheel's timer: the time of this send's last draw.
    const at = records[records.length - 1].ts;
    setCombo((c) => (c && c.giftId === giftId && c.to.join() === toIds.join() && c.each === count ? { ...c, count: c.count + 1, key: at } : { giftId, to: toIds, each: count, count: 1, key: at }));
  };
  const comboGift = combo ? luckyGift(combo.giftId) : undefined;

  const sendEnvelope = (amount: number, count: number) => {
    setPanel(null);
    // Live mode never offers the room envelope (menu): no coins leave or arrive on this phone for it.
    if (liveMode()) return;
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
    // Demo only: live mode never drops an envelope, and no coins are ever added on this phone there.
    if (!envelope || liveMode()) return;
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
    // Same house rule and payout pool as the casino (lib/games, lib/casino-odds).
    const r = playDuel(bet);
    if (!r.ok) {
      showAlert('Zar Düellosu', r.reason);
      return null;
    }
    setDicePlays((n) => n - 1);
    const { me, them, payout } = r;
    const opponent = pick(seatedOthers.length ? seatedOthers : USERS.map((u) => u.id));
    addMsg({ system: true, text: `🎲 ${ME.name} (${me}) vs ${userById(opponent).name} (${them}) → ${payout > 0 ? `${ME.name} kazandı! +${payout} (oyun bakiyesine)` : 'kasa kazandı'}` });
    return { me, them, opponent };
  };

  const liveMusicAct = (body: MusicAction) => void roomMusicAction(id, body).catch((e) => showAlert('Müzik değişmedi', errorText(e)));
  const music$ = {
    toggle: () => (real ? liveMusicAct({ action: nowMusic?.paused ? 'resume' : 'pause' }) : setMusic((m) => ({ ...m, playing: !m.playing }))),
    next: () => (real ? liveMusicAct({ action: 'skip' }) : setMusic((m) => ({ queue: m.queue.slice(1), playing: m.queue.length > 1, position: 0 }))),
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

  // Paylaş: in-app friends (people I follow or message), as a chat card that opens the room.
  const shareRoom = () => setPanel('invite');
  const shareExternal = () => shareLink(`Similar Club'da "${title}" odasına gel! 🎙️ Şu an ${listeners} kişi dinliyor.`, `oda/${id}`);
  const friends = USERS.filter((u) => (following.has(u.id) || conversations.some((c) => c.userId === u.id)) && !blocked.has(u.id));
  const sendToFriend = (uid: string) => {
    sendMessage(uid, roomInviteText(title), true, { roomId: id, title, cover });
    setSharedTo((s) => new Set(s).add(uid));
    // Some friends come right away (a demo stand-in for them opening the card).
    setTimeout(() => {
      if (Math.random() < 0.5 || getRoom(id)?.members.includes(uid)) return;
      if (joinPresence(id, uid, { eventId: `share:${uid}:${msgId()}` }).ok) addMsg({ system: true, text: `📨 ${userById(uid).name} davetinle odaya girdi` });
    }, 2500);
  };
  // "Odaya davet et" (owner/admins): every follower of the room's account, once every 24 hours per room.
  const inviteFollowers = () => {
    if (offlineBlocked()) return;
    const check = canInviteFollowers(myRole, followerInvites[id]);
    if (!check.ok) return showAlert('Davet gönderilemedi', check.reason);
    const count = followerCount(hostId);
    const owner = hostId === 'me' ? 'Hesabının' : `${userById(hostId).name} hesabının`;
    showAlert('Takipçiler davet edilsin mi?', `${owner} ${count.toLocaleString('tr-TR')} takipçisine oda daveti bildirimi gider. Bu oda için 24 saatte bir gönderilebilir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Davet gönder',
        onPress: () => {
          markFollowerInvite(id, Date.now());
          logMod('Takipçilere oda daveti gönderdi', `${count} takipçi`);
          addMsg({ system: true, text: `📣 Oda daveti ${count.toLocaleString('tr-TR')} takipçiye gönderildi` });
          const room = getRoom(id);
          knownFollowers(hostId)
            .filter((uid) => !room?.members.includes(uid) && !blocked.has(uid))
            .slice(0, 2)
            .forEach((uid, i) =>
              setTimeout(() => {
                if (joinPresence(id, uid, { eventId: `followers:${uid}:${msgId()}` }).ok) addMsg({ system: true, text: `📨 ${userById(uid).name} takipçi davetiyle odaya girdi` });
              }, 3000 * (i + 1)),
            );
        },
      },
    ]);
  };

  // --- Games (Oyun Merkezi spec): opened over the room; never touch seats, mic or membership ------------
  const openRoomGame = (gid: string) => {
    const g = gameCatalog.roomGames.find((x) => x.id === gid);
    if (!g || !g.active) return;
    setPanel(null);
    if (!g.playable) return showAlert(g.name, 'Bu oyun yakında geliyor.');
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
      return showAlert(g.name, access.reason, access.needWealth ? [{ text: 'Kapat', style: 'cancel' }, { text: 'Cömertlik Seviyem', onPress: () => router.push('/seviye') }] : undefined);
    setGame({ kind: 'casino', id: g.id });
    setGameMin(false);
  };
  const menuSections: MenuSection[] = [
    {
      title: 'Etkileşimli Oyunlar',
      variant: 'round',
      items: [
        // In live mode Oda içi PK runs on the server (lib/live/pk), so only in a server room.
        ...(myRole !== 'member' && !pk && (!liveMode() || real) ? [{ key: 'pk', label: 'PK', emoji: '⚔️', art: artSource('pk-takim-pk'), colors: ['#FF6576', '#087A80'] as [string, string], onPress: () => (setPanel(null), setPkSetup(true)) }] : []),
        ...(oneOnOneOpen() ? [{ key: 'match', label: 'Hemen Tanış', emoji: '⚡', colors: ['#13D9DF', '#0A8F95'] as [string, string], onPress: () => router.push('/eslesme') }] : []),
        // Live mode: the server's Şanslı çanta, in a server room only (lib/live/lucky-bags); the demo keeps its envelope.
        ...(!liveMode() || real ? [{ key: 'env', label: 'Şanslı çanta', emoji: '🧧', art: ROOM_ICON_ART.envelope, colors: ['#B91C1C', '#F59E0B'] as [string, string], onPress: () => setPanel(liveMode() ? 'bag' : 'envelope') }] : []),
        { key: 'tasks', label: 'Günlük görev', emoji: '📋', colors: ['#0E7C9A', '#13D9DF'], onPress: () => router.push('/gorevler') },
        { key: 'events', label: 'Aktivite', emoji: '🎉', art: ROOM_ICON_ART.activity, colors: ['#0A8F95', '#FF6576'], onPress: () => setPanel('events') },
        ...(canFunctions ? [{ key: 'poll', label: 'Anket', emoji: '📊', art: ROOM_ICON_ART.poll, colors: ['#0EA5E9', '#2563EB'] as [string, string], onPress: () => setPanel('poll') }] : []),
        ...(roomType === 'qa' ? [{ key: 'qa', label: 'Sorular', emoji: '❓', art: ROOM_ICON_ART.questions, colors: ['#F97316', '#DC2626'] as [string, string], onPress: () => setPanel('qa'), badge: questions.filter((q) => !q.picked).length }] : []),
        { key: 'music', label: 'Müzik', emoji: '🎵', art: ROOM_ICON_ART.music, colors: ['#C93C4F', '#0A8F95'], onPress: () => setPanel('music') },
      ],
    },
    // The free room games are opened by the room's staff (owner and admins); everyone else joins the table they open.
    ...(canManage
      ? [
          {
            title: 'Oda Oyunları · ücretsiz',
            variant: 'tile',
            note: 'Masayı sen açarsın, herkes katılır · oyun açıkken mikrofonun ve koltuğun aynen kalır',
            items: gameCatalog.roomGames
              .filter((g) => g.active)
              .map((g) => ({ key: `rg-${g.id}`, label: g.name, emoji: g.emoji, art: gameArtOf(g.id), hue: gameHueOf(g.id), badge: g.playable ? undefined : ('SOON' as const), onPress: () => openRoomGame(g.id) })),
          } satisfies MenuSection,
        ]
      : []),
    // Oyun Salonu only exists for Cömertlik Lv.2 and up; below that the room menu has no trace of it.
    // The section is gated on the level alone (the server-run wheel); casinoVisible gates the phone-decided games.
    ...(gamblingLevelOk(app.wealthLevel)
      ? [
          {
            title: 'Oyun Salonu',
            variant: 'tile',
            note: 'Sonuçlar sunucuda doğrulanır · jeton harcaması günlük limite dahildir',
            items: [
              // Rüzgâr Gülü: the server plays it (components/games/wheel); Oyun Salonu is only shown from Lv.2.
              { key: 'cg-ruzgar', label: 'Rüzgâr Gülü', icon: 'compass' as const, hue: '#F6BD60', badge: 'NEW' as const, onPress: () => (setPanel(null), setGame({ kind: 'wheel' }), setGameMin(false)) },
              // The other Oyun Salonu games are played on the phone: live mode doesn't offer them (no real coins).
              ...gameCatalog.casino
                .filter((g) => casinoVisible(app.wealthLevel) && g.active && g.fromRoom && !liveMode())
                .map((g) => ({ key: `cg-${g.id}`, label: g.name, emoji: g.emoji, art: gameArtOf(g.id), hue: gameHueOf(g.id), onPress: () => openCasino(g.id) })),
            ],
          } satisfies MenuSection,
        ]
      : []),
    // Oda kartı, Oda ayarları, Yayına Katılma Modu, Odadakiler and Katkı sıralaması open from the room's top bar
    // and its card, so the menu doesn't repeat them. Ses and Mikrofon denoise live in Efektler.
    {
      title: 'Oda',
      variant: 'tool',
      items: [
        { key: 'share', label: 'Paylaş', icon: 'arrow-redo-outline', onPress: shareRoom },
        { key: 'fx', label: 'Efektler ve ses', icon: 'sparkles-outline', badge: settings.effectsOff ? 'off' : 'on', onPress: () => setPanel('effects') },
        ...(myQueuePos !== null ? [{ key: 'queue', label: 'Kuyruktan çık', icon: 'exit-outline' as const, onPress: leaveQueue }] : []),
      ],
    },
  ];
  // Oda ayarları (everyone): the room's own settings for staff, then the room tools (Moderasyon, Giriş
  // yasakları, Oda yöneticileri) and my own settings for this room. A sheet opened here comes back here.
  const fromSettings = (open: () => void) => () => (menuReturn.current.push('settings'), open());
  const settingsSections: SettingsSection[] = [
    ...(canManage
      ? [
          {
            title: 'Oda yönetimi',
            rows: [
              { key: 'mod', label: 'Moderasyon', hint: 'Yavaş mod, yasaklı kelimeler, yasaklar ve oda günlüğü', onPress: fromSettings(() => setPanel('mod')) },
              ...(real
                ? [
                    { key: 'bans', label: 'Giriş yasakları', value: String(staff.bans?.length ?? 0), hint: 'Odadan atılanlar ve kara liste; yasağı buradan kaldırırsın', onPress: fromSettings(openBans) },
                    { key: 'admins', label: 'Oda yöneticileri', value: `${staff.admins.length}`, hint: 'Süper Yönetici: oda adı, bülten ve etkinlikler', onPress: fromSettings(openAdmins) },
                    ...(myRole === 'owner'
                      ? [{ key: 'djs', label: 'DJ’ler', value: `${djIds.length}/${djCapacity(level)}`, hint: 'Odada yalnızca müzik çalarlar; başka yetkileri yok', onPress: fromSettings(openDjs) }]
                      : []),
                  ]
                : []),
            ],
          },
        ]
      : []),
    {
      title: 'Benim ayarlarım',
      rows: [
        { key: 'effects', label: 'Efektler ve ses', value: settings.roomMuted ? 'Oda sesi kapalı' : settings.effectsOff ? 'Efektler kapalı' : 'Açık', onPress: fromSettings(() => setPanel('effects')) },
        { key: 'msg', label: 'Mesaj ayarları', hint: 'Sohbette giriş, hediye ve bot mesajları', onPress: fromSettings(() => setPanel('msgSettings')) },
        { key: 'decor', label: 'Süsler', hint: 'Çerçeve, giriş efekti ve sohbet balonu (Mağaza)', onPress: () => (menuReturn.current.push('settings'), router.push('/magaza')) },
      ],
    },
  ];

  // Oda kartı: the room at a glance and shortcuts to its sheets; a sheet opened from the card comes back to it.
  const roomLocked = real ? isLockedRoom(id) : isOwn ? myRoom.locked : !!base?.password;
  const cardDetails = [
    { label: 'Oda sahibi', value: hostId === 'me' ? 'Sen' : userById(hostId).name },
    { label: 'Senin yetkin', value: rankLabel('me') },
    { label: 'Odadakiler', value: `${listeners.toLocaleString('tr-TR')} kişi` },
    { label: 'Yayına katılma', value: layout ? `${modeById(layout.modeId).name} · ${layout.name}` : `Klasik · ${classicCapacity} mikrofon` },
    { label: 'Mikrofon kuyruğu', value: micQueue ? `Açık${queue.length ? ` · ${queue.length} kişi bekliyor` : ''}` : 'Kapalı' },
    { label: 'Yöneticiler', value: String(real ? staff.admins.length : adminIds.length) },
    { label: 'Oda kilidi', value: roomLocked ? 'Şifreli' : 'Herkese açık' },
  ];
  const fromCard = (open: () => void) => () => (menuReturn.current.push('info'), open());
  const cardActions = [
    { key: 'settings', label: 'Oda ayarları', icon: 'settings-outline' as const, onPress: fromCard(() => setPanel('settings')) },
    { key: 'people', label: 'Odadakiler', icon: 'people-outline' as const, onPress: fromCard(() => (setPanel(null), setPeopleOpen(true))) },
    { key: 'contrib', label: 'Katkı sıralaması', icon: 'trophy-outline' as const, onPress: fromCard(() => setPanel('contrib')) },
    { key: 'events', label: 'Etkinlikler', icon: 'calendar-outline' as const, onPress: fromCard(() => setPanel('events')) },
    ...(canStage ? [{ key: 'layout', label: 'Yayına Katılma Modu', icon: 'grid-outline' as const, onPress: fromCard(() => (setPanel(null), setLayoutsOpen(true))) }] : []),
    ...(canManage && (micQueue || queue.length > 0) ? [{ key: 'requests', label: 'Mikrofon istekleri', icon: 'hand-left-outline' as const, onPress: fromCard(() => setPanel('requests')) }] : []),
    ...(canManage ? [{ key: 'mod', label: 'Moderasyon', icon: 'shield-checkmark-outline' as const, onPress: fromCard(() => setPanel('mod')) }] : []),
    { key: 'effects', label: 'Efekt ayarları', icon: 'sparkles-outline' as const, onPress: fromCard(() => setPanel('effects')) },
  ];

  // Room card data (members, clan).
  // A server room has no member list on the server yet: none is shown (RoomInfoSheet `live`), never demo people.
  const roomMembers = isOwn ? ['me', ...myRoom.memberIds] : real ? (serverMembers?.ids ?? []) : [...(membership === 'member' ? ['me'] : []), ...USERS.filter((u) => !kicked.has(u.id) && !blocked.has(u.id)).slice(0, 10).map((u) => u.id)];
  const memberTotal = isOwn ? roomMembers.length : real ? (serverMembers?.total ?? 0) : Math.min(memberLimit(level), Math.round(base!.listeners * 1.8)) + (membership === 'member' ? 1 : 0);
  const ownFamily = FAMILIES.find((f) => f.id === familyId);
  const ownAgencyName = agencyId === 'own' ? ownedAgency?.name : AGENCIES.find((a) => a.id === agencyId)?.name;
  const otherFamily = FAMILIES[(Number(id.replace(/\D/g, '')) || 0) % FAMILIES.length];
  // A server room's card shows its owner's family on the server (never a demo family).
  const clan = real
    ? ownerFamily
      ? { label: ownerFamily.name, href: `/aile?id=${encodeURIComponent(ownerFamily.id)}` as Href }
      : null
    : isOwn
      ? familyId
        ? { label: ownFamily ? `${ownFamily.emoji} ${ownFamily.name}` : 'Ailem', href: '/aile' as const, ...(ownFamily ? {} : { art: artSource('oda-ailem') }) }
        : ownAgencyName
          ? { label: ownAgencyName, href: '/ajans' as const, art: ROOM_ICON_ART.agency }
          : null
      : base!.agency
        ? { label: 'Ajans odası', href: '/ajans' as const, art: ROOM_ICON_ART.agency }
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
  // In someone else's demo room the host invites me to a mic once per visit while I'm on the Balkon (simulated;
  // never in a server room, where the host is a real person).
  const onBalcony = unlocked && !isOwn && !real && !amSeated && view.balconyIds.includes('me');
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

  // Chat: message settings apply to the Tümü tab.
  const visibleInAll = useCallback(
    (m: FeedMsg) => (msgFilter.bot || !m.bot) && (msgFilter.joins || !(m.system && m.text.includes('odaya girdi'))) && (msgFilter.gifts || kindOf(m) !== 'gift'),
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
      if (real) {
        setPeopleOpen(false);
        return serverMicMute(uid, userById(uid).name, muted);
      }
      const r = setMicMute(id, 'me', uid, muted);
      if (!r.ok) return showAlert('Yapılamadı', r.reason);
      logMod(muted ? 'Mikrofonunu susturdu' : 'Mikrofonunu açtı', userById(uid).name);
    },
    kick: confirmKick,
    profile: (uid) => {
      setPeopleOpen(false);
      openPerson(uid);
    },
    gift: (uid) => {
      setPeopleOpen(false);
      setGiftTo(uid);
      setGiftOpen(true);
    },
    block: (uid) => app.toggleBlock(uid),
    report: (uid) =>
      reporting.start({ type: 'user', id: uid, name: userById(uid).name, note: `Oda: ${title}` }, () => {
        const no = createTicket('Şikâyet', `Kullanıcı şikâyeti: ${userById(uid).name} (${uid}) · oda ${title} (${id})`);
        showAlert('Şikâyet alındı', `Talep numaran #${no}. Durumu Destek ekranından izleyebilirsin.`);
      }),
  };

  // PK end: the result once per viewer, then the crown screen (cancelled PKs have no crowns).
  const pkEnded = lastPk && (lastPk.status === 'done' || lastPk.status === 'cancelled') ? lastPk : null;
  const showPkResult = !!pkEnded && full && !pkStore.seen.includes(pkEnded.id);
  const showCrowns = !!pkEnded && full && pkEnded.status === 'done' && pkStore.seen.includes(pkEnded.id) && !pkStore.seen.includes(`${pkEnded.id}:crowns`);
  const closePkResult = () => {
    if (!pkEnded) return;
    markPkSeen(pkEnded.id);
    if (pkEnded.status !== 'done') markPkSeen(`${pkEnded.id}:crowns`);
  };

  // Minimized: nothing of the room may stay open over other screens (sheets are Modals); a game keeps
  // running minimized. Derived from `full`, so it happens in the same render.
  const [wasFull, setWasFull] = useState(full);
  if (full !== wasFull) {
    setWasFull(full);
    if (full && reopenOnReturn) {
      setPanel(reopenOnReturn);
      setReopenOnReturn(null);
    }
    if (!full) {
      // Left for another screen from a sheet (a menu item, a profile from the card): it opens again on the way back.
      setReopenOnReturn(panel === 'menu' || panel === 'settings' || panel === 'info' ? panel : null);
      setPanel(null);
      setGiftOpen(false);
      setPeopleOpen(false);
      setInboxOpen(false);
      setInviteSeat(null);
      setSheet(null);
      setSeatMenu(null);
      setPerson(null);
      setEmojiOpen(false);
      setPkSetup(false);
      setMoving(null);
      setFlights([]);
      setGiftFx(null);
      setLuckyFx(null);
      setCombo(null);
      setEntry(null);
      setEntryQueue([]);
      if (game) setGameMin(true);
    }
  }
  // Video Odası Gizlilik Koruması: while the room is on screen, this phone blocks screenshots and screen recording.
  const noCapture = full && (real ? !!liveRules?.videoPrivacy : isOwn && myRoom.videoPrivacy);
  useEffect(() => {
    if (!noCapture || Platform.OS === 'web') return;
    const key = `oda-${id}`;
    void ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    return () => void ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
  }, [noCapture, id]);
  // The chat field may hold the keyboard; it must not stay up over the next screen.
  useEffect(() => {
    if (!full) Keyboard.dismiss();
  }, [full]);
  /** Mic-on-but-not-sending, for the mic button and screen readers. */
  const heldHint = block ? `Mikrofonun açık ama şu an ses gitmiyor: ${MIC_BLOCK_LABEL[block]}. Kapatmak için dokun` : undefined;

  // "Küçült" (the chat's fold tab, or a large chat): every mic becomes a small numbered circle in a strip at the
  // top (ten to a row) and the chat takes all the room below it; "Büyüt" brings the mics and the chat back.
  // A team PK keeps its arena (the teams need their sides).
  const [seatsSmall, setSeatsSmall] = useState(() => isLargeChat(getChatShare()));
  const strip = seatsSmall && !teamPk;
  // Classic mics are sized by how many there are: up to 8 guest mics go four to a row, more go five. Each mic
  // takes an equal share of the row and its avatar fills it (sharper faces).
  const seatCols = Math.min(6, allSeats.length - 1 <= 8 ? 4 : 5);
  const seatW = Math.floor((Math.min(win.width, 640) - 16) / seatCols);
  const gridSlot: ArenaSlot = { width: seatW, size: Math.max(34, Math.min(64, seatW - 20)) };
  const small = gridSlot.size < 46;
  // The strip's mics: a tenth of the row each, so ten fit and fewer stay together on the left.
  const stripW = Math.floor((Math.min(win.width, 640) - 16) / 10);
  const stripSlot: ArenaSlot = { width: stripW, size: Math.max(24, Math.min(34, stripW - 8)) };
  // Empty / locked / invite pending / mic on / mic off / muted by the room, per numbered mic.
  const slots = useMemo(() => slotStates(live, (uid) => uid === 'me' && !sending), [live, sending]);
  const renderSeat = (i: number, extra?: { host?: boolean; compact?: boolean; slot?: ArenaSlot; grid?: ArenaSlot; next?: { index: number; gap: number }; mini?: boolean }) => {
    const uid = allSeats[i];
    const link = extra?.next ? micLinkOf(roomBonds, uid, allSeats[extra.next.index]) : null;
    return (
      <Seat
        key={i}
        index={i}
        userId={uid}
        host={extra?.slot ? false : (extra?.host ?? i === 0)}
        small={small}
        vipLevel={uid === 'me' ? vipLevel : (uid ? (lookFor(uid)?.vipLevel ?? 0) : 0)}
        frameId={uid === 'me' ? equipped.frame : uid ? (lookFor(uid)?.frame ?? undefined) : undefined}
        speaking={!!uid && speaking.has(uid)}
        muted={uid === 'me' ? !sending : !!uid && peersMicOff.has(uid)}
        modMuted={!!uid && mutedUsers.has(uid)}
        invitee={!uid && slots[i]?.state === 'invited' && slots[i].invitee ? userById(slots[i].invitee!).name : undefined}
        similarity={uid ? simScores.get(uid) : undefined}
        role={uid ? roleOf(uid) : i === 0 && extra?.host ? 'owner' : undefined}
        locked={!uid && i > 0 && (lockedSeats.includes(i) || (!amSeated && seatAccess(micQueue, myRole) === 'request'))}
        compact={extra?.compact}
        reaction={uid && settings.seatReactions ? reactions[uid] : undefined}
        still={settings.reduceMotion}
        anchorRef={seatAnchor(uid, i)}
        camera={uid === 'me' && camOn}
        teamColor={teamColorOf(uid)}
        pkPoints={pkPointsOf(uid)}
        avatarSize={extra?.slot?.size ?? extra?.grid?.size}
        slotWidth={extra?.slot?.width ?? extra?.grid?.width}
        bondLink={link && extra?.next ? { bond: link, gap: extra.next.gap } : null}
        mini={extra?.mini}
        onPress={() => onSeatPress(i)}
      />
    );
  };

  // The game keeps running while the room is minimized, so it is the one piece rendered in both states.
  // Same root View and a fixed key in both returns, so React keeps the game's state across the switch.
  const gamePanel = game ? (
    <GamePanel
      key="game"
      open={game}
      entry={gameEntry}
      players={gamePlayers}
      hidden={gameMin || !full}
      voice={{ seated: amSeated, micOn, onToggleMic: () => !devicesBusy() && setMicOn((m) => !m) }}
      onSwitch={setGame}
      onMinimize={() => ((menuReturn.current = []), setGameMin(true))}
      onClose={() => (setGame(null), backToMenu())}
      onInvite={(name) => addMsg({ system: true, text: `🎮 ${ME.name} herkesi ${name} masasına davet ediyor! Katılmak için Menü › Oda Oyunları` })}
    />
  ) : null;

  if (!unlocked) return full ? <PasswordGate title={title} password={password} onPass={() => setUnlocked(true)} /> : null;
  // Minimized: the host hides this view, so drawing seats, chat and effects would be wasted work on
  // every room tick. Session, audio and timers live in hooks above and keep running.
  if (!full) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{gamePanel}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StageBackdrop theme={theme} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoid style={{ flex: 1 }}>
          <View style={styles.header}>
            <Pressable onPress={() => setPanel('info')} accessibilityLabel="Oda kartı" hitSlop={4}>
              <Avatar uri={userById(hostId).avatar} size={36} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Pressable onPress={() => setPanel('info')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {!!password && <Ionicons name="lock-closed" size={13} color={colors.textDim} />}
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>Lv.{level}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setPeopleOpen(true)} style={styles.subRow} accessibilityLabel={`${listeners} kişi, ${capacity} mikrofon. Odadaki kullanıcıları aç`}>
                <Ionicons name="people" size={11} color={colors.textDim} />
                <Text style={styles.sub}>{listeners}</Text>
                <Ionicons name="mic" size={11} color={colors.textDim} style={{ marginLeft: 4 }} />
                <Text style={styles.sub}>{capacity}</Text>
                {invisible && <Ionicons name="eye-off" size={11} color={colors.textDim} style={{ marginLeft: 4 }} accessibilityLabel="Gizli giriş" />}
                <Text style={[styles.sub, { flexShrink: 1, marginLeft: 2 }]} numberOfLines={1}>
                  {' · '}
                  {typeInfo.name}
                  {layout ? ` · ${modeById(layout.modeId).name}` : ''}
                  {agencyRoom ? ' · Ajans odası' : ''}
                  {myRank === 3 ? ' · Sahibi' : myRank > 0 ? ` · ${rankLabel('me')}` : ''}
                </Text>
              </Pressable>
            </View>
            {canManage && (micQueue || queue.length > 0) && (
              <Pressable onPress={() => setPanel('requests')} accessibilityLabel={`Konuşma istekleri, ${queue.length} kişi`} hitSlop={6}>
                <Art name="oda-konusmaci-kuyrugu-el-kaldir" size={25} />
                {queue.length > 0 && (
                  <View style={styles.reqBadge}>
                    <Text style={styles.reqBadgeText}>{queue.length}</Text>
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
            {(isOwn || !!liveSettings) && (
              <Pressable onPress={() => setPanel('settings')} accessibilityLabel="Oda ayarları" hitSlop={6}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={closeRoomScreen} hitSlop={10} accessibilityRole="button" accessibilityLabel="Odayı kapat: küçült veya odadan çık">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {/* Stage: boards and mics, in what the chat leaves (the chat keeps the height the person chose, so it never
              jumps when a banner comes or goes); scrolls when taller. While typing the mics stay in view: the stage
              keeps its height and only the chat gives way to the keyboard (down to a strip). */}
          <ScrollView style={typing || strip ? { flexGrow: 0, flexShrink: 1 } : { flex: 1, minHeight: 120 }} onTouchStart={emojiOpen ? () => setEmojiOpen(false) : undefined} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
            {musicEnabled && <MusicBar music={shownMusic} canControl={canControlMusic} onOpen={() => setPanel('music')} onToggle={music$.toggle} onNext={music$.next} />}
            {session && <SessionBanner session={session} />}
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
            {settings.roomMuted && (
              <View style={styles.mutedRow}>
                <ArtText art={ROOM_ICON_ART.soundOff} size={18} style={styles.mutedChip}>
                  Oda sesi senin için kapalı · Ses ayarlarından açabilirsin
                </ArtText>
              </View>
            )}
            {myQueuePos !== null && (
              <View style={[styles.queueChipRow, { backgroundColor: 'rgba(19,217,223,0.35)' }]}>
                <Art name="oda-konusmaci-kuyrugu-el-kaldir" size={18} />
                <Text style={styles.queueChipText}>Konuşmacı kuyruğundasın · sıran: {myQueuePos + 1}{freeSeatIndex < 0 ? ' · mikrofonlar dolu, bekleme listesindesin' : ''}</Text>
              </View>
            )}
            {roomType === 'event' && shownEvents.filter((e) => !e.cancelled)[0] && (
              <Pressable style={styles.eventBanner} onPress={() => setPanel('events')}>
                <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  📅 {shownEvents.filter((e) => !e.cancelled)[0].title} · {shownEvents.filter((e) => !e.cancelled)[0].when}
                </Text>
                <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 12 }}>{shownEvents.filter((e) => !e.cancelled)[0].going ? '✓ Katılıyorsun' : 'Katıl →'}</Text>
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

            {layout?.layoutSchema.content && (
              <RoomScreen
                roomId={id}
                playback={stage?.playback ?? null}
                always={modeById(layout.modeId).content === 'always'}
                canControl={canStage}
                denyReason={stageDeny}
                width={win.width}
                offline={offline}
                onChanged={(text) => addMsg({ system: true, text: `${ME.name}: ${text}` })}
              />
            )}
            {teamPk ? (
              <>
                {bossOn && (
                  <View style={[styles.topRow, { marginTop: 6 }]}>
                    <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
                  </View>
                )}
                <TeamArena pk={teamPk} seats={allSeats} boss={bossId} width={win.width} canManage={canManage && !offline} renderSeat={(i, slot) => renderSeat(i, { slot })} />
              </>
            ) : strip ? (
              <View style={styles.micStrip}>
                {bossOn && <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} mini={stripSlot} />}
                {allSeats.map((_, i) => renderSeat(i, { host: i === 0, grid: stripSlot, mini: true }))}
              </View>
            ) : layout ? (
              <>
                {bossOn && (
                  <View style={[styles.topRow, { marginTop: 6 }]}>
                    <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
                  </View>
                )}
                <StageLayout layout={layout} width={win.width} seats={allSeats} pkRoom={theme === 'pk'} cameraOf={(uid) => uid === 'me' && camOn} renderSeat={(i, slot, next) => renderSeat(i, { slot, next })} />
              </>
            ) : (
              <View style={styles.seatGrid}>
                {bossOn && (
                  <View style={styles.topRow}>
                    {renderSeat(0, { host: true, compact: true })}
                    <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
                  </View>
                )}
                {/* Seat 0 has its own row; the others wrap `seatCols` to a row (equal widths, no gap). */}
                {allSeats.map((_, i) =>
                  bossOn && i === 0
                    ? null
                    : i === 0
                      ? renderSeat(0)
                      : renderSeat(i, { grid: gridSlot, next: i + 1 < allSeats.length && (i - 1) % seatCols !== seatCols - 1 ? { index: i + 1, gap: 0 } : undefined }),
                )}
              </View>
            )}
          </ScrollView>
          {!typing && (
            <BalconyBar
              view={view}
              stale={offline}
              onOpen={() => {
                setInviteSeat(null);
                setPeopleOpen(true);
              }}
            />
          )}

          {/* A touch on the stage or the chat closes the emoji panel (as does the back button). */}
          <ChatFeed messages={messages} visible={visibleInAll} renderItem={renderChat} screenHeight={win.height} fill={typing} onLarge={setSeatsSmall} onTouch={emojiOpen ? () => setEmojiOpen(false) : undefined} />

          {emojiOpen && (
            <EmojiPanel
              onClose={() => setEmojiOpen(false)}
              onAnimate={sendAnim}
              hint={amSeated ? 'Seçtiğin emoji koltuğundaki avatarının üzerinde oynar.' : 'Koltukta değilsin: emoji mesajına eklenir. Mikrofona geçince avatarının üzerinde oynar.'}
              onPick={(e) => {
                if (amSeated) {
                  tapHaptic();
                  react('me', e);
                  // Server room: the others see it over my seat too (lib/live/room-bus 'react').
                  if (real) sendSignal({ t: 'react', emoji: e });
                  setEmojiOpen(false);
                } else if (stickerIdOf(e)) send(e);
                else editDraft((d) => d + e);
              }}
            />
          )}
          {chatMuted || voiceMuted ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 6, gap: 6 }}>
              {chatMuted && <MuteBanner s={chatMuted} text="Yazılı susturma" />}
              {voiceMuted && voiceMuted.id !== chatMuted?.id && <MuteBanner s={voiceMuted} text="Sesli susturma" />}
            </View>
          ) : null}
          <ContactNote text={chatRefused} />
          {mentionPeople.length > 0 && (
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionRow}>
              {mentionPeople.map((u) => (
                <Pressable key={u.id} style={styles.mentionChip} onPress={() => editDraft((d) => insertMention(d, u.name))} accessibilityRole="button" accessibilityLabel={`${u.name} kişisinden bahset`}>
                  <Avatar uri={u.avatar} name={u.name} size={22} />
                  <Text style={styles.mentionName} numberOfLines={1}>
                    {u.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* While typing only the field and a send button stay, so the field is wide; the `&&` slots keep the
              field in the same place in the tree, so it keeps its focus and the keyboard stays up. */}
          <View style={styles.bottom}>
            {!typing && <RoundBtn label="Menü" icon="ellipsis-horizontal" onPress={() => setPanel('menu')} />}
            <View style={styles.inputWrap}>
              <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel={amSeated ? 'Emoji gönder' : 'Emoji ekle'} hitSlop={8}>
                <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={24} color={colors.textDim} />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={editDraft}
                onSubmitEditing={() => send()}
                submitBehavior="submit"
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                editable={!chatBlocked}
                placeholder={chatBlocked ? 'Sohbete yazman kısıtlı' : 'Yaz…'}
                placeholderTextColor={colors.textDim}
                maxLength={300}
                style={styles.input}
                returnKeyType="send"
              />
            </View>
            {typing && (
              <Pressable onPress={() => send()} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel="Gönder" style={[styles.sendBtn, !draft.trim() && { opacity: 0.45 }]}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            )}
            {!typing && roomType === 'qa' && <RoundBtn label="Sorular" icon="help" onPress={() => setPanel('qa')} badge={questions.filter((q) => !q.picked).length} />}
            {!typing && <RoundBtn label="Mesajlar" icon="chatbubble-ellipses" onPress={() => setInboxOpen(true)} badge={inboxUnread} />}
            {/* The mic and "Oda sesi" side by side, small. A speaker keeps the mic while typing; the raise-hand button waits. */}
            {typing && !amSeated ? null : (
              <View style={styles.micGroup}>
                {amSeated ? (
                  <MicBtn
                    state={!micOn ? 'off' : sending ? 'on' : 'held'}
                    caption={block ? HELD_CAPTION[block] : undefined}
                    hint={heldHint}
                    onPress={() => (voiceMuted && !micOn ? showSanction(voiceMuted) : !devicesBusy() && setMicOn((m) => !m))}
                  />
                ) : (
                  <MicBtn state={myQueuePos !== null ? 'queued' : 'hand'} queuePos={myQueuePos ?? undefined} onPress={raiseHand} />
                )}
                {!typing && <RoomSoundBtn muted={settings.roomMuted} onPress={() => setSetting('roomMuted', !settings.roomMuted)} />}
              </View>
            )}
            {!typing && (
              <RoundBtn
                label="Hediye"
                icon="gift"
                gift
                onPress={() => {
                  setGiftTo(null);
                  setGiftOpen(true);
                }}
              />
            )}
          </View>
        </KeyboardAvoid>
      </SafeAreaView>

      {envelope && <EnvelopeDrop from={envelope.from} seconds={envelope.seconds} onGrab={grabEnvelope} />}
      {real && bags.bags.length > 0 && <LuckyBagFloat bags={bags.bags.filter((b) => !blocked.has(b.from.id))} now={bags.now} onOpen={setBagOpen} />}
      {real && bagRain && (
        <LuckyBagRain
          key={bagRain.id}
          bag={bagRain}
          width={win.width}
          height={win.height}
          still={settings.reduceMotion}
          onOpen={(b) => {
            setBagRain(null);
            setBagOpen(b);
          }}
          onDone={() => setBagRain(null)}
        />
      )}

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
        noBag={real}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => (setSheet(null), backToMenu())} />
      {reporting.sheet}
      {roomMute.sheet}
      <InboxSheet visible={inboxOpen} onClose={() => setInboxOpen(false)} />
      <ParticipantsSheet
        visible={peopleOpen}
        onClose={() => {
          setPeopleOpen(false);
          setInviteSeat(null);
          backToMenu();
        }}
        room={live}
        view={view}
        myRole={myRole}
        offline={offline}
        inviteSeat={inviteSeat}
        blocked={blocked}
        hiddenMe={invisible && !amSeated}
        actions={peopleActions}
      />
      <RoomInfoSheet
        key={panel === 'info' ? 'info-open' : 'info-closed'}
        visible={panel === 'info'}
        onClose={closePanel}
        details={cardDetails}
        actions={cardActions}
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
        canManageMembers={isOwn || (real && !!serverMembers?.canManage)}
        autoRemoveDays={isOwn ? myRoom.autoRemoveDays : (liveRules?.autoRemoveDays ?? 0)}
        membership={membership}
        onJoin={joinRoom}
        onApprove={(uid) => {
          if (real) return memberCall('Onaylanamadı', () => api.answerRoomMember(id, toServer(uid) ?? '', true), `🏠 ${userById(uid).name} oda üyesi oldu`);
          if (roomMembers.length >= memberLimit(level)) return showAlert('Üye kapasitesi dolu', `Lv.${level} oda en fazla ${memberLimit(level)} üye alabilir.`);
          setMemberApps((l) => l.filter((x) => x !== uid));
          updateMyRoom({ memberIds: [...myRoom.memberIds, uid] });
          addMsg({ system: true, text: `🏠 ${userById(uid).name} oda üyesi oldu` });
        }}
        onReject={(uid) => (real ? memberCall('Reddedilemedi', () => api.answerRoomMember(id, toServer(uid) ?? '', false)) : setMemberApps((l) => l.filter((x) => x !== uid)))}
        onRemoveMember={(uid) => {
          if (real) return memberCall('Çıkarılamadı', () => api.removeRoomMember(id, toServer(uid) ?? ''), undefined, () => logMod('Oda üyeliğinden çıkardı', userById(uid).name));
          updateMyRoom({ memberIds: myRoom.memberIds.filter((x) => x !== uid) });
          logMod('Oda üyeliğinden çıkardı', userById(uid).name);
        }}
        stats={{ coins: Object.entries(contrib).reduce((sum, [uid, v]) => (uid === 'me' && isOwn ? sum : sum + v), 0), peak, minutes }}
        giftLog={giftLog}
        announcement={announcement ?? ''}
        // Server room: the owner and Süper Yönetici edit the name and bulletin (the server checks the rank).
        canEditText={real && myRank >= 2}
        coverEdit={isOwn || (real && myRank >= 2)}
        onSave={(p) => {
          if (!real) return updateMyRoom(p);
          if (p.coverId !== undefined) return saveLook({ coverId: p.coverId }, 'Oda kapağını değiştirdi');
          const patch = { ...(p.title !== undefined && { title: p.title }), ...(p.announcement !== undefined && { announcement: p.announcement }) };
          if (!Object.keys(patch).length) return;
          updateServerRoom(id, patch)
            .then(() => setRoomEdits((n) => n + 1))
            .catch((e) => showAlert(refusalTitle(e, 'Kaydedilemedi'), errorText(e)));
        }}
        onSettings={fromCard(() => setPanel('settings'))}
        onShare={shareRoom}
        onInvite={() => setPanel('invite')}
        live={real}
      />
        <RoomSettingsScreen
          visible={panel === 'settings'}
          onClose={closePanel}
          room={
            liveSettings
              ? {
                  ...myRoom,
                  micCount: classicCapacity,
                  xp: base!.xp ?? 0,
                  roomType,
                  micPermission,
                  bossSeat: !!liveRules?.bossSeat,
                  joinMode: liveRules?.joinMode ?? 'open',
                  manageMembers: liveRules?.manageMembers ?? 'admins',
                  manageFunctions: functionsBy,
                  autoRemoveDays: liveRules?.autoRemoveDays ?? 0,
                  limit: liveRules?.limit ?? memberLimit(level),
                  profileVisible: liveRules?.profileVisible ?? true,
                  videoPrivacy: !!liveRules?.videoPrivacy,
                  blacklist: (staff.bans ?? []).filter((b) => b.until === null).map((b) => b.uid),
                }
              : myRoom
          }
          live={liveSettings}
          // The room's own settings for my room and the staff of a server room; everyone gets the sections.
          standard={isOwn || !!liveSettings}
          sections={settingsSections}
          update={(p) => {
            if (liveSettings) return saveRules(p);
            if (!isOwn) return;
            updateMyRoom(p);
            const keys = Object.keys(p).filter((k) => k !== 'password');
            if (keys.length) logMod('Oda ayarını değiştirdi', keys.join(', '));
          }}
          level={level}
          vipLevel={GATES.roomLock(nobleTier) ? 1 : 0}
          maxMics={maxMics}
          modLog={modLog}
          bans={real ? (staff.bans ?? []).map((b) => ({ userId: b.uid, until: banLeft(b.until) })) : bans}
          botOn={real ? botOn : settings.roomBot}
          setBot={(v) => (real ? saveLook({ rules: { bot: v } }, v ? 'Oda botunu açtı' : 'Oda botunu kapattı') : setSetting('roomBot', v))}
          layoutLabel={layout ? `${modeById(layout.modeId).name} · ${layout.name}` : `Klasik · ${classicCapacity} mikrofon`}
          classicActive={!layout}
          renderLayouts={layoutSheet}
          onClassicMics={setClassicMics}
        />
      <LayoutPickerSheet
        visible={layoutsOpen}
        onClose={() => (setLayoutsOpen(false), backToMenu())}
        layoutId={stage?.layoutId ?? null}
        modeId={stage?.modeId ?? null}
        info={stageInfo}
        classicLabel={`Klasik düzen · ${classicCapacity} mikrofon`}
        onPick={pickLayout}
      />
      {real ? (
        <LiveMusicSheet
          visible={panel === 'music'}
          onClose={closePanel}
          room={id}
          music={liveMusic}
          np={nowMusic}
          canPlay={canControlMusic}
          enabled={musicEnabled}
          setEnabled={setMusicEnabled}
          volume={musicVolume}
          setVolume={setMusicVolume}
          onDone={(text) => addMsg({ system: true, text })}
        />
      ) : (
      <MusicSheet
        visible={panel === 'music'}
        onClose={closePanel}
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
      )}
      <EnvelopeSendModal visible={panel === 'envelope'} onClose={closePanel} onSend={sendEnvelope} coins={coins} />
      {real && panel === 'bag' && (
        <LuckyBagSheet
          visible
          room={id}
          rules={bags.rules}
          coins={coins}
          svipLevel={svipLevel}
          onClose={closePanel}
          onDropped={(b) => {
            bags.put(b);
            sysNote(`🧧 Şanslı çanta attın: ${bagWhat(b)} · ${b.packets} pay`);
            setBagRain(b);
          }}
        />
      )}
      {bagOpen && <LuckyBagCard bag={bagOpen} now={bags.now} onClose={() => setBagOpen(null)} onChange={bags.put} />}
      <DiceModal visible={panel === 'dice'} onClose={closePanel} onPlay={playDice} playsLeft={dicePlays} />
      <ContributionModal visible={panel === 'contrib'} onClose={closePanel} data={contrib} locked={isOwn && level < 3} />
      <RequestsModal
        visible={panel === 'requests'}
        onClose={closePanel}
        requests={queue}
        freeSeats={allSeats.filter((x, i) => i > 0 && x === null && !lockedSeats.includes(i)).length}
        // Server room: the server seats the person (their phone follows its seat) and takes them off the queue.
        onAccept={(uid) => {
          const user = real ? toServer(uid) : null;
          if (!real) {
            if (placeOnSeat(uid)) setRequests((r) => r.filter((x) => x !== uid));
            return;
          }
          if (!user) return;
          if (freeSeatIndex < 1) return showAlert('Boş mikrofon yok', 'Onaylamak için önce bir mikrofonu boşalt veya kilidini aç.');
          queueCall('Onaylanamadı', { action: 'approve', user, seat: freeSeatIndex }, () => {
            addMsg({ system: true, text: `✅ ${userById(uid).name} ${freeSeatIndex + 1}. mikrofona alındı` });
            logMod('Mikrofon isteğini onayladı', userById(uid).name);
          });
        }}
        onReject={(uid) => {
          const done = () => addMsg({ system: true, text: `${userById(uid).name} adlı kullanıcının konuşma isteği reddedildi` });
          const user = real ? toServer(uid) : null;
          if (!real) return (setRequests((r) => r.filter((x) => x !== uid)), done());
          if (user) queueCall('Reddedilemedi', { action: 'reject', user }, done);
        }}
      />
      <PollCreate
        visible={panel === 'poll'}
        onClose={closePanel}
        onCreate={(question, opts, seconds, live) => {
          setPoll({ id: msgId(), question, options: opts.map((text) => ({ text, votes: 0 })), myVote: null, endsIn: seconds, live, closed: false });
          setPanel(null);
          addMsg({ system: true, text: `📊 Anket başladı: ${question}` });
        }}
      />
      <GoalCreate
        visible={panel === 'goal'}
        onClose={closePanel}
        onCreate={(g) => {
          setGoal({ ...g, id: msgId(), progress: 0 });
          setPanel(null);
          addMsg({ system: true, text: `🎯 Topluluk hedefi: ${g.title} (10 dk)` });
        }}
      />
      <EventsSheet
        visible={panel === 'events'}
        onClose={closePanel}
        events={shownEvents}
        // Server room: activities are for the owner and Süper Yönetici.
        canManage={real ? myRank >= 2 : myRole !== 'member'}
        onCreate={(e) => {
          if (real) {
            if (offlineBlocked()) return;
            return staffAction('Etkinlik eklenemedi', () => api.addRoomEvent(id, e), () => {
              addMsg({ system: true, text: `📅 Yeni etkinlik: ${e.title} · ${e.when}` });
              loadEvents();
            });
          }
          setEvents((l) => [...l, { ...e, id: msgId(), by: isOwn ? 'me' : hostId, going: true, reminder: true, attendees: 0, cancelled: false }]);
          addMsg({ system: true, text: `📅 Yeni etkinlik: ${e.title} · ${e.when}` });
        }}
        onToggleGoing={(eid) => {
          if (real) {
            const e = shownEvents.find((x) => x.id === eid);
            if (e && !offlineBlocked()) staffAction('Kaydedilemedi', () => api.goRoomEvent(Number(eid), !e.going), loadEvents);
            return;
          }
          setEvents((l) => l.map((e) => (e.id === eid ? { ...e, going: !e.going } : e)));
        }}
        onToggleReminder={(eid) => {
          const e = shownEvents.find((x) => x.id === eid);
          if (real) setReminders((l) => (l.includes(Number(eid)) ? l.filter((x) => x !== Number(eid)) : [...l, Number(eid)]));
          else setEvents((l) => l.map((x) => (x.id === eid ? { ...x, reminder: !x.reminder } : x)));
          // One reminder per event (no duplicates); respects the user's notification choices.
          if (e && !e.reminder) notify({ kind: 'social', icon: 'alarm', title: `Hatırlatma kuruldu: ${e.title}`, body: `${e.when} · ${title}`, href: `/oda/${id}` });
        }}
        onCancel={(eid) => {
          const e = shownEvents.find((x) => x.id === eid);
          if (real) {
            if (!e || offlineBlocked()) return;
            return staffAction('İptal edilemedi', () => api.cancelRoomEvent(Number(eid)), () => {
              addMsg({ system: true, text: `❌ Etkinlik iptal edildi: ${e.title}` });
              logMod('Etkinliği iptal etti', e.title);
              loadEvents();
            });
          }
          setEvents((l) => l.map((x) => (x.id === eid ? { ...x, cancelled: true } : x)));
          if (e) {
            addMsg({ system: true, text: `❌ Etkinlik iptal edildi: ${e.title} — katılımcılara bildirildi` });
            logMod('Etkinliği iptal etti', e.title);
          }
        }}
      />
      <QuestionsSheet
        visible={panel === 'qa'}
        onClose={closePanel}
        questions={questions}
        canManage={myRole !== 'member'}
        onAsk={(text) => {
          // A question is public: no contact details (the others check it again when it arrives).
          const refusal = messageRefusal(`room:${id}`, stripMentions(text, roomNamesKey.split('\n')), 'room.chat');
          if (refusal) return showAlert('Soru gönderilemedi', refusal);
          const qid = `q${msgId().replace('.', '')}`;
          if (real && !sendSignal({ t: 'q', id: qid, text })) return showAlert('Soru gönderilemedi', 'Oda bağlantısı yok, biraz sonra tekrar dene.');
          setQuestions((q) => [...q, { id: qid, userId: 'me', text, picked: false }]);
        }}
        onPick={(qid) => {
          const q = questions.find((x) => x.id === qid);
          if (real) sendSignal({ t: 'qpick', id: qid });
          setQuestions((l) => l.map((x) => (x.id === qid ? { ...x, picked: true } : x)));
          if (q) addMsg({ system: true, text: `🎤 Seçilen soru (${userById(q.userId).name}): ${q.text}` });
        }}
      />
      <EffectsSheet
        visible={panel === 'effects'}
        onClose={closePanel}
        settings={settings}
        set={setSetting}
        isOwner={isOwn || (real && myRank === 3)}
        roomFx={{ giftEffects: roomGiftFx }}
        setRoomFx={real ? (p) => saveLook(p, p.giftEffects ? 'Odada hediye efektlerini açtı' : 'Odada hediye efektlerini kapattı') : updateMyRoom}
      />
      <ModerationSheet visible={panel === 'mod'} onClose={closePanel} log={modLog} slowMode={real ? !!liveRules?.slowMode : slowMode} setSlowMode={(v) => (real ? saveLook({ rules: { slowMode: v } }, v ? 'Yavaş modu açtı' : 'Yavaş modu kapattı') : (setSlowMode(v), logMod(v ? 'Yavaş modu açtı' : 'Yavaş modu kapattı', 'Oda')))} words={real ? (liveRules?.words ?? []) : words} setWords={(w) => (real ? saveLook({ rules: { words: w } }, 'Kelime filtresini değiştirdi') : setWords(w))} bans={real ? (staff.bans ?? []).map((b) => ({ userId: b.uid, until: banLeft(b.until) })) : bans} sample={!liveMode()} />
      <ShareRoomSheet
        visible={panel === 'invite'}
        onClose={closePanel}
        friends={friends}
        sent={sharedTo}
        onSend={sendToFriend}
        onExternal={shareExternal}
        followers={canManage ? { count: followerCount(hostId), lastAt: followerInvites[id], onSend: inviteFollowers } : null}
      />
      <RoomMenuSheet visible={panel === 'menu'} onClose={() => setPanel(null)} sections={menuSections.map((sec) => ({ ...sec, items: sec.items.map((it) => (MENU_TOGGLES.has(it.key) ? it : { ...it, onPress: () => (menuReturn.current.push('menu'), it.onPress()) })) }))} />
      <ActionSheet
        visible={panel === 'msgSettings'}
        title="Mesaj ayarları (sadece senin ekranın)"
        onClose={closePanel}
        options={[
          { label: `${msgFilter.joins ? '✅' : '⬜'} Giriş mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, joins: !f.joins })) },
          { label: `${msgFilter.gifts ? '✅' : '⬜'} Hediye mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, gifts: !f.gifts })) },
          { label: `${msgFilter.bot ? '✅' : '⬜'} Bot mesajlarını göster`, onPress: () => setMsgFilter((f) => ({ ...f, bot: !f.bot })) },
        ]}
      />
      <GiftResults visible={panel === 'results'} onClose={closePanel} results={giftResults.rows} reason={giftResults.reason} />
      {visible && (
        <AnimLayer
          roomId={id}
          originOf={originOf}
          lite={settings.lowData}
          off={settings.effectsOff}
          micEffect={{ animationId: app.micFx, active: settings.micAnim && amSeated && sending && !callActive, isSpeaking: () => speakingMe.current }}
        />
      )}
      <PkSetupSheet key={pkSetup ? 'pk-open' : 'pk-closed'} visible={pkSetup} roomId={id} starterId="me" micUsers={view.micIds} offline={offline} onClose={() => (setPkSetup(false), backToMenu())} />
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
      {full && myInvite && !offline && <MicInvitePrompt key={myInvite.id} invite={myInvite} onAnswer={answerMyInvite} />}
      {session && <SessionTestSheet visible={panel === 'session'} session={session} onClose={closePanel} onKickMe={kickMeTest} />}
      <SeatMenu anchor={seatMenu?.anchor ?? null} title={seatMenu?.title} items={seatMenu?.items ?? []} onClose={() => setSeatMenu(null)} />
      {person && (
        <PersonCard
          uid={person.uid}
          note={person.note}
          onClose={() => setPerson(null)}
          onGift={(uid) => (setGiftTo(uid), setGiftOpen(true))}
          onMention={mention}
          onReport={peopleActions.report}
          onManage={person.manage}
        />
      )}
      {moving && (
        <Pressable style={styles.moveBanner} onPress={() => setMoving(null)} accessibilityLabel="Koltuk değiştirmeyi iptal et">
          <Text style={styles.moveText}>{userById(moving).name} için boş bir koltuğa dokun · iptal için buraya dokun</Text>
        </Pressable>
      )}
      {flights.length > 0 && <GiftFlights flights={flights} onDone={(k) => setFlights((f) => f.filter((x) => x.key !== k))} />}
      {gamePanel}
      {game && gameMin && (
        <Pressable style={styles.gameChip} onPress={() => setGameMin(false)} accessibilityLabel="Oyuna dön">
          <Text style={styles.gameChipText}>🎮 Oyun devam ediyor · aç</Text>
        </Pressable>
      )}
      {/* Rüzgâr Gülü shortcut: one tap from the room, only where the Oyun Salonu exists (Cömertlik Lv.2+). It steps
          aside while the emoji panel, the keyboard or a refusal note is up, so it never covers their text. */}
      {full && !game && !combo && !moving && !emojiOpen && !typing && !chatRefused && gamblingLevelOk(app.wealthLevel) && (
        <Pressable style={styles.wheelBtn} onPress={() => (setGame({ kind: 'wheel' }), setGameMin(false))} accessibilityRole="button" accessibilityLabel="Rüzgâr Gülü">
          <View style={styles.wheelDisc}>
            <Ionicons name="compass" size={26} color="#3A2A08" />
          </View>
          <Text style={styles.wheelText}>Rüzgâr Gülü</Text>
        </Pressable>
      )}
      {giftFx &&
        (giftShowOf(giftFx.gift.id) ? (
          <GiftShowFx key={giftFx.key} show={giftShowOf(giftFx.gift.id)!} play={giftFx} lite={settings.lowData} onDone={() => setGiftFx(null)} />
        ) : (
          <GiftAnimation key={giftFx.key} gift={giftFx.gift} onDone={() => setGiftFx(null)} />
        ))}
      {combo && comboGift && (
        <LuckyCombo
          key={`${combo.giftId}-${combo.to.join()}`}
          giftId={combo.giftId}
          emoji={comboGift.emoji}
          name={comboGift.name}
          price={comboGift.price * combo.each * combo.to.length}
          count={combo.count}
          restartKey={combo.key}
          onPress={() => sendLuckyGift(combo.giftId, combo.to, combo.each)}
          onExpire={() => setCombo(null)}
        />
      )}
      {luckyFx && <LuckyResult key={luckyFx[0].txId} records={luckyFx} still={settings.effectsOff || settings.reduceMotion} onDone={() => setLuckyFx(null)} />}
      {/* Platform-wide win announcements (every room shows every win). */}
      {visible && <WinBanner top={110} still={settings.reduceMotion} />}
      {entry && <EntryEffect key={`${entry.name}-${entry.fx}-${entry.avatar}`} show={entry} still={settings.reduceMotion} onDone={nextEntry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  sub: { color: colors.textDim, fontSize: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  levelBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(165,243,245,0.35)', boxShadow: '0 0 8px rgba(19,217,223,0.35)' },
  levelText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  reqBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: colors.red, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  reqBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  moveBanner: { position: 'absolute', left: 12, right: 12, top: 110, backgroundColor: semantic.action, borderRadius: 12, padding: 10, zIndex: 35 },
  moveText: { color: semantic.actionInk, fontWeight: '800', textAlign: 'center', fontSize: 13 },
  gameChip: { position: 'absolute', right: 12, bottom: 96, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, zIndex: 30 },
  gameChipText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
  wheelBtn: { position: 'absolute', right: 10, bottom: 150, alignItems: 'center', gap: 2, zIndex: 30 },
  wheelDisc: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F6BD60', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(246,189,96,0.6)' },
  wheelText: { color: '#fff', fontSize: 10, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  callBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: semantic.success, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  callBannerText: { color: semantic.successInk, fontWeight: '800', flex: 1, fontSize: 13 },
  callBannerGo: { color: semantic.successInk, fontWeight: '900' },
  topRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28 },
  topAvatar: { borderWidth: 2, borderRadius: 14 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 8, rowGap: 10 },
  // Küçült: the mics as one short strip (ten to a row, from the left), the chat takes the rest.
  micStrip: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2, rowGap: 6 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  mentionRow: { gap: 6, paddingHorizontal: 10, paddingTop: 4 },
  mentionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 160, paddingLeft: 3, paddingRight: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  mentionName: { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  micGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  mutedRow: { alignSelf: 'center', marginTop: 4, paddingHorizontal: 12 },
  mutedChip: { color: colors.gold, fontSize: 12, textAlign: 'center' },
  queueChip: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(19,217,223,0.35)', marginHorizontal: 12, marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  queueChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  queueChipText: { color: '#fff', fontSize: 12, flexShrink: 1 },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  inputWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.24)', borderRadius: 999, paddingLeft: 10, height: 48 },
  input: { flex: 1, minWidth: 0, color: '#fff', paddingRight: 14, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
});
