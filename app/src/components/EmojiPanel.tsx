import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { Text } from '@/components/text';
import { AssetView } from '@/components/fx/anim-player';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, REACTION_TAB_ANIMATED, StickerArt } from '@/components/ReactionArt';
import { DISPLAY_LABEL, type Animation } from '@/data/animations';
import { packOfSticker, stickerById, type Sticker } from '@/data/catalog';
import { isLive, isSentAnim, useAnimations } from '@/lib/animations';
import { animIdOf, animKey, emojiTabPacks, favourites, lastTab, notePick, openTab, panelTabs, pickCounts, setLastTab, type PanelKind, type PanelTab } from '@/lib/emoji-panel';
import { stickerIdOf, stickerToken } from '@/lib/stickers';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const KIND_NAME: Record<PanelKind, string> = { sabit: 'Sabit', vip: 'VIP' };

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
  const [tabs] = useState(() => panelTabs(room));
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
  /** A favourite this panel can still send: a sticker of an open pack shown here, or a live Hareketli in a room. */
  const canSend = (key: string) => {
    if (animIdOf(key)) return sendable(animOf(key));
    const id = stickerIdOf(key);
    const p = id ? packOfSticker(id) : undefined;
    return !!p && !p.retired && (!p.roomOnly || room) && packUnlocked(p.id);
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
    const x = id ? stickerById(id) : undefined;
    if (!x) return null;
    return (
      <Pressable key={key} onPress={() => pick(key)} style={styles.stickerCell} accessibilityLabel={x.name}>
        {art(x)}
      </Pressable>
    );
  };

  const list = fill ? styles.fillScroll : styles.stickerScroll;
  return (
    <View style={[styles.wrap, fill && styles.fillWrap]}>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <View style={styles.kinds} accessibilityRole="tablist">
        {(['sabit', 'vip'] as const).map((k) => (
          <Pressable key={k} onPress={() => switchKind(k)} style={[styles.kind2, kind === k && styles.kindOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
            <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>{KIND_NAME[k]}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}>
        {tabs
          .filter((x) => x.kind === kind)
          .map((x) => {
            const l = tabLabel(x);
            return (
              <Pressable
                key={x.id}
                onPress={() => choose(x)}
                style={[styles.tab, tab.id === x.id && styles.tabActive]}
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
      {(tab.id === 'animated' || tab.id === 'animated-free') && onAnimate ? (
        <View style={[{ paddingHorizontal: 8, gap: 6 }, fill && { flex: 1 }]}>
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
          <ScrollView style={list} nestedScrollEnabled>
            <View style={styles.grid}>{catalog.filter((a) => sendable(a) && a.is_free === !paidAnim).map(animCell)}</View>
          </ScrollView>
        </View>
      ) : tab.id === 'emoji' ? (
        // The faces first, then Müzik and (in a room) Hamle; it scrolls inside the panel, so the room's mics stay.
        <ScrollView style={list} nestedScrollEnabled>
          {emojiTabPacks(room).map((p, i) => (
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
      {locked && pack && (
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
  kind2: { paddingHorizontal: 18, paddingVertical: 5, borderRadius: 999 },
  kindOn: { backgroundColor: colors.primary },
  kindText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  kindTextOn: { color: '#fff' },
  // Light: a hairline and a soft upward shadow so the white panel lifts off the paper behind it.
  wrap: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 10, paddingBottom: 6, ...(dark ? null : { borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: 'rgba(42,21,32,0.08)', boxShadow: '0 -4px 16px rgba(64,20,40,0.06)' }) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tabIcon: { width: 18, height: 18 },
  tabActive: { backgroundColor: colors.cardAlt },
  tabText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, minHeight: 60 },
  stickerCell: { width: '20%', alignItems: 'center', paddingVertical: 6 },
  moveCell: { width: '33.33%', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 4 },
  moveArrow: { position: 'absolute', bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.action },
  moveName: { color: colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  // Four rows and a part of the fifth, so it shows there is more.
  stickerScroll: { maxHeight: 236 },
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
