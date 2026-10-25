import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NOBLE_DAYS, NOBLE_RIGHTS, NOBLE_TIERS, SVIP_LEVELS, SVIP_RIGHTS, VIP_COMPARE, VIP_PLANS } from '@/data/status';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Tab = 'svip' | 'vip' | 'noble';
const GOLD = '#F5D7A1';
const fmt = (n: number) => n.toLocaleString('tr-TR');
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}k` : String(n));

export default function PrivilegeCenter() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'vip' || params.tab === 'noble' ? params.tab : 'svip');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0A0F' }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.segment}>
          {(
            [
              ['svip', 'SVIP'],
              ['vip', 'VIP'],
              ['noble', 'Asil'],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
              <Text style={[styles.segText, tab === k && { color: '#3B2A12' }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => showAlert('Ayrıcalıklar', 'SVIP: yüklenen her jeton 1 deneyim puanıdır, seviye düşmez.\nVIP: süreli abonelik.\nAsil: jetonla 30 günlük unvan.\nTüm ayrıcalıklar sunucuda doğrulanır.')} hitSlop={10} accessibilityLabel="Yardım">
          <Ionicons name="help-circle-outline" size={26} color="#fff" />
        </Pressable>
      </View>
      {tab === 'svip' ? <Svip /> : tab === 'vip' ? <Vip /> : <Noble />}
    </SafeAreaView>
  );
}

function Svip() {
  const { svipXp, svipLevel } = useApp();
  const { width } = useWindowDimensions();
  const cardW = Math.min(width, 520) - 48;
  const [index, setIndex] = useState(Math.max(0, svipLevel - 1));
  const [sub, setSub] = useState<'rights' | 'shop'>('rights');
  const lv = SVIP_LEVELS[index];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.segment, { alignSelf: 'center', marginBottom: 12 }]}>
        {(
          [
            ['rights', 'Ayrıcalık Merkezi'],
            ['shop', 'Özel Mağaza'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => (k === 'shop' ? router.push('/magaza') : setSub(k))} style={[styles.segBtn, sub === k && styles.segActive]}>
            <Text style={[styles.segText, sub === k && { color: '#3B2A12' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        onMomentumScrollEnd={(e) => setIndex(Math.max(0, Math.min(9, Math.round(e.nativeEvent.contentOffset.x / (cardW + 12)))))}>
        {SVIP_LEVELS.map((l, i) => {
          const locked = svipLevel < l.level;
          const isNext = svipLevel === l.level - 1;
          return (
            <Pressable key={l.level} onPress={() => setIndex(i)} style={{ width: cardW }} accessibilityLabel={`SVIP${l.level} kartı`}>
              <LinearGradient colors={l.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.svipCard, index === i && { borderColor: GOLD }]}>
                {locked && <Text style={styles.lockChip}>🔒 Kilitli</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.svipTitle}>SVIP{l.level}</Text>
                  <Text style={{ fontSize: 54, marginLeft: 'auto' }}>{l.emoji}</Text>
                </View>
                {isNext ? (
                  <>
                    <Text style={styles.cardText}>
                      {short(svipXp)} / {short(l.xp)}
                    </Text>
                    <View style={styles.track}>
                      <View style={{ height: 6, width: `${Math.min(100, (svipXp / l.xp) * 100)}%`, backgroundColor: GOLD }} />
                    </View>
                  </>
                ) : locked ? (
                  <Text style={styles.cardText}>Kilidi Açılmadı, Deneyim Puanı {fmt(l.xp)} Olmalıdır</Text>
                ) : (
                  <Text style={[styles.cardText, { color: GOLD }]}>✓ Açıldı · kalıcı</Text>
                )}
                {locked && (
                  <Pressable style={styles.loadBtn} onPress={() => router.push('/cuzdan')}>
                    <Text style={{ color: '#B45309', fontWeight: '800' }}>Yükle</Text>
                  </Pressable>
                )}
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.rightsTitle}>
        ✦ SVIP{lv.level} hakları {lv.rights}/{SVIP_RIGHTS.length} ✦
      </Text>
      <View style={styles.grid}>
        {SVIP_RIGHTS.map((r, i) => {
          const on = i < lv.rights;
          return (
            <Pressable
              key={r.name}
              style={[styles.rightCell, !on && { opacity: 0.38 }]}
              onPress={() => {
                const need = SVIP_LEVELS.find((x) => x.rights > i);
                showAlert(r.name, on ? `SVIP${lv.level} ile kullanılabilir.` : need ? `SVIP${need.level} ile açılır.` : 'Yakında.');
              }}>
              <View style={styles.rightIcon}>
                <Text style={{ fontSize: 26 }}>{r.emoji}</Text>
              </View>
              <Text style={styles.rightName} numberOfLines={2}>
                {r.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Yüklenen her 1 jeton = 1 SVIP deneyim puanı. Bonus jetonlar ve hediye olarak alınan jetonlar sayılmaz. İadesi yapılan yüklemelerin puanı geri alınır.</Text>
    </ScrollView>
  );
}

function Vip() {
  const { vipDays, buyVipPlan, coins } = useApp();
  const [plan, setPlan] = useState(VIP_PLANS[1].days);
  const p = VIP_PLANS.find((x) => x.days === plan)!;
  const buy = () => {
    if (coins < p.price)
      return showAlert('Yetersiz jeton', `VIP ${p.label} için 🪙 ${fmt(p.price)} gerekir.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Yükle', onPress: () => router.push('/cuzdan') },
      ]);
    showAlert('VIP satın al', `VIP ${p.label} · 🪙 ${fmt(p.price)}. Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Satın al', onPress: () => buyVipPlan(p.days) && showAlert('VIP aktif 🎉', `${p.days} gün eklendi.`) },
    ]);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      {vipDays > 0 && <Text style={[styles.cardText, { color: GOLD, textAlign: 'center' }]}>👑 VIP aktif · {vipDays} gün kaldı</Text>}
      <Text style={styles.h1}>Ayrıcalık Karşılaştırması</Text>
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={[styles.th, { flex: 1.1 }]}>Ayrıcalıklar</Text>
          <Text style={[styles.th, styles.mid]}>VIP olmayan</Text>
          <Text style={[styles.th, styles.vipCol, { color: GOLD, fontSize: 20, fontStyle: 'italic', fontWeight: '900' }]}>VIP</Text>
        </View>
        {VIP_COMPARE.map(([name, free, vip]) => (
          <View key={name} style={styles.tr}>
            <Text style={[styles.td, { flex: 1.1 }]}>{name}</Text>
            <Text style={[styles.td, styles.mid]}>{free}</Text>
            <Text style={[styles.td, styles.vipCol, { color: GOLD, fontWeight: '700' }]}>{vip}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {VIP_PLANS.map((x) => (
          <Pressable key={x.days} onPress={() => setPlan(x.days)} style={[styles.plan, plan === x.days && { borderColor: GOLD }]}>
            {x.tag && <Text style={styles.planTag}>{x.tag}</Text>}
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{x.label}</Text>
            <Text style={{ color: GOLD, fontWeight: '700' }}>🪙 {fmt(x.price)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.note, { textAlign: 'center' }]}>👤 e***n 90 Gün pakete abone oldu</Text>
      <Pressable onPress={buy} style={styles.buyBtn}>
        <Text style={{ color: '#3B2A12', fontWeight: '900', fontSize: 18 }}>VIP Satın Al</Text>
      </Pressable>
      <Text style={styles.note}>Abonelik süresi dolunca ayrıcalıklar durur; otomatik yenileme yok. Kalan süre iade edilmez.</Text>
    </ScrollView>
  );
}

function Noble() {
  const { nobleTier, nobleDays, buyNoble, coins } = useApp();
  const [sel, setSel] = useState(Math.max(1, nobleTier));
  const t = NOBLE_TIERS[sel - 1];
  const owned = nobleTier >= sel;
  const buy = () => {
    if (coins < t.price)
      return showAlert('Kilidi açılmadı', `${t.name} için 🪙 ${fmt(t.price)} gerekir. Lütfen önce bakiye yükleyin.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Yükle', onPress: () => router.push('/cuzdan') },
      ]);
    showAlert(`${t.name} unvanı`, `${NOBLE_DAYS} gün · 🪙 ${fmt(t.price)}. Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Al', onPress: () => buyNoble(t.tier) && showAlert(`${t.emoji} ${t.name} oldun!`, `${t.rights} özel hak açıldı.`) },
    ]);
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#0F2A30' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.nobleTabs}>
          {NOBLE_TIERS.map((x) => (
            <Pressable key={x.tier} onPress={() => setSel(x.tier)}>
              <Text style={[styles.nobleTab, sel === x.tier && styles.nobleTabOn]}>{x.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <LinearGradient colors={t.colors} style={styles.emblem}>
            <Text style={{ fontSize: 86 }}>{t.emoji}</Text>
          </LinearGradient>
          {owned && <Text style={[styles.cardText, { color: GOLD, marginTop: 8 }]}>✓ Aktif · {nobleDays} gün kaldı</Text>}
        </View>
        <Text style={[styles.rightsTitle, { color: GOLD }]}>
          Özel Haklar {t.rights}/{NOBLE_RIGHTS.length}
        </Text>
        <View style={styles.grid}>
          {NOBLE_RIGHTS.map((r, i) => {
            const on = i < t.rights;
            return (
              <Pressable
                key={r.name}
                style={[styles.rightCell, { backgroundColor: 'transparent', borderWidth: 0 }, !on && { opacity: 0.35 }]}
                onPress={() => {
                  const need = NOBLE_TIERS.find((x) => x.rights > i);
                  showAlert(r.name, on ? `${t.name} ile kullanılabilir.` : need ? `${need.name} ile açılır.` : '');
                }}>
                <View>
                  <Text style={{ fontSize: 34 }}>{r.emoji}</Text>
                  {r.isNew && <Text style={styles.newTag}>Yeni</Text>}
                </View>
                <Text style={[styles.rightName, { color: GOLD }]} numberOfLines={2}>
                  {r.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 }}>
          {owned ? `${t.emoji} ${t.name} aktif` : nobleTier > 0 ? `Yükselt: ${t.name} · 🪙 ${fmt(t.price)}` : `Kilidi açılmadı · 🪙 ${fmt(t.price)} / ${NOBLE_DAYS} gün`}
        </Text>
        {!owned && (
          <Pressable onPress={buy} style={styles.alBtn} accessibilityLabel={`${t.name} al`}>
            <Text style={{ color: '#3B2A12', fontWeight: '900', fontSize: 18 }}>Al</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: 3 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: GOLD },
  segText: { color: colors.textDim, fontWeight: '800' },
  svipCard: { borderRadius: 16, padding: 16, minHeight: 170, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  lockChip: { alignSelf: 'flex-start', backgroundColor: '#FDE7C7', color: '#7C2D12', fontWeight: '800', fontSize: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  svipTitle: { color: GOLD, fontSize: 40, fontWeight: '900', fontStyle: 'italic' },
  cardText: { color: '#fff', fontSize: 14 },
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  loadBtn: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#FDE7C7', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  rightsTitle: { color: GOLD, fontWeight: '900', fontSize: 18, textAlign: 'center', marginVertical: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, rowGap: 12 },
  rightCell: { width: '31.3%', marginHorizontal: '1%', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,215,161,0.35)', backgroundColor: '#15120C' },
  rightIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E8B979', alignItems: 'center', justifyContent: 'center' },
  rightName: { color: GOLD, fontSize: 12, textAlign: 'center', paddingHorizontal: 4 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, paddingHorizontal: 16, marginTop: 12 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 20 },
  table: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  th: { color: colors.textDim, padding: 12, textAlign: 'center', fontSize: 13 },
  td: { color: '#D4D4D8', padding: 12, textAlign: 'center', fontSize: 13 },
  mid: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  vipCol: { flex: 1, backgroundColor: 'rgba(245,215,161,0.06)' },
  plan: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#17151D' },
  planTag: { position: 'absolute', top: -10, backgroundColor: colors.primary, color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  buyBtn: { backgroundColor: GOLD, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  nobleTabs: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  nobleTab: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  nobleTabOn: { color: '#fff', borderBottomWidth: 3, borderBottomColor: '#fff' },
  emblem: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center' },
  newTag: { position: 'absolute', top: -6, right: -18, backgroundColor: colors.red, color: '#fff', fontSize: 9, fontWeight: '800', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#1B1A17', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, borderColor: '#B8955A' },
  alBtn: { backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 34, paddingVertical: 12 },
});
