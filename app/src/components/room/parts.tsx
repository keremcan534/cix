import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, FramedAvatar, VerifiedBadge } from '@/components/ui';
import { cosmeticById } from '@/data/catalog';
import { GIFTS, userById, type Gift, type GiftCat, type Room, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { micHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

export type ChatMsg = { id: string; userId?: string; text: string; system?: boolean; bot?: boolean };
export type RoomRole = 'owner' | 'admin' | 'member';
export const ROLE_RANK: Record<RoomRole, number> = { owner: 3, admin: 2, member: 1 };
export type Pk = { opponent: Room; ours: number; theirs: number; left: number; phase: 'inviting' | 'countdown' | 'live' | 'done'; result?: 'win' | 'lose' | 'draw'; mvp?: string };

export function Seat({
  index,
  userId,
  host,
  small,
  vipLevel,
  frameId,
  speaking,
  muted,
  role,
  locked,
  compact,
  onPress,
}: {
  index: number;
  userId: string | null;
  host: boolean;
  small: boolean;
  vipLevel: number;
  frameId?: string;
  speaking: boolean;
  muted: boolean;
  role?: RoomRole;
  locked?: boolean;
  /** Host seat sharing the top row (e.g. with the boss seat). */
  compact?: boolean;
  onPress: () => void;
}) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!speaking) {
      pulse.setValue(0);
      return;
    }
    const anim = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [speaking, pulse]);

  const user = userId ? userById(userId) : null;
  const size = host ? 70 : small ? 48 : 56;

  return (
    <Pressable onPress={onPress} style={[styles.seat, host ? (compact ? { width: 96 } : styles.hostSeat) : { width: '20%' }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {speaking && (
          <Animated.View
            style={[
              styles.ring,
              { width: size, height: size, borderRadius: size / 2 },
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }] },
            ]}
          />
        )}
        {user && (vipLevel > 0 || frameId) ? (
          <FramedAvatar uri={user.avatar} size={size} vipLevel={vipLevel} frameId={frameId} />
        ) : user ? (
          <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: speaking ? semantic.live : 'transparent' }} />
        ) : (
          <View style={[styles.emptySeat, { width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name={locked ? 'lock-closed' : 'add'} size={small ? 18 : 22} color={colors.textDim} />
          </View>
        )}
        {muted && (
          <View style={styles.mutedBadge}>
            <Ionicons name="mic-off" size={10} color="#fff" />
          </View>
        )}
        {role === 'admin' && (
          <View style={styles.roleBadge}>
            <Text style={{ fontSize: 9 }}>🛡️</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {host && <Text style={{ fontSize: 12 }}>👑</Text>}
        <Text style={[styles.seatName, small && { fontSize: 12 }]} numberOfLines={1}>
          {user ? user.name : `${index + 1}`}
        </Text>
        {user?.verified && !small && <VerifiedBadge size={11} />}
      </View>
    </Pressable>
  );
}

export function ChatLine({ msg, bubbleId }: { msg: ChatMsg; bubbleId?: string }) {
  if (msg.bot) {
    return (
      <View style={styles.botMsg}>
        <Text style={styles.botTag}>🤖 BOT</Text>
        <Text style={styles.botText}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.system) {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  const u = userById(msg.userId!);
  const bubble = msg.userId === 'me' ? cosmeticById(bubbleId) : undefined;
  const content = (
    <Text style={styles.chatText}>
      <Text style={{ color: msg.userId === 'me' ? colors.gold : '#C4B5FD', fontWeight: '700' }}>{u.name}: </Text>
      {msg.text}
    </Text>
  );
  if (bubble?.color) {
    return (
      <LinearGradient colors={bubble.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatLine}>
        {content}
      </LinearGradient>
    );
  }
  return <View style={[styles.chatLine, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>{content}</View>;
}

export function RoundBtn({
  icon,
  onPress,
  gift,
  label,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Gold "money" button: gold is reserved for spending coins. */
  gift?: boolean;
  label: string;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={() => {
        if (gift) pressHaptic();
        else tapHaptic();
        onPress();
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}
    >
      {gift ? (
        <View style={[styles.round, styles.giftRound]}>
          <Ionicons name={icon} size={22} color={semantic.moneyInk} />
        </View>
      ) : (
        <View style={[styles.round, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name={icon} size={22} color="#fff" />
        </View>
      )}
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export type MicState = 'on' | 'off' | 'hand' | 'queued';
const MIC_LOOK: Record<MicState, { icon: keyof typeof Ionicons.glyphMap; caption: string; bg: string; edge: string; fg: string; a11y: string }> = {
  on: { icon: 'mic', caption: 'AÇIK', bg: semantic.live, edge: semantic.liveEdge, fg: semantic.liveInk, a11y: 'Mikrofon açık, kapatmak için dokun' },
  off: { icon: 'mic-off', caption: 'KAPALI', bg: colors.cardAlt, edge: '#18112E', fg: '#FCA5A5', a11y: 'Mikrofon kapalı, açmak için dokun' },
  hand: { icon: 'hand-left', caption: 'EL KALDIR', bg: colors.primary, edge: semantic.actionEdge, fg: '#fff', a11y: 'El kaldır, konuşmak iste' },
  queued: { icon: 'hourglass', caption: 'SIRADA', bg: semantic.tonal, edge: 'transparent', fg: semantic.tonalText, a11y: 'Konuşmacı sırasındasın' },
};

/** The biggest control in the room: state is shown by color, icon and caption together, never by color alone. */
export function MicBtn({ state, queuePos, onPress }: { state: MicState; queuePos?: number; onPress: () => void }) {
  const look = MIC_LOOK[state];
  const caption = state === 'queued' && queuePos !== undefined ? `SIRA ${queuePos + 1}` : look.caption;
  return (
    <Pressable
      onPress={() => {
        micHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={look.a11y}
      accessibilityState={{ checked: state === 'on' }}
      style={{ alignItems: 'center', gap: 2 }}
    >
      {({ pressed }) => (
        <>
          <View style={{ borderRadius: 28, backgroundColor: look.edge, paddingBottom: pressed ? 0 : 4, marginTop: pressed ? 4 : 0 }}>
            <View style={[styles.micRound, { backgroundColor: look.bg }]}>
              <Ionicons name={look.icon} size={26} color={look.fg} />
            </View>
          </View>
          <Text style={[styles.micCaption, state === 'on' && { color: semantic.live }]}>{caption}</Text>
        </>
      )}
    </Pressable>
  );
}

// --- Gift panel (Timo-style) --------------------------------------------------------

type GiftTab = GiftCat;
type GiftView = 'tab' | 'fav' | 'bag';
type HotSort = 'default' | 'asc' | 'desc';

const GIFT_TABS: { key: GiftTab; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'gameplay', label: 'Gameplay' },
  { key: 'couple', label: 'Çift' },
  { key: 'privilege', label: 'Ayrıcalık' },
];
const GIFT_COUNTS = [1, 10, 66, 99, 188, 520, 1314];
const COUNT_LABELS: Record<number, string> = { 1: '', 10: 'Mükemmel', 66: 'Her şey yolunda', 99: 'Sonsuza dek', 188: 'Seni seviyorum', 520: 'Aşkım', 1314: 'Ömür boyu' };
/** Sender gift level: Lv(n+1) needs GIFT_LEVEL_XP[n] coins spent in total. */
const GIFT_LEVEL_XP = [0, 870, 5_000, 20_000, 60_000, 150_000, 400_000, 1_000_000, 2_500_000, 6_000_000];
// Turkish dative suffix after the spoken number ("Lv2'ye", "Lv3'e", "Lv6'ya", "Lv10'a").
const LV_SUFFIX: Record<number, string> = { 2: 'ye', 3: 'e', 4: 'e', 5: 'e', 6: 'ya', 7: 'ye', 8: 'e', 9: 'a', 10: 'a' };

// Prototype persistence: the sheet remounts on every open, so favorites and the free-gift
// backpack live at module level (reset on app reload).
const favoriteGifts = new Set<string>(['g5', 'h1']);
const BACKPACK_SOURCES: Record<string, string> = { g1: 'Günlük giriş', g3: 'Günlük giriş', p3: 'Etkinlik ödülü', g2: 'Görev ödülü' };
const backpackStock: Record<string, number> = { g1: 7, g3: 2, p3: 3, g2: 1 };

const fmt = (n: number) => n.toLocaleString('tr-TR');
const giftLevelOf = (spent: number) => GIFT_LEVEL_XP.filter((x) => spent >= x).length;
const isLocked = (g: Gift, svip: number) => (g.minSvip ?? 0) > svip;

function giftsFor(view: GiftView, tab: GiftTab, sort: HotSort, favs: Set<string>, bag: Record<string, number>) {
  if (view === 'fav') return GIFTS.filter((g) => favs.has(g.id));
  if (view === 'bag') return GIFTS.filter((g) => (bag[g.id] ?? 0) > 0);
  const list = GIFTS.filter((g) => (g.cat ?? 'hot') === tab);
  if (tab === 'hot' && sort !== 'default') list.sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
  return list;
}

function GiftCell({
  gift,
  selected,
  favorite,
  locked,
  stock,
  onPress,
  onLongPress,
  onToggleFav,
}: {
  gift: Gift;
  selected: boolean;
  favorite: boolean;
  locked: boolean;
  stock?: number;
  onPress: () => void;
  onLongPress: () => void;
  onToggleFav: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={styles.giftCellWrap}>
      <View style={[styles.giftCell, selected && styles.giftSelected]}>
        <View style={[styles.giftArt, locked && { opacity: 0.45 }]}>
          <Text style={{ fontSize: 36 }}>{gift.emoji}</Text>
        </View>
        <Text style={styles.giftName} numberOfLines={1}>
          {gift.name}
        </Text>
        {stock !== undefined ? (
          <Text style={[styles.giftPrice, { color: colors.green }]}>Ücretsiz</Text>
        ) : (
          <Text style={styles.giftPrice}>🪙 {fmt(gift.price)}</Text>
        )}
        <View style={styles.cornerBadges}>
          {!!gift.minSvip && (
            <View style={[styles.cBadge, styles.cBadgeSvip]}>
              <Text style={styles.cBadgeSvipText}>S{gift.minSvip}</Text>
            </View>
          )}
          {gift.cat === 'couple' && (
            <View style={[styles.cBadge, styles.cBadgeCouple]}>
              <Ionicons name="heart" size={9} color="#fff" />
            </View>
          )}
          {gift.cat === 'gameplay' && (
            <View style={[styles.cBadge, styles.cBadgeGame]}>
              <Text style={{ fontSize: 8 }}>🎯</Text>
            </View>
          )}
          {gift.badge === '3D' && (
            <View style={[styles.cBadge, styles.cBadge3d]}>
              <Text style={styles.cBadge3dText}>3D</Text>
            </View>
          )}
          {gift.badge === 'music' && (
            <View style={[styles.cBadge, styles.cBadgeMusic]}>
              <Ionicons name="musical-notes" size={9} color="#fff" />
            </View>
          )}
        </View>
        {locked && (
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={11} color={colors.gold} />
          </View>
        )}
        {stock !== undefined && (
          <View style={styles.stockBadge}>
            <Text style={styles.stockText}>x{stock}</Text>
          </View>
        )}
        {(selected || favorite) && (
          <Pressable onPress={onToggleFav} hitSlop={8} style={styles.favBtn} accessibilityLabel={favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}>
            <Ionicons name={favorite ? 'star' : 'star-outline'} size={13} color={favorite ? colors.gold : colors.textDim} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function GiftBanner({ tab, onVip }: { tab: GiftTab; onVip: () => void }) {
  if (tab === 'couple')
    return (
      <LinearGradient colors={['#EC4899', '#FB7185', '#FDBA74']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
        <Text style={{ fontSize: 22 }}>💗</Text>
        <Text style={styles.bannerText} numberOfLines={2}>
          Çift hediyesi verdikten sonra yakınlık değeri ekstra %2
        </Text>
      </LinearGradient>
    );
  if (tab === 'privilege')
    return (
      <Pressable onPress={onVip}>
        <LinearGradient colors={['#B45309', '#F59E0B', '#FDE68A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
          <Text style={{ fontSize: 22 }}>💎</Text>
          <Text style={[styles.bannerText, { color: '#3B2300', fontSize: 17, fontWeight: '900' }]}>SVIP Sistemi</Text>
          <View style={styles.bannerArrow}>
            <Ionicons name="chevron-forward" size={16} color="#B45309" />
          </View>
        </LinearGradient>
      </Pressable>
    );
  if (tab === 'gameplay')
    return (
      <LinearGradient colors={['#4C1D95', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
        <Text style={{ fontSize: 22 }}>🎯</Text>
        <Text style={[styles.bannerText, { fontSize: 12 }]} numberOfLines={2}>
          Atış hediyeleri alıcının koltuğuna eğlenceli bir animasyonla fırlatılır. Fiyat sabittir, sürpriz ödül yoktur.
        </Text>
      </LinearGradient>
    );
  return null;
}

export function GiftSheet({
  visible,
  onClose,
  recipients,
  initialTo,
  coins,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  recipients: string[];
  initialTo?: string | null;
  coins: number;
  onSend: (g: Gift, to: string[], count: number) => void;
}) {
  const { svipLevel, spentTotal } = useApp();
  const [tab, setTab] = useState<GiftTab>('hot');
  const [view, setView] = useState<GiftView>('tab');
  const [sort, setSort] = useState<HotSort>('default');
  const [favs, setFavs] = useState(() => new Set(favoriteGifts));
  const [bag, setBag] = useState(() => ({ ...backpackStock }));
  const [sel, setSel] = useState<{ id: string; bag: boolean }>({ id: GIFTS[0].id, bag: false });
  const [count, setCount] = useState(1);
  const [countOpen, setCountOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => {
    const first = initialTo && recipients.includes(initialTo) ? initialTo : recipients[0];
    return first ? [first] : [];
  });
  const targets = picked.filter((id) => recipients.includes(id));
  const allSelected = recipients.length > 0 && targets.length === recipients.length;
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const list = giftsFor(view, tab, sort, favs, bag);
  const selected = GIFTS.find((g) => g.id === sel.id) ?? GIFTS[0];
  const fromBag = sel.bag;
  const unitPrice = fromBag ? 0 : selected.price;
  const total = unitPrice * count * targets.length;

  const level = giftLevelOf(spentTotal);
  const nextXp = GIFT_LEVEL_XP[level];
  const prevXp = GIFT_LEVEL_XP[level - 1] ?? 0;
  const progress = nextXp === undefined ? 1 : Math.min(1, (spentTotal - prevXp) / (nextXp - prevXp));

  const selectFirst = (nextView: GiftView, nextTab: GiftTab, nextSort: HotSort) => {
    const l = giftsFor(nextView, nextTab, nextSort, favs, bag);
    const keep = l.some((g) => g.id === sel.id) && sel.bag === (nextView === 'bag');
    if (!keep && l[0]) setSel({ id: l[0].id, bag: nextView === 'bag' });
  };
  const pickTab = (t: GiftTab) => {
    let nextSort = sort;
    if (t === 'hot' && view === 'tab' && tab === 'hot') {
      nextSort = sort === 'default' ? 'desc' : sort === 'desc' ? 'asc' : 'default';
      setSort(nextSort);
    }
    setTab(t);
    setView('tab');
    selectFirst('tab', t, nextSort);
  };
  const pickView = (v: GiftView) => {
    const next = view === v ? 'tab' : v;
    setView(next);
    selectFirst(next, tab, sort);
  };
  const toggleFav = (id: string) => {
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    favoriteGifts.clear();
    next.forEach((x) => favoriteGifts.add(x));
    setFavs(next);
  };
  const openVip = () => {
    onClose();
    router.push('/vip');
  };
  const lockedAlert = (g: Gift) =>
    showAlert(`SVIP ${g.minSvip} gerekli`, `${g.emoji} ${g.name} yalnızca SVIP ${g.minSvip} ve üzeri kullanıcılar tarafından gönderilebilir. Şu anki seviyen: SVIP ${svipLevel}.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'SVIP Sistemi', onPress: openVip },
    ]);
  const tapGift = (g: Gift) => {
    if (view !== 'bag' && isLocked(g, svipLevel)) return lockedAlert(g);
    setSel({ id: g.id, bag: view === 'bag' });
  };

  const send = () => {
    if (targets.length === 0) return showAlert('Alıcı seç', 'Hediye göndermek için en az bir kişi seç.');
    if (fromBag) {
      const need = count * targets.length;
      const have = bag[selected.id] ?? 0;
      if (need > have) return showAlert('Çantada yeterli hediye yok', `${selected.emoji} ${selected.name}: ${have} adet var, ${need} adet gerekiyor.`);
      const next = { ...bag, [selected.id]: have - need };
      Object.assign(backpackStock, next);
      setBag(next);
      onSend({ ...selected, price: 0 }, targets, count);
      return;
    }
    if (isLocked(selected, svipLevel)) return lockedAlert(selected);
    onSend(selected, targets, count);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      {view === 'tab' && (
        <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
          <GiftBanner tab={tab} onVip={openVip} />
        </View>
      )}
      <View style={styles.giftSheet}>
        {/* Recipients (multi-select) */}
        <View style={styles.recipRow}>
          <Text style={styles.recipLabel}>Kime? ({targets.length})</Text>
          {recipients.length === 0 ? (
            <Text style={{ color: colors.textDim, flex: 1, fontSize: 12 }}>Koltukta kimse yok.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {recipients.map((id) => (
                <Pressable key={id} onPress={() => togglePick(id)} style={{ opacity: targets.includes(id) ? 1 : 0.45 }} accessibilityLabel={userById(id).name}>
                  <Avatar uri={userById(id).avatar} size={34} ring={targets.includes(id)} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {recipients.length > 1 && (
            <Pressable onPress={() => setPicked(allSelected ? recipients.slice(0, 1) : recipients)} hitSlop={8} style={styles.allBtn}>
              <Text style={{ color: colors.pink, fontWeight: '800', fontSize: 12 }}>{allSelected ? 'Seçimi kaldır' : 'Hepsini seç'}</Text>
            </Pressable>
          )}
        </View>

        {/* Sender gift level */}
        <View style={styles.levelRow}>
          <LinearGradient colors={['#FDE68A', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.levelPill}>
            <Text style={styles.levelPillText}>Lv.{level}</Text>
          </LinearGradient>
          <View style={styles.levelDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.levelText} numberOfLines={1}>
              {nextXp === undefined ? (
                'Maksimum hediye seviyesine ulaştın 🎉'
              ) : (
                <>
                  <Text style={{ color: colors.gold, fontWeight: '800' }}>{fmt(nextXp - spentTotal)}</Text> Jeton hediye göndererek Lv{level + 1}&apos;{LV_SUFFIX[level + 1]} yüksel
                </>
              )}
            </Text>
            <View style={styles.levelTrack}>
              <LinearGradient colors={['#FDE68A', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 3 }} />
            </View>
          </View>
          <Text style={styles.levelPlus}>+{fmt(total)}</Text>
        </View>

        {/* Tabs + favorites / backpack */}
        <View style={styles.tabRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, alignItems: 'flex-end' }}>
            {GIFT_TABS.map((t) => {
              const active = view === 'tab' && tab === t.key;
              return (
                <Pressable key={t.key} onPress={() => pickTab(t.key)} style={{ alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                    {t.key === 'hot' && (
                      <Ionicons name={sort === 'asc' ? 'arrow-up' : sort === 'desc' ? 'arrow-down' : 'swap-vertical'} size={13} color={active ? '#fff' : colors.textDim} />
                    )}
                    {t.key === 'couple' && <Ionicons name="heart" size={15} color={colors.red} />}
                  </View>
                  <View style={[styles.tabLine, !active && { backgroundColor: 'transparent' }]} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={() => pickView('fav')} hitSlop={6} style={[styles.tabIcon, view === 'fav' && styles.tabIconActive]} accessibilityLabel="Favoriler">
            <Ionicons name={view === 'fav' ? 'star' : 'star-outline'} size={20} color={view === 'fav' ? colors.gold : colors.textDim} />
          </Pressable>
          <Pressable onPress={() => pickView('bag')} hitSlop={6} style={[styles.tabIcon, view === 'bag' && styles.tabIconActive]} accessibilityLabel="Çanta">
            <Ionicons name={view === 'bag' ? 'bag-handle' : 'bag-handle-outline'} size={20} color={view === 'bag' ? colors.primaryText : colors.textDim} />
          </Pressable>
        </View>
        {view === 'bag' && <Text style={styles.viewNote}>🎒 Çanta · Günlük giriş ve görev ödülü hediyeler. Gönderirken jeton harcanmaz.</Text>}
        {view === 'fav' && <Text style={styles.viewNote}>⭐ Favoriler · Bir hediyeye uzun basarak ekle ya da çıkar.</Text>}

        {/* Gift grid */}
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.giftGrid}>
          {list.length === 0 ? (
            <Text style={styles.emptyText}>
              {view === 'fav' ? 'Henüz favori hediyen yok. Bir hediyeye uzun basarak favorilere ekle.' : 'Çantan boş. Günlük girişten ücretsiz hediye kazanabilirsin.'}
            </Text>
          ) : (
            list.map((g) => (
              <GiftCell
                key={g.id}
                gift={g}
                selected={sel.id === g.id && sel.bag === (view === 'bag')}
                favorite={favs.has(g.id)}
                locked={view !== 'bag' && isLocked(g, svipLevel)}
                stock={view === 'bag' ? bag[g.id] : undefined}
                onPress={() => tapGift(g)}
                onLongPress={() => toggleFav(g.id)}
                onToggleFav={() => toggleFav(g.id)}
              />
            ))
          )}
        </ScrollView>

        {/* Price confirmation before spending (spec §7.2). */}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, total > coins && { color: colors.red }]} numberOfLines={1}>
            {selected.emoji} {selected.name} · {targets.length} alıcı × {count} × {fromBag ? 'Ücretsiz' : fmt(selected.price)} = 🪙 {fmt(total)}
          </Text>
          {fromBag ? (
            <Text style={[styles.summaryExtra, { color: colors.green }]}>{BACKPACK_SOURCES[selected.id] ?? 'Çanta'}</Text>
          ) : selected.intimacy ? (
            <Text style={[styles.summaryExtra, { color: colors.pink }]}>💗 +{fmt(selected.intimacy * count)} yakınlık</Text>
          ) : null}
        </View>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => {
              onClose();
              router.push('/cuzdan');
            }}
            style={styles.balance}
            accessibilityLabel="Cüzdan"
          >
            <Text style={{ fontSize: 16 }}>🪙</Text>
            <Text style={styles.balanceText}>{fmt(coins)}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </Pressable>
          <View style={styles.sendPill}>
            <Pressable onPress={() => setCountOpen((o) => !o)} style={styles.countBtn} accessibilityLabel="Adet seç">
              <Text style={styles.countText}>{count}</Text>
              <Ionicons name={countOpen ? 'chevron-down' : 'chevron-up'} size={14} color="#fff" />
            </Pressable>
            <Pressable onPress={send} accessibilityLabel="Gönder">
              <LinearGradient colors={[colors.primary, '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.sendBtn, targets.length === 0 && { opacity: 0.5 }]}>
                <Text style={styles.sendText}>Gönder</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        {countOpen && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCountOpen(false)} />
            <View style={styles.countPopup}>
              {GIFT_COUNTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    setCount(n);
                    setCountOpen(false);
                  }}
                  style={[styles.countOption, count === n && { backgroundColor: 'rgba(139,92,246,0.25)' }]}
                >
                  <Text style={styles.countOptionN}>{n}</Text>
                  {!!COUNT_LABELS[n] && <Text style={styles.countOptionLabel}>{COUNT_LABELS[n]}</Text>}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

export function GiftAnimation({ gift, onDone }: { gift: Gift; onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.delay(900),
      Animated.timing(v, { toValue: 2, duration: 400, useNativeDriver: true }),
    ]).start(() => done.current());
  }, [v]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Text
        style={{
          fontSize: 140,
          opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.6] }) },
            { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [120, 0, -80] }) },
          ],
        }}
      >
        {gift.emoji}
      </Animated.Text>
    </View>
  );
}

export function PkBar({ pk, roomTitle }: { pk: Pk; roomTitle: string }) {
  const ratio = pk.ours + pk.theirs === 0 ? 0.5 : pk.ours / (pk.ours + pk.theirs);
  const status =
    pk.phase === 'inviting'
      ? '📨 Davet gönderildi...'
      : pk.phase === 'countdown'
        ? `⏳ ${pk.left}`
        : pk.phase === 'live'
          ? `⚔️ ${pk.left}s`
          : pk.result === 'win'
            ? '🏆 KAZANDIN'
            : pk.result === 'lose'
              ? 'KAYBETTİN'
              : 'BERABERE';
  return (
    <View style={styles.pk}>
      <View style={styles.pkTop}>
        <Text style={styles.pkName} numberOfLines={1}>
          {roomTitle}
        </Text>
        <Text style={styles.pkTimer}>{status}</Text>
        <Text style={[styles.pkName, { textAlign: 'right' }]} numberOfLines={1}>
          {pk.opponent.title}
        </Text>
      </View>
      <View style={styles.pkTrack}>
        <LinearGradient colors={['#EC4899', '#F43F5E']} style={{ flex: Math.max(ratio, 0.04), justifyContent: 'center', paddingLeft: 8 }}>
          <Text style={styles.pkScore}>{pk.ours}</Text>
        </LinearGradient>
        <LinearGradient colors={['#3B82F6', '#6366F1']} style={{ flex: Math.max(1 - ratio, 0.04), justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={styles.pkScore}>{pk.theirs}</Text>
        </LinearGradient>
      </View>
      {pk.phase === 'done' && pk.mvp && <Text style={styles.pkMvp}>⭐ MVP destekçi: {userById(pk.mvp).name}</Text>}
    </View>
  );
}

export function ListenersModal({
  visible,
  onClose,
  users,
  canInvite,
  onInvite,
  total,
  invisibleMe,
}: {
  visible: boolean;
  onClose: () => void;
  users: User[];
  canInvite: boolean;
  onInvite: (id: string) => void;
  total: number;
  invisibleMe: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '60%' }]}>
        <Text style={styles.sheetTitle}>Dinleyiciler ({total})</Text>
        {invisibleMe && <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 6 }}>👻 Gizli girişte: listede görünmüyorsun (moderasyon kayıtlarında görünürsün).</Text>}
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.listenerRow}>
              <Avatar uri={item.avatar} size={40} online={item.online} />
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  onClose();
                  router.push(`/kullanici/${item.id}`);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>{item.city}</Text>
              </Pressable>
              {canInvite && (
                <Pressable style={styles.inviteBtn} onPress={() => onInvite(item.id)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Koltuğa davet</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

export function EntryBanner({ text, color }: { text: string; color: readonly [string, string] }) {
  const [x] = useState(() => new Animated.Value(-400));
  useEffect(() => {
    Animated.sequence([
      Animated.spring(x, { toValue: 0, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(x, { toValue: 500, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [x]);
  return (
    <Animated.View pointerEvents="none" style={[styles.entry, { transform: [{ translateX: x }] }]}>
      <LinearGradient colors={color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.entryInner}>
        <Text style={styles.entryText}>{text}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export const roomStyles = StyleSheet.create({
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
});

const styles = StyleSheet.create({
  seat: { alignItems: 'center', gap: 4 },
  hostSeat: { width: '100%' },
  ring: { position: 'absolute', borderWidth: 4, borderColor: semantic.live },
  emptySeat: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.red, borderRadius: 10, padding: 3 },
  roleBadge: { position: 'absolute', left: -2, bottom: -2, backgroundColor: colors.bg, borderRadius: 10, padding: 2 },
  seatName: { color: '#fff', fontSize: 12, maxWidth: 64 },
  systemMsg: { alignSelf: 'flex-start', backgroundColor: 'rgba(139,92,246,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  systemText: { color: '#DDD6FE', fontSize: 12 },
  botMsg: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '90%' },
  botTag: { color: colors.green, fontSize: 11, fontWeight: '900' },
  botText: { color: '#BBF7D0', fontSize: 12, flexShrink: 1 },
  chatLine: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '85%' },
  chatText: { color: '#fff', fontSize: 14 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  giftRound: { backgroundColor: semantic.money, borderBottomWidth: 4, borderBottomColor: semantic.moneyEdge },
  micRound: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  micCaption: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pk: { marginHorizontal: 12, marginTop: 4, gap: 6 },
  pkTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pkName: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  pkTimer: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  pkTrack: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  pkScore: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pkMvp: { color: colors.gold, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  listenerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  inviteBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  entry: { position: 'absolute', top: 110, left: 12, right: 12 },
  entryInner: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  entryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  sheet: roomStyles.sheet,
  sheetTitle: roomStyles.sheetTitle,
  giftSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 28 },
  recipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  recipLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  allBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(236,72,153,0.12)' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  levelPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  levelPillText: { color: '#7C2D12', fontWeight: '900', fontStyle: 'italic', fontSize: 12 },
  levelDivider: { width: 1, height: 18, backgroundColor: colors.border },
  levelText: { color: '#E9E3FF', fontSize: 12 },
  levelTrack: { height: 5, borderRadius: 3, backgroundColor: colors.cardAlt, marginTop: 5, overflow: 'hidden' },
  levelPlus: { color: colors.gold, fontWeight: '800', fontSize: 13, minWidth: 28, textAlign: 'right' },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  tabText: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '900' },
  tabLine: { width: 18, height: 3, borderRadius: 2, backgroundColor: '#fff', marginTop: 4 },
  tabIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.cardAlt },
  viewNote: { color: colors.textDim, fontSize: 12, marginTop: 6 },
  gridScroll: { height: 236, marginTop: 8 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 4 },
  giftCellWrap: { width: '25%', padding: 2 },
  giftCell: { alignItems: 'center', paddingTop: 8, paddingBottom: 6, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  giftSelected: { borderColor: colors.primary, backgroundColor: 'rgba(139,92,246,0.14)' },
  giftArt: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  giftName: { color: '#fff', fontSize: 12, marginTop: 4, maxWidth: '94%' },
  giftPrice: { color: colors.gold, fontSize: 11, marginTop: 2 },
  cornerBadges: { position: 'absolute', top: 4, right: 4, gap: 2, alignItems: 'flex-end' },
  cBadge: { minWidth: 16, height: 14, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  cBadge3d: { borderWidth: 1, borderColor: '#34D399', backgroundColor: 'rgba(6,78,59,0.85)' },
  cBadge3dText: { color: '#6EE7B7', fontSize: 8, fontWeight: '900' },
  cBadgeMusic: { backgroundColor: '#16A34A' },
  cBadgeSvip: { borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(120,53,15,0.9)' },
  cBadgeSvipText: { color: colors.gold, fontSize: 8, fontWeight: '900' },
  cBadgeCouple: { backgroundColor: colors.pink },
  cBadgeGame: { backgroundColor: 'rgba(139,92,246,0.6)' },
  lockIcon: { position: 'absolute', top: 30, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 3 },
  stockBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  stockText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  favBtn: { position: 'absolute', top: 3, left: 3 },
  emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', width: '100%', paddingVertical: 40, paddingHorizontal: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  bannerText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14 },
  bannerArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  summaryText: { flex: 1, color: colors.textDim, fontSize: 12 },
  summaryExtra: { fontSize: 12, fontWeight: '700' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  balanceText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  sendPill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999, overflow: 'hidden' },
  countBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  countText: { color: '#fff', fontWeight: '800', fontSize: 16, minWidth: 18, textAlign: 'center' },
  sendBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999 },
  sendText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  countPopup: { position: 'absolute', right: 110, bottom: 76, backgroundColor: colors.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, minWidth: 150 },
  countOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 7 },
  countOptionN: { color: '#fff', fontWeight: '900', fontSize: 14, minWidth: 38 },
  countOptionLabel: { color: colors.textDim, fontSize: 12 },
});
