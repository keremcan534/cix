// SimilarClub gift sheet. One job: send a chosen gift to chosen people at a cost the user has seen.
// Zones top to bottom: who (recipients) → what (catalog) → how much (total, balance) → one primary action.
// Who: a compact row of seat avatars (seat number only) plus two group picks: everyone on a mic, and
// everyone in the room (mics + listeners).
// Lucky shelf: price, every multiplier with its exact odds and reward are shown before sending; the draw
// happens on the server (lib/lucky) and is shown afterwards in the room.
// Spending rules: the total (price × count × recipients) is always visible before sending, gold is
// used only for the money action, and a short balance turns the action into "top up" instead of
// failing after the tap. Product rule: no gift ever asks for a confirmation; one tap sends.
// Gifts the owner hid in Yönetim › Canlı ayarlar are left off every shelf (lib/live/catalog-live visibleGifts).
// Global: the gifts the server marks global (Global hediye, announced in every room of the country), gathered from
// their own shelves (no shelf of their own on the server, so an older app keeps them where the admin put them), each
// with a Global badge.
// Çantam: free gifts from rewards. A live build shows the server's backpack (lib/live/backpack), read each time the
// sheet opens; the server takes the gifts out when it sends them. The demo keeps its sample stock on this phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, Button } from '@/components/ui';
import { BOND_KINDS, bondGiftMode, bondPointsOf, type RoomBond } from '@/data/bonds';
import { GIFTS, isBondGift, userById, type Gift, type GiftCat } from '@/data/mock';
import { LUCKY_RECIPIENT_SHARE, pct } from '@/data/rules';
import { bagCounts, bagLabel, bagNeed as needOf, bagShort as shortOf } from '@/lib/backpack';
import { gamblingLevelOk } from '@/lib/games';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { bagGifts, giftMarkOf, isGlobalGift, roomGiftShelf, useLiveCatalog, type LiveCatalog } from '@/lib/live/catalog-live';
import { liveMode } from '@/lib/live';
import { refreshBackpack, useBackpack } from '@/lib/live/backpack';
import { refreshLucky } from '@/lib/live/lucky';
import { LUCKY_MIN_AGE, maxMult, oddsLabel, unavailable, useLucky, type LuckyGift, type LuckyRecord } from '@/lib/lucky';
import { useApp } from '@/store';
import { SCRIM, colors, edge, radius, semantic, space, type } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { GiftArt, MUSIC_BADGE } from '@/components/GiftArt';
import { RollingNumber } from '@/components/fx/rolling-number';
import { useRoomSheetSpace, useSheetMax } from '@/lib/sheet-space';
import { marksShelfNote, refusesMarks } from '@/lib/live/marks-live';
import { refusalLine, refusingMarks } from '@/lib/profile-marks';

type Shelf = GiftCat | 'lucky' | 'fav' | 'bag' | 'global';
type PriceSort = 'default' | 'asc' | 'desc';

const SHELVES: { key: Shelf; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'hot', label: 'Popüler' },
  { key: 'global', label: 'Global', icon: 'globe' },
  { key: 'lucky', label: 'Şanslı', icon: 'leaf' },
  { key: 'couple', label: 'Çift' },
  { key: 'family', label: 'Aile ve Dost' },
  { key: 'gameplay', label: 'Kutlama' },
  { key: 'privilege', label: 'Özel' },
  { key: 'fav', label: 'Favoriler', icon: 'star' },
  // Drawn as the 3D bag with its count (the label is for screen readers).
  { key: 'bag', label: 'Çantam' },
];
/** The shelves that are a gift category: one with no gift left on it (all off the shelf for now) isn't shown. */
const CATEGORY_SHELVES = new Set<Shelf>(['hot', 'couple', 'family', 'gameplay', 'privilege']);
/** One neutral line that explains the shelf; no countdowns, no "spend more" nudges. */
const SHELF_NOTE: Record<Shelf, string> = {
  hot: 'En çok gönderilen hediyeler.',
  // How it is played and where its odds are, nothing about what can be won (the owners, Güncelleme 7).
  lucky: `Her gönderimde bir çekiliş yapılır; olasılıklar aşağıda. Ödül garanti değildir. Alıcıya ve PK puanına hediye değerinin ${pct(LUCKY_RECIPIENT_SHARE)}’si yazılır.`,
  // While a gift here leaves a profile mark (Kaka), the note says so instead (lib/live/marks-live marksShelfNote).
  gameplay: 'Atılan hediye alıcının koltuğuna düşer. Fiyat sabit, sürpriz ödül yok.',
  couple: 'Sevdiğine özel hediyeler.',
  family: 'Koruma Kartı koruyucu yapar. Bağ hediyesi istek olur, kabul edilmezse jeton döner; bağın varsa puan getirir.',
  privilege: 'VIP üyelerine özel hediyeler.',
  global: 'Gönderince ülkendeki bütün odalarda adınla duyurulur. Adını Ayarlar › Gizlilik’ten gizleyebilirsin.',
  fav: 'Bir hediyeye uzun basarak favorilere ekle veya çıkar.',
  bag: 'Görev ve giriş ödüllerin. Gönderirken jeton harcanmaz.',
};
/** Live: only the server's rewards fill the backpack (today the call task). */
const LIVE_BAG_NOTE = 'Görev ödüllerin. Gönderirken jeton harcanmaz.';
const COUNTS = [1, 5, 10, 25, 50, 100, 250];
/** Over a room leaving the sheet at least this under the Balkon line, the gift level stays under the title. */
const COMPACT_UNDER = 600;
/** One row of the grid: a 108 dp tile and the 3 dp around it. */
const TILE_ROW = 114;
/** Rows the sheet opens with over a room; the part of the next row shows that the grid scrolls. */
const ROWS_SHOWN = 3.35;
/** The sheet's fixed parts over a room: title row 46, people 58, shelves 44, action row 54. */
const ROOM_CHROME = 46 + 58 + 44 + 54;
/** What the gift level under the title adds to the title row. */
const LEVEL_ROW = 4;
const COUNT_LABELS: Record<number, string> = { 5: 'Selam', 25: 'Alkış', 100: 'Coşku', 250: 'Şölen' };
/** Sender gift level: Lv(n+1) needs LEVEL_XP[n] coins spent in total. */
const LEVEL_XP = [0, 870, 5_000, 20_000, 60_000, 150_000, 400_000, 1_000_000, 2_500_000, 6_000_000];

