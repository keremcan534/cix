import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { CP_GIFT_IDS, KABILE_COUPLES, KABILE_FRIENDS, KABILE_ROUTES, findKabile, fmtK, kabile, kabileMemberIds, type Pair } from '@/data/kabile';
import { GIFTS, userById, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const CP_GIFTS = CP_GIFT_IDS.map((id) => GIFTS.find((g) => g.id === id)).filter((g): g is Gift => !!g);

export default function IliskiMeydani() {
  const { familyId, spendCoins } = useApp();
  const [mode, setMode] = useState<'cp' | 'dost'>('cp');
  const [pickTo, setPickTo] = useState(false);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const family = findKabile(familyId);
  const list = mode === 'cp' ? KABILE_COUPLES : KABILE_FRIENDS;
  const top = list[0];
  const members = family ? kabileMemberIds(family).filter((id) => id !== 'me') : [];

  const sendGift = (g: Gift) => {
    if (!giftTo) return;
    const u = userById(giftTo);
    if (!spendCoins(g.price, `CP hediyesi: ${g.name} → ${u.name}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    kabile.trackCpGift(g.price);
    showAlert('CP hediyesi gönderildi 💞', `${g.emoji} ${g.name} → ${u.name}\nYakınlık +${g.intimacy ?? 0} · Görev Merkezi'nde her 350 🪙 için +2 Güç Puanı alabilirsin.`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="İlişki Meydanı"
        right={
          <Pressable
            hitSlop={8}
            accessibilityLabel="Kurallar"
            onPress={() =>
              showAlert(
                'İlişki Meydanı',
                'Çift (CP) ve dost sıralaması, bu hafta birbirine gönderilen çift hediyelerinden gelen yakınlık puanına göre yapılır. Dostlar aynı kabilede olduğunda kabile avantajlarından yararlanabilir.',
              )
            }>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>?</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <LinearGradient colors={['#6D28D9', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroTitle}>{mode === 'cp' ? 'En Tatlı Çift' : 'En Yakın Dostlar'}</Text>
          {top && <PairCard pair={top} mode={mode} big />}
        </LinearGradient>

        <View style={styles.toggle}>
          {(
            [
              ['cp', 'Çift'],
              ['dost', 'Dost'],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[styles.toggleBtn, mode === k && styles.toggleActive]} accessibilityLabel={l}>
              <Text style={[styles.toggleText, mode !== k && { color: colors.textDim }]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>{mode === 'cp' ? '💞 En tatlı çift' : '🤝 En yakın dostlar'}</Text>
          <Text style={[styles.dim, { textAlign: 'center' }]}>Dostlar aynı kabilede olduğunda kabile avantajlarından yararlanabilir.</Text>
          {list.map((pair, i) => (
            <View key={`${pair.a}-${pair.b}`} style={styles.rankRow}>
              <Text style={[styles.rank, i < 3 && { color: colors.gold }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <PairCard pair={pair} mode={mode} />
              </View>
            </View>
          ))}
        </Card>

        {family ? (
          <Card style={{ gap: 8 }}>
            <Text style={styles.sectionTitle}>Kabile üyelerine CP hediyesi gönder</Text>
            <Text style={styles.dim}>Çift hediyeleri yakınlık puanı kazandırır. Görev Merkezi&apos;nde her 350 🪙 için +2 Güç Puanı (sınırsız).</Text>
            <GradientButton title="CP hediyesi gönder" icon="heart" onPress={() => setPickTo(true)} />
            <Pressable onPress={() => router.push(KABILE_ROUTES.merkez)} style={{ alignItems: 'center', padding: 4 }}>
              <Text style={{ color: '#C4B5FD', fontWeight: '700' }}>Görev Merkezi&apos;ne git ›</Text>
            </Pressable>
          </Card>
        ) : (
          <GradientButton title="Kabileye katıl" onPress={() => router.replace(KABILE_ROUTES.profile)} />
        )}
      </ScrollView>

      <ActionSheet
        visible={pickTo}
        title="Kime göndereceksin?"
        onClose={() => setPickTo(false)}
        options={members.map((id) => ({ label: userById(id).name, onPress: () => setGiftTo(id) }))}
      />
      <ActionSheet
        visible={!!giftTo}
        title={giftTo ? `${userById(giftTo).name} · CP hediyesi` : ''}
        onClose={() => setGiftTo(null)}
        options={CP_GIFTS.map((g) => ({ label: `${g.emoji} ${g.name} · ${g.price.toLocaleString('tr-TR')} 🪙`, onPress: () => sendGift(g) }))}
      />
    </SafeAreaView>
  );
}

function PairCard({ pair, mode, big }: { pair: Pair; mode: 'cp' | 'dost'; big?: boolean }) {
  const a = userById(pair.a);
  const b = userById(pair.b);
  const size = big ? 52 : 40;
  return (
    <View style={[styles.pair, big && styles.pairBig]}>
      <Pressable onPress={() => router.push(`/kullanici/${a.id}`)} accessibilityLabel={a.name}>
        <Avatar uri={a.avatar} size={size} />
      </Pressable>
      <Pressable onPress={() => router.push(`/kullanici/${b.id}`)} style={{ marginLeft: -size / 3 }} accessibilityLabel={b.name}>
        <Avatar uri={b.avatar} size={size} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.pairName, big && { fontSize: 16 }]} numberOfLines={1}>
          {a.name} & {b.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Text style={styles.chip}>{mode === 'cp' ? 'CP' : 'Dost'}</Text>
          <Text style={styles.chip}>LV.{pair.level}</Text>
        </View>
      </View>
      <Text style={styles.score}>{fmtK(pair.score)} ❤</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  hero: { borderRadius: 20, padding: 16, gap: 12 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 20, textAlign: 'center', letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, padding: 4 },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 },
  toggleActive: { backgroundColor: colors.pink },
  toggleText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionTitle: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { color: colors.textDim, fontWeight: '900', width: 18 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(236,72,153,0.35)' },
  pairBig: { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: 'rgba(255,255,255,0.3)' },
  pairName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chip: { color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: 'rgba(236,72,153,0.6)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  score: { color: '#F9A8D4', fontWeight: '900', fontSize: 15 },
});
