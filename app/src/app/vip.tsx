import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NOBLE_DAYS, NOBLE_RIGHTS, NOBLE_TIERS, SVIP_LEVELS, SVIP_RIGHTS, VIP_COMPARE, VIP_GIFT_PACK, VIP_PERKS, VIP_PLANS, VIP_TICKER } from '@/data/status';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Art } from '@/components/Art';
import { Avatar, LevelChips } from '@/components/ui';

type Tab = 'svip' | 'vip' | 'noble';
const GOLD = '#F5D7A1';
const fmt = (n: number) => n.toLocaleString('tr-TR');
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}k` : String(n));

export default function PrivilegeCenter() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'vip' || params.tab === 'noble' ? params.tab : 'svip');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0A0F' }}>
      <Backdrop scene={SCENES.vip} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
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
        <Pressable onPress={() => showAlert('Ayrıcalıklar', 'SVIP: yüklenen her jeton 1 deneyim puanıdır, seviye düşmez.\nVIP: 7 gün, 1 ay veya 3 aylık mağaza aboneliği.\nAsil: jetonla 30 günlük unvan.\nTüm ayrıcalıklar sunucuda doğrulanır.')} hitSlop={10} accessibilityLabel="Yardım">
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
                  {l.art ? <Art name={l.art} size={68} style={{ marginLeft: 'auto' }} /> : <Text style={{ fontSize: 54, marginLeft: 'auto' }}>{l.emoji}</Text>}
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
      <View style={styles.rightsTitleRow}>
        <Art name="svip-svip-isareti" size={22} />
        <Text style={[styles.rightsTitle, { marginVertical: 0 }]}>
          SVIP{lv.level} hakları {lv.rights}/{SVIP_RIGHTS.length}
        </Text>
        <Art name="svip-svip-isareti" size={22} />
      </View>
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
                {r.art ? <Art name={r.art} size={34} /> : <Text style={{ fontSize: 26 }}>{r.emoji}</Text>}
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
  const { vipDays, buyVipPlan, me, wealthLevel, charmLevel, settings, setSetting } = useApp();
  const [plan, setPlan] = useState(VIP_PLANS[1].days);
  const [perkPage, setPerkPage] = useState(0);
  const [pageW, setPageW] = useState(0);
  const p = VIP_PLANS.find((x) => x.days === plan)!;
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const perkPages = Math.ceil(VIP_PERKS.length / 4);
  const buy = () =>
    showAlert('VIP satın al', `VIP ${p.label} · ${p.tl} TL (${store}). Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Satın al', onPress: () => buyVipPlan(p.days) && showAlert('VIP aktif 🎉', `${p.days} gün eklendi.`) },
    ]);
  const toggleHide = (k: 'hideWealth' | 'hideCharm', v: boolean) => {
    if (vipDays <= 0)
      return showAlert('VIP ayrıcalığı', 'Seviyeleri gizlemek VIP ayrıcalığıdır.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'VIP Satın Al', onPress: buy },
      ]);
    setSetting(k, v);
  };
  // A grid of 2x2 perks per page, swiped horizontally.
  const pages = Array.from({ length: perkPages }, (_, i) => VIP_PERKS.slice(i * 4, i * 4 + 4));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      {vipDays > 0 && <Text style={[styles.cardText, { color: GOLD, textAlign: 'center' }]}>👑 VIP aktif · {vipDays} gün kaldı</Text>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {VIP_PLANS.map((x) => (
          <Pressable key={x.days} onPress={() => setPlan(x.days)} style={[styles.plan, plan === x.days && { borderColor: GOLD }]} accessibilityLabel={`VIP ${x.label}, ${x.tl} TL`}>
            <Text style={styles.planTag}>%{x.save} KAYDET</Text>
            <Text style={{ color: colors.textDim, fontSize: 15, marginTop: 10 }}>{x.label}</Text>
            <Text style={{ color: plan === x.days ? '#fff' : '#D4D4D8', fontWeight: '900', fontSize: 26 }}>
              <Text style={{ fontSize: 11, fontWeight: '600' }}>TRY</Text>
              {fmt(x.tl)}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 12, textDecorationLine: 'line-through' }}>TRY{fmt(x.was)}</Text>
          </Pressable>
        ))}
      </View>
      <BuyButton onPress={buy} />

      <Text style={[styles.h1, { marginTop: 8 }]}>VIP Ayrıcalıkları ({p.label})</Text>
      <View style={styles.box}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => setPageW(e.nativeEvent.layout.width)}
          onMomentumScrollEnd={(e) => setPerkPage(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))}>
          {pages.map((page, i) => (
            <View key={i} style={{ width: pageW, flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }}>
              {page.map((r) => (
                <View key={r.name} style={styles.perk}>
                  <View style={styles.perkIcon}>
                    <Ionicons name={r.icon as keyof typeof Ionicons.glyphMap} size={22} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: GOLD, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: 11, lineHeight: 15 }} numberOfLines={3}>
                      {r.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
        <Dots count={perkPages} index={perkPage} />
        <View style={styles.giftBox}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
            Üyelik Büyük Hediye Paketi <Text style={{ color: GOLD }}>({VIP_GIFT_PACK.length})</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            {VIP_GIFT_PACK.map((g) => (
              <View key={g.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 34 }}>{g.emoji}</Text>
                <View>
                  <Text style={{ color: GOLD, fontWeight: '700' }}>{g.name}</Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>Geçerlilik Süresi: {g.days} Gün</Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>Adet: {g.qty}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      <Text style={[styles.h1, { marginTop: 8 }]}>Ayrıcalık Karşılaştırması</Text>
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={[styles.th, { flex: 1.1 }]}>Ayrıcalıklar</Text>
          <Text style={[styles.th, styles.mid]}>VIP olmayan</Text>
          <Text style={[styles.th, styles.vipCol, { color: GOLD, fontSize: 20, fontStyle: 'italic', fontWeight: '900' }]}>VIP</Text>
        </View>
        {VIP_COMPARE.map(([name, free, vip]) => (
          <View key={name} style={styles.tr}>
            <Text style={[styles.td, { flex: 1.1 }]}>{name}</Text>
            <CompareCell value={free} style={styles.mid} />
            <CompareCell value={vip} style={styles.vipCol} vip />
          </View>
        ))}
      </View>

      <View style={styles.box}>
        <Text style={[styles.rightsTitle, { color: '#fff', marginVertical: 4 }]}>
          <Text style={{ color: GOLD }}>◆ </Text>Seviyeyi Gizle<Text style={{ color: GOLD }}> ◆</Text>
        </Text>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar uri={me.avatar} size={76} />
          <Text style={{ color: GOLD, fontWeight: '800', fontSize: 17 }}>{me.name}</Text>
          <LevelChips wealth={wealthLevel} charm={charmLevel} hideWealth={vipDays > 0 && settings.hideWealth} hideCharm={vipDays > 0 && settings.hideCharm} />
        </View>
        <View style={styles.toggles}>
          {(
            [
              ['hideWealth', 'Zenginlik seviyesini gizle'],
              ['hideCharm', 'Cazibe seviyesini gizle'],
            ] as const
          ).map(([k, l], i) => (
            <View key={k} style={[styles.toggleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={{ color: colors.textDim, fontSize: 15, flex: 1 }}>{l}</Text>
              <Switch value={vipDays > 0 && settings[k]} onValueChange={(v) => toggleHide(k, v)} trackColor={{ true: '#E8B979' }} thumbColor="#fff" accessibilityLabel={l} />
            </View>
          ))}
        </View>
      </View>

      <Text style={[styles.note, { textAlign: 'center' }]}>
        Abonelik ücreti {store} hesabı üzerinden tahsil edilecek ve ücret, {store} hesabında ayarlanan ödeme yöntemindeki yerel para birimine göre düşülecektir (farklı ülke
        politikaları, özel ödeme koşulları nedeniyle ek vergi ve ücretler gerekli olabilir; fiyat {store} ödeme sayfasına tabidir). Abonelik, sona ermeden 24 saat önce
        yenileme için otomatik olarak ücretlendirilecektir. Aboneliği istediğiniz zaman {store}{"'"}da iptal edebilirsiniz. Etkinleştirerek şunu kabul etmiş olursunuz:{' '}
        <Text style={{ color: '#fff' }}>Yinelenen abonelik koşulları, Gizlilik Politikası</Text>
      </Text>
      <BuyButton onPress={buy} />
    </ScrollView>
  );
}

function CompareCell({ value, style, vip }: { value: string | boolean; style: object; vip?: boolean }) {
  if (typeof value === 'boolean')
    return (
      <View style={[styles.tdBox, style]}>
        <Ionicons name={value ? 'checkmark-sharp' : 'close-sharp'} size={26} color={value ? '#F5B94A' : '#D4D4D8'} accessibilityLabel={value ? 'Var' : 'Yok'} />
      </View>
    );
  return <Text style={[styles.td, style, vip && { color: GOLD, fontWeight: '700' }]}>{value}</Text>;
}

function BuyButton({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Ticker />
      <Pressable onPress={onPress} accessibilityRole="button">
        <LinearGradient colors={['#FDE7C7', '#F5C189']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buyBtn}>
          <Text style={{ color: '#3B2A12', fontWeight: '900', fontSize: 18 }}>VIP Satın Al</Text>
        </LinearGradient>
      </Pressable>
    </>
  );
}

/** Rotating "x***y N Gün pakete abone oldu" line above the buy button. */
function Ticker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % VIP_TICKER.length), 3000);
    return () => clearInterval(t);
  }, []);
  const [name, days] = VIP_TICKER[i];
  return (
    <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14 }}>
      👤 {name} <Text style={{ color: GOLD }}>{days} Gün pakete abone oldu</Text>
    </Text>
  );
}

