import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoinPill, Header } from '@/components/ui';
import { COSMETICS, COSMETIC_KINDS, EMOJI_PACKS, type Cosmetic, type CosmeticKind } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Tab = CosmeticKind | 'emoji';

export default function StoreScreen() {
  const { coins, inventory, equipped, buyCosmetic, equip, emojiPacks, buyEmojiPack, vipLevel, settings } = useApp();
  const [tab, setTab] = useState<Tab>('frame');
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
        {[...COSMETIC_KINDS, { kind: 'emoji' as const, label: '😀 Emoji paketleri' }].map((k) => (
          <Pressable key={k.kind} onPress={() => setTab(k.kind)} style={[styles.tab, tab === k.kind && styles.tabActive]}>
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
                  <Text style={styles.emojiPreview}>{p.emojis.slice(0, 4).join(' ')}</Text>
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
                      <Text style={styles.buyText}>🪙 {p.price}</Text>
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
                  <Preview item={c} />
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
                      <Text style={styles.buyText}>🪙 {c.price.toLocaleString('tr-TR')}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
      </ScrollView>
      <Text style={styles.footer}>Kozmetik satın alımları komisyon programına dahil değildir.</Text>
    </SafeAreaView>
  );
}

function Preview({ item }: { item: Cosmetic }) {
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
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  warn: { color: colors.gold, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingBottom: 30 },
  item: { width: '46%', margin: '2%', backgroundColor: colors.card, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  emojiPreview: { fontSize: 26, height: 64, textAlignVertical: 'center', paddingTop: 14 },
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
