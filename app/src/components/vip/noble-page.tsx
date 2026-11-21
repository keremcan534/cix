// VIP › Rütbe (21 Nov 2026, from the owners' sample screens): five tiers (Şövalye … Dük) bought with coins for 7, 30 or
// 90 days (Seviye ve VIP ayarları set the prices; the longer package costs less a day). A tab per tier, its emblem, its
// rights in a grid ("Özel Haklar n/m": lit when the tier has it, faded when a higher tier opens it, "Yakında" for one not
// built yet, which isn't counted), and at the bottom the tier's cheapest package with "Al", which opens the packages.
// "Rütbe kuralları" explains the rules. Rütbe is a system of its own: it adds nothing to the VIP level.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Art } from '@/components/Art';
import { Text } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { nobleRightsCount, nobleRightsOf, nobleTiersOf, type NoblePlan } from '@/lib/levels-live-core';
import { useLevels } from '@/lib/live/levels-live';
import { useApp } from '@/store';
import { SCRIM } from '@/theme';

const GOLD = '#F5D7A1';
const GOLD_DEEP = '#E8B86A';
const NIGHT = ['#0E2A33', '#123844'] as const;
const fmt = (n: number) => n.toLocaleString('tr-TR');
const daysText = (d: number) => `${d} gün`;

/** The rules ("?"), in the owners' words for this app: no coins come back, the same tier adds days, at most 365. */
export const NOBLE_RULES = [
  'Rütbe jetonla alınır; her kademe kendi haklarını açar, üst kademe alttakilerin haklarının hepsini de verir.',
  'Her kademenin 7, 30 ve 90 günlük paketleri vardır; uzun pakette gün başına daha az ödersin.',
  'Haklar paketin süresi boyunca geçerlidir; süre bitince rütbe ve hakları hemen kalkar.',
  'Aynı kademeyi yeniden alırsan süresi uzar; bir rütbe en fazla 365 gün ileriye alınabilir.',
  'Daha yüksek bir kademe alırsan hemen başlar; alttaki rütben süresi bitene kadar arkada bekler. Yüksek bir rütben varken daha düşüğü alınmaz.',
  '"Yakında" yazan haklar henüz açılmadı; açıldıkça kademene göre kendiliğinden gelir.',
  'Rütbe VIP değildir: VIP seviyen yalnız yüklediğin jetonla artar.',
];

