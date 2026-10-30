import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { RECHARGE_PACKS, type RechargePack } from '@/data/status';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Icon3D } from '@/components/Icon3D';
import { Art } from '@/components/Art';
import { IS_DEMO } from '@/lib/build';

export default function WalletScreen() {
  const { coins, buyPack, firstBuys, ledger, spentToday, settings, svipLevel, svipXp, addCoins } = useApp();
  const [tab, setTab] = useState<'buy' | 'history'>('buy');
  const [filter, setFilter] = useState<'coin' | 'diamond'>('coin');
  const [processing, setProcessing] = useState<string | null>(null);

  const buy = (pack: RechargePack) => {
    // A second tap while the store payment is pending must not charge twice.
    if (processing) return;
    setProcessing(pack.id);
    // Prototype: no real payment; simulate the store confirmation delay, then credit.
    setTimeout(() => {
      const total = buyPack(pack.id);
      setProcessing(null);
      showAlert('Başarılı 🎉', `${total.toLocaleString('tr-TR')} jeton hesabına eklendi. +${pack.coins.toLocaleString('tr-TR')} SVIP deneyim puanı. (Demo – gerçek ödeme alınmadı)`);
    }, 1200);
  };
  const rows = ledger.filter((r) => r.currency === filter);
  const loadedToday = ledger.filter((r) => r.currency === 'coin' && r.amount > 0).reduce((x, r) => x + r.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.wallet} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </Pressable>
        <Text style={[styles.title, { flex: 1, marginLeft: 12 }]}>{tab === 'buy' ? 'Jeton Yükle' : 'Hareketler'}</Text>
        <Pressable onPress={() => setTab(tab === 'buy' ? 'history' : 'buy')} hitSlop={8} accessibilityLabel="Hareketler" style={{ marginRight: 16 }}>
          <Ionicons name={tab === 'buy' ? 'document-text-outline' : 'wallet-outline'} size={24} color="#fff" />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Ödeme' } })} hitSlop={8} accessibilityLabel="Destek">
          <Ionicons name="headset-outline" size={24} color="#fff" />
        </Pressable>
      </View>

      {tab === 'history' ? (
        <>
          <Text style={[styles.note, { marginBottom: 8 }]}>
            Bugün: 🪙 {spentToday.toLocaleString('tr-TR')} harcandı · 🪙 {loadedToday.toLocaleString('tr-TR')} eklendi
            {settings.dailySpendLimit ? ` · Limit ${settings.dailySpendLimit.toLocaleString('tr-TR')}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
            {(
              [
                ['coin', '🪙 Jeton'],
                ['diamond', '💎 Elmas'],
              ] as const
            ).map(([k, l]) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            ListEmptyComponent={<Text style={[styles.note, { marginTop: 30 }]}>Henüz hareket yok.</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff' }}>{item.reason}</Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>
                    {item.time} · {item.status} · {item.ref}
                  </Text>
                </View>
                <Text style={{ color: item.amount < 0 ? colors.red : colors.green, fontWeight: '800' }}>
                  {item.amount > 0 ? '+' : ''}
                  {item.amount.toLocaleString('tr-TR')}
                </Text>
              </View>
            )}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
            <Text style={{ color: colors.textDim, fontSize: 16 }}>Jeton bakiyem ⓘ</Text>
            <Text style={styles.balanceN}>{coins.toLocaleString('tr-TR')}</Text>
            {IS_DEMO && (
              <Pressable
                onPress={() => {
                  addCoins(1_000_000, 'Demo test bakiyesi');
                  showAlert('Test jetonu eklendi', '1.000.000 jeton eklendi. (Demo – gerçek ödeme yok, SVIP puanı vermez)');
                }}
                style={styles.testBtn}
                accessibilityRole="button"
                accessibilityLabel="Demo: 1.000.000 test jetonu ekle"
              >
                <Ionicons name="flask-outline" size={14} color={colors.primaryText} />
                <Text style={styles.testText}>Demo: +1.000.000 test jetonu</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.push('/vip')} accessibilityLabel="SVIP Sistemi">
            <LinearGradient colors={['#78350F', '#0B3B4A', '#B45309']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
              <Text style={styles.bannerTitle}>SVIP Sistemi</Text>
              <Text style={{ color: '#FDE7C7', fontSize: 12 }}>{svipLevel ? `SVIP${svipLevel} · ${svipXp.toLocaleString('tr-TR')} puan` : 'Her yüklenen jeton = 1 deneyim puanı'}</Text>
              <Art name="finans-vip-elmas-paketi" size={52} style={{ position: 'absolute', right: 16, top: 8 }} />
            </LinearGradient>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 18, marginBottom: 8 }}>
            <Text style={[styles.title, { flex: 1, fontSize: 20 }]}>Paket seç</Text>
            <Text style={styles.flag}>🇹🇷 ▾</Text>
          </View>
          <View style={styles.grid}>
            {RECHARGE_PACKS.map((p: RechargePack) => {
              const first = !!p.firstBonus && !firstBuys.has(p.id);
              const bonus = first ? p.firstBonus : p.bonus;
              return (
                <Pressable key={p.id} onPress={() => buy(p)} accessibilityLabel={`${p.coins} jeton paketi`} style={{ width: '31.3%', margin: '1%' }}>
                  <LinearGradient colors={first ? ['#FB923C', '#F97316'] : ['#2A2433', '#1E1A26']} style={[styles.pack, processing === p.id && { opacity: 0.5 }]}>
                    {first && (
                      <View style={styles.firstTag}>
                        <Art name="finans-ilk-alim-firsati" size={14} />
                        <Text style={styles.firstTagText}>Sadece İlk Defa</Text>
                      </View>
                    )}
                    <Icon3D name="coin" size={40} />
                    <Text style={styles.packCoins}>{p.coins.toLocaleString('tr-TR')}</Text>
                    {bonus ? <Text style={[styles.packBonus, first && { color: '#FFF7ED' }]}>+{bonus.toLocaleString('tr-TR')}</Text> : <View style={{ height: 18 }} />}
                    <Text style={[styles.packPrice, first && { color: '#FFF7ED' }]}>{processing === p.id ? 'Bekleniyor…' : p.price}</Text>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>Yüklemeye devam ederek Kullanım Koşulları ve Ödeme Sözleşmesi&apos;ni okuduğunu ve kabul ettiğini onaylarsın. Prototip: ödeme simüle edilir; iade/itiraz için Destek.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(19,217,223,0.18)' },
  testText: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 12 },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700' },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  balance: { margin: 16, borderRadius: 20, padding: 20, gap: 6 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)' },
  balanceN: { color: '#fff', fontSize: 32, fontWeight: '800' },
  section: { color: '#fff', fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  pack: { alignItems: 'center', gap: 6, paddingTop: 26, paddingBottom: 16, borderRadius: 16, minHeight: 130 },
  banner: { marginHorizontal: 16, borderRadius: 14, padding: 16, gap: 4, overflow: 'hidden' },
  bannerTitle: { color: '#FDE68A', fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  flag: { color: '#fff', backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  firstTag: { position: 'absolute', top: -8, left: 4, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  firstTagText: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
  packBonus: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  packSelected: { borderColor: colors.primaryText },
  bonus: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bonusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  packCoins: { color: '#fff', fontSize: 18, fontWeight: '800' },
  packPrice: { color: colors.textDim },
  note: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
