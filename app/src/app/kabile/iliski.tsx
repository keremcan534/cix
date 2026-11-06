import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { ActionSheet } from '@/components/ActionSheet';
import { Art } from '@/components/Art';
import { ComingSoon } from '@/components/coming-soon';
import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { CP_GIFT_IDS, KABILE_COUPLES, KABILE_FRIENDS, KABILE_ROUTES, findKabile, fmtK, kabile, kabileMemberIds, payKabileGift, type Pair } from '@/data/kabile';
import { GIFTS, userById, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { successHaptic } from '@/lib/haptics';
import { liveMode } from '@/lib/live';
import { useApp } from '@/store';
import { ThemeScope, makeStyles, useTheme } from '@/theme';

const CP_GIFTS = CP_GIFT_IDS.map((id) => GIFTS.find((g) => g.id === id)).filter((g): g is Gift => !!g);

// Tayfa has no server yet (data/kabile tayfaAvailable): the pairs are sample people and an İkili gift would take
// real coins for no one, so a live build shows a notice instead.
export default function IliskiMeydani() {
  return liveMode() ? <ComingSoon title="Uyum Köşesi" /> : <DemoIliski />;
}

function DemoIliski() {
  const { familyId, spendCoins } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
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
    const paid = payKabileGift(g.price, `İkili hediyesi: ${g.name} → ${u.name}`, spendCoins);
    if (paid === 'off') return;
    if (paid === 'coins') {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    kabile.trackCpGift(g.price);
    successHaptic();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Uyum Köşesi"
        right={
          <Pressable
            hitSlop={8}
            accessibilityLabel="Kurallar"
            onPress={() =>
              showAlert(
                'Uyum Köşesi',
                'İkili ve dost sıralaması, bu hafta birbirine gönderilen İkili hediyelerinden gelen yakınlık puanına göre yapılır. Dostlar aynı tayfadaysa tayfa avantajlarından da yararlanır.',
              )
            }>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>?</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {/* Brand banner: teal-to-pink in both schemes; the pair card on it keeps the dark look. */}
        <ThemeScope scheme="dark">
        <LinearGradient colors={['#076A70', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroTitle}>{mode === 'cp' ? 'En Uyumlu İkili' : 'En Yakın Dostlar'}</Text>
          {top && <PairCard pair={top} mode={mode} big />}
        </LinearGradient>
        </ThemeScope>

        <View style={styles.toggle}>
          {(
            [
              ['cp', 'İkili'],
              ['dost', 'Dost'],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[styles.toggleBtn, mode === k && styles.toggleActive]} accessibilityLabel={l}>
              <Text style={[styles.toggleText, mode !== k && { color: colors.textDim }]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Card style={{ gap: 10 }}>
          <View style={styles.titleRow}>
            <Art name={mode === 'cp' ? 'iliski-cift-cp-en-tatli-cift' : 'iliski-dost-en-yakin-dostlar'} size={22} />
            <Text style={styles.sectionTitle}>{mode === 'cp' ? 'En uyumlu ikili' : 'En yakın dostlar'}</Text>
          </View>
          <Text style={[styles.dim, { textAlign: 'center' }]}>Dostlar aynı tayfadaysa tayfa avantajlarından da yararlanır.</Text>
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
            <Text style={styles.sectionTitle}>Tayfa üyelerine İkili hediyesi gönder</Text>
            <Text style={styles.dim}>İkili hediyeleri yakınlık puanı kazandırır. Görevler&apos;de her 350 🪙 için +2 katkı puanı (sınırsız).</Text>
            <GradientButton title="İkili hediyesi gönder" icon="heart" onPress={() => setPickTo(true)} />
            <Pressable onPress={() => router.push(KABILE_ROUTES.merkez)} style={{ alignItems: 'center', padding: 4 }}>
              <Text style={{ color: semantic.tonalText, fontWeight: '700' }}>Görevler&apos;e git ›</Text>
            </Pressable>
          </Card>
        ) : (
          <GradientButton title="Tayfaya katıl" onPress={() => router.replace(KABILE_ROUTES.profile)} />
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
        title={giftTo ? `${userById(giftTo).name} · İkili hediyesi` : ''}
        onClose={() => setGiftTo(null)}
        options={CP_GIFTS.map((g) => ({ label: `${g.emoji} ${g.name} · ${g.price.toLocaleString('tr-TR')} 🪙`, onPress: () => sendGift(g) }))}
      />
    </SafeAreaView>
  );
}

function PairCard({ pair, mode, big }: { pair: Pair; mode: 'cp' | 'dost'; big?: boolean }) {
  const styles = useStyles();
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
          <Text style={styles.chip} numberOfLines={1}>
            {mode === 'cp' ? 'İkili' : 'Dost'}
          </Text>
          <Text style={styles.chip} numberOfLines={1}>
            LV.{pair.level}
          </Text>
        </View>
      </View>
      <Text style={styles.score} numberOfLines={1}>
        {fmtK(pair.score)} ❤
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  hero: { borderRadius: 20, padding: 16, gap: 12 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 20, textAlign: 'center', letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, padding: 4, ...lift },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 },
  toggleActive: { backgroundColor: semantic.socialFill },
  toggleText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { color: colors.textDim, fontWeight: '900', width: 18 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,101,118,0.35)' },
  pairBig: { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: 'rgba(255,255,255,0.3)' },
  pairName: { color: colors.text, fontWeight: '800', fontSize: 14 },
  // Chips and the score never shrink: on a narrow row (360 px) a shrunk chip broke inside its word ('İkil i').
  chip: { flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: dark ? 'rgba(255,101,118,0.6)' : semantic.socialFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  score: { flexShrink: 0, color: dark ? '#F9A8D4' : semantic.socialText, fontWeight: '900', fontSize: 15 },
}));
