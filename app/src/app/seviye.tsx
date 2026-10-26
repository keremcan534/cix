// Seviyeler: Servet Seviyesi (spending) and Cazibe Seviyesi (others' engagement) share one layout:
// my progress, the level groups, what each level opens, and a guide with the full points table.
// Open on the charm tab with /seviye?tab=charm.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, CharmBadge, WealthBadge } from '@/components/ui';
import { CHARM_PERKS, CHARM_TIERS, CHARM_XP, charmBonusPct, charmTier } from '@/data/charm';
import { SVIP_LEVELS, nobleInfo } from '@/data/status';
import { WEALTH_ESTIMATED, WEALTH_PERKS, WEALTH_TIERS, WEALTH_XP, levelGiftOf, wealthTier, type LevelPerk, type LevelTier } from '@/data/wealth';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const TIER_W = 96;
type Kind = 'wealth' | 'charm';

type System = {
  title: string;
  point: string;
  table: number[];
  tiers: LevelTier[];
  perks: LevelPerk[];
  tierOf: (l: number) => LevelTier;
  Badge: (p: { level: number; size?: 'sm' | 'lg' }) => ReactNode;
  perkDetail: (p: LevelPerk, level: number) => string;
  estimated: number[];
};
const SYSTEMS: Record<Kind, System> = {
  wealth: {
    title: 'Servet',
    point: 'Servet puanı',
    table: WEALTH_XP,
    tiers: WEALTH_TIERS,
    perks: WEALTH_PERKS,
    tierOf: wealthTier,
    Badge: WealthBadge,
    perkDetail: (p, level) => (p.key === 'gift' ? `${levelGiftOf(level)} · ${p.detail}` : p.detail),
    estimated: WEALTH_ESTIMATED,
  },
  charm: {
    title: 'Cazibe',
    point: 'Cazibe puanı',
    table: CHARM_XP,
    tiers: CHARM_TIERS,
    perks: CHARM_PERKS,
    tierOf: charmTier,
    Badge: CharmBadge,
    perkDetail: (p, level) => (p.key === 'bonus' ? `+%${Math.max(1, charmBonusPct(level))} · ${p.detail}` : p.key === 'rank' ? `Sıralama ağırlığı ${level} · ${p.detail}` : p.detail),
    estimated: [],
  },
};

export default function LevelsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const app = useApp();
  const [tab, setTab] = useState<Kind>(params.tab === 'charm' ? 'charm' : 'wealth');
  const [help, setHelp] = useState(false);
  const xp = tab === 'wealth' ? app.wealthXp : app.charmXp;
  const level = tab === 'wealth' ? app.wealthLevel : app.charmLevel;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={s.seg}>
          {(['wealth', 'charm'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.segItem, tab === k && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[s.segText, tab === k && { color: semantic.actionInk }]}>{SYSTEMS[k].title} Seviyesi</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setHelp(true)} hitSlop={10} accessibilityLabel={`${SYSTEMS[tab].title} seviyesi rehberi`}>
          <Ionicons name="help-circle-outline" size={26} color={colors.text} />
        </Pressable>
      </View>

      <LevelPane key={tab} kind={tab} xp={xp} myLevel={level} />
      <Guide kind={tab} visible={help} onClose={() => setHelp(false)} />
    </SafeAreaView>
  );
}

