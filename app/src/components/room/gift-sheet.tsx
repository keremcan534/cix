// SimilarClub gift sheet. One job: send a chosen gift to chosen people at a cost the user has seen.
// Zones top to bottom: who (recipients) → what (catalog) → how much (total, balance) → one primary action.
// Who: a compact row of seat avatars (seat number only) plus two group picks: everyone on a mic, and
// everyone in the room (mics + listeners).
// Lucky shelf: price, every multiplier with its exact odds and reward are shown before sending; the draw
// happens on the server (lib/lucky) and is shown afterwards in the room.
// Spending rules: the total (price × count × recipients) is always visible before sending, gold is
// used only for the money action, and a short balance turns the action into "top up" instead of
// failing after the tap. Product rule: no gift ever asks for a confirmation; one tap sends.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button } from '@/components/ui';
import { GIFTS, userById, type Gift, type GiftCat } from '@/data/mock';
import { LUCKY_RECIPIENT_SHARE, pct } from '@/data/rules';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { LUCKY_MIN_AGE, maxMult, oddsLabel, unavailable, useLucky, type LuckyGift, type LuckyRecord } from '@/lib/lucky';
import { useApp } from '@/store';
import { colors, radius, semantic, space, type } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { GiftArt, MUSIC_BADGE } from '@/components/GiftArt';

type Shelf = GiftCat | 'lucky' | 'fav' | 'bag';
type PriceSort = 'default' | 'asc' | 'desc';

const SHELVES: { key: Shelf; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'hot', label: 'Popüler' },
  { key: 'lucky', label: 'Lucky', icon: 'leaf' },
  { key: 'gameplay', label: 'Eğlenceli' },
  { key: 'couple', label: 'İkili' },
  { key: 'privilege', label: 'Özel' },
  { key: 'fav', label: 'Favoriler', icon: 'star' },
  { key: 'bag', label: 'Çantam', icon: 'bag-handle' },
];
/** One neutral line that explains the shelf; no countdowns, no "spend more" nudges. */
const SHELF_NOTE: Record<Shelf, string> = {
  hot: 'En çok gönderilen hediyeler.',
  lucky: `Gönderdiğin hediyenin katları kadar jeton kazanma ihtimali. Ödül garanti değildir; olasılıklar aşağıda. Alıcıya ve PK puanına hediye değerinin ${pct(LUCKY_RECIPIENT_SHARE)}’si yazılır.`,
  gameplay: 'Alıcının koltuğuna animasyonla atılır. Fiyat sabit, sürpriz ödül yok.',
  couple: 'İkili hediyeler yakınlık puanını ekstra %2 artırır.',
  privilege: 'SVIP üyelerine özel hediyeler.',
  fav: 'Bir hediyeye uzun basarak favorilere ekle veya çıkar.',
  bag: 'Görev ve giriş ödüllerin. Gönderirken jeton harcanmaz.',
};
const COUNTS = [1, 10, 66, 99, 188, 520, 1314];
const COUNT_LABELS: Record<number, string> = { 10: 'Mükemmel', 66: 'Her şey yolunda', 99: 'Sonsuza dek', 188: 'Seni seviyorum', 520: 'Aşkım', 1314: 'Ömür boyu' };
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

