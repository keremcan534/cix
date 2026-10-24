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
  SettingsModal,
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
import { ChatLine, EntryBanner, GiftAnimation, GiftSheet, ListenersModal, PkBar, ROLE_RANK, RoundBtn, Seat, type ChatMsg, type Pk, type RoomRole } from '@/components/room/parts';
import { Avatar } from '@/components/ui';
import { MUSIC_CATALOG, adminCapacity, cosmeticById, micCapacity, roomLevel, roomTypeInfo, ROOM_LEVEL_REWARDS, type Track } from '@/data/catalog';
import { INCOMING_GIFT_POOL, VIP_ENTRY_LEVEL, VIP_INVISIBLE_LEVEL, vipTier } from '@/data/economy';
import { RULES } from '@/data/rules';
import { BOT_LINES, GIFTS, ME, ROOMS, USERS, roomById, userById, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
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
const pad = (s: (string | null)[], n: number) => (s.length >= n ? s.slice(0, n) : [...s, ...Array<string | null>(n - s.length).fill(null)]);

export default function VoiceRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isOwn = id === 'yeni';
  const app = useApp();
  const { coins, spendCoins, addCoins, receiveDiamonds, bump, vipLevel, blocked, settings, setSetting, equipped, myRoom, updateMyRoom, addRoomXp, agencyId, createTicket, visitRoom, addFanPoints, following, notify } = app;

  const base = isOwn ? null : roomById(id);
  const hostId = isOwn ? 'me' : base!.hostId;
  const title = isOwn ? myRoom.title : base!.title;
  const cover = isOwn ? myRoom.cover : base!.cover;
  const announcement = isOwn ? myRoom.announcement : base!.announcement;
  const password = isOwn ? '' : (base!.password ?? '');
  const level = isOwn ? roomLevel(myRoom.xp) : (base!.level ?? 1);
  const agencyRoom = isOwn ? !!agencyId : !!base!.agency;
  const capacity = micCapacity(agencyRoom, level);
  const adminIds = isOwn ? myRoom.adminIds : (base!.adminIds ?? []);
  const myRole: RoomRole = isOwn ? 'owner' : adminIds.includes('me') ? 'admin' : 'member';
  const roleOf = (uid: string): RoomRole => (uid === hostId ? 'owner' : adminIds.includes(uid) ? 'admin' : 'member');
  const botOn = isOwn ? settings.roomBot : true;
  const invisible = settings.invisibleEntry && vipLevel >= VIP_INVISIBLE_LEVEL;
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
    if (!entryItem && !ride && (!tier || tier.level < VIP_ENTRY_LEVEL)) return null;
    const who = `${tier ? `${tier.emoji} VIP${tier.level} ` : ''}${ME.name}`;
    const text = `${entryItem?.emoji ?? '✨'} ${ride ? `${ride.emoji} ${ride.name} ile ` : ''}${who} odaya katıldı!`;
    return { text, color: entryItem?.color ?? tier?.color ?? gradient };
  }, [vipLevel, equipped.entry, equipped.ride]);

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
    ...(invisible ? [{ id: 'inv', system: true, text: '👻 Gizli girişle girdin. Diğer kullanıcılar katıldığını görmez; moderasyon kayıtlarında görünürsün.' }] : []),
  ]);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const [giftFx, setGiftFx] = useState<Gift | null>(null);
  const [listeners, setListeners] = useState(isOwn ? 1 : base!.listeners);
  const [listOpen, setListOpen] = useState(false);
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[] } | null>(null);
  const [panel, setPanel] = useState<null | 'settings' | 'music' | 'envelope' | 'dice' | 'contrib' | 'requests' | 'poll' | 'goal' | 'events' | 'qa' | 'sound' | 'mod' | 'invite' | 'results'>(null);
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
  const [contrib, setContrib] = useState<Record<string, number>>({});
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
  const mySeat = allSeats.indexOf('me');
  const amSeated = mySeat >= 0;
  const seatedOthers = allSeats.filter((s): s is string => !!s && s !== 'me');
  const seatedKey = seatedOthers.join(',');
  const audience = USERS.filter((u) => !allSeats.includes(u.id) && !kicked.has(u.id) && !blocked.has(u.id));
  const canControlMusic = myRole !== 'member';

  const mask = (text: string) => words.reduce((t, w) => t.replace(new RegExp(w, 'gi'), '***'), text);
  const addMsg = (msg: Omit<ChatMsg, 'id'>) => setMessages((m) => [...m.slice(-80), { ...msg, text: msg.userId ? mask(msg.text) : msg.text, id: msgId() }]);
  const logMod = (action: string, target: string, reason = '') =>
    setModLog((l) => [{ id: msgId(), time: new Date().toTimeString().slice(0, 5), actor: myRole === 'owner' ? 'Sahip (sen)' : 'Yönetici (sen)', action, target, reason }, ...l]);
  const addContrib = (uid: string, n: number) => setContrib((c) => ({ ...c, [uid]: (c[uid] ?? 0) + n }));

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
    if (amSeated || myRole !== 'member') return sitMe(index);
    if (freeMic) return sitMe(index);
    // Stage-style rooms: join the speaker queue and see my position.
    if (myQueuePos !== null) return showAlert('Sıradasın', `Konumun: ${myQueuePos + 1}. Sıradan çıkmak için menüyü kullan.`);
    const pos = rollDie() % 3 + 1;
    setMyQueuePos(pos);
    addMsg({ system: true, text: `🙋 Konuşmacı kuyruğuna katıldın · sıran: ${pos + 1}` });
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
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    const total = each * delivered.length;
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

  const sendGift = (gift: Gift, toIds: string[], count: number) => {
    setGiftOpen(false);
    const total = gift.price * count * toIds.length;
    if (total >= settings.bigSpendConfirm) {
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

  const moreMenu = () =>
    setSheet({
      title,
      options: [
        { label: '🎵 Müzik', onPress: () => setPanel('music') },
        ...(myRole !== 'member' ? [{ label: '📊 Anket başlat', onPress: () => setPanel('poll') }, { label: '🎯 Topluluk hedefi', onPress: () => setPanel('goal') }] : []),
        { label: '📅 Etkinlikler', onPress: () => setPanel('events') },
        ...(roomType === 'qa' ? [{ label: '❓ Sorular', onPress: () => setPanel('qa') }] : []),
        { label: '🔊 Ses ve efekt ayarları', onPress: () => setPanel('sound') },
        ...(myRole !== 'member' ? [{ label: '🛡️ Moderasyon', onPress: () => setPanel('mod') }] : []),
        { label: '📨 Arkadaş davet et', onPress: () => setPanel('invite') },
        ...(myQueuePos !== null ? [{ label: '🚶 Konuşmacı kuyruğundan çık', onPress: () => setMyQueuePos(null) }] : []),
        { label: '🎲 Zar Düellosu', onPress: () => setPanel('dice') },
        { label: '🧧 Zarf dağıt', onPress: () => setPanel('envelope') },
        { label: '🎰 Şans çarkı', onPress: () => router.push('/cark') },
        ...(isOwn && !pk ? [{ label: '⚔️ PK daveti gönder', onPress: startPk }] : []),
        ...(isOwn ? [{ label: '⚙️ Oda ayarları', onPress: () => setPanel('settings') }] : []),
        { label: '👥 Dinleyiciler', onPress: () => setListOpen(true) },
        { label: '🏆 Katkı sıralaması', onPress: () => setPanel('contrib') },
        { label: '🔗 Odayı paylaş', onPress: () => Share.share({ message: `Vibe Club'da "${title}" odasına gel! 🎙️ vibeclub://oda/${id}` }).catch(() => {}) },
        {
          label: '🚩 Odayı şikâyet et',
          onPress: () => {
            const no = createTicket('Şikâyet', `Oda şikâyeti: ${title} (${id})`);
            showAlert('Şikâyet alındı', `Talep numaran #${no}. Durumu Destek ekranından izleyebilirsin.`);
          },
        },
      ],
    });

  if (!unlocked) return <PasswordGate title={title} password={password} onPass={() => setUnlocked(true)} />;

  const small = capacity > 10;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} blurRadius={25} />
      <LinearGradient colors={['rgba(18,11,36,0.55)', 'rgba(18,11,36,0.97)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Avatar uri={userById(hostId).avatar} size={36} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {password ? '🔒 ' : ''}
                  {title}
                </Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>Lv.{level}</Text>
                </View>
              </View>
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
            {allSeats.map((uid, i) => (
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
                onPress={() => onSeatPress(i)}
              />
            ))}
          </View>

          <FlatList
            style={{ flex: 1, marginHorizontal: 12 }}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatLine msg={item} bubbleId={equipped.bubble} />}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          />

          {emojiOpen && <EmojiPanel onPick={(e) => setDraft((d) => d + e)} />}
          <View style={styles.bottom}>
            <Pressable onPress={() => setEmojiOpen((v) => !v)} accessibilityLabel="Emoji" hitSlop={6}>
              <Ionicons name={emojiOpen ? 'close-circle' : 'happy-outline'} size={28} color={colors.textDim} />
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
            {amSeated && <RoundBtn label="Mikrofon" icon={micOn ? 'mic' : 'mic-off'} active={micOn} onPress={() => setMicOn((m) => !m)} />}
            {roomType === 'qa' && <RoundBtn label="Sorular" icon="help" onPress={() => setPanel('qa')} badge={questions.filter((q) => !q.picked).length} />}
            <RoundBtn label="Menü" icon="grid" onPress={moreMenu} />
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
      {isOwn && (
        <SettingsModal
          key={panel === 'settings' ? 'settings-open' : 'settings-closed'}
          visible={panel === 'settings'}
          onClose={() => setPanel(null)}
          room={myRoom}
          update={updateMyRoom}
          agencyRoom={agencyRoom}
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
      <GiftResults visible={panel === 'results'} onClose={() => setPanel(null)} results={giftResults} />
      {giftFx && <GiftAnimation gift={giftFx} onDone={() => setGiftFx(null)} />}
      {entry && <EntryBanner text={entry.text} color={entry.color} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  sub: { color: colors.textDim, fontSize: 11 },
  levelBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  levelText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  reqBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: colors.red, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  reqBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 8, rowGap: 10 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mutedChip: { color: colors.gold, fontSize: 11, textAlign: 'center', marginTop: 4 },
  queueChip: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(139,92,246,0.35)', marginHorizontal: 12, marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, minWidth: 0, backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
});
