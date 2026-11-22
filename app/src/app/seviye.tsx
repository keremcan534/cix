// Seviyeler: Cömertlik Seviyesi (spending) and Yankı Seviyesi (others' engagement) share one layout:
// my progress, the level groups, what each level opens, and a guide with the full points table.
// Open on the charm tab with /seviye?tab=charm.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { WealthEmblem } from '@/components/wealth-art';
import { Art, type ArtName } from '@/components/Art';
import { Avatar, CharmBadge, WealthBadge } from '@/components/ui';
import { CHARM_PERKS } from '@/data/charm';
import { charmTableOf, curvePerkFrom, decayLineOf, nobleTiersOf, tierFor, tiersOf, vipLevelsOf, wealthTableOf, type LiveLevels } from '@/lib/levels-live-core';
import { useLevels } from '@/lib/live/levels-live';
import { WEALTH_PERKS, levelGiftOf, shownPerks, type LevelPerk, type LevelTier } from '@/data/wealth';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { goBack } from '@/lib/nav';
import { fromN } from '@/lib/tr';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** The design's colours (Cömertlik Rozetleri design tokens): the screen keeps them in both colour schemes. */
const LUX = {
  bg: '#1D0B29',
  bg2: '#321338',
  card: '#281032',
  pink: '#E53C9A',
  purple: '#9343F8',
  gold: '#F5C878',
  goldLine: 'rgba(245,200,120,0.55)',
  muted: '#D7B9CB',
  white: '#FFF4F8',
  positive: '#42E5A3',
};
type Kind = 'wealth' | 'charm';

type System = {
  title: string;
  art: ArtName;
  point: string;
  table: number[];
  tiers: LevelTier[];
  perks: LevelPerk[];
  tierOf: (l: number) => LevelTier;
  Badge: (p: { level: number; size?: 'sm' | 'md' | 'lg' }) => ReactNode;
  perkDetail: (p: LevelPerk, level: number) => string;
};
/**
 * The perks a page lists: the app's own (only what it gives today, güncelleme 6) at the level Seviye ve VIP ayarları
 * open them (one turned off there is left out); without settings, the app's levels. Oyun Salonu is not listed: a
 * chance game with bought coins is not advertised as a reward (its gate is on its own screen).
 */
function perksOf(l: LiveLevels | null, kind: Kind): LevelPerk[] {
  return shownPerks(kind === 'wealth' ? WEALTH_PERKS : CHARM_PERKS).flatMap((p) => {
    const from = curvePerkFrom(l, kind, p.key);
    if (from === undefined) return [p];
    return from === null ? [] : [{ ...p, from }];
  });
}
/** Both systems as Seviye ve VIP ayarları have them: points, groups and perks (else the app's own). */
function systemsOf(l: LiveLevels | null): Record<Kind, System> {
  const wealthTiers = tiersOf(l, 'wealth');
  const charmTiers = tiersOf(l, 'charm');
  return {
    wealth: {
      title: 'Cömertlik',
      art: 'seviye-servet-seviyesi',
      point: 'Cömertlik puanı',
      table: wealthTableOf(l),
      tiers: wealthTiers,
      perks: perksOf(l, 'wealth'),
      tierOf: (level) => tierFor(wealthTiers, level),
      Badge: WealthBadge,
      perkDetail: (p, level) => (p.key === 'gift' ? `${levelGiftOf(level)} · ${p.detail}` : p.detail),
    },
    charm: { title: 'Yankı', art: 'seviye-cazibe-seviyesi', point: 'Yankı puanı', table: charmTableOf(l), tiers: charmTiers, perks: perksOf(l, 'charm'), tierOf: (level) => tierFor(charmTiers, level), Badge: CharmBadge, perkDetail: (p) => p.detail },
  };
}
const SYSTEMS = systemsOf(null);

