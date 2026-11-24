import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Image, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { Text } from '@/components/text';
import { AssetView } from '@/components/fx/anim-player';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, REACTION_TAB_ANIMATED, StickerArt } from '@/components/ReactionArt';
import { DISPLAY_LABEL, type Animation } from '@/data/animations';
import { type Sticker } from '@/data/catalog';
import { isLive, isSentAnim, useAnimations } from '@/lib/animations';
import { VIP_SOON, animIdOf, animKey, emojiTabPacks, favourites, lastTab, notePick, openTab, panelTabs, pickCounts, setLastTab, type PanelKind, type PanelTab } from '@/lib/emoji-panel';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { livePackOf, livePacks, liveSticker } from '@/lib/live/emoji-live';
import { stickerIdOf, stickerToken } from '@/lib/stickers';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const KIND_NAME: Record<PanelKind, string> = { sabit: 'Sabit', fav: 'Favoriler', vip: 'VIP' };

/** The panel's sideways swipe (as the gift sheet's ShelfSwipe): made once, it calls the latest handler; up and down stays the list's scroll. */
class TabSwipe {
  private on?: (dir: 1 | -1) => void;
  set(on: (dir: 1 | -1) => void) {
    this.on = on;
  }
  readonly pan = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 50 || Math.abs(g.vx) > 0.5) this.on?.(g.dx < 0 ? 1 : -1);
    },
  });
}

/**
 * Inline emoji picker, in two parts (lib/emoji-panel). Sabit: Emoji (the animated faces, then Müzik and, in a room,
 * Hamle), Favoriler (what this phone picks most) and, in a room, the free Hareketli. VIP: in a room the paid Hareketli,
 * effect gifts and mic effects, then the sticker packs bought in the store or opened by VIP (locked packs show a
 * preview). It opens on the tab it was last on. Picking a sticker hands the caller its token (lib/stickers).
 * In rooms (`onAnimate`) the Hareketli tabs come from the central animation catalog, so catalog changes show
 * up without an app update.
 * `onClose`: the phone's back button closes the panel (not the screen); hosts also close it on a touch above it.
 * `fill`: the panel fills the box it is given (a room lays it over its chat, components/room/fit-stage) and its lists
 * scroll inside it; otherwise it is as tall as its content, its lists at most four rows.
 */
