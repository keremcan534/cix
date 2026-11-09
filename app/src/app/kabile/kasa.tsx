import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Avatar, Card, GradientButton, Header, StateIcon } from '@/components/ui';
import { KABILE_ROUTES, KASA_GOAL, KASA_HISTORY_MOCK, ensureFresh, findKabile, fmt, kabileMemberIds, kabileMeta, memberPower, useKabileProgress } from '@/data/kabile';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { liveMode } from '@/lib/live';
import { youLabel } from '@/lib/tr';
import { useApp } from '@/store';
import { ThemeScope, makeStyles, useTheme } from '@/theme';

// The demo's treasury and its history are sample data; a live build's chests are in Görevler (the server's).
export default function KabileKasa() {
  return liveMode() ? <Redirect href={KABILE_ROUTES.merkez} /> : <DemoKabileKasa />;
}

function DemoKabileKasa() {
  const { familyId, me } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const p = useKabileProgress();
  useFocusEffect(useCallback(() => ensureFresh(), []));
  const family = findKabile(familyId);

  if (!family)
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Aile Kasası" />
        <View style={{ paddingTop: 96, paddingHorizontal: 32, gap: 12, alignItems: 'center' }}>
          <StateIcon name="lock-closed" />
          <Text style={[styles.title, { textAlign: 'center' }]}>Kasa aile üyelerine açıktır</Text>
          <Text style={{ color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>Bir aileye katıldığında bağışlar, kasa ödülleri ve harcamalar burada görünür.</Text>
          <GradientButton title="Aile bul" onPress={() => router.replace(KABILE_ROUTES.profile)} />
        </View>
      </SafeAreaView>
    );

  const meta = kabileMeta(family.id);
  const weekly = meta.weeklyPower + p.addedPower;
  const reached = weekly >= KASA_GOAL;
  const rows = kabileMemberIds(family)
    .map((id, i) => ({ id, power: id === 'me' ? p.myPower : memberPower(id, i) }))
    .sort((a, b) => b.power - a.power);
  const top3 = rows.filter((r) => r.power > 0).slice(0, 3);
  const myShare = reached && weekly ? Math.floor((meta.chestValue * p.myPower) / weekly) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Aile Kasası"
        right={
          <Pressable
            hitSlop={8}
            onPress={() =>
              showAlert(
                'Aile Kasası nasıl çalışır?',
                `Ailenin haftalık katkı puanı ${fmt(KASA_GOAL)} hedefine ulaşırsa, haftalık kapanışta sandık değeri katkı oranına göre dağıtılır:\n\nPayın = sandık değeri × senin katkın ÷ ailenin haftalık katkı puanı\n\nRastgele ödül yoktur.`,
              )
            }
            accessibilityLabel="Kasa kuralları">
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>?</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {/* Brand banner: a dark amber-to-teal gradient in both schemes, so what sits on it keeps the dark look. */}
        <ThemeScope scheme="dark">
        <LinearGradient colors={['#78350F', '#0B3B4A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <StateIcon name="wallet-outline" size={72} tone="money" />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.heroText}>Sandık Değeri {fmt(meta.chestValue)} 🪙</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.min(100, Math.round((weekly / KASA_GOAL) * 100))}%` }]} />
              <Text style={styles.barText}>
                {fmt(weekly)}/{fmt(KASA_GOAL)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.heroText}>TOP3 Katkı</Text>
              {top3.map((r) => (
                <Avatar key={r.id} uri={r.id === 'me' ? me.avatar : userById(r.id).avatar} size={24} />
              ))}
            </View>
          </View>
          <View style={styles.mine}>
            <Text style={[styles.dim, styles.heroDim]}>Benim Katkım</Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{fmt(p.myPower)} puan</Text>
          </View>
        </LinearGradient>
        </ThemeScope>

        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {reached && <Ionicons name="checkmark-circle" size={18} color={colors.green} />}
            <Text style={[styles.title, { flexShrink: 1 }]}>{reached ? 'Bu haftanın hedefi aşıldı' : `Hedefe ${fmt(KASA_GOAL - weekly)} katkı puanı kaldı`}</Text>
          </View>
          <Text style={styles.dim}>
            Tahmini payın: <Text style={{ color: colors.gold, fontWeight: '800' }}>{fmt(myShare)} 🪙</Text>
            {p.myPower ? '' : ' · pay almak için bu hafta görev yaparak katkı ver'}
          </Text>
          <Text style={styles.dim}>Pay = {fmt(meta.chestValue)} 🪙 × {fmt(p.myPower)} ÷ {fmt(weekly)}. Dağıtım haftalık kapanışta (Pazartesi 0:00, UTC+3) yapılır.</Text>
          <GradientButton small title="Görevler'de katkı ver" icon="flash" onPress={() => router.push(KABILE_ROUTES.merkez)} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={[styles.title, { marginBottom: 6 }]}>Haftalık katkı sıralaması</Text>
          {rows.map((r, i) => {
            const u = r.id === 'me' ? me : userById(r.id);
            return (
              <Pressable key={r.id} style={[styles.row, { paddingVertical: 5 }]} onPress={() => r.id !== 'me' && router.push(`/kullanici/${r.id}`)}>
                <Text style={[styles.rank, i < 3 && { color: colors.gold }]}>{i + 1}</Text>
                <Avatar uri={u.avatar} size={34} />
                <Text style={{ color: colors.text, flex: 1 }}>{r.id === 'me' ? youLabel(me.name) : u.name}</Text>
                <Text style={{ color: semantic.tonalText, fontWeight: '800' }}>{fmt(r.power)} puan</Text>
              </Pressable>
            );
          })}
        </Card>

        {p.items.length > 0 && (
          <Card style={{ gap: 6 }}>
            <Text style={styles.title}>Sandıklardan kazandıkların</Text>
            {p.items.map((it, i) => (
              <Text key={`${it.label}-${i}`} style={styles.dim}>
                🎁 {it.label} · {it.until} tarihine kadar
              </Text>
            ))}
          </Card>
        )}

        <Card style={{ gap: 4 }}>
          <Text style={[styles.title, { marginBottom: 6 }]}>Katkı geçmişi</Text>
          {p.history.map((h) => (
            <HistoryRow key={h.id} avatar={me.avatar} name="Sen" text={h.text} power={h.power} treasure={h.treasure} time={h.time} />
          ))}
          {KASA_HISTORY_MOCK.map((h) => (
            <HistoryRow key={h.id} avatar={userById(h.userId).avatar} name={userById(h.userId).name} text={h.text} power={h.power} treasure={h.treasure} time={h.time} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryRow({ avatar, name, text, power, treasure, time }: { avatar: string; name: string; text: string; power: number; treasure: number; time: string }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.row, { paddingVertical: 6 }]}>
      <Avatar uri={avatar} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
          <Text style={{ fontWeight: '700' }}>{name}</Text> · {text}
        </Text>
        <Text style={styles.dim}>{time}</Text>
      </View>
      <Text style={{ color: semantic.tonalText, fontWeight: '700', fontSize: 12 }}>
        +{power} puan · 🔮+{treasure}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { color: colors.textDim, fontWeight: '800', width: 20 },
  hero: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The banner stays dark in both schemes: its type keeps the dark scheme's colors.
  heroText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroDim: { color: '#A3B1CF' },
  bar: { height: 18, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 9, overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary, borderRadius: 9 },
  barText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  mine: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
}));
