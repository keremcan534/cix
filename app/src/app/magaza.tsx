import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryEffect, ENTRY_LOOKS, type EntryFx, type EntryShow } from '@/components/fx/entry';
import { ArtFrame, frameArtOf } from '@/components/fx/frame-art';
import { AnimatedFrame, type FrameFx } from '@/components/fx/frames';
import { CoinPill, Header } from '@/components/ui';
import { COSMETICS, COSMETIC_KINDS, EMOJI_PACKS, type Cosmetic, type CosmeticKind } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, ReactionArt } from '@/components/ReactionArt';

type Tab = CosmeticKind | 'emoji';

export default function StoreScreen() {
  const { coins, inventory, equipped, buyCosmetic, equip, emojiPacks, buyEmojiPack, vipLevel, settings, me } = useApp();
  const [tab, setTab] = useState<Tab>('frame');
  const [preview, setPreview] = useState<EntryShow | null>(null);
  const playPreview = (c: Cosmetic) =>
    setPreview({ name: me.name, avatar: me.avatar, fx: c.kind === 'entry' ? ((c.fx as EntryFx | undefined) ?? 'vip') : 'vip', ride: c.kind === 'ride' ? c.emoji : undefined });
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
      <Header title="Mağaza" right={<CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        {[...COSMETIC_KINDS, { kind: 'emoji' as const, label: 'Emoji paketleri' }].map((k) => (
          <Pressable key={k.kind} onPress={() => setTab(k.kind)} style={[styles.tab, tab === k.kind && styles.tabActive, k.kind === 'emoji' && styles.tabRow]}>
            {k.kind === 'emoji' && <Image source={EMOJI_PACKS_ICON} style={{ width: 18, height: 18 }} />}
            <Text style={[styles.tabText, tab === k.kind && { color: '#fff' }]}>{k.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {settings.effectsOff && (tab === 'entry' || tab === 'ride') && (
        <Text style={styles.warn}>Efektler ayarlardan kapalı: satın aldığın giriş efektleri sende gösterilmez, diğerleri görür.</Text>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {tab === 'emoji'
          ? EMOJI_PACKS.map((p) => {
              const owned = emojiPacks.has(p.id) || (p.minVip ? vipLevel >= p.minVip : false);
              return (
                <View key={p.id} style={styles.item}>
                  <View style={styles.packPreview} accessibilityLabel={p.emojis.slice(0, 4).join(' ')}>
                    {p.emojis.slice(0, 4).map((e) => (
                      <ReactionArt key={e} emoji={e} size={30} textStyle={styles.emojiPreview} />
                    ))}
                  </View>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta}>{p.animated ? 'Animasyonlu · kalıcı' : 'Kalıcı koleksiyon'}</Text>
                  {owned ? (
                    <Text style={styles.owned}>✓ Açık</Text>
                  ) : p.minVip && !p.price ? (
                    <Text style={styles.locked}>🔒 VIP {p.minVip}</Text>
                  ) : (
                    <Pressable
                      style={styles.buy}
                      onPress={() => {
                        const err = buyEmojiPack(p.id);
                        if (err) showAlert('Satın alınamadı', err);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon3D name="coin" size={16} /><Text style={styles.buyText}>{p.price}</Text></View>
                    </Pressable>
                  )}
                </View>
              );
            })
          : items.map((c) => {
              const owned = inventory.has(c.id);
              const isEquipped = equipped[c.kind] === c.id;
              return (
                <View key={c.id} style={[styles.item, isEquipped && { borderColor: colors.primaryText }]}>
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
                    <Pressable style={[styles.buy, { backgroundColor: isEquipped ? colors.cardAlt : colors.primary }]} onPress={() => equip(isEquipped ? null : c.id, c.kind)}>
                      <Text style={styles.buyText}>{isEquipped ? 'Çıkar' : 'Kullan'}</Text>
                    </Pressable>
                  ) : c.minVip && vipLevel < c.minVip ? (
                    <Pressable onPress={() => router.push('/vip')}>
                      <Text style={styles.locked}>🔒 VIP {c.minVip}</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.buy} onPress={() => buy(c)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon3D name="coin" size={16} /><Text style={styles.buyText}>{c.price.toLocaleString('tr-TR')}</Text></View>
                    </Pressable>
                  )}
                </View>
              );
            })}
      </ScrollView>
      <Text style={styles.footer}>Kozmetik satın alımları komisyon programına dahil değildir.</Text>
      {preview && <EntryEffect key={`${preview.fx}-${preview.ride}`} show={preview} still={settings.reduceMotion} top={140} onDone={() => setPreview(null)} />}
    </SafeAreaView>
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
    return (
      <View style={{ height: 76, justifyContent: 'center' }}>
        <AnimatedFrame fx={item.fx as FrameFx} size={64} still={still}>
          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} />
        </AnimatedFrame>
      </View>
    );
  }
  if (item.kind === 'entry') {
    const look = ENTRY_LOOKS[(item.fx as EntryFx | undefined) ?? 'vip'];
    return (
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.entryPreview}>
        {look.creature && <Text style={{ fontSize: 16 }}>{look.creature}</Text>}
        <Text style={styles.entryPreviewText} numberOfLines={1}>
          Hoş geldin
        </Text>
        <Text style={{ fontSize: 14 }}>{look.mark}</Text>
      </LinearGradient>
    );
  }
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
    return (
      <LinearGradient colors={item.color} style={styles.bubblePreview}>
        <Text style={{ color: '#fff', fontSize: 12 }}>Merhaba! {item.emoji}</Text>
      </LinearGradient>
    );
  }
  if (item.kind === 'specialId') return <Text style={styles.idPreview}>{item.name.replace('ID ', '')}</Text>;
  return <Text style={{ fontSize: 44, height: 64, textAlignVertical: 'center' }}>{item.emoji}</Text>;
}

const styles = StyleSheet.create({
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: 'rgba(19,217,223,0.18)' },
  previewText: { color: colors.primaryText, fontWeight: '700', fontSize: 12 },
  entryPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 20, paddingHorizontal: 10, marginVertical: 12, maxWidth: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  entryPreviewText: { color: '#fff', fontWeight: '800', fontSize: 12, flexShrink: 1 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  warn: { color: colors.gold, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingBottom: 30 },
  item: { width: '46%', margin: '2%', backgroundColor: colors.card, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  packPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 64 },
  emojiPreview: { fontSize: 22 },
  name: { color: '#fff', fontWeight: '700' },
  meta: { color: colors.textDim, fontSize: 12 },
  owned: { color: colors.green, fontWeight: '700', paddingVertical: 7 },
  locked: { color: colors.textDim, fontWeight: '700', paddingVertical: 7 },
  buy: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  buyText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  framePreview: { width: 64, height: 64, borderRadius: 32, padding: 4 },
  frameInner: { flex: 1, borderRadius: 28, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  bubblePreview: { height: 64, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, marginVertical: 0 },
  idPreview: { color: colors.gold, fontSize: 30, fontWeight: '900', height: 64, textAlignVertical: 'center', letterSpacing: 2, paddingTop: 12 },
  footer: { color: colors.textDim, fontSize: 12, textAlign: 'center', paddingBottom: 12 },
});
