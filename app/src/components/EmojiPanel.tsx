import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { AssetView } from '@/components/fx/anim-player';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, REACTION_TAB_ANIMATED, REACTION_TAB_RECENT, ReactionArt, StickerArt } from '@/components/ReactionArt';
import { DISPLAY_LABEL } from '@/data/animations';
import { STANDARD_EMOJI, STICKER_PACKS } from '@/data/catalog';
import { isLive, useAnimations } from '@/lib/animations';
import { stickerIdOf, stickerToken } from '@/lib/stickers';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

/**
 * Inline emoji picker. Top row: Hareketli (rooms only), recents, standard emoji, then one tab per
 * sticker pack. Standard Unicode emoji are free for everyone; sticker packs hold the custom-drawn
 * stickers and are bought in the store (locked packs show a preview). Picking a sticker hands the
 * caller its token (lib/stickers), picking an emoji hands the emoji.
 * In rooms (`onAnimate`) the first tab lists animated reactions, effect gifts and mic effects from the
 * central animation catalog, so catalog changes show up without an app update.
 */
export function EmojiPanel({ onPick, hint, onAnimate }: { onPick: (e: string) => void; hint?: string; onAnimate?: (animationId: string) => void }) {
  const { packUnlocked, recentEmojis, rememberEmoji, buyEmojiPack, ownedAnims, micFx, buyMicFx, setMicFx } = useApp();
  const { catalog } = useAnimations();
  const [tab, setTab] = useState<string>(onAnimate ? 'animated' : recentEmojis.length ? 'recent' : 'emoji');
  const [group, setGroup] = useState(STANDARD_EMOJI[0].id);
  const pack = STICKER_PACKS.find((p) => p.id === tab);
  const locked = !!pack && !packUnlocked(pack.id);
  // A recent sticker whose pack is no longer open (VIP ended) is hidden, not offered.
  const recents = recentEmojis.filter((e) => {
    const id = stickerIdOf(e);
    return !id || STICKER_PACKS.some((p) => packUnlocked(p.id) && p.stickers.some((x) => x.id === id));
  });

  const pick = (e: string) => {
    if (locked) return;
    rememberEmoji(e);
    onPick(e);
  };

  const tabs: { id: string; name: string; icon?: number; lock?: boolean }[] = [
    ...(onAnimate ? [{ id: 'animated', name: 'Hareketli', icon: REACTION_TAB_ANIMATED }] : []),
    { id: 'recent', name: '', icon: REACTION_TAB_RECENT },
    { id: 'emoji', name: 'Emoji' },
    ...STICKER_PACKS.map((p) => ({ id: p.id, name: p.name, icon: p.id === STICKER_PACKS[0].id ? EMOJI_PACKS_ICON : undefined, lock: !packUnlocked(p.id) })),
  ];

  return (
    <View style={styles.wrap}>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}>
        {tabs.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setTab(p.id)}
            style={[styles.tab, tab === p.id && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === p.id }}
            accessibilityLabel={p.id === 'recent' ? 'Son kullanılanlar' : STICKER_PACKS.some((x) => x.id === p.id) ? `${p.name} çıkartmaları` : p.name}
          >
            {p.icon && <Image source={p.icon} style={styles.tabIcon} />}
            {!!p.name && (
              <Text style={styles.tabText}>
                {p.name}
                {p.lock ? ' 🔒' : ''}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
      {tab === 'animated' && onAnimate ? (
        <View style={{ paddingHorizontal: 8, gap: 6 }}>
          <Text style={styles.sub}>🎙️ Mikrofon efektim · konuşurken koltuğunda kendiliğinden oynar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
            {catalog
              .filter((a) => a.display_type === 'mic_effect' && isLive(a))
              .map((a) => {
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
          <View style={styles.grid}>
            {catalog
              .filter((a) => isLive(a) && (a.display_type === 'reaction' || a.display_type === 'gift' || a.display_type === 'fullscreen'))
              .map((a) => (
                <Pressable key={a.animation_id} onPress={() => onAnimate(a.animation_id)} style={styles.animCell} accessibilityLabel={`${a.name} gönder`}>
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
              ))}
          </View>
        </View>
      ) : tab === 'emoji' ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 8, paddingTop: 6 }}>
            {STANDARD_EMOJI.map((gr) => (
              <Pressable key={gr.id} onPress={() => setGroup(gr.id)} style={[styles.chip, group === gr.id && styles.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: group === gr.id }}>
                <Text style={styles.chipText}>{gr.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView style={styles.emojiScroll} nestedScrollEnabled>
            <View style={styles.grid}>
              {(STANDARD_EMOJI.find((gr) => gr.id === group) ?? STANDARD_EMOJI[0]).emojis.map((e) => (
                <Pressable key={e} onPress={() => pick(e)} style={styles.cell} accessibilityLabel={e}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.freeNote}>Standart emojiler herkese ücretsiz · özel çizim çıkartmalar mağazada</Text>
        </View>
      ) : tab === 'recent' ? (
        <View style={styles.grid}>
          {recents.length === 0 && <Text style={styles.empty}>Henüz emoji kullanmadın.</Text>}
          {recents.map((e) => (
            <Pressable key={e} onPress={() => pick(e)} style={styles.cell} accessibilityLabel={e}>
              <ReactionArt emoji={e} size={32} textStyle={{ fontSize: 26 }} />
            </Pressable>
          ))}
        </View>
      ) : pack ? (
        <View style={[styles.grid, locked && { opacity: 0.4 }]}>
          {pack.stickers.map((x) => (
            <Pressable key={x.id} onPress={() => pick(stickerToken(x.id))} style={styles.stickerCell} accessibilityLabel={`${x.name} çıkartması${locked ? ', kilitli' : ''}`}>
              <StickerArt id={x.id} size={40} />
            </Pressable>
          ))}
        </View>
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

const styles = StyleSheet.create({
  hint: { color: colors.textDim, fontSize: 12, paddingHorizontal: 12, paddingBottom: 6 },
  wrap: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 10, paddingBottom: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tabIcon: { width: 18, height: 18 },
  tabActive: { backgroundColor: colors.cardAlt },
  tabText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, minHeight: 60 },
  cell: { width: '12.5%', alignItems: 'center', paddingVertical: 6 },
  stickerCell: { width: '20%', alignItems: 'center', paddingVertical: 6 },
  emoji: { fontSize: 26, lineHeight: 34 },
  emojiScroll: { maxHeight: 200 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.cardAlt, borderColor: colors.cardAlt },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  freeNote: { color: colors.textDim, fontSize: 10, textAlign: 'center', paddingBottom: 4 },
  empty: { color: colors.textDim, padding: 12 },
  sub: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  fx: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5 },
  fxOn: { borderColor: '#13D9DF', backgroundColor: 'rgba(19,217,223,0.15)' },
  fxText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fxPrice: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  animCell: { width: '25%', alignItems: 'center', paddingVertical: 6, gap: 1 },
  animName: { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: '92%' },
  free: { color: '#22C55E', fontSize: 10, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  price: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  kind: { color: colors.textDim, fontSize: 9 },
  unlock: { alignSelf: 'center', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 6 },
});