export function NoblePage() {
  const { nobleTier, nobleDays, buyNoble, coins } = useApp();
  const levels = useLevels();
  const tiers = nobleTiersOf(levels);
  const rights = nobleRightsOf(levels);
  const [sel, setSel] = useState(Math.max(1, nobleTier));
  const [buying, setBuying] = useState(false);
  const [rules, setRules] = useState(false);
  const t = tiers[sel - 1];
  const count = nobleRightsCount(rights, t.tier);
  const cheapest = t.plans[0];
  const mine = nobleTier === t.tier;
  const lower = nobleTier > t.tier;

  return (
    <LinearGradient colors={NIGHT} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={s.tabs}>
          {tiers.map((x) => (
            <Pressable key={x.tier} onPress={() => setSel(x.tier)} accessibilityRole="tab" accessibilityState={{ selected: sel === x.tier }} hitSlop={6}>
              <Text style={[s.tab, sel === x.tier && s.tabOn]}>{x.name}</Text>
              {sel === x.tier && <View style={s.tabLine} />}
            </Pressable>
          ))}
        </View>

        <View style={s.hero}>
          <View style={[s.glow, { backgroundColor: t.colors[0] }]} />
          {t.art ? <Art name={t.art} size={150} /> : <Text style={{ fontSize: 110 }}>{t.emoji}</Text>}
          {nobleTier === t.tier && <Text style={s.active}>✓ {t.name} · {daysText(nobleDays)} kaldı</Text>}
          {lower && <Text style={s.activeDim}>Daha yüksek bir rütben var</Text>}
          <Pressable onPress={() => setRules(true)} accessibilityRole="button" hitSlop={8} style={s.rulesLink}>
            <Ionicons name="help-circle-outline" size={16} color={GOLD} />
            <Text style={s.rulesText}>Rütbe kuralları</Text>
          </Pressable>
        </View>

        <View style={s.ribbon}>
          <View style={s.ribbonLine} />
          <Text style={s.ribbonText}>
            Özel Haklar {count.have}/{count.all}
          </Text>
          <View style={s.ribbonLine} />
        </View>

        <View style={s.grid}>
          {rights.map((r) => {
            const on = !r.soon && r.level <= t.tier;
            const need = tiers.find((x) => x.tier === r.level);
            return (
              <Pressable
                key={r.name}
                style={s.cell}
                accessibilityLabel={`${r.name}${r.soon ? ', yakında' : on ? '' : `, ${need?.name ?? ''} ile açılır`}`}
                onPress={() => showAlert(r.name, r.soon ? 'Bu hak yakında açılacak.' : on ? `${t.name} ile kullanabilirsin.` : `${need?.name ?? 'Üst kademe'} rütbesiyle açılır.`)}>
                <View style={[s.icon, !on && { opacity: r.soon ? 0.3 : 0.4 }]}>{r.art ? <Art name={r.art} size={46} /> : <Text style={{ fontSize: 36 }}>{r.emoji}</Text>}</View>
                {r.soon && (
                  <View style={s.soon}>
                    <Text style={s.soonText} maxFontSizeMultiplier={1.2}>
                      Yakında
                    </Text>
                  </View>
                )}
                <Text style={[s.name, !on && s.nameOff]} numberOfLines={2}>
                  {r.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.bar}>
        <View style={{ flex: 1 }}>
          <Text style={s.barPrice}>
            🪙 {fmt(cheapest.price)}
            <Text style={s.barDays}> / {daysText(cheapest.days)}</Text>
          </Text>
          <Text style={s.barSub} numberOfLines={1}>
            {mine ? 'Yeniden alırsan süren uzar' : lower ? 'Yüksek rütben bitince alınabilir' : `${count.have} hak açılır`}
          </Text>
        </View>
        <Pressable onPress={() => (lower ? showAlert('Daha yüksek bir rütben var', 'Yüksek rütben varken daha düşüğü alınmaz.') : setBuying(true))} style={[s.al, lower && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={`${t.name} al`}>
          <Text style={s.alText}>Al</Text>
        </Pressable>
      </View>

      {buying && (
        <BuySheet
          name={t.name}
          art={t.art}
          emoji={t.emoji}
          plans={t.plans}
          extend={mine}
          coins={coins}
          onClose={() => setBuying(false)}
          onBuy={(p) => {
            // The sheet closes first: the question is drawn over the page, never under the sheet.
            setBuying(false);
            if (coins < p.price) {
              return showAlert('Jetonun yetmiyor', `${t.name} ${daysText(p.days)} için 🪙 ${fmt(p.price)} gerekir.`, [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Yükle', onPress: () => router.push('/cuzdan') },
              ]);
            }
            showAlert(`${t.name} · ${daysText(p.days)}`, `🪙 ${fmt(p.price)} ödenecek${mine ? '; süren uzar' : ''}. Onaylıyor musun?`, [
              { text: 'Vazgeç', style: 'cancel' },
              {
                text: 'Al',
                onPress: () => {
                  if (!buyNoble(t.tier, p.days)) return;
                  showAlert(`${t.emoji} ${t.name} oldun!`, `${daysText(p.days)} boyunca ${count.have} hak senin.`);
                },
              },
            ]);
          }}
        />
      )}
      {rules && <RulesSheet onClose={() => setRules(false)} />}
    </LinearGradient>
  );
}

/** The tier's packages: three cards (days, price, the saving and the week's-rate price struck through), then "Al". */
function BuySheet({ name, art, emoji, plans, extend, coins, onClose, onBuy }: { name: string; art?: Parameters<typeof Art>[0]['name']; emoji: string; plans: NoblePlan[]; extend: boolean; coins: number; onClose: () => void; onBuy: (p: NoblePlan) => void }) {
  const { bottom } = useSafeAreaInsets();
  // The middle one is picked first, as in the sample (the month); the only one when there is one.
  const [pick, setPick] = useState(plans[Math.min(1, plans.length - 1)].days);
  const chosen = plans.find((p) => p.days === pick) ?? plans[0];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(24, bottom + 12) }]}>
        <View style={s.sheetArt}>{art ? <Art name={art} size={120} /> : <Text style={{ fontSize: 90 }}>{emoji}</Text>}</View>
        <Text style={s.sheetTitle}>{extend ? `${name} süreni uzat` : `${name} ol`}</Text>
        <View style={s.plans}>
          {plans.map((p) => {
            const on = p.days === chosen.days;
            return (
              <Pressable key={p.days} onPress={() => setPick(p.days)} style={[s.plan, on && s.planOn]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${p.days} gün, ${fmt(p.price)} jeton${p.save ? `, yüzde ${p.save} indirim` : ''}`}>
                <View style={[s.save, !p.save && { backgroundColor: '#5B4A3A' }]}>
                  <Text style={s.saveText}>{p.save ? `%${p.save} indirim` : 'Haftalık'}</Text>
                </View>
                <Text style={s.planDays}>{daysText(p.days)}</Text>
                <Text style={s.planPrice}>🪙 {fmt(p.price)}</Text>
                <Text style={[s.planWas, !p.save && { opacity: 0 }]}>🪙 {fmt(p.was)}</Text>
                <View style={s.planFoot}>
                  <Text style={s.planFootText}>Günü 🪙 {fmt(Math.round(p.price / p.days))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.balance}>Jetonun: 🪙 {fmt(coins)}</Text>
        <Pressable onPress={() => onBuy(chosen)} style={s.sheetAl} accessibilityRole="button" accessibilityLabel={`${name} ${chosen.days} gün al`}>
          <Text style={s.alText}>Al · 🪙 {fmt(chosen.price)}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function RulesSheet({ onClose }: { onClose: () => void }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingTop: 22, paddingBottom: Math.max(24, bottom + 12), alignItems: 'stretch' }]}>
        <Text style={[s.sheetTitle, { marginTop: 0, textAlign: 'left' }]}>Rütbe nasıl alınır</Text>
        <ScrollView style={{ maxHeight: 420 }}>
          {NOBLE_RULES.map((r, i) => (
            <Text key={i} style={s.rule}>
              {i + 1}. {r}
            </Text>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={[s.sheetAl, { marginTop: 16 }]} accessibilityRole="button">
          <Text style={s.alText}>Tamam</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 12, paddingHorizontal: 8 },
  tab: { color: 'rgba(245,215,161,0.45)', fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  tabOn: { color: '#FFF4DE', fontSize: 18, fontWeight: '900' },
  tabLine: { alignSelf: 'center', width: 22, height: 3, borderRadius: 2, backgroundColor: GOLD },
  rulesLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  rulesText: { color: GOLD, fontSize: 13, textDecorationLine: 'underline' },
  hero: { alignItems: 'center', paddingTop: 22, paddingBottom: 8 },
  glow: { position: 'absolute', top: 40, width: 150, height: 150, borderRadius: 75, opacity: 0.25 },
  active: { color: GOLD, fontWeight: '800', marginTop: 10, fontSize: 14 },
  activeDim: { color: 'rgba(245,215,161,0.7)', marginTop: 10, fontSize: 13 },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, marginTop: 14, marginBottom: 18 },
  ribbonLine: { flex: 1, height: 1, backgroundColor: 'rgba(245,215,161,0.35)' },
  ribbonText: { color: GOLD, fontSize: 19, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, rowGap: 18 },
  cell: { width: '33.33%', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  icon: { height: 52, justifyContent: 'center' },
  soon: { position: 'absolute', top: -6, right: '14%', backgroundColor: '#E5484D', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  soonText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  name: { color: GOLD, fontSize: 13, textAlign: 'center', lineHeight: 17 },
  nameOff: { color: 'rgba(230,230,230,0.55)' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 22, backgroundColor: '#1A2226', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, borderColor: '#B8955A' },
  barPrice: { color: GOLD_DEEP, fontSize: 21, fontWeight: '900' },
  barDays: { color: GOLD, fontSize: 15, fontWeight: '700' },
  barSub: { color: 'rgba(245,215,161,0.75)', fontSize: 13, marginTop: 2 },
  al: { backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 38, paddingVertical: 13 },
  alText: { color: '#3B2A12', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: '#123844', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, borderColor: '#B8955A', paddingHorizontal: 16, alignItems: 'center' },
  sheetArt: { marginTop: -60 },
  sheetTitle: { color: GOLD, fontSize: 19, fontWeight: '900', marginTop: 6, marginBottom: 14 },
  plans: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  plan: { flex: 1, borderRadius: 14, backgroundColor: '#1F2A2E', overflow: 'hidden', alignItems: 'center', paddingTop: 30, borderWidth: 2, borderColor: 'transparent' },
  planOn: { borderColor: GOLD, backgroundColor: '#183740' },
  save: { position: 'absolute', top: 0, left: 0, backgroundColor: '#E5484D', borderBottomRightRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  saveText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  planDays: { color: GOLD, fontSize: 19, fontWeight: '900' },
  planPrice: { color: '#FFF4DE', fontSize: 15, fontWeight: '700', marginTop: 6 },
  planWas: { color: 'rgba(245,215,161,0.6)', fontSize: 12, textDecorationLine: 'line-through', marginTop: 2 },
  planFoot: { alignSelf: 'stretch', backgroundColor: GOLD, marginTop: 10, paddingVertical: 6 },
  planFootText: { color: '#3B2A12', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  balance: { color: 'rgba(245,215,161,0.75)', fontSize: 13, marginTop: 14 },
  sheetAl: { alignSelf: 'stretch', backgroundColor: GOLD, borderRadius: 999, paddingVertical: 14, marginTop: 12 },
  rule: { color: '#EAF2F2', fontSize: 14.5, lineHeight: 21, marginBottom: 10 },
});