function LevelPane({ kind, xp, myLevel }: { kind: Kind; xp: number; myLevel: number }) {
  const sys = SYSTEMS[kind];
  const { me, svipLevel, svipXp, nobleTier, nobleDays, vipDays } = useApp();
  const [level, setLevel] = useState(Math.max(1, myLevel));
  const max = sys.table.length - 1;
  const tier = sys.tierOf(level);
  const mine = sys.tierOf(myLevel);
  const next = Math.min(max, myLevel + 1);
  const from = sys.table[myLevel];
  const to = sys.table[next];
  const pct = myLevel >= max ? 1 : Math.min(1, (xp - from) / (to - from));
  const open = myLevel >= level;
  const noble = nobleInfo(nobleTier);
  const nextSvip = SVIP_LEVELS[svipLevel];
  const Badge = sys.Badge;
  const firstCostume = sys.perks.filter((p) => p.kind === 'costume').reduce((m, p) => Math.min(m, p.from), 99);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient colors={[mine.colors[1], colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.me}>
        <Avatar uri={me.avatar} size={56} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.name} numberOfLines={1}>
              {me.name}
            </Text>
            <Badge level={myLevel} />
          </View>
          <Text style={s.meLine}>
            {sys.point} <Text style={{ fontWeight: '900', color: '#fff' }}>{fmt(xp)}</Text> · {mine.name}
            {kind === 'charm' && charmBonusPct(myLevel) > 0 ? ` · kazanç bonusu %${charmBonusPct(myLevel)}` : ''}
          </Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: mine.colors[0] }]} />
          </View>
          <Text style={s.meDim}>{myLevel >= max ? 'En yüksek seviyedesin.' : `Lv.${next} için ${fmt(to - xp)} puan daha (${fmt(xp)} / ${fmt(to)})`}</Text>
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tiers} contentOffset={{ x: Math.max(0, sys.tiers.indexOf(mine) * TIER_W - 120), y: 0 }}>
        {sys.tiers.map((t) => (
          <TierEmblem key={t.name} tier={t} on={t === tier} reached={myLevel >= t.from} onPress={() => setLevel(Math.max(1, t.from))} />
        ))}
      </ScrollView>

      <View style={s.levels}>
        {Array.from({ length: tier.to - Math.max(1, tier.from) + 1 }, (_, i) => Math.max(1, tier.from) + i).map((l) => (
          <Pressable key={l} onPress={() => setLevel(l)} style={[s.levelChip, l === level && { borderColor: tier.colors[0], backgroundColor: 'rgba(255,255,255,0.06)' }]} accessibilityRole="tab" accessibilityState={{ selected: l === level }}>
            <Text style={[s.levelText, l === level && { color: '#fff' }]}>Lv.{l}</Text>
            {myLevel >= l ? <Ionicons name="checkmark-circle" size={13} color={semantic.success} /> : <Ionicons name="lock-closed" size={11} color={colors.textDim} />}
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={[s.status, open ? s.statusOk : null]}>
          <Ionicons name={open ? 'checkmark-circle' : 'lock-closed'} size={16} color={open ? semantic.success : colors.gold} />
          <Text style={s.statusText}>{open ? `Lv.${level} ayrıcalıkları açık.` : `Lv.${level} için ${fmt(sys.table[level] - xp)} ${sys.point.toLowerCase()} gerekiyor (toplam ${fmt(sys.table[level])}).`}</Text>
        </View>
        <PerkGrid title={`Lv.${level} ayrıcalıkları`} perks={sys.perks.filter((p) => p.kind === 'privilege' && p.from <= level)} level={level} open={open} Badge={Badge} detail={sys.perkDetail} />
        <PerkGrid title={`Lv.${level} görünüm`} perks={sys.perks.filter((p) => p.kind === 'costume' && p.from <= level)} level={level} open={open} Badge={Badge} detail={sys.perkDetail} empty={`Görünüm ödülleri Lv.${firstCostume}’dan itibaren açılır.`} />

        {kind === 'wealth' && (
          <Pressable onPress={() => router.push('/vip')} style={s.card} accessibilityLabel="Ayrıcalıklarım">
            <Text style={s.cardTitle}>Diğer ayrıcalıklarım</Text>
            <Text style={s.row}>
              SVIP: {svipLevel ? `SVIP${svipLevel}` : 'Yok'} · {fmt(svipXp)} puan{nextSvip ? ` · SVIP${nextSvip.level} için ${fmt(nextSvip.xp - svipXp)}` : ''}
            </Text>
            <Text style={s.row}>Asil: {noble ? `${noble.emoji} ${noble.name} · ${nobleDays} gün` : 'Henüz alınmadı'}</Text>
            <Text style={s.row}>VIP: {vipDays > 0 ? `${vipDays} gün kaldı` : 'Yok'}</Text>
            <Text style={[s.row, { color: colors.gold }]}>Ayrıcalık merkezine git ›</Text>
          </Pressable>
        )}
        <Text style={s.dim}>Servet ve Cazibe seviyeleri kalıcıdır ve düşmez; VIP ve Asil süreli, SVIP ise yükleme deneyimiyle kalıcı olarak yükselir.</Text>
      </View>
    </ScrollView>
  );
}

function TierEmblem({ tier, on, reached, onPress }: { tier: LevelTier; on: boolean; reached: boolean; onPress: () => void }) {
  const size = on ? 72 : 54;
  return (
    <Pressable onPress={onPress} style={s.tier} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${tier.name}, seviye ${Math.max(1, tier.from)}–${tier.to}${reached ? '' : ', henüz ulaşılmadı'}`}>
      <View style={{ height: 76, justifyContent: 'center' }}>
        <LinearGradient colors={tier.colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[s.emblem, { width: size, height: size, borderRadius: size * 0.3, opacity: reached || on ? 1 : 0.45 }, on && { borderColor: '#fff' }]}>
          <View style={{ transform: [{ rotate: '-45deg' }] }}>
            <Ionicons name={tier.icon} size={on ? 34 : 24} color={tier.ink} />
          </View>
        </LinearGradient>
      </View>
      <Text style={[s.tierName, on && { color: '#fff' }]} numberOfLines={1}>
        {tier.name}
      </Text>
      <Text style={s.tierRange}>
        Lv.{Math.max(1, tier.from)}–{tier.to}
      </Text>
    </Pressable>
  );
}

function PerkGrid({ title, perks, level, open, empty, Badge, detail }: { title: string; perks: LevelPerk[]; level: number; open: boolean; empty?: string; Badge: System['Badge']; detail: System['perkDetail'] }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {perks.length === 0 ? (
        <Text style={s.dim}>{empty}</Text>
      ) : (
        <View style={s.grid}>
          {perks.map((p) => (
            <View key={p.key} style={s.perk} accessibilityLabel={`${p.title}${open ? '' : ', kilitli'}`}>
              <View style={s.perkArt}>
                {p.key === 'badge' ? <Badge level={level} size="lg" /> : <Text style={{ fontSize: 28 }}>{p.emoji}</Text>}
                {!open && (
                  <View style={s.lock}>
                    <Ionicons name="lock-closed" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={s.perkTitle} numberOfLines={2}>
                {p.title}
              </Text>
              <Text style={s.perkDetail} numberOfLines={3}>
                {detail(p, level)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const GUIDE: Record<Kind, { title: string; body: string[] }[]> = {
  wealth: [
    { title: '💰 Servet seviyesi nedir?', body: ['Similar Club’da yaptığın geçerli jeton harcamalarının toplamını gösteren kalıcı seviyedir. Harcadıkça servet puanın birikir; eşik geçildiğinde seviyen yükselir ve düşmez.'] },
    { title: '🎁 Ne işe yarar?', body: ['Seviyen adının yanında rozet olarak görünür. Yükseldikçe listelerde öne çıkarsın; seviye hediyesi, giriş efekti, madalya ve çerçeve açılır. Lv.10’dan sonra seviye atlaman bulunduğun odada, Lv.33’ten sonra tüm platformda duyurulur. Casino oyunları Servet Lv.2 ile açılır.'] },
    { title: '📈 Puan nasıl kazanılır?', body: ['Harcanan her 1 jeton 1 servet puanıdır. Sayılanlar: odada ve sohbette hediye, Lucky hediye (yalnızca harcadığın jeton; kazandığın ödül sayılmaz), ücretli mesaj ve aramalar, mağaza alışverişi, kabile kurma ve kabile hediyeleri, oda etkinlikleri ve animasyonlar.'] },
    { title: '⚠️ Sayılmayanlar', body: ['• Jetonla oynanan şans oyunları ve zar düellosu.', '• Jeton dağıtma: oda zarfı, jeton transferi.', '• İade edilen işlemler ve kural dışı bulunan hareketler; şüpheli işlemlerde puan verilmez.'] },
  ],
  charm: [
    { title: '🌹 Cazibe seviyesi nedir?', body: ['Diğer kullanıcıların seninle ne kadar etkileşim kurduğunu gösteren kalıcı seviyedir. Her kullanıcının bir cazibe seviyesi vardır ve profilinde, odada ve keşfette rozet olarak görünür.'] },
    { title: '💎 Kazancını ve popülerliğini etkiler', body: [`• Kazanç: Lv.6’dan itibaren aldığın hediyelerin elmasına bonus eklenir (Lv.6 %1, Lv.16 %2, Lv.26 %3, Lv.36 %4, Lv.46 %5). Bonus, gelir geçmişinde ayrı satır olarak görünür.`, '• Popülerlik: Keşfet ve önerilerde çevrimiçi kişiler arasında cazibesi yüksek olan daha üstte gösterilir.'] },
    { title: '📈 Puan nasıl kazanılır?', body: ['Sana gönderilen hediyelerden gelen her 1 elmas 1 cazibe puanıdır; seninle yapılan ücretli aramalar da sayılır. Beğeni ve özel sohbet puanları sunucuya geçince günlük sınırla eklenecek.'] },
    { title: '⚠️ Dikkat', body: ['Sahte etkileşimle puan artırmak, başkasının kimliğini kullanmak veya kural ihlali puan silinmesine ve hesabın kapatılmasına yol açar.'] },
  ],
};

/** Plain-language guide and the full points table. */
function Guide({ kind, visible, onClose }: { kind: Kind; visible: boolean; onClose: () => void }) {
  const sys = SYSTEMS[kind];
  const Badge = sys.Badge;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.top}>
          <Text style={[s.cardTitle, { flex: 1, fontSize: 18 }]}>{sys.title} Seviyesi rehberi</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          {GUIDE[kind].map((g) => (
            <View key={g.title} style={s.card}>
              <Text style={s.cardTitle}>{g.title}</Text>
              {g.body.map((b) => (
                <Text key={b} style={s.body}>
                  {b}
                </Text>
              ))}
            </View>
          ))}
          <View style={s.card}>
            <Text style={s.cardTitle}>📋 Seviye tablosu</Text>
            <View style={s.tableHead}>
              <Text style={[s.cell, s.headCell]}>Seviye</Text>
              <Text style={[s.cell, s.headCell, { textAlign: 'right' }]}>Gereken puan</Text>
              <Text style={[s.cell, s.headCell, { textAlign: 'right' }]}>Rozet</Text>
            </View>
            {sys.table.map((xp, l) => (
              <View key={l} style={[s.tableRow, l % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                <Text style={s.cell}>
                  Lv.{l} · {sys.tierOf(l).name}
                </Text>
                <Text style={[s.cell, { textAlign: 'right' }]}>
                  {fmt(xp)}
                  {sys.estimated.includes(l) ? ' *' : ''}
                </Text>
                <View style={[s.cell, { alignItems: 'flex-end' }]}>
                  <Badge level={l} />
                </View>
              </View>
            ))}
            {sys.estimated.length > 0 && <Text style={[s.dim, { marginTop: 6 }]}>* Taslak eşik; ürün ekibinin onayı bekleniyor.</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  seg: { flex: 1, flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segOn: { backgroundColor: semantic.action },
  segText: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, marginTop: 6, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  name: { color: '#fff', fontSize: 18, fontWeight: '900', flexShrink: 1 },
  meLine: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  meDim: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  tiers: { paddingHorizontal: 12, alignItems: 'flex-end' },
  tier: { width: TIER_W, alignItems: 'center', gap: 2 },
  emblem: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', transform: [{ rotate: '45deg' }] },
  tierName: { color: colors.textDim, fontWeight: '800', fontSize: 12, marginTop: 4 },
  tierRange: { color: colors.textDim, fontSize: 11 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  levelText: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, backgroundColor: 'rgba(251,191,36,0.08)' },
  statusOk: { backgroundColor: 'rgba(34,197,94,0.08)' },
  statusText: { color: colors.text, fontSize: 13, flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 8 },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  perk: { width: '33.33%', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  perkArt: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  perkTitle: { color: colors.text, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  perkDetail: { color: colors.textDim, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  row: { color: '#fff', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headCell: { color: colors.textDim, fontWeight: '700' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderRadius: 6 },
  cell: { flex: 1, color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },
});