// Prototype persistence: the sheet remounts on every open, so favorites and the reward backpack
// live at module level (reset on app reload).
const favoriteGifts = new Set<string>(['g5', 'h1']);
const BACKPACK_SOURCES: Record<string, string> = { g1: 'Günlük giriş ödülü', g3: 'Günlük giriş ödülü', p3: 'Etkinlik ödülü', g2: 'Görev ödülü' };
const backpackStock: Record<string, number> = { g1: 7, g3: 2, p3: 3, g2: 1 };

const fmt = (n: number) => n.toLocaleString('tr-TR');
const levelOf = (spent: number) => LEVEL_XP.filter((x) => spent >= x).length;
const isLocked = (g: Gift, svip: number) => (g.minSvip ?? 0) > svip;

/** `shown`: the gifts the server still offers (giftShelf); `inBag`: what the backpack may send (bagGifts). */
function shelfGifts(shown: Gift[], shelf: Shelf, sort: PriceSort, favs: Set<string>, bag: Record<string, number>, inBag: Gift[], catalog: LiveCatalog | null) {
  if (shelf === 'lucky') return [];
  if (shelf === 'fav') return shown.filter((g) => favs.has(g.id));
  if (shelf === 'bag') return inBag.filter((g) => (bag[g.id] ?? 0) > 0);
  const list = shown.filter((g) => (shelf === 'global' ? isGlobalGift(g.id, catalog) : (g.cat ?? 'hot') === shelf));
  if (sort !== 'default') list.sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
  return list;
}