function shelfGifts(shelf: Shelf, sort: PriceSort, favs: Set<string>, bag: Record<string, number>) {
  if (shelf === 'lucky') return [];
  if (shelf === 'fav') return GIFTS.filter((g) => favs.has(g.id));
  if (shelf === 'bag') return GIFTS.filter((g) => (bag[g.id] ?? 0) > 0);
  const list = GIFTS.filter((g) => (g.cat ?? 'hot') === shelf);
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
}: {
  visible: boolean;
  onClose: () => void;
  /** People on a mic (not me), with their seat number (1-based). */
  seated: { id: string; seat: number }[];
  /** Listeners in the room (not on a mic). */
  listeners: string[];
  initialTo?: string | null;
  coins: number;
  /** False when nothing was delivered (offline, no balance); the backpack is only charged on true. */
  onSend: (g: Gift, to: string[], count: number) => boolean;
  /** `count` Lucky gifts to each person picked (one draw per gift). */
  onSendLucky: (giftId: string, toIds: string[], count: number) => void;
}) {
  const { svipLevel, spentTotal, me, spendBlock } = useApp();
  const lucky = useLucky();
  const [luckyId, setLuckyId] = useState(lucky.config.gifts[0]?.id ?? '');
  const [luckyView, setLuckyView] = useState<'odds' | 'history'>('odds');
  const [shelf, setShelf] = useState<Shelf>('hot');
  const [sort, setSort] = useState<PriceSort>('default');
  const [favs, setFavs] = useState(() => new Set(favoriteGifts));
  const [bag, setBag] = useState(() => ({ ...backpackStock }));
  const [sel, setSel] = useState<{ id: string; bag: boolean }>({ id: GIFTS[0].id, bag: false });
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
  const list = shelfGifts(shelf, sort, favs, bag);
  const gift = GIFTS.find((g) => g.id === sel.id) ?? GIFTS[0];
  // An empty shelf (bag, favorites, no Lucky packages) keeps the last pick in state; never send it from here.
  const onShelf = shelf === 'lucky' ? !!lg : list.some((it) => it.id === sel.id && sel.bag === (shelf === 'bag'));
  const fromBag = sel.bag;
  const locked = !fromBag && isLocked(gift, svipLevel);
  const total = isLucky ? lg.price * count * targets.length : (fromBag ? 0 : gift.price) * count * targets.length;
  const short = fromBag ? 0 : total - coins;
  const bagNeed = count * targets.length;
  const bagShort = fromBag && bagNeed > (bag[gift.id] ?? 0);
  // The daily spending limit (Ayarlar > Harcama kontrolü) is shown here, before the tap, like the balance.
  const overLimit = total > 0 && total <= coins ? spendBlock(total) : null;

  const level = levelOf(spentTotal);
  const nextXp = LEVEL_XP[level];
  const prevXp = LEVEL_XP[level - 1] ?? 0;
  const progress = nextXp === undefined ? 1 : Math.min(1, (spentTotal - prevXp) / (nextXp - prevXp));

  const pickShelf = (s: Shelf) => {
    tapHaptic();
    setShelf(s);
    const l = shelfGifts(s, sort, favs, bag);
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

  const luckyBlock = isLucky ? (me.age < LUCKY_MIN_AGE ? `Lucky hediyeler ${LUCKY_MIN_AGE} yaş ve üzeri içindir.` : unavailable(lg)) : null;
  const sendLucky = () => {
    if (!targets.length || luckyBlock || overLimit) return;
    if (total > coins) return goWallet();
    pressHaptic();
    onSendLucky(lg.id, targets, count);
  };

  const send = () => {
    if (!onShelf) return;
    if (isLucky) return sendLucky();
    if (!targets.length || locked || bagShort) return;
    if (fromBag) {
      // Stock goes down only after the gift really went out (offline sends nothing).
      if (!onSend({ ...gift, price: 0 }, targets, count)) return;
      const next = { ...bag, [gift.id]: (bag[gift.id] ?? 0) - bagNeed };
      Object.assign(backpackStock, next);
      setBag(next);
      return;
    }
    if (short > 0) return goWallet();
    if (overLimit) return;
    pressHaptic();
    onSend(gift, targets, count);
  };

  const top = isLucky ? maxMult(lg) : 0;
  const topOdds = isLucky ? (lg.tiers.find((t) => t.mult === top)?.weight ?? 0) : 0;
  // Footer state: exactly one message and one primary action at a time.
  const footer = !targets.length
    ? { tone: 'info' as const, text: roomIds.length ? 'Hediyeyi kime göndereceğini yukarıdan seç.' : 'Odada hediye gönderebileceğin kimse yok.', cta: 'Önce alıcı seç', disabled: true }
    : !onShelf
      ? { tone: 'info' as const, text: shelf === 'lucky' ? 'Şu an gönderilebilecek Lucky hediye yok.' : 'Bu rafta gönderilecek hediye yok. Başka bir raftan seç.', cta: 'Önce hediye seç', disabled: true }
    : isLucky
      ? luckyBlock
        ? { tone: 'lock' as const, text: luckyBlock, cta: 'Şu an gönderilemez', disabled: true }
        : total > coins
          ? { tone: 'warn' as const, text: `Bakiyen ${fmt(coins)} jeton. Bu gönderim için ${fmt(total - coins)} jeton eksik.`, cta: 'Jeton yükle', variant: 'money' as const }
          : overLimit
            ? { tone: 'lock' as const, text: overLimit, cta: 'Günlük limiti aşıyor', disabled: true }
          : { tone: 'info' as const, text: `${count * targets.length > 1 ? `Her hediye için ayrı çekiliş yapılır. ` : ''}En yüksek ödül ×${fmt(top)} = ${fmt(lg.price * top)} jeton (olasılık ${oddsLabel(topOdds)}). Ödül garanti değildir. Sonra sağ alttaki çarka basarak aynı gönderimi tekrarlayabilirsin.`, cta: `Gönder · ${fmt(total)}`, variant: 'money' as const }
    : locked
      ? { tone: 'lock' as const, text: `${gift.name}, SVIP ${gift.minSvip} ve üzerine özel. Senin seviyen: SVIP ${svipLevel}.`, cta: 'SVIP ayrıcalıklarını gör', variant: 'tonal' as const, onPress: goVip }
      : bagShort
        ? { tone: 'warn' as const, text: `Çantanda ${bag[gift.id] ?? 0} adet var, bu gönderim için ${bagNeed} adet gerekiyor.`, cta: 'Adedi azalt', variant: 'tonal' as const, onPress: () => setCountOpen(true) }
        : fromBag
          ? { tone: 'info' as const, text: `${BACKPACK_SOURCES[gift.id] ?? 'Çanta'} · jeton harcanmaz.`, cta: 'Ücretsiz gönder', variant: 'hero' as const }
          : short > 0
            ? { tone: 'warn' as const, text: `Bakiyen ${fmt(coins)} jeton. Bu gönderim için ${fmt(short)} jeton eksik.`, cta: 'Jeton yükle', variant: 'money' as const }
            : overLimit
              ? { tone: 'lock' as const, text: overLimit, cta: 'Günlük limiti aşıyor', disabled: true }
            : { tone: 'info' as const, text: `Gönderimden sonra kalan bakiye: ${fmt(coins - total)} jeton`, cta: `Gönder · ${fmt(total)}`, variant: 'money' as const };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={g.scrim} onPress={onClose} accessibilityLabel="Hediye panelini kapat" />
      <View style={g.sheet}>
        <View style={g.handle} />

        {/* Header: title, quiet gift level, balance, explicit close */}
        <View style={g.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={g.title}>Hediye gönder</Text>
            <View style={g.levelRow} accessibilityLabel={`Hediye seviyen ${level}`}>
              <Text style={g.levelText}>Hediye seviyesi Lv.{level}</Text>
              <View style={g.levelTrack}>
                <View style={[g.levelFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            </View>
          </View>
          <Pressable onPress={goWallet} style={g.balance} accessibilityRole="button" accessibilityLabel={`Bakiye ${fmt(coins)} jeton, jeton yükle`}>
            <Icon3D name="coin" size={20} />
            <Text style={g.balanceText}>{fmt(coins)}</Text>
            <Ionicons name="add-circle" size={18} color={semantic.money} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={g.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Who */}
        <View style={g.section}>
          <Text style={g.label}>
            Kime
            {targets.length ? ` · ${roomAll && listeners.length ? 'odadaki herkes · ' : micAll ? 'mikrofondaki herkes · ' : ''}${targets.length} kişi` : ''}
          </Text>
          {roomIds.length === 0 ? (
            <Text style={g.dim}>Odada hediye gönderebileceğin kimse yok.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.whoRow}>
              {seated.map(({ id, seat }) => (
                <PersonPick key={id} uri={userById(id).avatar} tag={String(seat)} on={targets.includes(id)} label={`${seat}. mikrofon, ${userById(id).name}`} onPress={() => togglePerson(id)} />
              ))}
              {pickedListeners.map((id) => (
                <PersonPick key={id} uri={userById(id).avatar} tag="🎧" on label={`Dinleyici, ${userById(id).name}`} onPress={() => togglePerson(id)} />
              ))}
              <View style={g.groupGap} />
              <GroupPick icon="home" on={roomAll} label={`Odadaki herkes: mikrofondakiler ve dinleyiciler, ${roomIds.length} kişi`} onPress={() => pickGroup(roomIds, roomAll)} />
              {micIds.length > 0 && <GroupPick icon="mic" on={micAll} label={`Mikrofondaki herkes, ${micIds.length} kişi`} onPress={() => pickGroup(micIds, micAll)} />}
            </ScrollView>
          )}
        </View>

        {/* What: shelves */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={g.shelves}>
          {SHELVES.map((s) => {
            const on = shelf === s.key;
            const n = s.key === 'bag' ? Object.values(bag).filter((x) => x > 0).length : 0;
            return (
              <Pressable key={s.key} onPress={() => pickShelf(s.key)} style={[g.shelf, on && g.shelfOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                {s.icon && <Ionicons name={s.icon} size={14} color={on ? '#fff' : colors.textDim} />}
                <Text style={[g.shelfText, on && { color: '#fff' }]}>
                  {s.label}
                  {n ? ` ${n}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={g.noteRow}>
          <Text style={[g.dim, { flex: 1 }]} numberOfLines={2}>
            {shelf === 'privilege' ? `${SHELF_NOTE.privilege} Senin seviyen: SVIP ${svipLevel}.` : SHELF_NOTE[shelf]}
          </Text>
          {isLucky && (
            <Pressable onPress={() => setLuckyView((v) => (v === 'odds' ? 'history' : 'odds'))} style={g.sortBtn} accessibilityRole="button">
              <Ionicons name={luckyView === 'odds' ? 'time-outline' : 'stats-chart-outline'} size={14} color={colors.primaryText} />
              <Text style={g.sortText}>{luckyView === 'odds' ? 'Geçmişim' : 'Olasılıklar'}</Text>
            </Pressable>
          )}
          {shelf !== 'fav' && shelf !== 'bag' && shelf !== 'lucky' && (
            <Pressable
              onPress={() => setSort((x) => (x === 'default' ? 'asc' : x === 'asc' ? 'desc' : 'default'))}
              style={g.sortBtn}
              accessibilityRole="button"
              accessibilityLabel={`Fiyata göre sırala: ${sort === 'asc' ? 'artan' : sort === 'desc' ? 'azalan' : 'varsayılan'}`}
            >
              <Ionicons name={sort === 'asc' ? 'arrow-up' : sort === 'desc' ? 'arrow-down' : 'swap-vertical'} size={14} color={colors.primaryText} />
              <Text style={g.sortText}>{sort === 'asc' ? 'Ucuzdan' : sort === 'desc' ? 'Pahalıdan' : 'Fiyat'}</Text>
            </Pressable>
          )}
        </View>

        {/* What: grid */}
        {/* Keyed by shelf: each shelf opens at its top, not at the previous shelf's scroll offset. */}
        <ScrollView key={shelf} style={g.gridScroll} contentContainerStyle={g.grid}>
          {isLucky ? (
            <LuckyShelf
              gifts={lucky.config.gifts}
              selected={lg}
              view={luckyView}
              history={lucky.records.filter((r) => r.userId === 'me')}
              version={lucky.config.version}
              onPick={(id) => {
                tapHaptic();
                setLuckyId(id);
              }}
            />
          ) : list.length === 0 ? (
            <Text style={[g.dim, { padding: space.xl, textAlign: 'center', width: '100%' }]}>
              {shelf === 'fav' ? 'Henüz favorin yok. Bir hediyeye uzun basarak ekleyebilirsin.' : 'Çantan boş. Günlük giriş ve görevlerden ücretsiz hediye kazanabilirsin.'}
            </Text>
          ) : (
            list.map((it) => (
              <GiftTile
                key={it.id}
                gift={it}
                selected={sel.id === it.id && sel.bag === (shelf === 'bag')}
                favorite={favs.has(it.id)}
                locked={shelf !== 'bag' && isLocked(it, svipLevel)}
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
        <View style={g.footer}>
          <View style={g.summary}>
            <GiftArt giftId={isLucky ? lg.id : gift.id} emoji={isLucky ? lg.emoji : gift.emoji} size={36} textStyle={g.summaryArt} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={g.summaryName} numberOfLines={1}>
                {isLucky ? `${lg.name} · Lucky` : gift.name}
              </Text>
              <Text style={g.dim} numberOfLines={1}>
                {isLucky ? `${fmt(lg.price)} jeton × ${count} adet × ${targets.length} kişi` : `${fromBag ? 'Ücretsiz' : `${fmt(gift.price)} jeton`} × ${count} adet × ${targets.length} kişi`}
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

          <View style={[g.notice, footer.tone === 'warn' && g.noticeWarn, footer.tone === 'lock' && g.noticeLock]}>
            <Ionicons name={footer.tone === 'warn' ? 'alert-circle' : footer.tone === 'lock' ? 'lock-closed' : 'information-circle'} size={16} color={footer.tone === 'info' ? colors.textDim : colors.gold} />
            <Text style={[g.dim, { flex: 1 }, footer.tone !== 'info' && { color: '#FDE68A' }]}>{footer.text}</Text>
          </View>

          <View style={g.actions}>
            <Pressable onPress={() => setCountOpen((o) => !o)} style={g.countBtn} accessibilityRole="button" accessibilityLabel={`Adet ${count}, değiştir`}>
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
            <View style={g.countPopup}>
              {COUNTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    tapHaptic();
                    setCount(n);
                    setCountOpen(false);
                  }}
                  style={[g.countOption, count === n && { backgroundColor: semantic.tonal }]}
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
        <Avatar uri={uri} size={42} />
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
        <Ionicons name={icon} size={22} color={on ? semantic.action : colors.text} />
      </View>
      <View style={[g.pickTag, g.groupTag, on && g.pickTagOn]}>
        <Text style={[g.pickTagText, on && { color: semantic.actionInk }]}>Tümü</Text>
      </View>
    </Pressable>
  );
}

/** Lucky packages, then either the full odds table of the selected one or the user's own Lucky history. */
function LuckyShelf({ gifts, selected, view, history, version, onPick }: { gifts: LuckyGift[]; selected: LuckyGift; view: 'odds' | 'history'; history: LuckyRecord[]; version: number; onPick: (id: string) => void }) {
  const top = maxMult(selected);
  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {gifts.map((it) => {
          const on = it.id === selected.id;
          const off = !!unavailable(it);
          return (
            <Pressable key={it.id} onPress={() => onPick(it.id)} style={g.tileWrap} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${it.name}, Lucky, ${fmt(it.price)} jeton, en yüksek ×${maxMult(it)}${off ? ', şu an kapalı' : ''}`}>
              <View style={[g.tile, on && g.tileOn]}>
                <GiftArt giftId={it.id} emoji={it.emoji} size={42} style={off && { opacity: 0.4 }} textStyle={[g.tileArt, off && { opacity: 0.4 }]} />
                <Text style={g.tileName} numberOfLines={1}>
                  {it.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon3D name="coin" size={13} />
                  <Text style={g.tilePrice}>{fmt(it.price)}</Text>
                </View>
                <View style={[g.badge, { backgroundColor: off ? colors.cardAlt : 'rgba(34,197,94,0.25)' }]}>
                  <Text style={g.badgeText}>{off ? 'Kapalı' : `×${fmt(maxMult(it))}`}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      {view === 'odds' ? (
        <View style={g.odds} accessibilityLabel={`${selected.name} olasılık tablosu`}>
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
            Bu oranlar sunucudaki gerçek ayarlardır (sürüm {version}). Ödül garanti değildir, jeton nakde çevrilmez. Hediyeyi alan kişi normal hediye gelirini alır; senin ödülün ayrıca hesaplanır.
          </Text>
        </View>
      ) : history.length === 0 ? (
        <Text style={[g.dim, { padding: space.lg, textAlign: 'center' }]}>Henüz Lucky gönderimin yok.</Text>
      ) : (
        <View style={g.odds}>
          {history.slice(0, 30).map((r) => (
            <View key={r.txId} style={g.histRow}>
              <GiftArt giftId={r.giftId} emoji={r.emoji} size={26} textStyle={{ fontSize: 20 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={g.summaryName} numberOfLines={1}>
                  {r.giftName} → {userById(r.toId).name}
                </Text>
                <Text style={g.dim} numberOfLines={1}>
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
  stock,
  onPress,
  onLongPress,
}: {
  gift: Gift;
  selected: boolean;
  favorite: boolean;
  locked: boolean;
  stock?: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // At most one corner badge: a lock beats the effect type, so the important fact is never crowded out.
  const badge = locked ? null : gift.badge === '3D' || gift.badge === 'music' ? gift.badge : null;
  const a11y = `${gift.name}, ${stock !== undefined ? `ücretsiz, ${stock} adet` : `${fmt(gift.price)} jeton`}${locked ? `, SVIP ${gift.minSvip} gerekli` : ''}${favorite ? ', favori' : ''}`;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={g.tileWrap} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={a11y} accessibilityHint="Uzun bas: favorilere ekle veya çıkar">
      <View style={[g.tile, selected && g.tileOn]}>
        <GiftArt giftId={gift.id} emoji={gift.emoji} size={42} style={locked && { opacity: 0.4 }} textStyle={[g.tileArt, locked && { opacity: 0.4 }]} />
        <Text style={[g.tileName, locked && { color: colors.textDim }]} numberOfLines={1}>
          {gift.name}
        </Text>
        {locked ? (
          <View style={g.lockPill}>
            <Ionicons name="lock-closed" size={10} color={colors.gold} />
            <Text style={g.lockText}>SVIP {gift.minSvip}</Text>
          </View>
        ) : stock !== undefined ? (
          <Text style={[g.tilePrice, { color: semantic.success }]}>Ücretsiz · {stock}</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Icon3D name="coin" size={13} />
            <Text style={g.tilePrice}>{fmt(gift.price)}</Text>
          </View>
        )}
        {badge === 'music' ? (
          <Image source={MUSIC_BADGE} style={g.musicBadge} accessibilityIgnoresInvertColors />
        ) : badge ? (
          <View style={g.badge}>
            <Text style={g.badgeText}>{badge}</Text>
          </View>
        ) : null}
        {favorite && <Ionicons name="star" size={12} color={colors.gold} style={g.favMark} />}
        {selected && <Ionicons name="checkmark-circle" size={18} color={colors.primaryText} style={g.check} />}
      </View>
    </Pressable>
  );
}

const g = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(8,4,18,0.45)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: space.lg, maxHeight: '82%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  title: { color: colors.text, fontSize: type.title, fontWeight: '800' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  levelText: { color: colors.textDim, fontSize: type.caption },
  levelTrack: { width: 56, height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  levelFill: { height: '100%', backgroundColor: colors.textDim },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: radius.pill, paddingHorizontal: space.md, height: 36 },
  coin: { fontSize: 15 },
  balanceText: { color: semantic.money, fontWeight: '800', fontSize: type.body, fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md },
  label: { color: colors.text, fontSize: type.body, fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: type.caption, lineHeight: 17 },
  whoRow: { gap: 10, alignItems: 'flex-start', paddingRight: space.sm },
  pick: { alignItems: 'center', width: 52 },
  pickRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  pickRingOn: { borderColor: semantic.action },
  groupDisc: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  pickTag: { marginTop: -10, minWidth: 30, height: 18, borderRadius: 9, paddingHorizontal: 6, backgroundColor: '#0B1322', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  groupTag: { minWidth: 40 },
  pickTagOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  pickTagText: { color: '#fff', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  groupGap: { width: 1, alignSelf: 'stretch', marginVertical: 8, backgroundColor: colors.border },
  odds: { marginHorizontal: 4, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.03)', gap: 2 },
  oddsHead: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  oddsHeadText: { color: colors.textDim, fontWeight: '700' },
  oddsRow: { flexDirection: 'row', paddingVertical: 5, borderRadius: 6 },
  oddsCell: { flex: 1, color: colors.text, fontSize: type.caption, fontVariant: ['tabular-nums'] },
  oddsMult: { fontWeight: '900' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 6, paddingRight: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, maxWidth: 160 },
  personOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  personText: { color: colors.textDim, fontSize: type.body, fontWeight: '700', flexShrink: 1 },
  shelves: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  shelf: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt },
  shelfOn: { backgroundColor: colors.primary },
  shelfText: { color: colors.textDim, fontSize: type.body, fontWeight: '700' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 32 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: space.sm },
  sortText: { color: colors.primaryText, fontSize: type.caption, fontWeight: '700' },
  gridScroll: { flexGrow: 0, flexShrink: 1, minHeight: 180 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md, paddingBottom: space.sm },
  tileWrap: { width: '25%', padding: 4 },
  tile: { alignItems: 'center', gap: 2, paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.03)' },
  tileOn: { borderColor: colors.primaryText, backgroundColor: semantic.tonal },
  tileArt: { fontSize: 34, lineHeight: 42 },
  tileName: { color: colors.text, fontSize: type.caption, fontWeight: '600', maxWidth: '100%' },
  tilePrice: { color: colors.textDim, fontSize: type.caption, fontVariant: ['tabular-nums'] },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  lockText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 20, height: 16, borderRadius: 5, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  musicBadge: { position: 'absolute', top: 3, right: 3, width: 20, height: 20 },
  favMark: { position: 'absolute', top: 5, left: 6 },
  check: { position: 'absolute', bottom: 34, right: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summaryArt: { fontSize: 28 },
  summaryName: { color: colors.text, fontSize: type.body, fontWeight: '800' },
  totalLabel: { color: colors.textDim, fontSize: type.caption },
  total: { color: colors.text, fontSize: type.title, fontWeight: '900', fontVariant: ['tabular-nums'] },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 2 },
  noticeWarn: { backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: radius.sm, padding: space.sm },
  noticeLock: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: radius.sm, padding: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  countBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.cardAlt },
  countText: { color: colors.text, fontWeight: '800', fontSize: type.bodyL, fontVariant: ['tabular-nums'] },
  countPopup: { position: 'absolute', left: space.lg, bottom: 84, backgroundColor: colors.cardAlt, borderRadius: radius.lg, paddingVertical: 6, minWidth: 200, borderWidth: 1, borderColor: colors.border },
  countOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 44 },
  countOptionN: { color: colors.text, fontWeight: '800', fontSize: type.body, width: 52, fontVariant: ['tabular-nums'] },
});
