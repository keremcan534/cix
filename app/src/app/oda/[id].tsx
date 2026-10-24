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
import { ChatLine, EntryBanner, GiftAnimation, GiftSheet, ListenersModal, PkBar, ROLE_RANK, RoundBtn, Seat, type ChatMsg, type Pk, type RoomRole } from '@/components/room/parts';
import { Avatar } from '@/components/ui';
import { MUSIC_CATALOG, adminCapacity, cosmeticById, micCapacity, roomLevel, ROOM_LEVEL_REWARDS, type Track } from '@/data/catalog';
import { INCOMING_GIFT_POOL, VIP_ENTRY_LEVEL, VIP_INVISIBLE_LEVEL, vipTier } from '@/data/economy';
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
const pad = (s: (string | null)[], n: number) => (s.length >= n ? s.slice(0, n) : [...s, ...Array<string | null>(n - s.length).fill(null)]);

export default function VoiceRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isOwn = id === 'yeni';
  const app = useApp();
  const { coins, spendCoins, addCoins, receiveDiamonds, bump, vipLevel, blocked, settings, setSetting, equipped, myRoom, updateMyRoom, addRoomXp, agencyId, createTicket } = app;

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
  const [panel, setPanel] = useState<null | 'settings' | 'music' | 'envelope' | 'dice' | 'contrib' | 'requests'>(null);
  const [pk, setPk] = useState<Pk | null>(null);
  const [contrib, setContrib] = useState<Record<string, number>>({});
  const [requests, setRequests] = useState<string[]>([]);
  const [myRequest, setMyRequest] = useState(false);
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

  const addMsg = (msg: Omit<ChatMsg, 'id'>) => setMessages((m) => [...m.slice(-80), { ...msg, id: msgId() }]);
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

  // Minutes in room: daily task + room XP.
  useEffect(() => {
    const t = setInterval(() => {
      bump('roomMinutes');
      gainXp(10);
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Labeled system bot with periodic tips (owner can switch it off).
  useEffect(() => {
    if (!botOn) return;
    const t = setInterval(() => addMsg({ bot: true, text: pick(BOT_TIPS) }), 45_000);
    return () => clearInterval(t);
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
      const r = Math.random();
      if (r < 0.25) {
        setListeners((n) => (isOwn ? Math.min(myRoom.limit, n + 1) : n + 1));
        addMsg({ system: true, text: `${u.name} odaya katıldı` });
        gainXp(5);
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
  }, [kicked, blocked]);

  // Own room: listeners send gifts (host earns diamonds, room earns XP) and ask to speak.
  useEffect(() => {
    if (!isOwn) return;
    const gifts = setInterval(() => {
      const from = pick(USERS);
      const gift = GIFTS.find((g) => g.price === pick(INCOMING_GIFT_POOL)) ?? GIFTS[0];
      receiveDiamonds(gift.price, 'Hediye', from.id);
      gainXp(gift.price);
      addContrib(from.id, gift.price);
      if (gift.price >= 50 && !settings.effectsOff) setGiftFx(gift);
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
    return () => {
      clearInterval(gifts);
      clearInterval(reqs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn]);

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
              onPress: () =>
                setMutedUsers((m) => {
                  const n = new Set(m);
                  if (muted) n.delete(uid);
                  else n.add(uid);
                  return n;
                }),
            },
            {
              label: '⬇️ Mikrofondan indir',
              onPress: () => {
                removeFromSeat(uid);
                addMsg({ system: true, text: `${u.name} mikrofondan indirildi` });
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
                  addMsg({ system: true, text: isAdmin ? `${u.name} artık yönetici değil` : `🛡️ ${u.name} oda yöneticisi oldu` });
                },
              },
              {
                label: '🚫 Odadan çıkar',
                destructive: true,
                onPress: () => {
                  removeFromSeat(uid);
                  setKicked((k) => new Set(k).add(uid));
                  addMsg({ system: true, text: `${u.name} odadan çıkarıldı (gerekçe ve süre denetim kaydına yazıldı)` });
                },
              },
            );
          }
        } else {
          options.push({
            label: '🔒 Üst role müdahale edilemez',
            onPress: () => showAlert('Yetki yok', `${targetRole === 'owner' ? 'Oda sahibini' : 'Aynı veya üst rolü'} susturamaz ya da mikrofondan indiremezsin. Bu deneme denetim kaydına yazıldı.`),
          });
        }
      }
      setSheet({ title: `${u.name} · ${targetRole === 'owner' ? 'Oda sahibi' : targetRole === 'admin' ? 'Yönetici' : 'Üye'}`, options });
      return;
    }
    if (index === 0) return;
    if (amSeated || myRole !== 'member') return sitMe(index);
    // Others' rooms require approval to speak.
    if (myRequest) return showAlert('İsteğin bekliyor', 'Oda sahibinin onayını bekliyorsun.');
    setMyRequest(true);
    addMsg({ system: true, text: '🙋 Konuşma isteğin oda sahibine gönderildi' });
    setTimeout(() => {
      setMyRequest(false);
      sitMe(index);
      addMsg({ system: true, text: `✅ ${userById(hostId).name} konuşma isteğini kabul etti` });
    }, 2000);
  };

  // --- Chat, gifts, games ---------------------------------------------------------
  const send = () => {
    if (!draft.trim()) return;
    addMsg({ userId: 'me', text: draft.trim() });
    setDraft('');
    setEmojiOpen(false);
    gainXp(2);
  };

  const sendGift = (gift: Gift, toId: string, count: number) => {
    setGiftOpen(false);
    const total = gift.price * count;
    if (!spendCoins(total, `Hediye: ${gift.name} x${count}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    bump('giftsSent', count);
    addContrib('me', total);
    if (!settings.effectsOff) setGiftFx(gift);
    setPk((p) => (p?.phase === 'live' ? { ...p, ours: p.ours + total } : p));
    addMsg({ system: true, text: `🎁 ${ME.name}, ${userById(toId).name} kişisine ${gift.emoji} ${gift.name} x${count} gönderdi!` });
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
                  👥 {listeners} · 🎙️ {capacity}
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
                locked={!uid && i > 0 && myRole === 'member' && !amSeated}
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
      />
      <EnvelopeSendModal visible={panel === 'envelope'} onClose={() => setPanel(null)} onSend={sendEnvelope} coins={coins} />
      <DiceModal visible={panel === 'dice'} onClose={() => setPanel(null)} onPlay={playDice} playsLeft={dicePlays} />
      <ContributionModal visible={panel === 'contrib'} onClose={() => setPanel(null)} data={contrib} locked={isOwn && level < 3} />
      <RequestsModal
        visible={panel === 'requests'}
        onClose={() => setPanel(null)}
        requests={requests}
        onAccept={(uid) => {
          setRequests((r) => r.filter((x) => x !== uid));
          placeOnSeat(uid);
        }}
        onReject={(uid) => {
          setRequests((r) => r.filter((x) => x !== uid));
          addMsg({ system: true, text: `${userById(uid).name} adlı kullanıcının konuşma isteği reddedildi` });
        }}
      />
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
  input: { flex: 1, minWidth: 0, backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
});
