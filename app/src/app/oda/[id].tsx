import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { ChatLine, EntryBanner, GiftAnimation, ListenersModal, MicBtn, PkBar, REACTION_MS, ROLE_RANK, RoundBtn, Seat, type ChatMsg, type Pk, type RoomRole, type SeatReactionData } from '@/components/room/parts';
import { Avatar } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { BOSS_SEAT_MIN_COINS, BOSS_SEAT_MIN_LEVEL, COIN_GAME_TILES, MUSIC_CATALOG, adminCapacity, cosmeticById, memberLimit, micCapacity, roomLevel, roomTypeInfo, ROOM_LEVEL_REWARDS, type Track } from '@/data/catalog';
import { FAMILIES, INCOMING_GIFT_POOL, vipTier } from '@/data/economy';
import { GATES, nobleInfo } from '@/data/status';
import { RULES } from '@/data/rules';
import { BOT_LINES, GIFTS, ME, ROOMS, USERS, roomById, userById, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

const PK_SECONDS = 60;
const DAILY_DICE = 20;
const BOT_TIPS = [
  'Oda kuralları: saygılı ol, spam ve hakaret yok. Şikâyet için ⋯ menüsünü kullan.',
  'Koltuğa geçmek için boş bir koltuğa dokun; bu odada istekle oturuluyor.',
  'Hediyeler yayıncıya elmas olarak yazılır ve oda seviyesini yükseltir.',
];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const msgId = () => String(Date.now() + Math.random());
const QUESTIONS = ['Türkiye\'nin en kalabalık şehri?', 'En sevdiğiniz film hangisi?', 'Yarın etkinlik var mı?', 'Hangi şarkıyı çalalım?', 'Nasıl yönetici olunur?'];
const clock = () => new Date().toTimeString().slice(0, 5);
const pad = (s: (string | null)[], n: number) => (s.length >= n ? s.slice(0, n) : [...s, ...Array<string | null>(n - s.length).fill(null)]);

const BOT_REACTIONS = ['😂', '😍', '👏', '🔥', '😎', '🥳', '❤️', '👍', '😮', '🤣'];

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
  // "Oda işlevlerini yönet": music, polls, goals, events can be limited to the owner.
  const canFunctions = myRole === 'owner' || (myRole === 'admin' && functionsBy === 'admins');
  const botOn = isOwn ? settings.roomBot : true;
  const invisible = settings.invisibleEntry && GATES.invisibleEntry(nobleTier);
  const roomType = isOwn ? myRoom.roomType : (base!.roomType ?? 'free');
  const typeInfo = roomTypeInfo(roomType);
  const lockedSeats = isOwn ? myRoom.lockedSeats : [];
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
    return { text, color: entryItem?.color ?? tier?.color ?? gradient };
  }, [vipLevel, svipLevel, nobleTier, equipped.entry, equipped.ride]);

  const [unlocked, setUnlocked] = useState(!password);
  const [seats, setSeats] = useState<(string | null)[]>(() => pad(isOwn ? ['me'] : base!.seatUserIds, capacity));
  const [micOn, setMicOn] = useState(isOwn);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [kicked, setKicked] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [entry, setEntry] = useState<typeof entryInfo>(() => (invisible || settings.effectsOff ? null : entryInfo));
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 'w', system: true, text: 'Odaya hoş geldin! Saygılı ol, iyi eğlenceler 💜' },
    ...(announcement ? [{ id: 'ann', system: true, text: `📢 ${announcement}` }] : []),
    ...(botOn ? [{ id: 'bot0', bot: true, text: `Merhaba ${ME.name}! ${BOT_TIPS[0]}` }] : []),
    ...(entryInfo && !invisible ? [{ id: 'vip', system: true, text: entryInfo.text }] : []),
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
  const [listeners, setListeners] = useState(isOwn ? 1 : base!.listeners);
  const [listOpen, setListOpen] = useState(false);
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
  const [pk, setPk] = useState<Pk | null>(null);
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
  const mySeat = allSeats.indexOf('me');
  const amSeated = mySeat >= 0 || bossId === 'me';
  const seatedOthers = allSeats.filter((s): s is string => !!s && s !== 'me');
  const seatedKey = [...seatedOthers, bossId && bossId !== 'me' ? bossId : ''].join(',');
  const audience = USERS.filter((u) => !allSeats.includes(u.id) && !kicked.has(u.id) && !blocked.has(u.id));
  const canControlMusic = canFunctions;

  const mask = (text: string) => words.reduce((t, w) => t.replace(new RegExp(w, 'gi'), '***'), text);
  const addMsg = (msg: Omit<ChatMsg, 'id'>) => setMessages((m) => [...m.slice(-80), { ...msg, text: msg.userId ? mask(msg.text) : msg.text, id: msgId() }]);
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

  useEffect(() => {
    if (!entry) return;
    const t = setTimeout(() => setEntry(null), 3500);
    return () => clearTimeout(t);
  }, [entry]);

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

  // Seat emoji: plays over the sender's avatar, then clears itself (unless replaced by a newer one).
  const react = (uid: string, emoji: string) => {
    const key = Date.now() + Math.random();
    setReactions((r) => ({ ...r, [uid]: { emoji, key } }));
    setTimeout(() => setReactions((r) => (r[uid]?.key === key ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== uid)) : r)), REACTION_MS);
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

  // Fake chat, joins and (in other rooms) other people's gifts.
  useEffect(() => {
    const t = setInterval(() => {
      const u = pick(USERS);
      if (kicked.has(u.id) || blocked.has(u.id)) return;
      if (slowMode && Math.random() < 0.6) return;
      const r = Math.random();
      if (r < 0.25) {
        setListeners((n) => (isOwn ? Math.min(myRoom.limit, n + 1) : n + 1));
        addMsg({ system: true, text: `${u.name} odaya katıldı${isOwn && myRoom.joinSounds ? ' 🔔' : ''}` });
        gainXp(5);
        setGoal((g) => (g && g.kind === 'join' ? { ...g, progress: g.progress + 1 } : g));
      } else if (r < 0.3) {
        setGoal((g) => (g && g.kind === 'like' ? { ...g, progress: g.progress + 1 } : g));
        addMsg({ system: true, text: `❤️ ${u.name} odayı beğendi` });
      } else if (r < 0.35 && !isOwn) {
        const g = pick(GIFTS.slice(0, 5));
        addContrib(u.id, g.price);
        logGift(u.id, hostId, g, 1);
        addMsg({ system: true, text: `🎁 ${u.name}, ${userById(hostId).name} kişisine ${g.emoji} ${g.name} gönderdi` });
      } else {
        addMsg({ userId: u.id, text: pick(BOT_LINES) });
      }
    }, 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kicked, blocked, slowMode, words]);

  // Own room: listeners send gifts (host earns diamonds, room earns XP) and ask to speak.
  useEffect(() => {
    if (!isOwn) return;
    const gifts = setInterval(() => {
      const from = pick(USERS);
      const gift = GIFTS.find((g) => g.price === pick(INCOMING_GIFT_POOL)) ?? GIFTS[0];
      receiveDiamonds(gift.price, 'Hediye', from.id);
      // Owner bonus is calculated separately and never reduces the streamer's earnings.
      const ownerBonus = Math.round(gift.price * RULES.roomOwnerBonus);
      if (ownerBonus > 0) receiveDiamonds(ownerBonus, 'Oda sahibi bonusu', from.id);
      gainXp(gift.price);
      addContrib(from.id, gift.price);
      logGift(from.id, 'me', gift, 1);
      if (gift.price >= 50 && showFx(gift.price)) setGiftFx(gift);
      addMsg({ system: true, text: `🎁 ${from.name} sana ${gift.emoji} ${gift.name} gönderdi! (+${gift.price} 💎)` });
      setPk((p) => (p?.phase === 'live' ? { ...p, ours: p.ours + gift.price } : p));
    }, 6000);
    const reqs = setInterval(() => {
      setRequests((r) => {
        if (r.length >= 4) return r;
        const u = pick(USERS.filter((x) => !r.includes(x.id)));
        return u ? [...r, u.id] : r;
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
  if (myQueuePos === 0 && freeSeatIndex > 0) {
    // Derived transition: my turn came and a mic is free.
    setMyQueuePos(null);
    setSeats((st) => pad(st, capacity).map((x, i) => (i === freeSeatIndex ? 'me' : x)));
    setMicOn(true);
    setMessages((m) => [...m, { id: msgId(), system: true, text: `✅ Sıran geldi: ${freeSeatIndex + 1}. mikrofona geçtin` }]);
  }

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

  // PK: invite -> countdown -> live -> done.
  const pkPhase = pk?.phase;
  useEffect(() => {
    if (pkPhase !== 'countdown' && pkPhase !== 'live') return;
    const t = setInterval(() => {
      setPk((p) => {
        if (!p) return p;
        if (p.phase === 'countdown') return p.left > 1 ? { ...p, left: p.left - 1 } : { ...p, phase: 'live', left: PK_SECONDS };
        if (p.phase !== 'live') return p;
        const theirs = p.theirs + (Math.random() < 0.5 ? pick(INCOMING_GIFT_POOL) : 0);
        const ours = p.ours + (Math.random() < 0.3 ? pick(INCOMING_GIFT_POOL) : 0);
        if (p.left > 1) return { ...p, left: p.left - 1, theirs, ours };
        return { ...p, left: 0, theirs, ours, phase: 'done', result: ours > theirs ? 'win' : ours < theirs ? 'lose' : 'draw' };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pkPhase]);
  const pkResult = pk?.result;
  useEffect(() => {
    if (pkPhase !== 'done') return;
    const t = setTimeout(() => {
      if (pkResult === 'win') gainXp(300);
      setPk(null);
    }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkPhase, pkResult]);

  const startPk = () => {
    const opponent = pick(ROOMS.filter((r) => r.id !== id));
    setPk({ opponent, ours: 0, theirs: 0, left: 0, phase: 'inviting' });
    addMsg({ system: true, text: `📨 PK daveti gönderildi: ${opponent.title}` });
    setTimeout(() => {
      setPk((p) => (p ? { ...p, phase: 'countdown', left: 3 } : p));
      addMsg({ system: true, text: `⚔️ ${opponent.title} daveti kabul etti! Tur süresi ${PK_SECONDS} sn · hediye puanı x1` });
    }, 2000);
  };
  const mvp = pk?.phase === 'done' ? Object.entries(contrib).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;

  // --- Seat actions ------------------------------------------------------------
  const placeOnSeat = (userId: string) => {
    if (allSeats.includes(userId)) return showAlert('Zaten koltukta', `${userById(userId).name} zaten mikrofonda.`);
    const free = allSeats.findIndex((s, i) => i > 0 && s === null);
    if (free < 0) return showAlert('Boş koltuk yok', `Bu oda ${capacity} mikrofonlu.`);
    setSeats((s) => pad(s, capacity).map((x, i) => (i === free ? userId : x)));
    addMsg({ system: true, text: `${userById(userId).name} ${free + 1}. koltuğa oturdu` });
  };
  const removeFromSeat = (userId: string) => setSeats((s) => pad(s, capacity).map((x) => (x === userId ? null : x)));
  const sitMe = (index: number) => {
    setSeats((s) => pad(s, capacity).map((x, i) => (i === index ? 'me' : x === 'me' ? null : x)));
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
  const onSeatPress = (index: number) => {
    const uid = allSeats[index];
    if (uid === 'me') {
      if (isOwn) return;
      showAlert('Koltuktan in', 'Dinleyici olarak devam etmek ister misin?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İn', onPress: () => removeFromSeat('me') },
      ]);
      return;
    }
    if (uid) {
      const u = userById(uid);
      const targetRole = roleOf(uid);
      const options: SheetOption[] = [
        { label: '👤 Profili gör', onPress: () => router.push(`/kullanici/${uid}`) },
        {
          label: '🎁 Hediye gönder',
          onPress: () => {
            setGiftTo(uid);
            setGiftOpen(true);
          },
        },
        { label: '💬 Mesaj gönder', onPress: () => router.push(`/sohbet/${uid}`) },
      ];
      if (myRole !== 'member') {
        if (ROLE_RANK[myRole] > ROLE_RANK[targetRole]) {
          const muted = mutedUsers.has(uid);
          options.push(
            {
              label: muted ? '🔊 Sesini aç' : '🔇 Sustur',
              onPress: () => {
                setMutedUsers((m) => {
                  const n = new Set(m);
                  if (muted) n.delete(uid);
                  else n.add(uid);
                  return n;
                });
                logMod(muted ? 'Sesini açtı' : 'Susturdu', u.name);
              },
            },
            {
              label: '⬇️ Mikrofondan indir',
              onPress: () => {
                removeFromSeat(uid);
                addMsg({ system: true, text: `${u.name} mikrofondan indirildi` });
                logMod('Mikrofondan indirdi', u.name);
              },
            },
          );
          if (myRole === 'owner') {
            const isAdmin = adminIds.includes(uid);
            options.push(
              {
                label: isAdmin ? '🛡️ Yöneticilikten al' : '🛡️ Yönetici yap',
                onPress: () => {
                  if (!isAdmin && adminIds.length >= adminCapacity(level)) return showAlert('Yönetici kontenjanı dolu', `Lv.${level} odada en fazla ${adminCapacity(level)} yönetici olabilir.`);
                  updateMyRoom({ adminIds: isAdmin ? adminIds.filter((x) => x !== uid) : [...adminIds, uid] });
                  logMod(isAdmin ? 'Yöneticilikten aldı' : 'Yönetici atadı', u.name);
                  addMsg({ system: true, text: isAdmin ? `${u.name} artık yönetici değil` : `🛡️ ${u.name} oda yöneticisi oldu` });
                },
              },
              {
                label: '⛔ Kara listeye ekle (kalıcı)',
                destructive: true,
                onPress: () => {
                  removeFromSeat(uid);
                  setKicked((k) => new Set(k).add(uid));
                  updateMyRoom({ blacklist: [...new Set([...myRoom.blacklist, uid])], memberIds: myRoom.memberIds.filter((x) => x !== uid) });
                  addMsg({ system: true, text: `${u.name} oda kara listesine eklendi` });
                  logMod('Kara listeye ekledi', u.name, 'kalıcı');
                },
              },
              {
                label: '🚫 Odadan çıkar (10 dk giriş yasağı)',
                destructive: true,
                onPress: () => {
                  removeFromSeat(uid);
                  setKicked((k) => new Set(k).add(uid));
                  setBans((b) => [...b.filter((x) => x.userId !== uid), { userId: uid, until: '10 dk' }]);
                  addMsg({ system: true, text: `${u.name} odadan çıkarıldı · 10 dk giriş yasağı (denetim kaydına yazıldı)` });
                  logMod('Odadan çıkardı', u.name, '10 dk giriş yasağı');
                },
              },
            );
          }
        } else {
          options.push({
            label: '🔒 Üst role müdahale edilemez',
            onPress: () => {
              logMod('Reddedilen deneme: üst role müdahale', u.name);
              showAlert('Yetki yok', `${targetRole === 'owner' ? 'Oda sahibini' : 'Aynı veya üst rolü'} susturamaz ya da mikrofondan indiremezsin. Bu deneme denetim kaydına yazıldı.`);
            },
          });
        }
      }
      setSheet({ title: `${u.name} · ${targetRole === 'owner' ? 'Oda sahibi' : targetRole === 'admin' ? 'Yönetici' : 'Üye'}`, options });
      return;
    }
    if (index === 0) return;
    if (isOwn) {
      const locked = lockedSeats.includes(index);
      setSheet({
        title: `${index + 1}. mikrofon`,
        options: [
          { label: locked ? '🔓 Kilidi aç' : '🔒 Mikrofonu kilitle', onPress: () => updateMyRoom({ lockedSeats: locked ? lockedSeats.filter((x) => x !== index) : [...lockedSeats, index] }) },
          { label: '👥 Dinleyicilerden davet et', onPress: () => setListOpen(true) },
        ],
      });
      return;
    }
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
    if (myQueuePos !== null) return showAlert('Sıradasın', `Konumun: ${myQueuePos + 1}. Sıradan çıkmak için menüyü kullan.`);
    const pos = rollDie() % 3 + 1;
    setMyQueuePos(pos);
    addMsg({ system: true, text: `🙋 Konuşmacı kuyruğuna katıldın · sıran: ${pos + 1}` });
  };

  // The big mic button for a listener (Discord Stage style): take a free mic, or raise a hand when all are taken.
  const raiseHand = () => {
    if (freeSeatIndex > 0) return isOwn ? sitMe(freeSeatIndex) : onSeatPress(freeSeatIndex);
    if (myRole === 'member' && micPermission === 'members' && membership !== 'member') return onSeatPress(1);
    joinQueue();
  };

  // --- Chat, gifts, games ---------------------------------------------------------
  const send = () => {
    if (!draft.trim()) return;
    addMsg({ userId: 'me', text: draft.trim() });
    setDraft('');
    setEmojiOpen(false);
    gainXp(2);
  };

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
    setPk((p) => (p?.phase === 'live' ? { ...p, ours: p.ours + total } : p));
    addMsg({ system: true, text: `🎁 ${ME.name}, ${delivered.length > 1 ? `${delivered.length} kişiye` : `${userById(delivered[0].userId).name} kişisine`} ${gift.emoji} ${gift.name} x${count} gönderdi!` });
    if (toIds.length > 1 || delivered.length < toIds.length) {
      setGiftResults(results);
      setPanel('results');
    }
  };

  const sendGift = (gift: Gift, toIds: string[], count: number, confirmed = false) => {
    setGiftOpen(false);
    const total = gift.price * count * toIds.length;
    // The gift sheet asks for high-value confirmation itself; other callers still get the dialog.
    if (!confirmed && total >= settings.bigSpendConfirm) {
      showAlert('Yüksek tutarlı gönderim', `${toIds.length} alıcıya toplam 🪙 ${total.toLocaleString('tr-TR')} gönderilecek. Onaylıyor musun?`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Onayla ve gönder', onPress: () => deliverGifts(gift, toIds, count) },
      ]);
      return;
    }
    deliverGifts(gift, toIds, count);
  };

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

  const shareRoom = () => Share.share({ message: `Similar Club'da "${title}" odasına gel! 🎙️ similarclub://oda/${id}` }).catch(() => {});

  const report = () => {
    const no = createTicket('Şikâyet', `Oda şikâyeti: ${title} (${id})`);
    showAlert('Şikâyet alındı', `Talep numaran #${no}. Durumu Destek ekranından izleyebilirsin.`);
  };
  const toGames = () => router.push('/oyunlar');
  const menuSections: MenuSection[] = [
    {
      title: 'Etkileşimli Oyunlar',
      variant: 'round',
      items: [
        ...(isOwn && !pk ? [{ key: 'pk', label: 'PK Modu', emoji: '⚔️', colors: ['#EC4899', '#7C3AED'] as [string, string], onPress: startPk }] : []),
        { key: 'env', label: 'Şanslı çanta', emoji: '🧧', colors: ['#B91C1C', '#F59E0B'], onPress: () => setPanel('envelope') },
        { key: 'dice', label: 'Zar Düellosu', emoji: '🎲', colors: ['#2563EB', '#7C3AED'], onPress: () => setPanel('dice') },
        { key: 'wheel', label: 'Şans çarkı', emoji: '🎡', colors: ['#F59E0B', '#DB2777'], onPress: () => router.push('/cark') },
        { key: 'tasks', label: 'Merkez görevi', emoji: '📋', colors: ['#6366F1', '#A78BFA'], onPress: () => router.push('/gorevler') },
        { key: 'events', label: 'Aktivite', emoji: '🎉', colors: ['#8B5CF6', '#EC4899'], onPress: () => setPanel('events') },
        ...(canFunctions
          ? [
              { key: 'poll', label: 'Anket', emoji: '📊', colors: ['#0EA5E9', '#2563EB'] as [string, string], onPress: () => setPanel('poll') },
              { key: 'goal', label: 'Topluluk hedefi', emoji: '🎯', colors: ['#16A34A', '#0D9488'] as [string, string], onPress: () => setPanel('goal') },
            ]
          : []),
        ...(roomType === 'qa' ? [{ key: 'qa', label: 'Sorular', emoji: '❓', colors: ['#F97316', '#DC2626'] as [string, string], onPress: () => setPanel('qa'), badge: questions.filter((q) => !q.picked).length }] : []),
        { key: 'music', label: 'Müzik', emoji: '🎵', colors: ['#DB2777', '#9333EA'], onPress: () => setPanel('music') },
      ],
    },
    {
      title: 'Jetonlu Oyunlar',
      variant: 'tile',
      note: GATES.games(svipLevel, nobleTier) ? 'Sonuçlar oyun sağlayıcısı tarafından doğrulanır · jeton harcaması günlük limitine dahildir' : 'SVIP 2 veya Asil Vikont ile açılır · katalog önizleme',
      items: COIN_GAME_TILES.map((g) => ({ key: g.id, label: g.name, emoji: g.emoji, colors: g.colors, badge: g.badge, onPress: toGames })),
    },
    {
      title: 'Oda Araçları',
      variant: 'tool',
      items: [
        { key: 'card', label: 'Oda kartı', icon: 'home-outline', onPress: () => setPanel('info') },
        ...(isOwn ? [{ key: 'settings', label: 'Oda ayarları', icon: 'settings-outline' as const, onPress: () => setPanel('settings') }] : []),
        ...(myRole !== 'member' ? [{ key: 'mod', label: 'Moderasyon', icon: 'shield-checkmark-outline' as const, onPress: () => setPanel('mod') }] : []),
        { key: 'invite', label: 'Arkadaş davet et', icon: 'person-add-outline', onPress: () => setPanel('invite') },
        { key: 'listeners', label: 'Dinleyiciler', icon: 'people-outline', onPress: () => setListOpen(true) },
        { key: 'contrib', label: 'Katkı sıralaması', icon: 'trophy-outline', onPress: () => setPanel('contrib') },
        ...(myQueuePos !== null ? [{ key: 'queue', label: 'Kuyruktan çık', icon: 'exit-outline' as const, onPress: () => setMyQueuePos(null) }] : []),
        { key: 'report', label: 'Odayı şikâyet et', icon: 'flag-outline', onPress: report },
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

  if (!unlocked) return <PasswordGate title={title} password={password} onPass={() => setUnlocked(true)} />;

  const small = capacity > 10;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} blurRadius={25} />
      <LinearGradient colors={['rgba(18,11,36,0.55)', 'rgba(18,11,36,0.97)']} style={StyleSheet.absoluteFill} />

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
              <Pressable onPress={() => setListOpen(true)}>
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

          {musicEnabled && <MusicBar music={music} canControl={canControlMusic} onOpen={() => setPanel('music')} onToggle={music$.toggle} onNext={music$.next} />}
          {pk && <PkBar pk={{ ...pk, mvp }} roomTitle={title} />}
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

          <View style={styles.seatGrid}>
            {bossOn && (
              <View style={styles.topRow}>
                <Seat
                  index={0}
                  userId={allSeats[0]}
                  host
                  small={small}
                  vipLevel={allSeats[0] === 'me' ? vipLevel : 0}
                  frameId={allSeats[0] === 'me' ? equipped.frame : undefined}
                  speaking={!!allSeats[0] && speaking.has(allSeats[0])}
                  muted={allSeats[0] === 'me' ? !micOn : !!allSeats[0] && mutedUsers.has(allSeats[0])}
                  role="owner"
                  compact
                  reaction={allSeats[0] ? reactions[allSeats[0]] : undefined}
                  still={settings.reduceMotion}
                  onPress={() => onSeatPress(0)}
                />
                <BossSeat userId={bossId} speaking={!!bossId && speaking.has(bossId)} onPress={onBossPress} />
              </View>
            )}
            {allSeats.map((uid, i) => bossOn && i === 0 ? null : (
              <Seat
                key={i}
                index={i}
                userId={uid}
                host={i === 0}
                small={small}
                vipLevel={uid === 'me' ? vipLevel : 0}
                frameId={uid === 'me' ? equipped.frame : undefined}
                speaking={!!uid && speaking.has(uid)}
                muted={uid === 'me' ? !micOn : !!uid && mutedUsers.has(uid)}
                role={uid ? roleOf(uid) : undefined}
                locked={!uid && i > 0 && (lockedSeats.includes(i) || (myRole === 'member' && !amSeated && !freeMic))}
                reaction={uid ? reactions[uid] : undefined}
                still={settings.reduceMotion}
                onPress={() => onSeatPress(i)}
              />
            ))}
          </View>

          <FlatList
            style={{ flex: 1, marginHorizontal: 12 }}
            data={[...messages]
              .filter((m) => (msgFilter.bot || !m.bot) && (msgFilter.joins || !(m.system && m.text.includes('odaya katıldı'))) && (msgFilter.gifts || !(m.system && m.text.startsWith('🎁'))))
              .reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatLine msg={item} bubbleId={equipped.bubble} />}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          />

          {emojiOpen && (
            <EmojiPanel
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
            {amSeated ? (
              <MicBtn state={micOn ? 'on' : 'off'} onPress={() => setMicOn((m) => !m)} />
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
        recipients={allSeats.filter((s): s is string => !!s && s !== 'me')}
        initialTo={giftTo}
        coins={coins}
        onSend={sendGift}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <ListenersModal
        visible={listOpen}
        onClose={() => setListOpen(false)}
        users={audience}
        canInvite={myRole !== 'member'}
        onInvite={(uid) => placeOnSeat(uid)}
        total={listeners}
        invisibleMe={invisible}
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
        stats={{ coins: Object.entries(contrib).reduce((sum, [uid, v]) => (uid === 'me' && isOwn ? sum : sum + v), 0), peak: listeners, minutes }}
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
          setRequests((r) => r.filter((x) => x !== uid));
          placeOnSeat(uid);
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
      {giftFx && <GiftAnimation gift={giftFx} onDone={() => setGiftFx(null)} />}
      {entry && <EntryBanner text={entry.text} color={entry.color} />}
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
  topRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28 },
  topAvatar: { borderWidth: 2, borderRadius: 14 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 8, rowGap: 10 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mutedChip: { color: colors.gold, fontSize: 12, textAlign: 'center', marginTop: 4 },
  queueChip: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(139,92,246,0.35)', marginHorizontal: 12, marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  inputWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingLeft: 10, height: 48 },
  input: { flex: 1, minWidth: 0, color: '#fff', paddingRight: 14, paddingVertical: 10, fontSize: 15 },
});