export function EmojiPanel({ onPick, hint, onAnimate, onClose, fill }: { onPick: (e: string) => void; hint?: string; onAnimate?: (animationId: string) => void; onClose?: () => void; fill?: boolean }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!close.current) return false;
      close.current();
      return true;
    });
    return () => sub.remove();
  }, []);
  const { packUnlocked, recentEmojis, rememberEmoji, buyEmojiPack, ownedAnims, micFx, buyMicFx, setMicFx } = useApp();
  const { catalog } = useAnimations();
  const styles = useStyles();
  const t = useTheme();
  const room = !!onAnimate;
  // The packs as Yönetim › Emojiler has them now (the app's own without a server); fixed while the panel is open.
  const catalogNow = useLiveCatalog();
  const [packs] = useState(() => livePacks(catalogNow));
  const [tabs] = useState(() => panelTabs(room, packs));
  const [tab, setTab] = useState<PanelTab>(() => openTab(lastTab(), tabs));
  // Favoriler as it was when the panel opened: a pick counts, but the grid doesn't move under the finger.
  const [counts] = useState(pickCounts);
  const kind = tab.kind;
  const pack = tab.pack;
  const locked = !!pack && !packUnlocked(pack.id);

  const choose = (next: PanelTab) => {
    setTab(next);
    setLastTab(next.id);
  };
  const switchKind = (k: PanelKind) => {
    if (k !== kind) choose(tabs.find((x) => x.kind === k) ?? tabs[0]);
  };
  // A swipe left or right over the list goes to the next or previous tab, from Sabit's last on into VIP's first and
  // back (owners, 24 Nov 2026). Only a clearly sideways move takes the touch: an up-down one still scrolls the list,
  // and a tap still picks. The tab strip follows, so the tab shown is in sight.
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const tabX = useRef(new Map<string, number>());
  const step = (by: 1 | -1) => {
    const next = tabs[tabs.findIndex((x) => x.id === tab.id) + by];
    if (!next) return;
    choose(next);
    // The strip shows one kind's tabs; its new tab is placed once it is drawn.
    requestAnimationFrame(() => strip.current?.scrollTo({ x: Math.max(0, (tabX.current.get(next.id) ?? 0) - 40), animated: true }));
  };
  // The responder is made once (TabSwipe); it calls the newest step (the tab it starts from changes with every swipe).
  const [swipe] = useState(() => new TabSwipe());
  useEffect(() => swipe.set(step));

  // VIP's packs are "Yakında" (lib/emoji-panel VIP_SOON): one I don't have yet is shown, never opened or bought.
  const soon = VIP_SOON && kind === 'vip' && locked;
  const pick = (e: string) => {
    if (locked) return;
    rememberEmoji(e);
    notePick(e);
    onPick(e);
  };
  const animate = (a: Animation) => {
    if (!onAnimate) return;
    notePick(animKey(a.animation_id));
    onAnimate(a.animation_id);
  };

  /** A Hareketli item this panel can send now. */
  const sendable = (a: Animation | undefined): a is Animation => !!a && room && isLive(a) && isSentAnim(a);
  const animOf = (key: string) => {
    const id = animIdOf(key);
    return id ? catalog.find((a) => a.animation_id === id) : undefined;
  };
  /** A favourite this panel can still send: a sticker of an open pack shown here (Hareketli is gone from the panel). */
  const canSend = (key: string) => {
    if (animIdOf(key)) return false;
    const id = stickerIdOf(key);
    const p = id ? livePackOf(id) : undefined;
    return !!p && !p.retired && p.stickers.some((s) => s.id === id) && (!p.roomOnly || room) && packUnlocked(p.id);
  };
  const favs = tab.id === 'fav' ? favourites(counts, recentEmojis, canSend) : [];

  const tabLabel = (x: PanelTab): { name: string; icon?: number; star?: boolean; lock?: boolean } =>
    x.id === 'emoji'
      ? { name: 'Emoji', icon: EMOJI_PACKS_ICON }
      : x.id === 'fav'
        ? { name: 'Favoriler', star: true }
        : x.id === 'animated' || x.id === 'animated-free'
          ? { name: 'Hareketli', icon: REACTION_TAB_ANIMATED }
          : { name: x.pack?.name ?? x.id, lock: !!x.pack && !packUnlocked(x.pack.id) };

  const paidAnim = tab.id === 'animated';
  const micFxList = catalog.filter((a) => a.display_type === 'mic_effect' && isLive(a) && a.is_free === !paidAnim);

  /** A sticker's picture; a Hamle pick to one side carries an arrow for that side. */
  const art = (x: Sticker) => (
    <View>
      <StickerArt id={x.id} size={40} />
      {/-(sol|sag)$/.test(x.id) && (
        <View style={[styles.moveArrow, x.id.endsWith('-sol') ? { left: -8 } : { right: -8 }]}>
          <Ionicons name={x.id.endsWith('-sol') ? 'arrow-back' : 'arrow-forward'} size={11} color="#fff" />
        </View>
      )}
    </View>
  );
  /** A Hamle pick does something, so it says what: its name under the picture. */
  const moveCell = (x: Sticker) => (
    <Pressable key={x.id} onPress={() => pick(stickerToken(x.id))} style={styles.moveCell} accessibilityRole="button" accessibilityLabel={x.name}>
      {art(x)}
      <Text style={styles.moveName} numberOfLines={2}>
        {x.name}
      </Text>
    </Pressable>
  );
  const stickerCell = (x: Sticker) => (
    <Pressable key={x.id} onPress={() => pick(stickerToken(x.id))} style={styles.stickerCell} accessibilityLabel={`${x.name} çıkartması${locked ? ', kilitli' : ''}`}>
      <StickerArt id={x.id} size={40} />
    </Pressable>
  );
  const animCell = (a: Animation) => (
    <Pressable key={a.animation_id} onPress={() => animate(a)} style={styles.animCell} accessibilityLabel={`${a.name} gönder`}>
      <AssetView asset={a.preview_asset} size={30} />
      <Text style={styles.animName} numberOfLines={1}>
        {a.name}
      </Text>
      {a.is_free ? (
        <Text style={styles.free}>Ücretsiz</Text>
      ) : (
        <View style={styles.priceRow}>
          <Icon3D name="coin" size={11} />
          <Text style={styles.price}>{a.coin_price.toLocaleString('tr-TR')}</Text>
        </View>
      )}
      {a.display_type !== 'reaction' && <Text style={styles.kind}>{DISPLAY_LABEL[a.display_type]}</Text>}
    </Pressable>
  );
  /** Favoriler: stickers, Hamle picks and Hareketli in one even grid (a paid Hareketli also shows its price). */
  const favCell = (key: string) => {
    const a = animOf(key);
    if (a) {
      return (
        <Pressable key={key} onPress={() => animate(a)} style={styles.stickerCell} accessibilityLabel={`${a.name} gönder${a.is_free ? '' : `, ${a.coin_price} jeton`}`}>
          <AssetView asset={a.preview_asset} size={36} />
          {!a.is_free && (
            <View style={styles.priceRow}>
              <Icon3D name="coin" size={11} />
              <Text style={styles.price}>{a.coin_price.toLocaleString('tr-TR')}</Text>
            </View>
          )}
        </Pressable>
      );
    }
    const id = stickerIdOf(key);
    const x = id ? liveSticker(id) : undefined;
    if (!x) return null;
    return (
      <Pressable key={key} onPress={() => pick(key)} style={styles.stickerCell} accessibilityLabel={x.name}>
        {art(x)}
      </Pressable>
    );
  };

  const list = fill ? styles.fillScroll : styles.stickerScroll;
  const kindSwitch = (
    <View style={[styles.kinds, fill && styles.kindsInline]} accessibilityRole="tablist">
      {(['sabit', 'fav', 'vip'] as const).filter((k) => tabs.some((x) => x.kind === k)).map((k) => (
        <Pressable key={k} onPress={() => switchKind(k)} hitSlop={{ top: 8, bottom: 8 }} style={[styles.kind2, fill && styles.kind2Inline, kind === k && styles.kindOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
          <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>{KIND_NAME[k]}</Text>
        </Pressable>
      ))}
    </View>
  );
  const micEffects = (
    <>
      {micFxList.length > 0 && <Text style={styles.sub}>🎙️ Mikrofon efektim · konuşurken koltuğunda kendiliğinden oynar</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6 }}>
        {micFxList.map((a) => {
          const owned = ownedAnims.has(a.animation_id);
          const on = micFx === a.animation_id;
          return (
            <Pressable
              key={a.animation_id}
              onPress={() => {
                if (on) return setMicFx(null);
                const err = buyMicFx(a.animation_id);
                if (err) showAlert('Alınamadı', err);
              }}
              style={[styles.fx, on && styles.fxOn]}
              accessibilityLabel={`${a.name} mikrofon efekti`}
            >
              <AssetView asset={a.preview_asset} size={18} />
              <Text style={styles.fxText}>{a.name}</Text>
              <Text style={styles.fxPrice}>{on ? '✓ Açık' : owned || a.is_free ? 'Kullan' : `${a.coin_price}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
  return (
    <View style={[styles.wrap, fill && styles.fillWrap]}>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {/* Over a room's chat every row counts: the switch rides in the tab strip, the mic effects scroll with the list. */}
      {!fill && kindSwitch}
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0, flexShrink: 0 }, fill && styles.strip]} contentContainerStyle={[{ gap: 6, paddingHorizontal: 8 }, fill && styles.stripIn]}>
        {fill && kindSwitch}
        {tabs
          // Favoriler is one list: its heading is enough, no tab of its own under it.
          .filter((x) => x.kind === kind && x.kind !== 'fav')
          .map((x) => {
            const l = tabLabel(x);
            return (
              <Pressable
                key={x.id}
                onPress={() => choose(x)}
                onLayout={(e) => tabX.current.set(x.id, e.nativeEvent.layout.x)}
                hitSlop={fill ? { top: 8, bottom: 8 } : undefined}
                style={[styles.tab, fill ? styles.tabInline : styles.tabTall, tab.id === x.id && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab.id === x.id }}
                accessibilityLabel={x.pack ? `${l.name} çıkartmaları` : l.name}
              >
                {l.icon && <Image source={l.icon} style={styles.tabIcon} />}
                {l.star && <Ionicons name="star" size={15} color={t.colors.gold} />}
                <Text style={styles.tabText}>
                  {l.name}
                  {l.lock ? ' 🔒' : ''}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
      <View style={fill ? { flex: 1 } : { flexShrink: 1 }} {...swipe.pan.panHandlers}>
        {(tab.id === 'animated' || tab.id === 'animated-free') && onAnimate ? (
        <View style={[{ paddingHorizontal: 8, gap: 6 }, fill ? { flex: 1 } : { flexShrink: 1 }]}>
          {!fill && micEffects}
          <ScrollView style={list} contentContainerStyle={fill ? { gap: 6 } : undefined} nestedScrollEnabled>
            {fill && micEffects}
            <View style={styles.grid}>{catalog.filter((a) => sendable(a) && a.is_free === !paidAnim).map(animCell)}</View>
          </ScrollView>
        </View>
      ) : tab.id === 'emoji' ? (
        // The faces first, then Müzik and (in a room) Hamle; it scrolls inside the panel, so the room's mics stay.
        <ScrollView style={list} nestedScrollEnabled>
          {emojiTabPacks(room, packs).map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Text style={styles.section}>{p.name}</Text>}
              <View style={styles.grid}>{p.stickers.map((x) => (p.roomOnly ? moveCell(x) : stickerCell(x)))}</View>
            </View>
          ))}
        </ScrollView>
      ) : tab.id === 'fav' ? (
        <ScrollView style={list} nestedScrollEnabled>
          <View style={styles.grid}>
            {favs.length === 0 && <Text style={styles.empty}>Kullandıkça en sevdiklerin burada toplanır.</Text>}
            {favs.map(favCell)}
          </View>
        </ScrollView>
      ) : pack ? (
        <ScrollView style={list} nestedScrollEnabled>
          <View style={[styles.grid, locked && { opacity: 0.4 }]}>{pack.stickers.map((x) => (pack.roomOnly ? moveCell(x) : stickerCell(x)))}</View>
        </ScrollView>
        ) : null}
      </View>
      {soon && (
        <View style={[styles.unlock, { opacity: 0.85 }]} accessibilityRole="text">
          <Text style={{ color: '#fff', fontWeight: '700' }}>Yakında</Text>
        </View>
      )}
      {locked && pack && !soon && (
        <Pressable
          style={styles.unlock}
          onPress={() => {
            if (pack.minVip && !pack.price) return router.push('/vip');
            const err = buyEmojiPack(pack.id);
            if (err) showAlert('Açılamadı', err);
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{pack.minVip && !pack.price ? `VIP ${pack.minVip} ile açılır` : `Çıkartma paketini aç · 🪙 ${pack.price}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  hint: { color: colors.textDim, fontSize: 12, paddingHorizontal: 12, paddingBottom: 6 },
  kinds: { flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 3, marginBottom: 8, borderRadius: 999, backgroundColor: colors.cardAlt },
  kindsInline: { marginBottom: 0 },
  kind2: { paddingHorizontal: 18, paddingVertical: 5, borderRadius: 999 },
  kind2Inline: { paddingHorizontal: 9 },
  // A scroll view takes no touch outside its own box, so the strip reaches up under the panel's top padding: the hitSlop
  // of the switch and the tabs then works, and nothing moves on screen.
  strip: { marginTop: -8 },
  // Tight enough that the last tab (Hareketli) still shows on a 320 wide phone with large text.
  stripIn: { gap: 4, alignItems: 'center', paddingTop: 8, paddingBottom: 5 },
  kindOn: { backgroundColor: colors.primary },
  kindText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  kindTextOn: { color: '#fff' },
  // Light: a hairline and a soft upward shadow so the white panel lifts off the paper behind it.
  wrap: { flexShrink: 1, backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 10, paddingBottom: 6, ...(dark ? null : { borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: 'rgba(42,21,32,0.08)', boxShadow: '0 -4px 16px rgba(64,20,40,0.06)' }) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tabInline: { paddingHorizontal: 7 },
  tabTall: { paddingVertical: 9 },
  tabIcon: { width: 18, height: 18 },
  tabActive: { backgroundColor: colors.cardAlt },
  tabText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, minHeight: 60 },
  stickerCell: { width: '20%', alignItems: 'center', paddingVertical: 6 },
  moveCell: { width: '33.33%', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 4 },
  moveArrow: { position: 'absolute', bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.action },
  moveName: { color: colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  // Four rows and a part of the fifth, so it shows there is more; less in a short sheet (a chat over the room stops at its
  // Balkon line): the panel gives way, not the message field under it.
  stickerScroll: { maxHeight: 236, flexShrink: 1 },
  // Over a room's chat: the panel is the chat's height and its list takes what the tabs leave.
  fillWrap: { flex: 1 },
  fillScroll: { flex: 1 },
  section: { color: colors.textDim, fontSize: 11, fontWeight: '700', paddingHorizontal: 12, paddingTop: 4 },
  empty: { color: colors.textDim, padding: 12 },
  sub: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  fx: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5 },
  fxOn: { borderColor: semantic.actionText, backgroundColor: dark ? 'rgba(255,95,162,0.15)' : 'rgba(208,46,120,0.09)' },
  fxText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  fxPrice: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  animCell: { width: '25%', alignItems: 'center', paddingVertical: 6, gap: 1 },
  animName: { color: colors.text, fontSize: 11, fontWeight: '700', maxWidth: '92%' },
  free: { color: semantic.successText, fontSize: 10, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  price: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  kind: { color: colors.textDim, fontSize: 10 },
  unlock: { alignSelf: 'center', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 6 },
}));