function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: i === index ? 28 : 14, height: 4, borderRadius: 2, backgroundColor: i === index ? '#D4D4D8' : 'rgba(255,255,255,0.15)' }} />
      ))}
    </View>
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
            {t.art ? <Art name={t.art} size={112} /> : <Text style={{ fontSize: 86 }}>{t.emoji}</Text>}
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
                  {r.art ? <Art name={r.art} size={44} /> : <Text style={{ fontSize: 34 }}>{r.emoji}</Text>}
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
        {owned && <Art name={t.art} size={28} style={{ marginRight: -6 }} />}
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 }}>
          {owned ? `${t.name} aktif` : nobleTier > 0 ? `Yükselt: ${t.name} · 🪙 ${fmt(t.price)}` : `Kilidi açılmadı · 🪙 ${fmt(t.price)} / ${NOBLE_DAYS} gün`}
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
  rightsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 18 },
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
  tdBox: { padding: 10, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  vipCol: { flex: 1, backgroundColor: 'rgba(245,215,161,0.06)' },
  plan: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 18, paddingBottom: 14, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#1E1C22' },
  planTag: { position: 'absolute', top: -2, left: -2, backgroundColor: '#E5484D', color: '#fff', fontSize: 11, fontWeight: '800', borderTopLeftRadius: 12, borderBottomRightRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  buyBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  box: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1A181E', padding: 16, gap: 12, overflow: 'hidden' },
  perk: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10 },
  perkIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  giftBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, gap: 12 },
  toggles: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingHorizontal: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  nobleTabs: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  nobleTab: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  nobleTabOn: { color: '#fff', borderBottomWidth: 3, borderBottomColor: '#fff' },
  emblem: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center' },
  newTag: { position: 'absolute', top: -6, right: -18, backgroundColor: colors.red, color: '#fff', fontSize: 9, fontWeight: '800', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#1B1A17', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, borderColor: '#B8955A' },
  alBtn: { backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 34, paddingVertical: 12 },
});