export function GiftSheet({
  visible,
  onClose,
  seated,
  listeners,
  initialTo,
  coins,
  onSend,
  onSendLucky,
  onSendBond,
  bonds,
}: {
  visible: boolean;
  onClose: () => void;
  /** People on a mic (not me), with their seat number (1-based). */
  seated: { id: string; seat: number }[];
  /** Listeners in the room (not on a mic). */
  listeners: string[];
  initialTo?: string | null;
  coins: number;
  /**
   * False when nothing was delivered (offline, no balance); the demo's backpack is only charged on true. `fromBag`:
   * a free gift from Çantam (live: the server takes it out of the backpack and charges no coins).
   */
  onSend: (g: Gift, to: string[], count: number, fromBag?: boolean) => boolean;
  /** `count` Lucky gifts to each person picked (one draw per gift). */
  onSendLucky: (giftId: string, toIds: string[], count: number) => void;
  /** A bond gift of the Aile ve Dost shelf: one, to one person, as a bond request. */
  onSendBond: (g: Gift, to: string) => void;
  /** The room's bonds (room-bonds useRoomBonds): a bond gift to someone I have that bond with goes as a gift (onSend). */
  bonds?: readonly RoomBond[];
}) {
  const { svipLevel, spentTotal, me, spendBlock, wealthLevel } = useApp();
  // Android modals draw edge to edge: the Gönder row must sit above the navigation bar.
  const { top: statusBar, bottom: navBar } = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // Over the room this one sheet may rise above the Balkon line (lib/sheet-space) and cover part of the mics: picking a
  // gift needs at least three rows in sight. It has a height of its own, so its top doesn't jump between shelves, and
  // gives way only to the status bar (the scrim keeps that much). It is laid out compactly there (no handle, the people
  // without their heading, a shelf note only where it carries a rule, the total in the button and a notice only for
  // Şanslı or when something is wrong).
  const roomSpace = useRoomSheetSpace();
  const compact = roomSpace !== null;
  const showLevel = roomSpace === null || roomSpace >= COMPACT_UNDER;
  const maxHeight = useSheetMax(0.82);
  const padBottom = Math.max(compact ? space.sm : space.lg, navBar + 8);
  const roomHeight = Math.max(roomSpace ?? 0, ROOM_CHROME + (showLevel ? LEVEL_ROW : 0) + padBottom + ROWS_SHOWN * TILE_ROW + 4);
  const lucky = useLucky();
  const catalog = useLiveCatalog();
  // The admins' gifts (Yönetim › Hediyeler) lead their shelves; then the compiled ones the server still lists.
  const shown = roomGiftShelf(catalog);
  const inBag = bagGifts(GIFTS, catalog);
  // Şanslı is a game of chance: no shelf below the gambling level. Live: the server draws and pays (lib/live/lucky).
  const luckyShelf = gamblingLevelOk(wealthLevel);
  // Live: the packages, odds and today's limit as the server has them, read each time the sheet opens.
  useEffect(() => {
    if (visible && luckyShelf && liveMode()) void refreshLucky().catch(() => {});
  }, [visible, luckyShelf]);
  const [luckyId, setLuckyId] = useState(lucky.config.gifts[0]?.id ?? '');
  const [luckyView, setLuckyView] = useState<'odds' | 'history'>('odds');
  // The "Olasılıklar" link under the button: the odds table of the gift picked, scrolled into sight (store rules want the
  // odds close to the purchase). `want`: the table is still to be laid out (it was the history).
  const gridRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const oddsAt = useRef({ shelf: 0, table: 0, want: false });
  const scrollToOdds = () => {
    const a = oddsAt.current;
    a.want = false;
    gridRef.current?.scrollTo({ y: Math.max(0, a.shelf + a.table - 8), animated: true });
  };
  const showOdds = () => {
    tapHaptic();
    if (luckyView === 'odds') return scrollToOdds();
    oddsAt.current.want = true;
    setLuckyView('odds');
  };
  const [pickedShelf, setShelf] = useState<Shelf>('hot');
  const shelf: Shelf = pickedShelf === 'lucky' && !luckyShelf ? 'hot' : pickedShelf;
  const [sort, setSort] = useState<PriceSort>('default');
  const [favs, setFavs] = useState(() => new Set(favoriteGifts));
  const [demoBag, setBag] = useState(() => ({ ...backpackStock }));
  // Live: the server's backpack, read again each time the sheet opens.
  const live = liveMode();
  const server = useBackpack(live);
  useEffect(() => {
    if (visible && live) void refreshBackpack();
  }, [visible, live]);
  const bag = live ? bagCounts(server?.items ?? []) : demoBag;
  const sourceOf = (id: string) => (live ? bagLabel(server?.items ?? [], id) : (BACKPACK_SOURCES[id] ?? 'Çanta'));
  const [sel, setSel] = useState<{ id: string; bag: boolean }>(() => ({ id: (shown.find((g) => (g.cat ?? 'hot') === 'hot') ?? shown[0]).id, bag: false }));
  const [count, setCount] = useState(1);
  const [countOpen, setCountOpen] = useState(false);
  const micIds = seated.map((x) => x.id);
  const roomIds = [...micIds, ...listeners.filter((id) => !micIds.includes(id))];
  const [picked, setPicked] = useState<string[]>(() => {
    const first = initialTo && roomIds.includes(initialTo) ? initialTo : micIds[0];
    return first ? [first] : [];
  });

  const targets = picked.filter((id) => roomIds.includes(id));
  const sameSet = (ids: string[]) => ids.length > 0 && targets.length === ids.length && ids.every((id) => targets.includes(id));
  const micAll = sameSet(micIds);
  const roomAll = sameSet(roomIds);
  // Listeners picked one by one (e.g. "Hediye gönder" from their profile) still show up in the row.
  const pickedListeners = roomAll ? [] : targets.filter((id) => !micIds.includes(id));
  const lg = lucky.config.gifts.find((x) => x.id === luckyId) ?? lucky.config.gifts[0];
  const isLucky = shelf === 'lucky' && !!lg;
  const list = shelfGifts(shown, shelf, sort, favs, bag, inBag, catalog);
  const kutlamaNote = shelf === 'gameplay' ? marksShelfNote() : null;
  // A pick from Çantam may be a gift off the shelf for now (Kalp from the call task).
  const gift = (sel.bag ? inBag : shown).find((g) => g.id === sel.id) ?? shown[0];
  // An empty shelf (bag, favorites, no Lucky packages) keeps the last pick in state; never send it from here.
  const onShelf = shelf === 'lucky' ? !!lg : list.some((it) => it.id === sel.id && sel.bag === (shelf === 'bag'));
  const fromBag = sel.bag;
  const locked = !fromBag && isLocked(gift, svipLevel);
  // A bond gift to someone I have that bond with goes as an ordinary gift, any count, and adds bond points; to someone
  // with a bond of another kind it can't go (one bond per pair); else it goes one at a time, to one person, and asks
  // them for a bond (data/bonds bondGiftMode).
  const bondMode = !isLucky && !fromBag ? bondGiftMode(bonds ?? [], 'me', targets, gift.id) : null;
  const bondAgain = bondMode?.mode === 'again';
  const bondGift = !isLucky && !fromBag && isBondGift(gift.id) && !bondAgain;
  const sendCount = bondGift ? 1 : count;
  // Profil izleri: a gift that leaves a mark doesn't go to someone who refuses marks (Gizlilik); the others still get it.
  const refusing = isLucky ? [] : refusingMarks(giftMarkOf(gift.id), targets, refusesMarks);
  const sendTo = refusing.length ? targets.filter((id) => !refusing.includes(id)) : targets;
  const total = isLucky ? lg.price * count * targets.length : (fromBag ? 0 : gift.price) * sendCount * sendTo.length;
  const short = fromBag ? 0 : total - coins;
  const bagNeed = needOf(count, targets.length);
  const bagShort = fromBag && shortOf(bag, gift.id, count, targets.length);
  // The daily spending limit (Ayarlar > Harcama kontrolü) is shown here, before the tap, like the balance.
  const overLimit = total > 0 && total <= coins ? spendBlock(total) : null;

  const level = levelOf(spentTotal);
  const nextXp = LEVEL_XP[level];
  const prevXp = LEVEL_XP[level - 1] ?? 0;
  const progress = nextXp === undefined ? 1 : Math.min(1, (spentTotal - prevXp) / (nextXp - prevXp));

  const pickShelf = (s: Shelf) => {
    tapHaptic();
    setShelf(s);
    const l = shelfGifts(shown, s, sort, favs, bag, inBag, catalog);
    const keep = l.some((g) => g.id === sel.id) && sel.bag === (s === 'bag');
    if (!keep && l[0]) setSel({ id: l[0].id, bag: s === 'bag' });
  };
  const toggleFav = (id: string) => {
    tapHaptic();
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    favoriteGifts.clear();
    next.forEach((x) => favoriteGifts.add(x));
    setFavs(next);
  };
  const togglePerson = (id: string) => {
    tapHaptic();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const pickGroup = (ids: string[], on: boolean) => {
    tapHaptic();
    setPicked(on ? micIds.slice(0, 1) : ids);
  };
  const goWallet = () => {
    onClose();
    router.push('/cuzdan');
  };
  const goVip = () => {
    onClose();
    router.push('/vip');
  };

  const luckyBlock = isLucky ? (me.age < LUCKY_MIN_AGE ? `Şanslı hediyeler ${LUCKY_MIN_AGE} yaş ve üzeri içindir.` : unavailable(lg)) : null;
  const sendLucky = () => {
    if (!targets.length || luckyBlock || overLimit) return;
    if (total > coins) return goWallet();
    pressHaptic();
    onSendLucky(lg.id, targets, count);
  };

  const send = () => {
    if (!onShelf) return;
    if (isLucky) return sendLucky();
    if (!sendTo.length || locked || bagShort) return;
    if (bondGift) {
      if (targets.length !== 1) return;
      if (short > 0) return goWallet();
      if (overLimit) return;
      pressHaptic();
      return onSendBond(gift, targets[0]);
    }
    if (fromBag) {
      // Stock goes down only after the gift really went out (offline sends nothing). Live: the server's answer.
      if (!onSend({ ...gift, price: 0 }, sendTo, count, true) || live) return;
      const next = { ...demoBag, [gift.id]: (demoBag[gift.id] ?? 0) - bagNeed };
      Object.assign(backpackStock, next);
      setBag(next);
      return;
    }
    if (short > 0) return goWallet();
    if (overLimit) return;
    pressHaptic();
    onSend(gift, sendTo, count);
  };

  // Footer state: exactly one message and one primary action at a time.
  const footer = !targets.length
    ? { tone: 'info' as const, text: roomIds.length ? 'Yukarıdan alıcı seç.' : 'Odada hediye gönderebileceğin kimse yok.', cta: 'Önce alıcı seç', disabled: true }
    : !onShelf
      ? { tone: 'info' as const, text: shelf === 'lucky' ? 'Şu an gönderilebilecek Şanslı hediye yok.' : 'Bu rafta hediye yok.', cta: 'Önce hediye seç', disabled: true }
    : isLucky
      ? luckyBlock
        ? { tone: 'lock' as const, text: luckyBlock, cta: 'Şu an gönderilemez', disabled: true }
        : total > coins
          ? { tone: 'warn' as const, text: `${fmt(total - coins)} jeton eksik.`, cta: 'Jeton yükle', variant: 'money' as const }
          : overLimit
            ? { tone: 'lock' as const, text: overLimit, cta: 'Günlük limiti aşıyor', disabled: true }
          : // The odds a tap away, next to the purchase (store rules); no prize amount here.
            { tone: 'info' as const, text: `${count * targets.length > 1 ? `Her hediye için ayrı çekiliş yapılır. ` : ''}Ödül garanti değildir`, odds: true, cta: `Gönder · ${fmt(total)}`, variant: 'money' as const }
    : bondGift && targets.length !== 1
      ? { tone: 'info' as const, text: 'Bağ hediyesi tek kişiye gönderilir: alıcılardan birini seç.', cta: 'Tek kişi seç', disabled: true }
    : bondMode?.mode === 'other' && bondMode.bond
      ? { tone: 'lock' as const, text: `Aranızda ${BOND_KINDS[bondMode.bond.kind].label} bağı var; bir kişiyle tek bağ kurulur.`, cta: 'Gönderilemez', disabled: true }
    : refusing.length === targets.length
      ? { tone: 'lock' as const, text: refusalLine(gift, refusing, (id) => userById(id).name, targets.length), cta: 'Gönderilemez', disabled: true }
    : locked
      ? { tone: 'lock' as const, text: `VIP ${gift.minSvip} ve üzerine özel (sen VIP ${svipLevel}).`, cta: 'VIP ayrıcalıklarını gör', variant: 'tonal' as const, onPress: goVip }
      : bagShort
        ? { tone: 'warn' as const, text: `Çantanda ${bag[gift.id] ?? 0} adet var, ${bagNeed} gerekli.`, cta: 'Adedi azalt', variant: 'tonal' as const, onPress: () => setCountOpen(true) }
        : fromBag
          ? { tone: 'info' as const, text: `${sourceOf(gift.id)} · jeton harcanmaz.`, cta: 'Ücretsiz gönder', variant: 'hero' as const }
          : short > 0
            ? { tone: 'warn' as const, text: `${fmt(short)} jeton eksik.`, cta: 'Jeton yükle', variant: 'money' as const }
            : overLimit
              ? { tone: 'lock' as const, text: overLimit, cta: 'Günlük limiti aşıyor', disabled: true }
            : bondAgain
              ? { tone: 'bond' as const, text: `+${fmt(bondPointsOf(total))} bağ puanı · Kalan: ${fmt(coins - total)} jeton`, cta: `Gönder · ${fmt(total)}`, variant: 'money' as const }
            : refusing.length
              ? { tone: 'warn' as const, text: refusalLine(gift, refusing, (id) => userById(id).name, targets.length), cta: `Gönder · ${fmt(total)}`, variant: 'money' as const }
            : { tone: 'info' as const, text: `Kalan: ${fmt(coins - total)} jeton`, cta: `Gönder · ${fmt(total)}`, variant: 'money' as const };

  const sortBtn =
    shelf !== 'fav' && shelf !== 'bag' && shelf !== 'lucky' ? (
      <Pressable
        onPress={() => setSort((x) => (x === 'default' ? 'asc' : x === 'asc' ? 'desc' : 'default'))}
        hitSlop={{ top: 6, bottom: 6 }}
        style={[g.sortBtn, compact && g.sortBtnBar]}
        accessibilityRole="button"
        accessibilityLabel={`Fiyata göre sırala: ${sort === 'asc' ? 'artan' : sort === 'desc' ? 'azalan' : 'varsayılan'}`}
      >
        <Ionicons name={sort === 'asc' ? 'arrow-up' : sort === 'desc' ? 'arrow-down' : 'swap-vertical'} size={14} color={colors.primaryText} />
        {/* Compact: one word, so a tap doesn't resize the shelves beside it; the arrow shows the direction. */}
        <Text style={g.sortText} numberOfLines={1}>
          {compact ? 'Fiyat' : sort === 'asc' ? 'Ucuzdan' : sort === 'desc' ? 'Pahalıdan' : 'Fiyat'}
        </Text>
      </Pressable>
    ) : null;
  // Compact: the total is in the button; a notice only for Şanslı (its odds) or when something is wrong.
  const noticeShown = !compact || isLucky || footer.tone !== 'info';
  const toneIcon = footer.tone === 'warn' ? 'alert-circle' : footer.tone === 'lock' ? 'lock-closed' : footer.tone === 'bond' ? 'link' : 'information-circle';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[g.scrim, compact && { minHeight: statusBar + 8 }]} onPress={onClose} accessibilityLabel="Hediye panelini kapat" />
      <View style={[g.sheet, compact ? { height: roomHeight, flexShrink: 1 } : { maxHeight }, { paddingBottom: padBottom }]}>
        {!compact && <View style={g.handle} />}

        {/* Header: title, quiet gift level, balance, explicit close */}
        <View style={[g.header, compact && g.headerSlim]}>
          <View style={{ flex: 1, minWidth: 0, gap: compact ? 2 : 4 }}>
            <Text style={[g.title, compact && g.titleSlim]} numberOfLines={compact ? 1 : undefined} adjustsFontSizeToFit={compact} minimumFontScale={0.85}>
              {compact && screenW < 360 ? 'Hediye' : 'Hediye gönder'}
            </Text>
            {showLevel && (
            <View style={g.levelRow} accessibilityLabel={`Hediye seviyen ${level}`}>
              <Text style={g.levelText} numberOfLines={1}>
                Hediye seviyen:{'\u00A0'}
                {level}
              </Text>
              <View style={g.levelTrack}>
                <View style={[g.levelFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            </View>
            )}
          </View>
          <Pressable onPress={goWallet} hitSlop={{ top: 4, bottom: 4 }} style={g.balance} accessibilityRole="button" accessibilityLabel={`Bakiye ${fmt(coins)} jeton, jeton yükle`}>
            <Icon3D name="coin" size={20} />
            <RollingNumber value={coins} style={g.balanceText} />
            <Ionicons name="add-circle" size={18} color={semantic.money} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={g.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Who */}
        <View style={[g.section, compact && { paddingBottom: 6 }]}>
          {!compact && (
            <Text style={g.label}>
              Kime
              {targets.length ? ` · ${roomAll && listeners.length ? 'odadaki herkes · ' : micAll ? 'mikrofondaki herkes · ' : ''}${targets.length} kişi` : ''}
            </Text>
          )}
          {roomIds.length === 0 ? (
            <Text style={[g.dim, { paddingRight: space.lg }]}>Odada hediye gönderebileceğin kimse yok.</Text>
          ) : (
            <View style={g.whoBar}>
              {/* The group picks stay in sight; the people run to the screen's edge, a cut avatar shows they scroll. */}
              <GroupPick icon="home" on={roomAll} label={`Odadaki herkes: mikrofondakiler ve dinleyiciler, ${roomIds.length} kişi`} onPress={() => pickGroup(roomIds, roomAll)} />
              {micIds.length > 0 && <GroupPick icon="mic" on={micAll} label={`Mikrofondaki herkes, ${micIds.length} kişi`} onPress={() => pickGroup(micIds, micAll)} />}
              {seated.length + pickedListeners.length > 0 && <View style={g.groupGap} />}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={g.whoRow}>
                {seated.map(({ id, seat }) => (
                  <PersonPick key={id} uri={userById(id).avatar} tag={String(seat)} on={targets.includes(id)} label={`${seat}. mikrofon, ${userById(id).name}`} onPress={() => togglePerson(id)} />
                ))}
                {pickedListeners.map((id) => (
                  <PersonPick key={id} uri={userById(id).avatar} tag="🎧" on label={`Dinleyici, ${userById(id).name}`} onPress={() => togglePerson(id)} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* What: shelves (compact: the price sort at their end, as the shelf notes are left out) */}
        <View style={g.shelfBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={g.shelves}>
          {SHELVES.filter((s) =>
            s.key === 'lucky' ? luckyShelf : s.key === 'global' ? shown.some((g) => isGlobalGift(g.id, catalog)) : !CATEGORY_SHELVES.has(s.key) || shown.some((g) => (g.cat ?? 'hot') === s.key),
          ).map((s) => {
            const on = shelf === s.key;
            const n = s.key === 'bag' ? Object.values(bag).filter((x) => x > 0).length : 0;
            // Çantam is the app's 3D bag alone, its count on a badge; the word stays for screen readers.
            if (s.key === 'bag')
              return (
                <Pressable key={s.key} onPress={() => pickShelf(s.key)} hitSlop={{ top: 4, bottom: 4 }} style={[g.shelf, g.shelfIcon, on && g.shelfOn]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={n ? `${s.label}, ${n} çeşit hediye` : s.label}>
                  <Icon3D name="bag" size={24} />
                  {n > 0 && (
                    <View style={g.shelfBadge}>
                      <Text style={g.shelfBadgeText} numberOfLines={1}>
                        {n > 99 ? '99+' : n}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            return (
              <Pressable key={s.key} onPress={() => pickShelf(s.key)} hitSlop={{ top: 4, bottom: 4 }} style={[g.shelf, on && g.shelfOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                {s.icon && <Ionicons name={s.icon} size={14} color={on ? '#fff' : colors.textDim} />}
                <Text style={[g.shelfText, on && { color: '#fff' }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {compact && sortBtn}
        </View>
        {/* The notes that carry a rule (Şanslı, Aile ve Dost, Global) open the grid below instead, in full. */}
        {!compact && shelf !== 'lucky' && (
        <View style={g.noteRow}>
          <Text style={[g.dim, { flex: 1 }]} numberOfLines={2}>
            {shelf === 'family' || shelf === 'global' || (shelf === 'gameplay' && kutlamaNote) ? '' : shelf === 'privilege' ? `${SHELF_NOTE.privilege} Senin seviyen: VIP ${svipLevel}.` : shelf === 'bag' && live ? LIVE_BAG_NOTE : SHELF_NOTE[shelf]}
          </Text>
          {sortBtn}
        </View>
        )}

        {/* What: grid */}
        {/* Keyed by shelf: each shelf opens at its top, not at the previous shelf's scroll offset. */}
        <ScrollView key={shelf} ref={gridRef} style={compact ? g.gridFill : g.gridScroll} contentContainerStyle={g.grid}>
          {/* Şanslı's disclaimer, the bond gifts' refund rule and Global's announcement: always in full, atop their shelf. */}
          {(shelf === 'lucky' || shelf === 'family' || shelf === 'global') && <Text style={[g.dim, g.shelfNote]}>{SHELF_NOTE[shelf]}</Text>}
          {/* Kutlama with a gift that leaves a profile mark: what it does, what cleans it, that anyone may refuse it. */}
          {shelf === 'gameplay' && kutlamaNote && <Text style={[g.dim, g.shelfNote]}>{kutlamaNote}</Text>}
          {isLucky ? (
            <LuckyShelf
              gifts={lucky.config.gifts}
              selected={lg}
              view={luckyView}
              onToggleView={() => setLuckyView((v) => (v === 'odds' ? 'history' : 'odds'))}
              history={lucky.records.filter((r) => r.userId === 'me')}
              version={lucky.config.version}
              onShelfAt={(y) => (oddsAt.current.shelf = y)}
              onTableAt={(y) => {
                oddsAt.current.table = y;
                if (oddsAt.current.want) scrollToOdds();
              }}
              onPick={(id) => {
                tapHaptic();
                setLuckyId(id);
              }}
            />
          ) : list.length === 0 ? (
            <Text style={[g.dim, { padding: space.xl, textAlign: 'center', width: '100%' }]}>
              {shelf === 'fav'
                ? 'Henüz favorin yok. Bir hediyeye uzun basarak ekleyebilirsin.'
                : !live
                  ? 'Çantan boş. Günlük giriş ve görevlerden ücretsiz hediye kazanabilirsin.'
                  : server === null
                    ? 'Çantan yükleniyor…'
                    : server.sources.length
                      ? 'Çantan boş. Günlük görevlerden ücretsiz hediye kazanabilirsin.'
                      : 'Çantan boş.'}
            </Text>
          ) : (
            list.map((it) => (
              <GiftTile
                key={it.id}
                gift={it}
                selected={sel.id === it.id && sel.bag === (shelf === 'bag')}
                favorite={favs.has(it.id)}
                locked={shelf !== 'bag' && isLocked(it, svipLevel)}
                muted={targets.length > 0 && refusingMarks(giftMarkOf(it.id), targets, refusesMarks).length === targets.length}
                global={isGlobalGift(it.id, catalog)}
                stock={shelf === 'bag' ? bag[it.id] : undefined}
                onPress={() => {
                  tapHaptic();
                  setSel({ id: it.id, bag: shelf === 'bag' });
                }}
                onLongPress={() => toggleFav(it.id)}
              />
            ))
          )}
        </ScrollView>

        {/* How much + one action */}
        <View style={[g.footer, compact && { paddingTop: 6 }]}>
          {!compact && (
          <View style={g.summary}>
            <GiftArt giftId={isLucky ? lg.id : gift.id} emoji={isLucky ? lg.emoji : gift.emoji} size={36} textStyle={g.summaryArt} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={g.summaryName} numberOfLines={1}>
                {isLucky ? `${lg.name} · Şanslı` : gift.name}
              </Text>
              <Text style={g.dim} numberOfLines={1}>
                {isLucky ? `${fmt(lg.price)} jeton × ${count} adet × ${targets.length} kişi` : `${fromBag ? 'Ücretsiz' : `${fmt(gift.price)} jeton`} × ${sendCount} adet × ${targets.length} kişi`}
                {!isLucky && gift.intimacy && !fromBag ? ` · 💗 +${fmt(gift.intimacy * count)} yakınlık` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={g.totalLabel}>Toplam</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Toplam ${fmt(total)} jeton`}>
                <Icon3D name="coin" size={22} />
                <Text style={[g.total, short > 0 && !locked && targets.length > 0 && { color: '#FCA5A5' }]}>{fmt(total)}</Text>
              </View>
            </View>
          </View>
          )}

          {noticeShown && 'odds' in footer ? (
          // Şanslı: a tap shows the odds table of the gift picked.
          <Pressable onPress={showOdds} hitSlop={{ top: 6, bottom: 6 }} style={g.notice} accessibilityRole="link" accessibilityLabel={`${footer.text}. Olasılık tablosunu göster`}>
            <Ionicons name="information-circle" size={16} color={colors.textDim} />
            <Text style={[g.dim, { flex: 1 }]}>
              {footer.text} · <Text style={g.noticeLink}>Olasılıklar</Text>
            </Text>
          </Pressable>
          ) : noticeShown ? (
          <View style={[g.notice, footer.tone === 'warn' && g.noticeWarn, footer.tone === 'lock' && g.noticeLock]}>
            <Ionicons name={toneIcon} size={16} color={footer.tone === 'info' ? colors.textDim : footer.tone === 'bond' ? '#FF8AA6' : colors.gold} />
            <Text style={[g.dim, { flex: 1 }, footer.tone !== 'info' && { color: footer.tone === 'bond' ? '#FFD3DF' : '#FDE68A' }]}>{footer.text}</Text>
          </View>
          ) : null}

          <View style={g.actions}>
            <Pressable onPress={() => setCountOpen((o) => !o)} style={[g.countBtn, compact && { height: 48 }]} accessibilityRole="button" accessibilityLabel={`Adet ${count}, değiştir`}>
              <Text style={g.countText}>×{count}</Text>
              <Ionicons name={countOpen ? 'chevron-down' : 'chevron-up'} size={14} color={colors.text} />
            </Pressable>
            <Button
              title={footer.cta}
              variant={'variant' in footer ? footer.variant : 'hero'}
              disabled={'disabled' in footer && footer.disabled}
              onPress={'onPress' in footer && footer.onPress ? footer.onPress : send}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {countOpen && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCountOpen(false)} accessibilityLabel="Adet seçimini kapat" />
            {/* Just over the ×N button, whatever the navigation bar under the sheet. */}
            <View style={[g.countPopup, { bottom: padBottom + (compact ? 54 : 60) }, compact && g.countPopupWide, compact && { width: Math.min(300, screenW - 32) }]}>
              {COUNTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    tapHaptic();
                    setCount(n);
                    setCountOpen(false);
                  }}
                  style={[g.countOption, compact && g.countOptionHalf, count === n && { backgroundColor: semantic.tonal }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: count === n }}
                >
                  <Text style={g.countOptionN}>×{n}</Text>
                  {!!COUNT_LABELS[n] && <Text style={g.dim}>{COUNT_LABELS[n]}</Text>}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** One person in the recipient row: avatar and seat number only (the name is in the accessibility label). */
function PersonPick({ uri, tag, on, label, onPress }: { uri: string; tag: string; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={g.pick} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={4}>
      <View style={[g.pickRing, on && g.pickRingOn]}>
        <Avatar uri={uri} size={36} />
      </View>
      <View style={[g.pickTag, on && g.pickTagOn]}>
        <Text style={[g.pickTagText, on && { color: semantic.actionInk }]}>{tag}</Text>
      </View>
    </Pressable>
  );
}
function GroupPick({ icon, on, label, onPress }: { icon: 'home' | 'mic'; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={g.pick} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={4}>
      <View style={[g.pickRing, g.groupDisc, on && g.pickRingOn]}>
        <Ionicons name={icon} size={20} color={on ? semantic.action : colors.text} />
      </View>
      <View style={[g.pickTag, g.groupTag, on && g.pickTagOn]}>
        <Text style={[g.pickTagText, on && { color: semantic.actionInk }]}>Tümü</Text>
      </View>
    </Pressable>
  );
}

/** Lucky packages, then either the full odds table of the selected one or the user's own Lucky history. */
function LuckyShelf({
  gifts,
  selected,
  view,
  onToggleView,
  history,
  version,
  onShelfAt,
  onTableAt,
  onPick,
}: {
  gifts: LuckyGift[];
  selected: LuckyGift;
  view: 'odds' | 'history';
  onToggleView: () => void;
  history: LuckyRecord[];
  version: number;
  /** Where this shelf and its odds table sit in the grid (the "Olasılıklar" link under the button scrolls there). */
  onShelfAt: (y: number) => void;
  onTableAt: (y: number) => void;
  onPick: (id: string) => void;
}) {
  const top = maxMult(selected);
  return (
    <View style={{ width: '100%' }} onLayout={(e) => onShelfAt(e.nativeEvent.layout.y)}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {gifts.map((it) => {
          const on = it.id === selected.id;
          const off = !!unavailable(it);
          return (
            <Pressable key={it.id} onPress={() => onPick(it.id)} style={g.tileWrap} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${it.name}, Şanslı, ${fmt(it.price)} jeton, en yüksek ×${maxMult(it)}${off ? ', şu an kapalı' : ''}`}>
              <View style={[g.tile, g.tileLucky, on && g.tileOn]}>
                <View style={g.tileArtBox}>
                  <GiftArt giftId={it.id} emoji={it.emoji} size={44} style={off && { opacity: 0.4 }} textStyle={[g.tileArt, off && { opacity: 0.4 }]} />
                </View>
                {/* On a line of its own: ×1.000 is wider than the corner of a tile. */}
                <View style={[g.luckyBadge, { backgroundColor: off ? colors.cardAlt : 'rgba(34,197,94,0.25)' }]}>
                  <Text style={g.badgeText}>{off ? 'Kapalı' : `×${fmt(maxMult(it))}`}</Text>
                </View>
                <View style={g.tileNameBox}>
                  <Text style={g.tileName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {it.name}
                  </Text>
                </View>
                <View style={g.tilePriceRow}>
                  <Icon3D name="coin" size={12} />
                  <Text style={g.tilePrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {fmt(it.price)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={g.luckyToggle}>
        <Pressable onPress={onToggleView} hitSlop={{ top: 6, bottom: 6 }} style={g.sortBtn} accessibilityRole="button">
          <Ionicons name={view === 'odds' ? 'time-outline' : 'stats-chart-outline'} size={14} color={colors.primaryText} />
          <Text style={g.sortText}>{view === 'odds' ? 'Geçmişim' : 'Olasılıklar'}</Text>
        </Pressable>
      </View>
      {view === 'odds' ? (
        <View style={g.odds} accessibilityLabel={`${selected.name} olasılık tablosu`} onLayout={(e) => onTableAt(e.nativeEvent.layout.y)}>
          <View style={g.oddsHead}>
            <Text style={[g.oddsCell, g.oddsHeadText]}>Çarpan</Text>
            <Text style={[g.oddsCell, g.oddsHeadText, { textAlign: 'center' }]}>Olasılık</Text>
            <Text style={[g.oddsCell, g.oddsHeadText, { textAlign: 'right' }]}>Ödül</Text>
          </View>
          {[...selected.tiers].sort((a, b) => b.mult - a.mult).map((t) => (
            <View key={t.mult} style={[g.oddsRow, t.mult === top && t.mult > 0 && { backgroundColor: 'rgba(251,191,36,0.08)' }]}>
              <Text style={[g.oddsCell, g.oddsMult]}>{t.mult ? `×${fmt(t.mult)}` : 'Ödül yok'}</Text>
              <Text style={[g.oddsCell, { textAlign: 'center' }]}>{oddsLabel(t.weight)}</Text>
              <Text style={[g.oddsCell, { textAlign: 'right' }]}>{t.mult ? `${fmt(selected.price * t.mult)} jeton` : '—'}</Text>
            </View>
          ))}
          <Text style={[g.dim, { marginTop: 6 }]}>
            Bu oranlar sunucudaki gerçek ayarlardır (sürüm {version}). Ödül garanti değildir. Ödül jeton olarak bakiyene eklenir; ödülle yaptığın harcama Cömertlik puanına sayılmaz.
          </Text>
        </View>
      ) : history.length === 0 ? (
        <Text style={[g.dim, { padding: space.lg, textAlign: 'center' }]}>Henüz Şanslı gönderimin yok.</Text>
      ) : (
        <View style={g.odds}>
          {history.slice(0, 30).map((r) => (
            <View key={r.txId} style={g.histRow}>
              <GiftArt giftId={r.giftId} emoji={r.emoji} size={26} textStyle={{ fontSize: 20 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={g.summaryName} numberOfLines={1}>
                  {r.giftName} → {userById(r.toId).name}
                </Text>
                <Text style={g.dim} numberOfLines={2}>
                  {r.at} · harcanan {fmt(r.price)} · ayar v{r.configVersion}
                </Text>
              </View>
              <Text style={[g.summaryName, { color: r.reward ? semantic.success : colors.textDim }]}>{r.reward ? `×${fmt(r.mult)} +${fmt(r.reward)}` : 'Ödül yok'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function GiftTile({
  gift,
  selected,
  favorite,
  locked,
  muted = false,
  global,
  stock,
  onPress,
  onLongPress,
}: {
  gift: Gift;
  selected: boolean;
  favorite: boolean;
  locked: boolean;
  /** Can't go to the people picked (they refuse the profile mark it leaves): drawn faded, without a lock. */
  muted?: boolean;
  /** Global hediye: announced in every room of the country; its badge takes the corner. */
  global?: boolean;
  stock?: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // At most one corner badge: Global (it says the whole country hears of it), else the effect type unless locked, so
  // the important fact is never crowded out.
  const badge = global ? 'global' : locked ? null : gift.badge === '3D' || gift.badge === 'music' ? gift.badge : null;
  const a11y = `${gift.name}, ${stock !== undefined ? `ücretsiz, ${stock} adet` : `${fmt(gift.price)} jeton`}${global ? ', global hediye' : ''}${locked ? `, VIP ${gift.minSvip} gerekli` : ''}${muted ? ', alıcı iz kabul etmiyor' : ''}${favorite ? ', favori' : ''}`;
  const faded = locked || muted;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={g.tileWrap} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={a11y} accessibilityHint="Uzun bas: favorilere ekle veya çıkar">
      <View style={[g.tile, selected && g.tileOn]}>
        <View style={g.tileArtBox}>
          <GiftArt giftId={gift.id} emoji={gift.emoji} size={44} style={faded && { opacity: 0.4 }} textStyle={[g.tileArt, faded && { opacity: 0.4 }]} />
        </View>
        <View style={g.tileNameBox}>
          <Text style={[g.tileName, faded && { color: colors.textDim }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
            {gift.name}
          </Text>
        </View>
        {locked ? (
          <View style={g.lockPill}>
            <Ionicons name="lock-closed" size={10} color={colors.gold} />
            <Text style={g.lockText}>VIP {gift.minSvip}</Text>
          </View>
        ) : stock !== undefined ? (
          <Text style={[g.tilePrice, { color: semantic.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Ücretsiz · {stock}
          </Text>
        ) : (
          <View style={g.tilePriceRow}>
            <Icon3D name="coin" size={12} />
            <Text style={g.tilePrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {fmt(gift.price)}
            </Text>
          </View>
        )}
        {badge === 'global' ? (
          <View style={g.globalBadge}>
            <Ionicons name="globe" size={9} color="#1A1014" />
            <Text style={g.globalBadgeText}>Global</Text>
          </View>
        ) : badge === 'music' ? (
          <Image source={MUSIC_BADGE} style={g.musicBadge} accessibilityIgnoresInvertColors />
        ) : badge ? (
          <View style={g.badge}>
            <Text style={g.badgeText}>{badge}</Text>
          </View>
        ) : null}
        {favorite && <Ionicons name="star" size={12} color={colors.gold} style={g.favMark} />}
        {selected && <Ionicons name="checkmark-circle" size={16} color={colors.primaryText} style={g.check} />}
      </View>
    </Pressable>
  );
}

const g = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: space.lg, ...edge.sheet },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  headerSlim: { paddingTop: 6, paddingBottom: 4 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '800' },
  titleSlim: { fontSize: type.bodyL },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  levelText: { color: colors.textDim, fontSize: type.caption },
  levelTrack: { width: 56, flexShrink: 1, height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  levelFill: { height: '100%', backgroundColor: colors.textDim },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: radius.pill, paddingHorizontal: space.md, height: 36 },
  coin: { fontSize: 15 },
  balanceText: { color: semantic.money, fontWeight: '800', fontSize: type.body, fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  // No right padding: the people's row runs to the screen's edge.
  section: { paddingLeft: space.lg, gap: space.sm, paddingBottom: space.md },
  label: { color: colors.text, fontSize: type.body, fontWeight: '700', paddingRight: space.lg },
  dim: { color: colors.textDim, fontSize: type.caption, lineHeight: 17 },
  whoBar: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  whoRow: { gap: space.sm, alignItems: 'flex-start', paddingRight: space.lg },
  pick: { alignItems: 'center', width: 48 },
  pickRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  pickRingOn: { borderColor: semantic.action },
  groupDisc: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  pickTag: { marginTop: -10, minWidth: 30, height: 18, borderRadius: 9, paddingHorizontal: 6, backgroundColor: '#0B1322', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  // Slimmer sides: "Tümü" at the largest text size would otherwise fill the 48 dp pick to the last pixel and could wrap.
  groupTag: { minWidth: 40, paddingHorizontal: 4 },
  pickTagOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  pickTagText: { color: '#fff', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  groupGap: { width: 1, alignSelf: 'stretch', marginVertical: 8, backgroundColor: colors.border },
  odds: { marginHorizontal: 3, marginTop: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.03)', gap: 2 },
  oddsHead: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  oddsHeadText: { color: colors.textDim, fontWeight: '700' },
  oddsRow: { flexDirection: 'row', paddingVertical: 5, borderRadius: 6 },
  oddsCell: { flex: 1, color: colors.text, fontSize: type.caption, fontVariant: ['tabular-nums'] },
  oddsMult: { fontWeight: '900' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 6, paddingRight: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, maxWidth: 160 },
  personOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  personText: { color: colors.textDim, fontSize: type.body, fontWeight: '700', flexShrink: 1 },
  shelfBar: { flexDirection: 'row', alignItems: 'center' },
  shelves: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs, alignItems: 'center' },
  shelf: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt },
  shelfOn: { backgroundColor: colors.primary },
  // Çantam: the bag icon alone, the pill as wide as it is tall; the count on its corner.
  shelfIcon: { width: 44, paddingHorizontal: 0, justifyContent: 'center' },
  shelfBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.gold, borderWidth: 1.5, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  shelfBadgeText: { color: '#1A1014', fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  shelfText: { color: colors.textDim, fontSize: type.body, fontWeight: '700' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 32 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: space.sm },
  sortText: { color: colors.primaryText, fontSize: type.caption, fontWeight: '700' },
  // Compact: at the shelves' end, one width whatever the sort, set apart so no shelf reads as covered by it.
  sortBtnBar: { width: 68, justifyContent: 'center', paddingHorizontal: space.sm, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  gridScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  // Compact: the sheet has its own height, the grid takes what the fixed parts leave.
  gridFill: { flex: 1, minHeight: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.sm, paddingBottom: space.sm },
  shelfNote: { width: '100%', paddingHorizontal: space.sm, paddingBottom: 6 },
  luckyToggle: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.xs },
  tileWrap: { width: '25%', padding: 3 },
  // One height for every tile: art, two lines kept for the name, and the price on the same line across a row.
  tile: { height: 108, alignItems: 'center', paddingTop: 4, paddingBottom: 3, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.03)' },
  // Şanslı: one line more, for the top multiplier.
  tileLucky: { height: 124 },
  tileOn: { borderColor: colors.primaryText, backgroundColor: semantic.tonal },
  tileArtBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // An emoji in place of a picture grows with the phone's text size and still has to fit the 44 dp box.
  tileArt: { fontSize: 30, lineHeight: 38 },
  tileNameBox: { flex: 1, alignSelf: 'stretch', minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  // Two lines, broken between words ("Şans / Yoncası"), instead of "Şans Yon…".
  tileName: { color: colors.text, fontSize: type.caption, fontWeight: '600', maxWidth: '100%', textAlign: 'center' },
  tilePriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, maxWidth: '100%' },
  tilePrice: { color: colors.textDim, fontSize: type.caption, fontVariant: ['tabular-nums'], flexShrink: 1 },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  lockText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 20, height: 16, borderRadius: 5, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  luckyBadge: { alignSelf: 'center', minWidth: 20, height: 16, borderRadius: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  musicBadge: { position: 'absolute', top: 2, right: 2, width: 20, height: 20 },
  globalBadge: { position: 'absolute', top: 2, right: 2, flexDirection: 'row', alignItems: 'center', gap: 1, height: 14, borderRadius: 5, paddingHorizontal: 3, backgroundColor: colors.gold },
  globalBadgeText: { color: '#1A1014', fontSize: 9, fontWeight: '900' },
  // The left corner, clear of the name: the selection above, the favourite star under it.
  favMark: { position: 'absolute', top: 20, left: 4 },
  check: { position: 'absolute', top: 2, left: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summaryArt: { fontSize: 28 },
  summaryName: { color: colors.text, fontSize: type.body, fontWeight: '800' },
  totalLabel: { color: colors.textDim, fontSize: type.caption },
  total: { color: colors.text, fontSize: type.title, fontWeight: '900', fontVariant: ['tabular-nums'] },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 2 },
  noticeLink: { color: colors.primaryText, fontWeight: '700', textDecorationLine: 'underline' },
  noticeWarn: { backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: radius.sm, padding: space.sm },
  noticeLock: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: radius.sm, padding: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  countBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt },
  countText: { color: colors.text, fontWeight: '800', fontSize: type.bodyL, fontVariant: ['tabular-nums'] },
  countPopup: { position: 'absolute', left: space.lg, backgroundColor: colors.cardAlt, borderRadius: radius.lg, paddingVertical: 6, minWidth: 200, borderWidth: 1, borderColor: colors.border },
  countOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 44 },
  // Compact: two columns, so the list stays inside the shorter sheet (Android takes no touch outside it).
  countPopupWide: { flexDirection: 'row', flexWrap: 'wrap' },
  countOptionHalf: { width: '50%', paddingHorizontal: space.md },
  countOptionN: { color: colors.text, fontWeight: '800', fontSize: type.body, width: 52, fontVariant: ['tabular-nums'] },
});