export default function LevelsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const app = useApp();
  const [tab, setTab] = useState<Kind>(params.tab === 'charm' ? 'charm' : 'wealth');
  const [help, setHelp] = useState(false);
  // A narrow phone (320 points) keeps both tab names whole: smaller words and pictures.
  const narrow = useWindowDimensions().width < 360;
  const xp = tab === 'wealth' ? app.wealthXp : app.charmXp;
  const level = tab === 'wealth' ? app.wealthLevel : app.charmLevel;

  return (
    // The owners' design (Cömertlik Rozetleri, 22 Nov 2026): night plum with pink and gold in both colour schemes.
    <View style={{ flex: 1, backgroundColor: LUX.bg }}>
      <LinearGradient colors={[LUX.bg2, LUX.bg, LUX.bg]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={l.brand} accessibilityRole="header">
          <View style={l.brandLine} />
          <Text style={l.brandText}>✦ SimilarClub ✦</Text>
          <View style={l.brandLine} />
        </View>
        <View style={l.top}>
          <Pressable onPress={() => goBack()} hitSlop={10} style={l.round} accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={24} color={LUX.white} />
          </Pressable>
          <View style={l.seg} accessibilityRole="tablist">
            {(['wealth', 'charm'] as const).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[l.segItem, tab === k && l.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={`${SYSTEMS[k].title} Seviyesi`}>
                {tab === k && <LinearGradient colors={[LUX.pink, '#B4237A']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />}
                <Art name={SYSTEMS[k].art} size={narrow ? 16 : 20} />
                <Text style={[l.segText, narrow && { fontSize: 13 }, tab === k && { color: LUX.white }]} numberOfLines={1}>
                  {SYSTEMS[k].title}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setHelp(true)} hitSlop={10} style={l.round} accessibilityRole="button" accessibilityLabel={`${SYSTEMS[tab].title} seviyesi rehberi`}>
            <Ionicons name="help-circle-outline" size={26} color={LUX.white} />
          </Pressable>
        </View>

        <LevelPane key={tab} kind={tab} xp={xp} myLevel={level} onGuide={() => setHelp(true)} />
        <Guide kind={tab} visible={help} onClose={() => setHelp(false)} />
      </SafeAreaView>
    </View>
  );
}

function LevelPane({ kind, xp, myLevel, onGuide }: { kind: Kind; xp: number; myLevel: number; onGuide: () => void }) {
  const levels = useLevels();
  const sys = systemsOf(levels)[kind];
  const decay = decayLineOf(levels, kind);
  const { me, svipLevel, svipXp, nobleTier, nobleDays, vipDays } = useApp();
  const { width } = useWindowDimensions();
  const [level, setLevel] = useState(Math.max(1, myLevel));
  const max = sys.table.length - 1;
  const tier = sys.tierOf(level);
  const mine = sys.tierOf(myLevel);
  const next = Math.min(max, myLevel + 1);
  const from = sys.table[myLevel];
  const to = sys.table[next];
  const pct = myLevel >= max ? 1 : Math.min(1, Math.max(0, (xp - from) / (to - from)));
  const open = myLevel >= level;
  const noble = nobleTier ? nobleTiersOf(levels)[nobleTier - 1] : undefined;
  const vipList = vipLevelsOf(levels);
  const nextSvip = vipList[svipLevel];
  const Badge = sys.Badge;
  const firstCostume = sys.perks.filter((p) => p.kind === 'costume').reduce((m, p) => Math.min(m, p.from), 99);
  // The two designs differ here: Cömertlik shows four big emblems across the screen, swiped; Yankı five smaller ones
  // between ‹ › arrows with dots under them (four on a narrow phone). Either row scrolls through all the groups.
  const slider = kind === 'charm';
  const across = slider && width >= 360 ? 5 : 4;
  const tileW = Math.floor((Math.min(width, 560) - (slider ? 2 * ARROW_W + 8 : 24)) / across);
  const band = useRef<ComponentRef<typeof ScrollView>>(null);
  // The row opens on my group with the one before it in sight (contentOffset isn't applied on every platform).
  const toMine = () =>
    band.current?.scrollTo({
      x: Math.max(0, (sys.tiers.indexOf(mine) - 1) * tileW),
      animated: false,
    });
  // The arrows move it two groups at a time; a dot for each of those steps (the design's ‹ › and dots).
  const [bandX, setBandX] = useState(0);
  const steps = Math.max(1, Math.ceil((sys.tiers.length - across) / 2) + 1);
  const step = Math.min(steps - 1, Math.round(bandX / (2 * tileW)));
  const go = (d: number) =>
    band.current?.scrollTo({
      x: Math.min(Math.max(0, sys.tiers.length - across) * tileW, Math.max(0, Math.min(steps - 1, step + d)) * 2 * tileW),
      animated: true,
    });
  const pink = kind === 'charm';

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={l.me}>
        <LinearGradient colors={['#3B1747', '#231031']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
        <View style={l.avatarRing}>
          <Avatar uri={me.avatar} size={64} />
        </View>
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Text style={l.name} numberOfLines={1}>
              {me.name}
            </Text>
            <Badge level={myLevel} size="md" />
          </View>
          <Text style={l.meLine}>
            {sys.point} <Text style={{ fontWeight: '900', color: LUX.white }}>{fmt(xp)}</Text> · {mine.name}
          </Text>
          <View
            style={l.track}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(pct * 100),
            }}
          >
            <LinearGradient colors={pink ? ['#B4237A', LUX.pink, '#FF9BD0'] : [LUX.purple, '#C084FC', LUX.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[l.fill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
          <Text style={l.meDim}>{myLevel >= max ? 'En yüksek seviyedesin.' : `Lv.${next} için ${fmt(to - xp)} puan daha (${fmt(xp)} / ${fmt(to)})`}</Text>
        </View>
      </View>

      <View style={l.bandRow}>
        {slider && (
          <Pressable onPress={() => go(-1)} disabled={step === 0} style={[l.arrow, step === 0 && { opacity: 0.3 }]} hitSlop={{ left: 8, right: 8 }} accessibilityRole="button" accessibilityState={{ disabled: step === 0 }} accessibilityLabel="Önceki seviye grupları">
            <Ionicons name="chevron-back" size={24} color={LUX.gold} />
          </Pressable>
        )}
        <ScrollView ref={band} horizontal showsHorizontalScrollIndicator={false} style={{ width: across * tileW, flexGrow: 0 }} contentContainerStyle={l.tiers} onContentSizeChange={toMine} onScroll={(e) => setBandX(e.nativeEvent.contentOffset.x)} scrollEventThrottle={32}>
          {sys.tiers.map((t) => (
            <TierEmblem key={t.name} tier={t} width={tileW} on={t === tier} reached={myLevel >= t.from} onPress={() => setLevel(Math.max(1, t.from))} />
          ))}
        </ScrollView>
        {slider && (
          <Pressable onPress={() => go(1)} disabled={step >= steps - 1} style={[l.arrow, step >= steps - 1 && { opacity: 0.3 }]} hitSlop={{ left: 8, right: 8 }} accessibilityRole="button" accessibilityState={{ disabled: step >= steps - 1 }} accessibilityLabel="Sonraki seviye grupları">
            <Ionicons name="chevron-forward" size={24} color={LUX.gold} />
          </Pressable>
        )}
      </View>
      {slider && (
        <View style={l.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {Array.from({ length: steps }, (_, i) => (
            <View key={i} style={[l.dot, i === step && l.dotOn]} />
          ))}
        </View>
      )}

      <View style={l.levelsRow}>
        <View style={l.levels}>
          {Array.from({ length: tier.to - Math.max(1, tier.from) + 1 }, (_, i) => Math.max(1, tier.from) + i).map((lv) => {
            const on = lv === level;
            const got = myLevel >= lv;
            return (
              <Pressable key={lv} onPress={() => setLevel(lv)} hitSlop={{ top: 6, bottom: 6 }} style={[l.chip, on && (pink ? l.chipPink : l.chipGold)]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Seviye ${lv}${got ? ', açık' : ', kilitli'}`}>
                {on && <LinearGradient colors={pink ? ['#B0186A', '#6E0E44'] : ['#4A1838', '#2A0E26']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />}
                <Text style={[l.chipText, on && { color: LUX.white }]}>Lv.{lv}</Text>
                {got ? <Ionicons name="checkmark-circle" size={14} color={LUX.positive} /> : <Ionicons name="lock-closed" size={11} color="#F2B8D2" />}
              </Pressable>
            );
          })}
        </View>
        {/* The design's book: the level guide, a tap away. */}
        <Pressable onPress={onGuide} style={l.book} accessibilityRole="button" accessibilityLabel={`${sys.title} seviyesi rehberi`}>
          <Image source={DECO.kitap} style={{ width: 44, height: 44 }} accessibilityIgnoresInvertColors />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 18 }}>
        <View style={[l.status, open && l.statusOk]} accessibilityLiveRegion="polite">
          <Ionicons name={open ? 'checkmark-circle-outline' : 'lock-closed'} size={19} color={open ? LUX.positive : LUX.gold} />
          <Text style={l.statusText}>{open ? `Lv.${level} ayrıcalıkları açık.` : `Lv.${level} için ${fmt(sys.table[level] - xp)} ${sys.point.toLowerCase()} gerekiyor (toplam ${fmt(sys.table[level])}).`}</Text>
        </View>
        {decay && (
          <View style={l.status}>
            <Ionicons name="time-outline" size={20} color={LUX.gold} />
            <Text style={l.statusText}>Seviye düşmesi: {decay}</Text>
          </View>
        )}
        <PerkGrid title={`Lv.${level} ayrıcalıkları`} perks={sys.perks.filter((p) => p.kind === 'privilege' && p.from <= level)} level={level} open={open} Badge={Badge} detail={sys.perkDetail} />
        {/* No look rewards are built yet (güncelleme 6): the section comes back with the first one. */}
        {firstCostume < 99 && <PerkGrid title={`Lv.${level} görünüm`} perks={sys.perks.filter((p) => p.kind === 'costume' && p.from <= level)} level={level} open={open} Badge={Badge} detail={sys.perkDetail} empty={`Görünüm ödülleri Lv.${fromN(firstCostume)} itibaren açılır.`} />}

        <Panel title="Diğer ayrıcalıklarım">
          <Image source={DECO.hediye} style={[l.gift, width < 360 && { width: 70, height: 72 }]} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no" />
          <Pressable onPress={() => router.push('/vip')} accessibilityRole="button" accessibilityLabel="Diğer ayrıcalıklarım: ayrıcalıklara git" style={{ gap: 2, paddingRight: width < 360 ? 50 : 78 }}>
            <OtherRow icon="crown" text={`VIP seviyesi: ${svipLevel ? (vipList[svipLevel - 1]?.name ?? `VIP ${svipLevel}`) : 'Yok'} · ${fmt(svipXp)} puan${nextSvip ? ` · ${nextSvip.name} için ${fmt(nextSvip.xp - svipXp)}` : ''}`} />
            <OtherRow icon="noble" art={noble?.art} text={`Rütbe: ${noble ? `${noble.name} · ${nobleDays} gün` : 'Henüz alınmadı'}`} />
            <OtherRow icon="vip" text={`VIP aboneliği: ${vipDays > 0 ? `${vipDays} gün kaldı` : 'Yok'}`} last />
            <Text style={l.goto}>Ayrıcalıklara git ›</Text>
          </Pressable>
        </Panel>
        <View style={l.note}>
          <Ionicons name="information-circle-outline" size={18} color={LUX.muted} />
          <Text style={l.noteText}>Cömertlik ve Yankı seviyeleri kalıcıdır, düşmez. VIP aboneliği ve Rütbe süreli; VIP seviyesi ise yükledikçe yükselir ve kalıcıdır.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** A row of "Diğer ayrıcalıklarım": its gold mark and its line. */
function OtherRow({ icon, art, text, last }: { icon: 'crown' | 'noble' | 'vip'; art?: ArtName; text: string; last?: boolean }) {
  return (
    <View style={[l.otherRow, !last && l.otherLine]}>
      <View style={l.otherIcon}>{art ? <Art name={art} size={26} /> : <Image source={icon === 'vip' ? DECO.vipAbone : icon === 'crown' ? DECO.vipSeviye : DECO.rutbe} style={{ width: 26, height: 26 }} resizeMode="contain" />}</View>
      <Text style={l.otherText}>{text}</Text>
    </View>
  );
}

/** A panel with its title on a ribbon over its top edge (the design's "Lv.41 ayrıcalıkları"). */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={l.panel}>
      <View style={l.ribbonRow}>
        <View style={l.ribbon} accessibilityRole="header">
          <LinearGradient colors={['#7A1E4F', '#4B1036']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
          <Text style={l.ribbonText} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={l.ribbonTail} />
      </View>
      <View style={{ paddingTop: 6 }}>{children}</View>
    </View>
  );
}

function TierEmblem({ tier, width, on, reached, onPress }: { tier: LevelTier; width: number; on: boolean; reached: boolean; onPress: () => void }) {
  const range = `Lv.${Math.max(1, tier.from)}–${tier.to}`;
  return (
    <Pressable onPress={onPress} style={[l.tier, { width }]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${tier.name}, seviye ${Math.max(1, tier.from)}–${tier.to}${reached ? '' : ', henüz ulaşılmadı'}`}>
      <View
        style={{
          height: width * 0.9,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        {tier.look ? (
          // The designed emblem carries the group's name on its ribbon; the range is live text under it.
          <WealthEmblem look={tier.look} width={Math.round(width * (on ? 1.04 : 0.94))} dim={!reached && !on} />
        ) : tier.emblem ? (
          <Art name={tier.emblem} size={Math.round(width * (on ? 0.86 : 0.7))} style={{ opacity: reached || on ? 1 : 0.45 }} />
        ) : (
          <LinearGradient
            colors={tier.colors}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[
              l.emblem,
              {
                width: width * 0.55,
                height: width * 0.55,
                borderRadius: width * 0.16,
                opacity: reached || on ? 1 : 0.45,
              },
            ]}
          >
            <View style={{ transform: [{ rotate: '-45deg' }] }}>
              <Ionicons name={tier.icon} size={on ? 34 : 24} color={tier.ink} />
            </View>
          </LinearGradient>
        )}
      </View>
      {!tier.look && (
        <Text style={[l.tierName, on && { color: LUX.white }]} numberOfLines={1}>
          {tier.name}
        </Text>
      )}
      <Text style={[l.tierRange, on && { color: LUX.gold }]}>{range}</Text>
      {on && <View style={l.tierGlow} />}
    </Pressable>
  );
}

function PerkGrid({ title, perks, level, open, empty, Badge, detail }: { title: string; perks: LevelPerk[]; level: number; open: boolean; empty?: string; Badge: System['Badge']; detail: System['perkDetail'] }) {
  const many = perks.length > 1;
  return (
    <Panel title={title}>
      {perks.length === 0 ? (
        <Text style={l.noteText}>{empty}</Text>
      ) : (
        <View style={many ? l.cards : { gap: 14 }}>
          {perks.map((p) => (
            <View key={p.key} style={many ? l.card3 : l.perk} accessibilityLabel={`${p.title}: ${detail(p, level)}${open ? '' : ', kilitli'}`}>
              <View style={many ? l.perkArtSm : l.perkArt}>
                {p.key === 'badge' ? <Badge level={level} size={many ? 'md' : 'lg'} /> : p.art ? <Art name={p.art} size={many ? 32 : 44} /> : <Text style={{ fontSize: many ? 24 : 32 }}>{p.emoji}</Text>}
                {!open && (
                  <View style={l.lock}>
                    <Ionicons name="lock-closed" size={11} color="#fff" />
                  </View>
                )}
              </View>
              <View style={many ? { gap: 3, alignItems: 'center' } : { flex: 1, gap: 2 }}>
                <Text style={many ? l.cardTitle : l.perkTitle}>{p.title}</Text>
                <Text style={many ? l.cardText : l.perkDetail}>{detail(p, level)}</Text>
              </View>
              {!many && <Image source={DECO.tac} style={l.crown} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no" />}
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

const GUIDE: Record<
  Kind,
  {
    title: string;
    art?: ArtName;
    icon?: keyof typeof Ionicons.glyphMap;
    body: string[];
  }[]
> = {
  wealth: [
    {
      title: 'Cömertlik seviyesi nedir?',
      art: 'seviye-servet-seviyesi',
      body: ['Similar Club’da yaptığın geçerli jeton harcamalarının toplamını gösteren kalıcı seviyedir. Harcadıkça cömertlik puanın birikir; eşik geçildiğinde seviyen yükselir ve düşmez.'],
    },
    {
      title: 'Ne işe yarar?',
      icon: 'gift-outline',
      body: ['Seviyen profilinde adının yanında rozet olarak görünür. Yeni ayrıcalıklar eklendikçe bu ekranda listelenir.'],
    },
    {
      title: 'Puan nasıl kazanılır?',
      icon: 'trending-up',
      body: ['Harcanan her 1 jeton 1 cömertlik puanıdır. Sayılanlar: odada ve sohbette hediye, Şanslı hediye (yalnızca harcadığın jeton; kazandığın ödül sayılmaz), ücretli mesaj ve aramalar, mağaza alışverişi, aile kurma ve aile hediyeleri, oda etkinlikleri ve animasyonlar.'],
    },
    {
      title: 'Sayılmayanlar',
      icon: 'alert-circle-outline',
      body: ['• Jetonla oynanan oyunlar.', '• Jeton dağıtma: oda zarfı, jeton transferi.', '• İade edilen işlemler ve kural dışı bulunan hareketler; şüpheli işlemlerde puan verilmez.'],
    },
  ],
  charm: [
    {
      title: 'Yankı seviyesi nedir?',
      art: 'seviye-cazibe-seviyesi',
      body: ['Diğer kullanıcıların seninle ne kadar etkileşim kurduğunu gösteren kalıcı seviyedir. Her kullanıcının bir Yankı seviyesi vardır ve profilinde ve Ana Sayfa kartında rozet olarak görünür.'],
    },
    {
      title: 'Ne işe yarar?',
      icon: 'diamond-outline',
      body: ['• Popülerlik: Ana Sayfa’da çevrim içi kişiler arasında Yankı seviyesi yüksek olan daha üstte gösterilir.', '• Lv.5’te Anlar’da paylaşım açılır.'],
    },
    {
      title: 'Puan nasıl kazanılır?',
      icon: 'trending-up',
      body: ['Sana gönderilen hediyelerden gelen her 1 elmas 1 Yankı puanıdır; seninle yapılan ücretli aramalar da sayılır. Beğeni ve özel sohbet puanları sunucuya geçince günlük sınırla eklenecek.'],
    },
    {
      title: 'Dikkat',
      icon: 'alert-circle-outline',
      body: ['Sahte etkileşimle puan artırmak, başkasının kimliğini kullanmak veya kural ihlali puan silinmesine ve hesabın kapatılmasına yol açar.'],
    },
  ],
};

/** Plain-language guide and the full points table. */
function Guide({ kind, visible, onClose }: { kind: Kind; visible: boolean; onClose: () => void }) {
  const sys = systemsOf(useLevels())[kind];
  const Badge = sys.Badge;
  const { colors, ink } = useTheme();
  const s = useStyles();
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
              <View style={s.guideHead}>
                {g.art ? <Art name={g.art} size={20} /> : g.icon ? <Ionicons name={g.icon} size={18} color={colors.gold} /> : null}
                <Text style={s.cardTitle}>{g.title}</Text>
              </View>
              {g.body.map((b) => (
                <Text key={b} style={s.body}>
                  {b}
                </Text>
              ))}
            </View>
          ))}
          <View style={s.card}>
            <View style={s.guideHead}>
              <Ionicons name="list" size={18} color={colors.gold} />
              <Text style={s.cardTitle}>Seviye tablosu</Text>
            </View>
            <Text style={[s.dim, { marginBottom: 4 }]}>İlk seviyeler hızlı açılır; ortadan sonra her seviye bir öncekinden yaklaşık dörtte bir fazla puan ister.</Text>
            <View style={s.tableHead}>
              <Text style={[s.cell, s.headCell]}>Seviye</Text>
              <Text style={[s.cell, s.headCell, { textAlign: 'right' }]}>Gereken puan</Text>
              <Text style={[s.cell, s.headCell, { textAlign: 'right' }]}>Rozet</Text>
            </View>
            {sys.table.map((xp, l) => (
              <View key={l} style={[s.tableRow, l % 2 === 1 && { backgroundColor: ink(0.03) }]}>
                <Text style={s.cell}>
                  Lv.{l} · {sys.tierOf(l).name}
                </Text>
                <Text style={[s.cell, { textAlign: 'right' }]}>{fmt(xp)}</Text>
                <View style={[s.cell, { alignItems: 'flex-end' }]}>
                  <Badge level={l} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 8, ...lift },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headCell: { color: colors.textDim, fontWeight: '700' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderRadius: 6 },
  cell: { flex: 1, color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },
}));

/** The design's own pictures on this screen (assets/levels/ekran, cut from the owners' screens, 23 Nov 2026). */
const DECO = {
  kitap: require('../../assets/levels/ekran/kitap.webp'),
  tac: require('../../assets/levels/ekran/tac.webp'),
  hediye: require('../../assets/levels/ekran/hediye.webp'),
  vipSeviye: require('../../assets/levels/ekran/ikon-vip-seviye.webp'),
  rutbe: require('../../assets/levels/ekran/ikon-rutbe.webp'),
  vipAbone: require('../../assets/levels/ekran/ikon-vip-abone.webp'),
};

/** The width of each ‹ › arrow beside the row of groups. */
const ARROW_W = 26;

const l = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 6 },
  brandLine: { flex: 1, maxWidth: 70, height: 1, backgroundColor: LUX.goldLine },
  brandText: { color: LUX.gold, fontSize: 22, fontWeight: '800', letterSpacing: 0.3, textShadowColor: 'rgba(245,200,120,0.45)', textShadowRadius: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 10 },
  round: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, flexDirection: 'row', borderRadius: 999, padding: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: LUX.goldLine },
  segItem: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, overflow: 'hidden' },
  segOn: { borderWidth: 1, borderColor: 'rgba(255,214,150,0.8)' },
  segText: { color: LUX.muted, fontWeight: '800', fontSize: 15 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14, marginTop: 4, padding: 16, borderRadius: 22, borderWidth: 1.5, borderColor: LUX.goldLine, boxShadow: '0 0 18px rgba(229,60,154,0.18)' },
  avatarRing: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: LUX.gold },
  name: { color: LUX.white, fontSize: 19, fontWeight: '900', flexShrink: 1 },
  meLine: { color: LUX.muted, fontSize: 13 },
  meDim: { color: LUX.muted, fontSize: 12 },
  track: { height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,200,120,0.25)' },
  fill: { height: '100%', borderRadius: 5 },
  tiers: { alignItems: 'flex-end' },
  tier: { alignItems: 'center', gap: 2, paddingBottom: 10 },
  emblem: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    transform: [{ rotate: '45deg' }],
  },
  tierName: { color: LUX.muted, fontWeight: '800', fontSize: 12, marginTop: 4 },
  tierRange: { color: LUX.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  tierGlow: { position: 'absolute', bottom: 2, width: '46%', height: 3, borderRadius: 2, backgroundColor: LUX.gold, boxShadow: '0 0 8px rgba(245,200,120,0.9)' },
  // Slim pills, as in the design (32 points tall; hitSlop makes the touch area 44, rows 12 apart so they never overlap).
  levels: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12, paddingLeft: 16, paddingRight: 6, paddingVertical: 12 },
  chip: { height: 32, flexBasis: '22.5%', flexGrow: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(242,184,210,0.28)', backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, overflow: 'hidden' },
  chipPink: { borderColor: '#FF5FB4', borderWidth: 1.5, boxShadow: '0 0 10px rgba(255,79,168,0.6)' },
  chipGold: { borderColor: LUX.gold, borderWidth: 1.5, boxShadow: '0 0 10px rgba(245,200,120,0.55)' },
  levelsRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  book: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  crown: { width: 64, height: 48, opacity: 0.9 },
  gift: { position: 'absolute', right: -6, bottom: 6, width: 96, height: 99 },
  chipText: { color: '#E9D3DE', fontWeight: '700', fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(245,200,120,0.08)', borderWidth: 1, borderColor: 'rgba(245,200,120,0.25)' },
  statusOk: { backgroundColor: 'rgba(66,229,163,0.08)', borderColor: 'rgba(66,229,163,0.35)' },
  statusText: { color: LUX.white, fontSize: 14, flex: 1 },
  panel: { backgroundColor: LUX.card, borderRadius: 24, borderWidth: 1.5, borderColor: LUX.goldLine, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 30, marginTop: 14, boxShadow: '0 0 20px rgba(147,67,248,0.15)' },
  ribbonRow: { position: 'absolute', top: -18, left: 14, right: 14, flexDirection: 'row', alignItems: 'center' },
  ribbon: { borderRadius: 14, borderWidth: 1.5, borderColor: LUX.gold, paddingHorizontal: 18, paddingVertical: 6, overflow: 'hidden', maxWidth: '85%' },
  ribbonText: { color: '#FFE3B0', fontSize: 18, fontWeight: '800' },
  ribbonTail: { flex: 1, height: 1, backgroundColor: LUX.goldLine, marginLeft: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // Two or more perks: cards side by side (the design's Yankı ayrıcalıkları), wrapping on a narrow phone.
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card3: { flexGrow: 1, flexBasis: '30%', minWidth: 76, alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(245,200,120,0.28)' },
  cardTitle: { color: LUX.white, fontWeight: '800', fontSize: 12.5, textAlign: 'center' },
  cardText: { color: LUX.muted, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  perkArtSm: { height: 36, alignItems: 'center', justifyContent: 'center' },
  // ‹ row of groups ›: the arrows stand beside the row, never over an emblem.
  bandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingTop: 10 },
  arrow: { width: ARROW_W, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(215,185,203,0.35)' },
  dotOn: {
    backgroundColor: LUX.gold,
    transform: [{ rotate: '45deg' }],
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  perkArt: { minWidth: 84, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  perkTitle: { color: LUX.white, fontWeight: '800', fontSize: 16 },
  perkDetail: { color: LUX.muted, fontSize: 13, lineHeight: 18 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  otherLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(245,200,120,0.2)' },
  otherIcon: { width: 32, alignItems: 'center' },
  otherText: { color: LUX.white, fontSize: 14, flex: 1 },
  goto: { color: LUX.gold, fontWeight: '800', fontSize: 15, paddingTop: 10 },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, alignItems: 'flex-start' },
  noteText: { color: LUX.muted, fontSize: 12, lineHeight: 18, flex: 1 },
});
