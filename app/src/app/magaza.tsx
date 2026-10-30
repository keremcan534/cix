import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryEffect, ENTRY_LOOKS, type EntryFx, type EntryShow } from '@/components/fx/entry';
import { GlossButton, Halo, hueAt } from '@/components/fx/float';
import { ArtFrame, frameArtOf } from '@/components/fx/frame-art';
import { AnimatedFrame, type FrameFx } from '@/components/fx/frames';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, EdgeLight, PressableScale, glassChip } from '@/components/fx/surface';
import { CoinPill, Header } from '@/components/ui';
import { COSMETICS, COSMETIC_KINDS, STICKER_PACKS, type Cosmetic, type CosmeticKind } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, fonts, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, StickerArt } from '@/components/ReactionArt';
import { SPECIAL_ID_ART, STORE_TAB_ART, frameBadgeArtOf, storeArtOf } from '@/components/StoreArt';

type Tab = CosmeticKind | 'emoji';

export default function StoreScreen() {
  const { coins, inventory, equipped, buyCosmetic, equip, packUnlocked, buyEmojiPack, vipLevel, settings, me } = useApp();
  const [tab, setTab] = useState<Tab>('frame');
  const [preview, setPreview] = useState<EntryShow | null>(null);
  const playPreview = (c: Cosmetic) =>
    setPreview({
      name: me.name,
      avatar: me.avatar,
      fx: c.kind === 'entry' ? ((c.fx as EntryFx | undefined) ?? 'vip') : 'vip',
      ride: c.kind === 'ride' ? c.emoji : undefined,
      rideArt: c.kind === 'ride' ? storeArtOf(c.id) : undefined,
    });
  const items = COSMETICS.filter((c) => c.kind === tab);

  const buy = (c: Cosmetic) => {
    showAlert(`${c.emoji} ${c.name}`, `Fiyat: ${c.price.toLocaleString('tr-TR')} jeton · Süre: ${c.days ? `${c.days} gün` : 'kalıcı'}`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Satın al',
        onPress: () => {
          const err = buyCosmetic(c.id);
          if (err) showAlert('Satın alınamadı', err);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.store} />
      <Header title="Mağaza" right={<CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />} />
      <View style={styles.tabTrack}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, padding: 4 }}>
          {[...COSMETIC_KINDS, { kind: 'emoji' as const, label: 'Çıkartma paketleri', emoji: '' }].map((k) => {
            const art = k.kind === 'emoji' ? EMOJI_PACKS_ICON : STORE_TAB_ART[k.kind];
            return (
              <Pressable key={k.kind} onPress={() => setTab(k.kind)} style={[styles.tab, styles.tabRow, tab === k.kind && styles.tabActive]}>
                {art ? <Image source={art} style={{ width: 18, height: 18 }} /> : <Text style={styles.tabText}>{k.emoji}</Text>}
                <Text style={[styles.tabText, tab === k.kind && { color: semantic.actionInk }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {settings.effectsOff && (tab === 'entry' || tab === 'ride') && (
        <Text style={styles.warn}>Efektler ayarlardan kapalı: satın aldığın giriş efektleri sende gösterilmez, diğerleri görür.</Text>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {tab === 'emoji' && <Text style={styles.freeNote}>Standart emojiler herkese ücretsiz. Buradaki paketler özel çizim çıkartmalardır.</Text>}
        {tab === 'emoji'
          ? STICKER_PACKS.map((p, i) => {
              const owned = packUnlocked(p.id);
              const hue = hueAt(i + 2);
              return (
                <Shelf key={p.id} hue={hue}>
                  <View style={styles.packPreview} accessibilityLabel={p.stickers.slice(0, 4).map((x) => x.name).join(', ')}>
                    {p.stickers.slice(0, 4).map((x) => (
                      <StickerArt key={x.id} id={x.id} size={30} />
                    ))}
                  </View>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta}>
                    {p.stickers.length} çıkartma · {p.animated ? 'animasyonlu · kalıcı' : p.price || p.minVip ? 'kalıcı' : 'ücretsiz'}
                  </Text>
                  {owned ? (
                    <Text style={styles.owned}>✓ Açık</Text>
                  ) : p.minVip && !p.price ? (
                    <View>
                      <GlossButton label={`🔒 VIP ${p.minVip}`} tone="locked" small />
                    </View>
                  ) : (
                    <PressableScale
                      onPress={() => {
                        const err = buyEmojiPack(p.id);
                        if (err) showAlert('Satın alınamadı', err);
                      }}
                    >
                      <GlossButton label={String(p.price)} small icon={<Icon3D name="coin" size={16} />} />
                    </PressableScale>
                  )}
                </Shelf>
              );
            })
          : items.map((c, i) => {
              const owned = inventory.has(c.id);
              const isEquipped = equipped[c.kind] === c.id;
              return (
                <Shelf key={c.id} hue={c.color?.[0] ?? hueAt(i)} on={isEquipped}>
                  <Preview item={c} avatar={me.avatar} still={settings.reduceMotion} />
                  {(c.kind === 'entry' || c.kind === 'ride') && (
                    <Pressable onPress={() => playPreview(c)} style={styles.previewBtn} accessibilityRole="button" accessibilityLabel={`${c.name} önizle`}>
                      <Ionicons name="play" size={12} color={colors.primaryText} />
                      <Text style={styles.previewText}>Önizle</Text>
                    </Pressable>
                  )}
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>
                    {c.days ? `${c.days} gün` : 'Kalıcı'}
                    {c.minVip ? ` · VIP ${c.minVip}+` : ''}
                  </Text>
                  {owned ? (
                    <PressableScale onPress={() => equip(isEquipped ? null : c.id, c.kind)}>
                      <GlossButton label={isEquipped ? 'Çıkar' : 'Kullan'} tone={isEquipped ? 'locked' : 'action'} small />
                    </PressableScale>
                  ) : c.minVip && vipLevel < c.minVip ? (
                    <PressableScale onPress={() => router.push('/vip')}>
                      <GlossButton label={`🔒 VIP ${c.minVip}`} tone="locked" small />
                    </PressableScale>
                  ) : (
                    <PressableScale onPress={() => buy(c)}>
                      <GlossButton label={c.price.toLocaleString('tr-TR')} small icon={<Icon3D name="coin" size={16} />} />
                    </PressableScale>
                  )}
                </Shelf>
              );
            })}
      </ScrollView>
      <Text style={styles.footer}>Kozmetik satın alımları komisyon programına dahil değildir.</Text>
      {preview && <EntryEffect key={`${preview.fx}-${preview.ride}`} show={preview} still={settings.reduceMotion} top={140} onDone={() => setPreview(null)} />}
    </SafeAreaView>
  );
}

/** A store item: a card lit in the item's color, its preview standing on a pool of that light. */
function Shelf({ hue, on, children }: { hue: string; on?: boolean; children: ReactNode }) {
  return (
    <LinearGradient
      colors={[`${hue}38`, `${hue}0A`, '#101C30']}
      locations={[0, 0.5, 1]}
      style={[styles.item, { borderColor: on ? colors.primaryText : `${hue}40`, boxShadow: `0 8px 20px rgba(0,0,0,0.35), 0 0 16px ${hue}1F` }]}
    >
      <EdgeLight inset={16} strength={0.4} />
      <View style={styles.halo}>
        <Halo size={90} hue={hue} strength={0.45} />
      </View>
      {on && <Text style={styles.onTag}>Kullanılıyor</Text>}
      {children}
    </LinearGradient>
  );
}

function Preview({ item, avatar, still }: { item: Cosmetic; avatar: string; still?: boolean }) {
  const art = item.kind === 'frame' ? frameArtOf(item.id) : undefined;
  if (art) {
    // Size the avatar so the whole illustrated frame (wings, crown) fits the card.
    const size = Math.round(100 * 2 * art.hole * 1.04);
    return (
      <View style={{ height: 104, justifyContent: 'center', alignItems: 'center' }}>
        <ArtFrame art={art} size={size} still={still} maxScale={3}>
          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} />
        </ArtFrame>
      </View>
    );
  }
  if (item.kind === 'frame' && item.fx) {
    const badge = frameBadgeArtOf(item.id);
    return (
      <View style={{ height: 76, justifyContent: 'center' }}>
        <AnimatedFrame fx={item.fx as FrameFx} size={64} still={still}>
          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} />
        </AnimatedFrame>
        {badge && <Image source={badge} style={styles.frameBadge} accessibilityLabel={item.name} />}
      </View>
    );
  }
  const pic = storeArtOf(item.id);
  if (item.kind === 'entry') {
    const look = ENTRY_LOOKS[(item.fx as EntryFx | undefined) ?? 'vip'];
    const banner = (
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.entryPreview, !!pic && styles.entryPreviewSmall]}>
        {look.creature && <Text style={{ fontSize: 16 }}>{look.creature}</Text>}
        <Text style={styles.entryPreviewText} numberOfLines={1}>
          Hoş geldin
        </Text>
        <Text style={{ fontSize: 14 }}>{look.mark}</Text>
      </LinearGradient>
    );
    if (!pic) return banner;
    return (
      <View style={styles.artStack}>
        <Image source={pic} style={styles.artIcon} accessibilityLabel={item.name} />
        {banner}
      </View>
    );
  }
  if (item.kind === 'ride' && pic) return <Image source={pic} style={styles.rideArt} accessibilityLabel={item.name} />;
  if (item.kind === 'frame' && item.color) {
    return (
      <LinearGradient colors={item.color} style={styles.framePreview}>
        <View style={styles.frameInner}>
          <Ionicons name="person" size={26} color={colors.textDim} />
        </View>
      </LinearGradient>
    );
  }
  if (item.kind === 'bubble' && item.color) {
    const bubble = (
      <LinearGradient colors={item.color} style={[styles.bubblePreview, !!pic && styles.bubblePreviewSmall]}>
        <Text style={{ color: '#fff', fontSize: 12 }}>Merhaba!{pic ? '' : ` ${item.emoji}`}</Text>
      </LinearGradient>
    );
    if (!pic) return bubble;
    return (
      <View style={styles.artStack}>
        <Image source={pic} style={styles.artIcon} accessibilityLabel={item.name} />
        {bubble}
      </View>
    );
  }
  if (item.kind === 'specialId') {
    return (
      <View style={styles.artStack}>
        <Image source={SPECIAL_ID_ART} style={styles.idArt} accessibilityLabel={item.name} />
        <Text style={[styles.idPreview, styles.idPreviewSmall]}>{item.name.replace('ID ', '')}</Text>
      </View>
    );
  }
  return <Text style={{ fontSize: 44, height: 64, textAlignVertical: 'center' }}>{item.emoji}</Text>;
}

const styles = StyleSheet.create({
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: 'rgba(19,217,223,0.18)' },
  previewText: { color: colors.primaryText, fontWeight: '700', fontSize: 12 },
  entryPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 20, paddingHorizontal: 10, marginVertical: 12, maxWidth: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  entryPreviewSmall: { height: 32, marginVertical: 0 },
  entryPreviewText: { color: '#fff', fontWeight: '800', fontSize: 12, flexShrink: 1 },
  artStack: { alignItems: 'center', gap: 4 },
  artIcon: { width: 56, height: 56 },
  rideArt: { width: 72, height: 72 },
  tabTrack: { marginHorizontal: 16, marginBottom: 12, borderRadius: 999, overflow: 'hidden', ...glassChip },
  tab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: semantic.action, boxShadow: '0 3px 12px rgba(19,217,223,0.4)' },
  tabText: { color: colors.textDim, fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 18 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  warn: { color: colors.gold, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 16, paddingBottom: 30 },
  item: { width: '48.5%', borderRadius: 20, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1.5 },
  halo: { position: 'absolute', top: 14, alignSelf: 'center', width: 90, height: 90 },
  onTag: { position: 'absolute', top: 8, right: 8, color: semantic.actionInk, backgroundColor: colors.primaryText, fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', zIndex: 1 },
  packPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 64 },
  freeNote: { width: '100%', color: colors.textDim, fontSize: 12, textAlign: 'center' },
  name: { color: '#fff', fontFamily: fonts.display, fontSize: 16, lineHeight: 21, textAlign: 'center' },
  meta: { color: colors.textDim, fontSize: 12 },
  owned: { color: colors.green, fontWeight: '700', paddingVertical: 7 },
  framePreview: { width: 64, height: 64, borderRadius: 32, padding: 4 },
  frameInner: { flex: 1, borderRadius: 28, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  bubblePreview: { height: 64, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, marginVertical: 0 },
  bubblePreviewSmall: { height: 32 },
  idPreview: { color: colors.gold, fontSize: 30, fontWeight: '900', height: 64, textAlignVertical: 'center', letterSpacing: 2, paddingTop: 12 },
  idPreviewSmall: { fontSize: 20, height: 26, paddingTop: 0 },
  idArt: { width: 44, height: 44 },
  frameBadge: { position: 'absolute', right: -14, bottom: 0, width: 30, height: 30 },
  footer: { color: colors.textDim, fontSize: 12, textAlign: 'center', paddingBottom: 12 },
});
