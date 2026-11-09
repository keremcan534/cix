// Şanslı çanta in a server room (lib/live/lucky-bags): the sheet that drops one (coins or gifts, how many shares,
// when it opens, followers only), the show when one is dropped (it comes down at the top, the room dims and bags
// fall), the bag floating over the room while one is open, and the card that opens it and shows who took what.
// The server takes the coins, draws the shares and pays; this only shows its answers.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { Icon3D } from '@/components/Icon3D';
import { ROOM_ICON_ART } from '@/components/RoomArt';
import { useSheetBottom, roomStyles } from '@/components/room/parts';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { GIFTS, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { message } from '@/lib/live';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import { bagDetail, dropBag, grabBag, grabCode, type Bag, type BagDrop, type BagGot, type BagGrab, type BagRules } from '@/lib/live/lucky-bags';
import { colors } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const delayName = (s: number) => (s === 0 ? 'Hemen' : `${Math.round(s / 60)} dk sonra`);
const giftOf = (id: string | null) => GIFTS.find((g) => g.id === id);
/** "1.000 jeton" or "Pasta ×10". */
export const bagWhat = (b: Pick<Bag, 'kind' | 'giftId' | 'units' | 'coins'>) => (b.kind === 'coins' ? `${fmt(b.coins)} jeton` : `${giftOf(b.giftId)?.name ?? 'Hediye'} ×${fmt(b.units)}`);

function Chips<T extends number>({ values, value, onPick, label }: { values: T[]; value: T; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={s.chips}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onPick(v)} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Drops a bag in the room. `onDropped` gets the bag the server stored. */
export function LuckyBagSheet({ visible, room, rules, coins, svipLevel, onClose, onDropped }: { visible: boolean; room: string; rules: BagRules; coins: number; svipLevel: number; onClose: () => void; onDropped: (b: Bag) => void }) {
  const paddingBottom = useSheetBottom();
  const gifts = visibleGifts(GIFTS, useLiveCatalog()).filter((g) => (g.minSvip ?? 0) <= svipLevel && g.price > 0);
  const [kind, setKind] = useState<'coins' | 'gift'>('coins');
  const [amount, setAmount] = useState(rules.coins[0]);
  const [coinPackets, setCoinPackets] = useState(rules.coinPackets[0]);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [count, setCount] = useState(rules.giftCounts[0]);
  const [giftPackets, setGiftPackets] = useState(rules.giftPackets[0]);
  const [delay, setDelay] = useState(rules.delays[0]);
  const [followers, setFollowers] = useState(false);
  const [busy, setBusy] = useState(false);
  const gift: Gift | undefined = gifts.find((g) => g.id === giftId) ?? gifts[0];
  // Choices the server no longer offers fall back to its first.
  const pick = <T,>(list: T[], v: T) => (list.includes(v) ? v : list[0]);
  const a = pick(rules.coins, amount);
  const cp = pick(rules.coinPackets, coinPackets);
  const gc = pick(rules.giftCounts, count);
  const gp = Math.min(pick(rules.giftPackets, giftPackets), gc);
  const d = pick(rules.delays, delay);
  const total = kind === 'coins' ? a : (gift?.price ?? 0) * gc;
  const packets = kind === 'coins' ? cp : gp;
  const short = coins < total;
  const toWallet = () => (onClose(), router.push('/cuzdan'));

  const send = async () => {
    if (busy) return;
    if (kind === 'gift' && !gift) return;
    const body: BagDrop = kind === 'coins' ? { kind, amount: a, packets: cp, delay: d, followersOnly: followers } : { kind, giftId: gift!.id, count: gc, packets: gp, delay: d, followersOnly: followers };
    setBusy(true);
    try {
      const bag = await dropBag(room, body);
      onDropped(bag);
      onClose();
    } catch (e) {
      const coinsShort = e instanceof api.ApiError && (e.data.code === 'insufficient' || e.data.code === 'reward_coins_only');
      showAlert('Çanta atılamadı', message(e), coinsShort ? [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Jeton yükle', onPress: toWallet }] : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[roomStyles.sheet, s.sheet, { paddingBottom }]}>
        <View style={s.head}>
          <Image source={ROOM_ICON_ART.envelope} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Şanslı çanta</Text>
            <Text style={s.sub}>Odadakiler açar, paylar rastgele dağılır</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        <View style={s.segment}>
          {(['coins', 'gift'] as const).map((k) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[s.segItem, kind === k && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
              <Text style={[s.segText, kind === k && s.segTextOn]}>{k === 'coins' ? 'Jeton' : 'Hediye'}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
          {kind === 'coins' ? (
            <>
              <Text style={s.label}>Çantadaki jeton</Text>
              <Chips values={rules.coins} value={a} onPick={setAmount} label={fmt} />
              <Text style={s.label}>Pay sayısı</Text>
              <Chips values={rules.coinPackets} value={cp} onPick={setCoinPackets} label={(n) => `${n} pay`} />
            </>
          ) : (
            <>
              <Text style={s.label}>Hediye</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {gifts.map((g) => {
                  const on = g.id === gift?.id;
                  return (
                    <Pressable key={g.id} onPress={() => setGiftId(g.id)} style={[s.gift, on && s.chipOn]} accessibilityRole="button" accessibilityLabel={`${g.name}, ${fmt(g.price)} jeton`} accessibilityState={{ selected: on }}>
                      <GiftArt giftId={g.id} emoji={g.emoji} size={40} />
                      <Text style={s.giftName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <View style={s.priceRow}>
                        <Icon3D name="coin" size={11} />
                        <Text style={s.giftPrice}>{fmt(g.price)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={s.label}>Adet</Text>
              <Chips values={rules.giftCounts} value={gc} onPick={setCount} label={(n) => `×${n}`} />
              <Text style={s.label}>Pay sayısı</Text>
              <Chips values={rules.giftPackets.filter((p) => p <= gc)} value={gp} onPick={setGiftPackets} label={(n) => `${n} pay`} />
            </>
          )}
          <Text style={s.label}>Açılma zamanı</Text>
          <Chips values={rules.delays} value={d} onPick={setDelay} label={delayName} />
          <View style={s.switchRow}>
            <Ionicons name="people-outline" size={18} color={colors.textDim} />
            <Text style={s.switchText}>Yalnızca beni takip edenler açabilir</Text>
            <Switch value={followers} onValueChange={setFollowers} trackColor={{ true: colors.primary, false: 'rgba(255,255,255,0.18)' }} thumbColor="#fff" />
          </View>
          <Text style={s.note}>
            {kind === 'gift' ? 'Her pay, açan kişiye senden gönderilmiş bir hediye sayılır. ' : ''}
            {`Açıldıktan sonra ${Math.round(rules.windowSeconds / 60)} dakika içinde alınmayan paylar sana geri döner.`}
          </Text>
        </ScrollView>

        <View style={s.total}>
          <View style={{ flex: 1 }}>
            <Text style={s.totalLabel}>
              Toplam · {packets} pay · {delayName(d).toLowerCase()}
            </Text>
            <View style={s.priceRow}>
              <Icon3D name="coin" size={20} />
              <Text style={s.totalValue}>{fmt(total)}</Text>
            </View>
          </View>
          <Pressable onPress={toWallet} style={s.wallet} accessibilityRole="button" accessibilityLabel={`Bakiye ${fmt(coins)} jeton. Jeton yükle`}>
            <Text style={s.walletText}>Bakiye {fmt(coins)}</Text>
            <Text style={s.walletLink}>Jeton yükle</Text>
          </Pressable>
        </View>
        <Pressable onPress={send} disabled={busy || (kind === 'gift' && !gift)} style={[s.send, (short || busy) && { opacity: 0.55 }]} accessibilityRole="button" accessibilityLabel={`Çantayı gönder, ${fmt(total)} jeton`}>
          <Text style={s.sendText}>{busy ? 'Gönderiliyor…' : short ? 'Bakiye yetmiyor' : 'Gönder'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** One falling bag: where it starts across the screen, when it falls, how long it takes, how far it sways, its size. */
type Drop = { x: number; delay: number; duration: number; sway: number; size: number };
/** A new set of falling bags across `width`, spread so they don't bunch up (impure: once per show). */
function makeDrops(count: number, width: number): Drop[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(((i + Math.random() * 0.8) / count) * Math.max(0, width - 56)),
    delay: Math.round(Math.random() * 1500),
    duration: 1700 + Math.round(Math.random() * 1000),
    sway: Math.round((Math.random() - 0.5) * 40),
    size: 38 + Math.round(Math.random() * 16),
  }));
}
const RAIN_DROPS = 14;

/**
 * A bag was just dropped in the room: it comes down at the top with who dropped it and what is in it, then the room
 * dims a little and bags fall from the top to the bottom. A tap on a falling bag or on the top card opens the bag;
 * the show ends by itself after about five seconds and never blocks the room (only the bags take touches).
 * Reduce motion: the top card alone, a little longer.
 */
export function LuckyBagRain({ bag, width, height, still, onOpen, onDone }: { bag: Bag; width: number; height: number; still?: boolean; onOpen: (b: Bag) => void; onDone: () => void }) {
  const { top } = useSafeAreaInsets();
  const [intro] = useState(() => new Animated.Value(0));
  const [dim] = useState(() => new Animated.Value(0));
  const [drops] = useState(() => makeDrops(still ? 0 : RAIN_DROPS, width));
  const [falls] = useState(() => drops.map(() => new Animated.Value(0)));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const show = Animated.sequence([
      Animated.spring(intro, { toValue: 1, useNativeDriver: true, bounciness: 10, speed: 9 }),
      Animated.delay(still ? 2600 : 450),
      Animated.parallel([
        Animated.timing(dim, { toValue: 1, duration: 380, useNativeDriver: true }),
        ...falls.map((v, i) =>
          Animated.sequence([Animated.delay(drops[i].delay), Animated.timing(v, { toValue: 1, duration: drops[i].duration, easing: Easing.in(Easing.quad), useNativeDriver: true })]),
        ),
      ]),
      Animated.parallel([
        Animated.timing(dim, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(intro, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
    ]);
    show.start(({ finished }) => finished && done.current());
    return () => show.stop();
  }, [intro, dim, falls, drops, still]);

  const open = () => onOpen(bag);
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.rainDim, { opacity: dim }]} />
      {drops.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            s.drop,
            {
              left: d.x,
              transform: [
                { translateY: falls[i].interpolate({ inputRange: [0, 1], outputRange: [0, height + 160] }) },
                { translateX: falls[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, d.sway, 0] }) },
                { rotate: falls[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-14deg', '12deg', '-8deg'] }) },
              ],
            },
          ]}
        >
          <Pressable onPress={open} hitSlop={10} accessibilityRole="button" accessibilityLabel="Şanslı çantayı aç">
            <Image source={ROOM_ICON_ART.envelope} style={{ width: d.size, height: d.size }} />
          </Pressable>
        </Animated.View>
      ))}
      <Animated.View
        style={[
          s.rainCard,
          { top: top + 64, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }) }, { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] },
        ]}
      >
        <Pressable onPress={open} style={s.rainInner} accessibilityRole="button" accessibilityLabel={`${bag.mine ? 'Şanslı çanta attın' : `${bag.from.name} Şanslı çanta attı`}: ${bagWhat(bag)}, ${bag.packets} pay. Açmak için dokun`}>
          <Image source={ROOM_ICON_ART.envelope} style={{ width: 56, height: 56 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rainTitle} numberOfLines={1}>
              {bag.mine ? 'Şanslı çanta attın' : `${bag.from.name} Şanslı çanta attı`}
            </Text>
            <Text style={s.rainSub} numberOfLines={1}>
              {bagWhat(bag)} · {bag.packets} pay
            </Text>
          </View>
          <View style={s.rainGo}>
            <Text style={s.rainGoText}>Aç</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** The room's open bags, floating over the room: the next one to open, its countdown and how many there are. */
export function LuckyBagFloat({ bags, now, onOpen }: { bags: Bag[]; now: number; onOpen: (b: Bag) => void }) {
  const ready = bags.find((b) => !b.mine && b.got === null && Date.parse(b.opensAt) <= now);
  const b = ready ?? [...bags].sort((x, y) => Date.parse(x.opensAt) - Date.parse(y.opensAt))[0];
  if (!b) return null;
  const wait = Date.parse(b.opensAt) - now;
  const line = wait > 0 ? mmss(wait) : b.mine || b.got !== null ? 'Kimler aldı' : 'Aç!';
  return (
    <Pressable style={[s.float, !(wait > 0) && !b.mine && b.got === null && s.floatHot]} onPress={() => onOpen(b)} accessibilityRole="button" accessibilityLabel={`${b.from.name} Şanslı çanta attı. ${wait > 0 ? `${mmss(wait)} sonra açılır` : 'Açılabilir'}`}>
      <Image source={ROOM_ICON_ART.envelope} style={{ width: 42, height: 42 }} />
      <Text style={s.floatLine}>{line}</Text>
      {bags.length > 1 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{bags.length}</Text>
        </View>
      )}
    </Pressable>
  );
}

type Opened = { got: BagGot | null; grabs: BagGrab[] | null; bag: Bag };

/** A bag up close: who dropped it, what is in it, its countdown, the open button, then my share and who took what. */
export function LuckyBagCard({ bag: first, now, onClose, onChange }: { bag: Bag; now: number; onClose: () => void; onChange: (b: Bag) => void }) {
  const [st, setSt] = useState<Opened>({ got: null, grabs: null, bag: first });
  const [busy, setBusy] = useState(false);
  const bag = st.bag.id === first.id ? st.bag : first;
  const grabs = st.bag.id === first.id ? st.grabs : null;
  const got = st.bag.id === first.id ? st.got : null;
  const wait = Date.parse(bag.opensAt) - now;
  const doneForMe = bag.mine || bag.got !== null || got !== null;
  // Mine or already opened: who took what.
  const bagId = bag.id;
  useEffect(() => {
    if (!doneForMe) return;
    let alive = true;
    bagDetail(bagId)
      .then((r) => alive && setSt((x) => ({ ...x, bag: r.bag, grabs: r.grabs })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bagId, doneForMe]);
  const gift = giftOf(bag.giftId);
  const open = async () => {
    if (busy || wait > 0) return;
    setBusy(true);
    try {
      const r = await grabBag(bag.id);
      setSt({ got: r.got, grabs: r.grabs, bag: r.bag });
      onChange(r.bag);
    } catch (e) {
      const code = grabCode(e);
      if (code === 'empty' || code === 'taken') {
        const r = await bagDetail(bag.id).catch(() => null);
        if (r) {
          setSt({ got: null, grabs: r.grabs, bag: r.bag });
          onChange(r.bag);
        }
      }
      if (code !== 'taken') showAlert(code === 'empty' ? 'Çanta boşaldı' : 'Çanta açılamadı', code === 'empty' ? 'Paylar bitti, bir dahaki sefere!' : message(e));
    } finally {
      setBusy(false);
    }
  };
  const best = grabs?.length ? grabs.reduce((m, g) => (g.units > m.units ? g : m), grabs[0]) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.scrim, s.center]} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Pressable onPress={onClose} hitSlop={10} style={s.cardClose} accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.75)" />
          </Pressable>
          <View style={s.from}>
            <Avatar uri={bag.from.avatarUrl ?? undefined} name={bag.from.name} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={s.fromName} numberOfLines={1}>
                {bag.mine ? 'Senin çantan' : bag.from.name}
              </Text>
              <Text style={s.fromSub}>
                {bag.kind === 'coins' ? 'Jeton çantası' : 'Hediye çantası'} · {bag.packets} pay{bag.followersOnly ? ' · takipçilere özel' : ''}
              </Text>
            </View>
          </View>

          {got ? (
            <View style={s.prize}>
              {got.kind === 'gift' ? <GiftArt giftId={got.giftId ?? undefined} emoji={gift?.emoji ?? '🎁'} size={72} /> : <Icon3D name="coin" size={64} />}
              <Text style={s.prizeValue}>{got.kind === 'gift' ? `${gift?.name ?? 'Hediye'} ×${fmt(got.units)}` : `+${fmt(got.coins)}`}</Text>
              <Text style={s.prizeNote}>{got.kind === 'gift' ? `${fmt(got.coins)} elmas hesabına geçti` : 'Jeton bakiyene eklendi'}</Text>
            </View>
          ) : (
            <View style={s.prize}>
              {bag.kind === 'gift' ? <GiftArt giftId={bag.giftId ?? undefined} emoji={gift?.emoji ?? '🎁'} size={72} /> : <Image source={ROOM_ICON_ART.envelope} style={{ width: 84, height: 84 }} />}
              <Text style={s.prizeValue}>{bagWhat(bag)}</Text>
              <Text style={s.prizeNote}>{bag.status !== 'open' || bag.left === 0 ? 'Bütün paylar alındı' : `${bag.left} / ${bag.packets} pay duruyor`}</Text>
            </View>
          )}

          {!doneForMe &&
            (wait > 0 ? (
              <View style={s.wait}>
                <Text style={s.waitLabel}>Açılmasına</Text>
                <Text style={s.waitValue}>{mmss(wait)}</Text>
              </View>
            ) : (
              <Pressable onPress={open} disabled={busy} style={[s.send, s.openBtn, busy && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Çantayı aç">
                <Text style={s.sendText}>{busy ? 'Açılıyor…' : 'Aç'}</Text>
              </Pressable>
            ))}

          {grabs && (
            <View style={s.list}>
              <Text style={s.listTitle}>{grabs.length ? `Açanlar · ${grabs.length}/${bag.packets}` : 'Henüz kimse açmadı'}</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {grabs.map((g) => (
                  <View key={g.user.id} style={s.grab}>
                    <Avatar uri={g.user.avatarUrl ?? undefined} name={g.user.name} size={28} />
                    <Text style={s.grabName} numberOfLines={1}>
                      {g.user.name}
                    </Text>
                    {best === g && grabs.length > 1 && (
                      <View style={s.luckiest}>
                        <Ionicons name="trophy" size={11} color="#1B1300" />
                        <Text style={s.luckiestText}>En şanslı</Text>
                      </View>
                    )}
                    <Text style={s.grabValue}>{bag.kind === 'gift' ? `×${fmt(g.units)}` : fmt(g.coins)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const GOLD = colors.gold;
const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, padding: 3, marginBottom: 6 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segOn: { backgroundColor: GOLD },
  segText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#1B1300' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7, letterSpacing: 0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 64, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  chipOn: { borderColor: GOLD, backgroundColor: 'rgba(246,189,96,0.14)' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: GOLD },
  gift: { width: 84, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', gap: 3 },
  giftName: { color: '#fff', fontSize: 11, fontWeight: '600', maxWidth: 76 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftPrice: { color: GOLD, fontSize: 11, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  switchText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  note: { color: colors.textDim, fontSize: 11, marginTop: 10, lineHeight: 16 },
  total: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  totalLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  totalValue: { color: GOLD, fontSize: 22, fontWeight: '900' },
  wallet: { alignItems: 'flex-end' },
  walletText: { color: colors.textDim, fontSize: 11 },
  walletLink: { color: colors.primaryText, fontSize: 13, fontWeight: '800', marginTop: 2 },
  send: { marginTop: 12, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, boxShadow: '0 6px 18px rgba(246,189,96,0.35)' },
  sendText: { color: '#1B1300', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  float: { position: 'absolute', right: 10, top: 186, width: 66, paddingVertical: 6, borderRadius: 18, alignItems: 'center', backgroundColor: 'rgba(20,12,4,0.78)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.55)' },
  floatHot: { borderColor: GOLD, borderWidth: 2, boxShadow: '0 0 16px rgba(246,189,96,0.55)' },
  floatLine: { color: GOLD, fontSize: 12, fontWeight: '900', marginTop: 1 },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#140C04' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // The drop show: a warm dark veil, bags falling from above the screen, and the card at the top.
  rainDim: { backgroundColor: 'rgba(6,4,14,0.46)' },
  drop: { position: 'absolute', top: -80 },
  rainCard: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  rainInner: { width: '88%', maxWidth: 380, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#1A1208', borderWidth: 1.5, borderColor: GOLD, boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 22px rgba(246,189,96,0.35)' },
  rainTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rainSub: { color: GOLD, fontSize: 13, fontWeight: '700' },
  rainGo: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: GOLD },
  rainGoText: { color: '#1B1300', fontSize: 13, fontWeight: '900' },
  card: { width: '100%', maxWidth: 360, borderRadius: 26, padding: 18, backgroundColor: '#1A1208', borderWidth: 1, borderColor: 'rgba(246,189,96,0.4)', boxShadow: '0 20px 50px rgba(0,0,0,0.55)' },
  cardClose: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  from: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 26 },
  fromName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  fromSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 },
  prize: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  prizeValue: { color: GOLD, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  prizeNote: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' },
  wait: { alignItems: 'center', paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(246,189,96,0.1)' },
  waitLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  waitValue: { color: GOLD, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  openBtn: { marginTop: 0 },
  list: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  listTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  grab: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  grabName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  luckiest: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: GOLD },
  luckiestText: { color: '#1B1300', fontSize: 10, fontWeight: '800' },
  grabValue: { color: GOLD, fontSize: 13, fontWeight: '800', minWidth: 48, textAlign: 'right' },
});
