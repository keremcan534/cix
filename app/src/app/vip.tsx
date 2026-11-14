import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { NOBLE_DAYS, NOBLE_RIGHTS, NOBLE_TIERS, SVIP_LEVELS, SVIP_RIGHTS, VIP_COMPARE, VIP_GIFT_PACK, VIP_PERKS, VIP_PLANS } from '@/data/status';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { openLegal } from '@/lib/legal';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Art } from '@/components/Art';
import { Avatar, LevelChips } from '@/components/ui';
import { saveExtras } from '@/lib/api';
import { liveMode, message, myServerId } from '@/lib/live';
import { loadPublicProfile } from '@/lib/live/profile';
import { buyVip, openPlaySubscriptions, openVipShop, useVipShop } from '@/lib/live/vip';
import { vipProductOf } from '@/lib/live/vip-core';
import { featureOff } from '@/lib/remote-control';

type Tab = 'svip' | 'vip' | 'noble';
const GOLD = '#F5D7A1';
/** The champagne gold as text on the screen or a card: GOLD on the night screen, dark gold on light cards. */
const useGold = () => {
  const { dark, colors } = useTheme();
  return dark ? GOLD : colors.gold;
};
const fmt = (n: number) => n.toLocaleString('tr-TR');
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}k` : String(n));

export default function PrivilegeCenter() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'vip' || params.tab === 'noble' ? params.tab : 'svip');
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.vip} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.segment}>
          {(
            [
              ['svip', 'VIP'],
              ['vip', 'Abonelik'],
              ['noble', 'Rütbe'],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
              <Text style={[styles.segText, tab === k && { color: '#3B2A12' }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => showAlert('Ayrıcalıklar', 'VIP 1–10: yüklediğin her jeton 1 puan, seviyen hiç düşmez.\nAbonelik: 7 günlük, 1 aylık ya da 3 aylık VIP aboneliği.\nRütbe: jetonla alınır, 30 gün geçerli.\nTüm ayrıcalıklar sunucuda doğrulanır.')} hitSlop={10} accessibilityLabel="Yardım">
          <Ionicons name="help-circle-outline" size={26} color={colors.text} />
        </Pressable>
      </View>
      {tab === 'svip' ? <Svip /> : tab === 'vip' ? <Vip /> : <Noble />}
    </SafeAreaView>
  );
}

function Svip() {
  const { svipXp, svipLevel } = useApp();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.min(width, 520) - 48;
  const [index, setIndex] = useState(Math.max(0, svipLevel - 1));
  const [sub, setSub] = useState<'rights' | 'shop'>('rights');
  // The carousel opens on the member's own level and a tapped card slides to the centre, so the card in
  // view always matches the perks listed under it.
  const step = cardW + 12;
  const carousel = useRef<ComponentRef<typeof ScrollView>>(null);
  const placed = useRef(false);
  const select = (i: number) => {
    setIndex(i);
    carousel.current?.scrollTo({ x: i * step, animated: true });
  };
  const lv = SVIP_LEVELS[index];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.segment, { alignSelf: 'center', marginBottom: 12 }]}>
        {(
          [
            ['rights', 'Ayrıcalıklar'],
            ['shop', 'Üyelere Özel'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => (k === 'shop' ? router.push('/magaza') : setSub(k))} style={[styles.segBtn, sub === k && styles.segActive]}>
            <Text style={[styles.segText, sub === k && { color: '#3B2A12' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        ref={carousel}
        horizontal
        pagingEnabled={false}
        snapToInterval={step}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * step, y: 0 }}
        onContentSizeChange={() => {
          if (placed.current) return;
          placed.current = true;
          carousel.current?.scrollTo({ x: index * step, animated: false });
        }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        onMomentumScrollEnd={(e) => setIndex(Math.max(0, Math.min(SVIP_LEVELS.length - 1, Math.round(e.nativeEvent.contentOffset.x / step))))}>
        {SVIP_LEVELS.map((l, i) => {
          const locked = svipLevel < l.level;
          const isNext = svipLevel === l.level - 1;
          return (
            <Pressable key={l.level} onPress={() => select(i)} style={{ width: cardW }} accessibilityLabel={`VIP ${l.level} kartı`}>
              <LinearGradient colors={l.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.svipCard, index === i && { borderColor: GOLD }]}>
                {locked && (
                  <View style={styles.lockChip}>
                    <Ionicons name="lock-closed" size={11} color="#fff" />
                    <Text style={styles.lockText}>Kilitli</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.svipTitle}>VIP {l.level}</Text>
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
                  <Text style={styles.cardText}>Bu seviyeye {fmt(l.xp - svipXp)} puan kaldı</Text>
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
          VIP {lv.level} hakları {lv.rights}/{SVIP_RIGHTS.length}
        </Text>
        <Art name="svip-svip-isareti" size={22} />
      </View>
      <View style={styles.grid}>
        {SVIP_RIGHTS.map((r, i) => {
          const on = i < lv.rights;
          return (
            <Pressable
              key={r.name}
              style={styles.rightCell}
              accessibilityState={{ disabled: !on }}
              onPress={() => {
                const need = SVIP_LEVELS.find((x) => x.rights > i);
                showAlert(r.name, on ? `VIP ${lv.level} ile kullanabilirsin.` : need ? `VIP ${need.level} ile açılır.` : 'Yakında.');
              }}>
              {/* Locked: only the art fades; the name stays readable (textDim). */}
              <View style={[styles.rightIcon, !on && { opacity: 0.38 }]}>
                {r.art ? <Art name={r.art} size={34} /> : <Text style={{ fontSize: 26 }}>{r.emoji}</Text>}
              </View>
              <Text style={[styles.rightName, !on && { color: colors.textDim }]} numberOfLines={2}>
                {r.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Yüklediğin her jeton 1 VIP puanı kazandırır. Bonus jetonlar ve hediye gelen jetonlar sayılmaz; iade edilen yüklemenin puanı geri alınır.</Text>
    </ScrollView>
  );
}

function Vip() {
  const { vipDays, buyVipPlan, me, wealthLevel, charmLevel, settings, setSetting } = useApp();
  const { colors, ink, dark } = useTheme();
  const styles = useStyles();
  const gold = useGold();
  // Plan prices that are not selected: zinc on the night screen, slate on white cards.
  const soft = dark ? '#D4D4D8' : '#33425A';
  const [plan, setPlan] = useState(VIP_PLANS[1].days);
  const [perkPage, setPerkPage] = useState(0);
  const [pageW, setPageW] = useState(0);
  const p = VIP_PLANS.find((x) => x.days === plan)!;
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const perkPages = Math.ceil(VIP_PERKS.length / 4);
  const live = liveMode();
  // Live mode: the subscription is the server's (lib/live/vip): free on a test server, through Google Play otherwise;
  // the days left above come from the server's answer. The demo adds the days here.
  const sale = useVipShop();
  const [buying, setBuying] = useState(false);
  useEffect(() => {
    if (live) void openVipShop();
  }, [live]);
  const buyLive = () => {
    if (buying) return;
    // The store purchase switch (FEATURES_OFF / Canlı ayarlar 'purchases') stops subscriptions too, server and app.
    if (featureOff('purchases')) return showAlert('Abonelik kapalı', 'Mağaza satın alımları şu an geçici olarak kapalı. Kısa süre içinde yeniden açılacak; hesabın güvende.');
    if (sale.mode !== 'test' && sale.mode !== 'play') return showAlert('Abonelik', sale.notice ?? 'Abonelik planları hazırlanıyor…');
    const run = () => {
      setBuying(true);
      buyVip(vipProductOf(p.days))
        .then((a) => a && showAlert(a.title, a.body))
        .finally(() => setBuying(false));
    };
    if (sale.mode === 'test')
      return showAlert('VIP satın al', `VIP ${p.label} · Test sürümü: ücretsiz, gerçek ödeme alınmaz. ${p.days} gün eklensin mi?`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ekle', onPress: run },
      ]);
    // A Play subscription that renews on its own would be charged next to a second plan: it is changed in Play.
    if (sale.renewing?.platform === 'android')
      return showAlert('Aboneliğin zaten açık', "Planını değiştirmek ya da aboneliği iptal etmek için Google Play › Abonelikler'i aç.", [
        { text: 'Vazgeç', style: 'cancel' },
        { text: "Google Play'i aç", onPress: () => openPlaySubscriptions(sale.renewing?.productId) },
      ]);
    // Google Play's own sheet shows the price and asks.
    run();
  };
  const buy = () =>
    live
      ? buyLive()
      : showAlert('VIP satın al', `VIP ${p.label} · ${p.tl} TL (${store}). Onaylıyor musun?`, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Satın al', onPress: () => buyVipPlan(p.days) && showAlert('VIP aktif 🎉', `${p.days} gün eklendi.`) },
        ]);
  // Live mode: what others see is the server's (server/api/profiles.mjs, VIP 1+ by SVIP level or Rütbe, or the Abonelik
  // there), so the switches start from it and a change goes there first; the server says no without either.
  useEffect(() => {
    const id = myServerId();
    if (!live || !id) return;
    let alive = true;
    loadPublicProfile(id, true)
      .then((c) => {
        if (!alive || !c.levelsHidden) return;
        setSetting('hideWealth', c.levelsHidden.wealth);
        setSetting('hideCharm', c.levelsHidden.charm);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Read once when the screen opens; setSetting is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const toggleHide = (k: 'hideWealth' | 'hideCharm', v: boolean) => {
    if (live) {
      saveExtras({ [k]: v })
        .then((x) => setSetting(k, x[k]))
        .catch((e) => showAlert('Kaydedilemedi', message(e)));
      return;
    }
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
      {vipDays > 0 && <Text style={[styles.cardText, { color: gold, textAlign: 'center' }]}>👑 VIP aktif · {vipDays} gün kaldı</Text>}
      {live && sale.renewing?.platform === 'android' && (
        <Text style={[styles.legalLink, { textAlign: 'center' }]} onPress={() => openPlaySubscriptions(sale.renewing?.productId)} accessibilityRole="link">
          Aboneliği Google Play&apos;de yönet
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {VIP_PLANS.map((x) => (
          <Pressable key={x.days} onPress={() => setPlan(x.days)} style={[styles.plan, plan === x.days && styles.planOn]} accessibilityLabel={`VIP ${x.label}, ${x.tl} TL`}>
            <Text style={styles.planTag}>%{x.save} daha uygun</Text>
            <Text style={{ color: colors.textDim, fontSize: 15, marginTop: 10 }}>{x.label}</Text>
            <Text style={{ color: plan === x.days ? colors.text : soft, fontWeight: '900', fontSize: 26 }}>
              <Text style={{ fontSize: 11, fontWeight: '600' }}>TRY</Text>
              {fmt(x.tl)}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 12, textDecorationLine: 'line-through' }}>TRY{fmt(x.was)}</Text>
          </Pressable>
        ))}
      </View>
      <BuyButton onPress={buy} busy={buying} />
      {live && sale.mode === 'test' && <Text style={[styles.note, { textAlign: 'center', marginTop: 0 }]}>Test sürümü · abonelik ücretsiz, gerçek ödeme alınmaz</Text>}

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
                    <Ionicons name={r.icon as keyof typeof Ionicons.glyphMap} size={22} color={gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: gold, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>
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
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
            Hoş Geldin Kutusu <Text style={{ color: gold }}>({VIP_GIFT_PACK.length})</Text>
          </Text>
          {/* Two per row, so nothing hides off the card's edge. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
            {VIP_GIFT_PACK.map((g) => (
              <View key={g.name} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 }}>
                <Art name={g.art} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: gold, fontWeight: '700' }} numberOfLines={2}>
                    {g.name}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>{`${g.days} gün · ${g.qty} adet`}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Text style={[styles.h1, { marginTop: 8 }]}>Ayrıcalık Karşılaştırması</Text>
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={[styles.th, { flex: 1.1 }]}>Ayrıcalıklar</Text>
          <Text style={[styles.th, styles.mid]}>VIP olmayan</Text>
          <Text style={[styles.th, styles.vipCol, { color: gold, fontSize: 20, fontStyle: 'italic', fontWeight: '900' }]}>VIP</Text>
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
        <Text style={[styles.rightsTitle, { color: colors.text, marginVertical: 4 }]}>
          <Text style={{ color: gold }}>◆ </Text>Seviyeyi Gizle<Text style={{ color: gold }}> ◆</Text>
        </Text>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar uri={me.avatar} size={76} />
          <Text style={{ color: gold, fontWeight: '800', fontSize: 17 }}>{me.name}</Text>
          <LevelChips wealth={wealthLevel} charm={charmLevel} hideWealth={(live || vipDays > 0) && settings.hideWealth} hideCharm={(live || vipDays > 0) && settings.hideCharm} />
        </View>
        <View style={styles.toggles}>
          {(
            [
              ['hideWealth', 'Cömertlik seviyesini gizle'],
              ['hideCharm', 'Yankı seviyesini gizle'],
            ] as const
          ).map(([k, l], i) => (
            <View key={k} style={[styles.toggleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink(0.1) }]}>
              <Text style={{ color: colors.textDim, fontSize: 15, flex: 1 }}>{l}</Text>
              <Switch value={(live || vipDays > 0) && settings[k]} onValueChange={(v) => toggleHide(k, v)} trackColor={{ true: '#E8B979' }} thumbColor="#fff" accessibilityLabel={l} />
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.note}>
        Ödeme {store} hesabından, hesabındaki ödeme yöntemiyle ve yerel para biriminde alınır. Ülkene göre vergi eklenebilir; son fiyatı {store} ödeme sayfasında
        görürsün. Abonelik, süresi bitmeden 24 saat önce kendiliğinden yenilenir ve ücretlendirilir. İstediğin zaman {store} üzerinden iptal edebilirsin. Satın alarak
        şunları kabul edersin:{' '}
        <Text style={styles.legalLink} onPress={() => openLegal('subscription')} accessibilityRole="link">
          Abonelik Koşulları
        </Text>{' '}
        ve{' '}
        <Text style={styles.legalLink} onPress={() => openLegal('privacy')} accessibilityRole="link">
          Gizlilik Politikası
        </Text>
        .
      </Text>
      <BuyButton onPress={buy} busy={buying} />
    </ScrollView>
  );
}

function CompareCell({ value, style, vip }: { value: string | boolean; style: object; vip?: boolean }) {
  const { dark } = useTheme();
  const styles = useStyles();
  const gold = useGold();
  if (typeof value === 'boolean')
    return (
      <View style={[styles.tdBox, style]}>
        <Ionicons name={value ? 'checkmark-sharp' : 'close-sharp'} size={26} color={value ? (dark ? '#F5B94A' : '#C98A1E') : dark ? '#D4D4D8' : '#8A96A8'} accessibilityLabel={value ? 'Var' : 'Yok'} />
      </View>
    );
  return <Text style={[styles.td, style, vip && { color: gold, fontWeight: '700' }]}>{value}</Text>;
}

function BuyButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityState={{ busy: !!busy }}>
      <LinearGradient colors={['#FDE7C7', '#F5C189']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.buyBtn, busy && { opacity: 0.7 }]}>
        <Text style={{ color: '#3B2A12', fontWeight: '900', fontSize: 18 }}>{busy ? 'İşleniyor…' : 'VIP Satın Al'}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Dots({ count, index }: { count: number; index: number }) {
  const { ink, dark } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: i === index ? 28 : 14, height: 4, borderRadius: 2, backgroundColor: i === index ? (dark ? '#D4D4D8' : '#8A96A8') : ink(0.15) }} />
      ))}
    </View>
  );
}

function Noble() {
  const { nobleTier, nobleDays, buyNoble, coins } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const gold = useGold();
  const [sel, setSel] = useState(Math.max(1, nobleTier));
  const t = NOBLE_TIERS[sel - 1];
  const owned = nobleTier >= sel;
  const buy = () => {
    if (coins < t.price)
      return showAlert('Kilidi açılmadı', `${t.name} için 🪙 ${fmt(t.price)} gerekir. Önce jeton yükle.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Yükle', onPress: () => router.push('/cuzdan') },
      ]);
    showAlert(`${t.name} rütbesi`, `${NOBLE_DAYS} gün · 🪙 ${fmt(t.price)}. Onaylıyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Al', onPress: () => buyNoble(t.tier) && showAlert(`${t.emoji} ${t.name} oldun!`, `${t.rights} hak açıldı.`) },
    ]);
  };
  return (
    <View style={styles.noble}>
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
          {owned && <Text style={[styles.cardText, { color: gold, marginTop: 8 }]}>✓ Aktif · {nobleDays} gün kaldı</Text>}
        </View>
        <Text style={[styles.rightsTitle, { color: gold }]}>
          Rütbe hakları {t.rights}/{NOBLE_RIGHTS.length}
        </Text>
        <View style={styles.grid}>
          {NOBLE_RIGHTS.map((r, i) => {
            const on = i < t.rights;
            return (
              <Pressable
                key={r.name}
                style={[styles.rightCell, { backgroundColor: 'transparent', borderWidth: 0 }]}
                accessibilityState={{ disabled: !on }}
                onPress={() => {
                  const need = NOBLE_TIERS.find((x) => x.rights > i);
                  showAlert(r.name, on ? `${t.name} ile kullanabilirsin.` : need ? `${need.name} rütbesiyle açılır.` : '');
                }}>
                <View style={!on && { opacity: 0.35 }}>{r.art ? <Art name={r.art} size={44} /> : <Text style={{ fontSize: 34 }}>{r.emoji}</Text>}</View>
                <Text style={[styles.rightName, { color: on ? gold : colors.textDim }]} numberOfLines={2}>
                  {r.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        {owned && <Art name={t.art} size={28} style={{ marginRight: -6 }} />}
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>
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

// Light scheme only: the soft card shadow (the night screen's cards stand out by color).
const LIGHT_SHADOW = '0 1px 2px rgba(64,20,40,0.05), 0 6px 16px rgba(64,20,40,0.06)';

// The privilege center keeps its warm night palette in the dark scheme. In the light one the screen, the plan cards,
// boxes and table become white cards with dark-gold text; the VIP level cards, emblems and gold fills stay as they are.
const useStyles = makeStyles(({ colors, surface, ink, dark }) => {
  const gold = dark ? GOLD : colors.gold;
  const shadow = dark ? {} : { boxShadow: LIGHT_SHADOW };
  return {
    safe: { flex: 1, backgroundColor: dark ? '#0B0A0F' : colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
    segment: { flexDirection: 'row', backgroundColor: ink(0.08), borderRadius: 999, padding: 3 },
    segBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    segActive: { backgroundColor: GOLD },
    segText: { color: colors.textDim, fontWeight: '800' },
    svipCard: { borderRadius: 16, padding: 16, minHeight: 170, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    lockChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(22,14,18,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    lockText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    svipTitle: { color: GOLD, fontSize: 40, fontWeight: '900', fontStyle: 'italic' },
    cardText: { color: '#fff', fontSize: 14 },
    track: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
    loadBtn: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#FDE7C7', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
    rightsTitle: { color: gold, fontWeight: '900', fontSize: 18, textAlign: 'center', marginVertical: 18 },
    rightsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 18 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, rowGap: 12 },
    rightCell: { width: '31.3%', marginHorizontal: '1%', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: dark ? 'rgba(245,215,161,0.35)' : 'rgba(183,131,46,0.28)', backgroundColor: dark ? '#15120C' : colors.card, ...shadow },
    rightIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E8B979', alignItems: 'center', justifyContent: 'center' },
    rightName: { color: gold, fontSize: 12, textAlign: 'center', paddingHorizontal: 4 },
    note: { color: colors.textDim, fontSize: 12, lineHeight: 17, paddingHorizontal: 16, marginTop: 12 },
    legalLink: { color: gold, fontWeight: '700', textDecorationLine: 'underline' },
    h1: { color: colors.text, fontWeight: '900', fontSize: 20 },
    table: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: ink(0.1), ...(dark ? {} : { backgroundColor: colors.card, boxShadow: LIGHT_SHADOW }) },
    tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surface.hairline },
    th: { color: colors.textDim, padding: 12, textAlign: 'center', fontSize: 13 },
    td: { color: dark ? '#D4D4D8' : '#33425A', padding: 12, textAlign: 'center', fontSize: 13 },
    tdBox: { padding: 10, alignItems: 'center', justifyContent: 'center' },
    mid: { flex: 1, backgroundColor: surface.pressed },
    vipCol: { flex: 1, backgroundColor: dark ? 'rgba(245,215,161,0.06)' : 'rgba(232,185,121,0.12)' },
    plan: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 18, paddingBottom: 14, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', backgroundColor: dark ? '#1E1C22' : colors.card, ...shadow },
    planOn: { borderColor: dark ? GOLD : '#D9A24A' },
    planTag: { position: 'absolute', top: -2, left: -2, backgroundColor: '#E5484D', color: '#fff', fontSize: 11, fontWeight: '800', borderTopLeftRadius: 12, borderBottomRightRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
    buyBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
    box: { borderRadius: 18, borderWidth: 1, borderColor: ink(0.1), backgroundColor: dark ? '#1A181E' : colors.card, padding: 16, gap: 12, overflow: 'hidden', ...shadow },
    perk: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10 },
    perkIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(232,185,121,0.16)', alignItems: 'center', justifyContent: 'center' },
    giftBox: { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(232,185,121,0.10)', borderRadius: 14, padding: 14, gap: 12 },
    toggles: { backgroundColor: surface.pressed, borderRadius: 14, paddingHorizontal: 14 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    noble: { flex: 1, backgroundColor: dark ? '#2A1A22' : '#F6E9EF' },
    nobleTabs: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
    nobleTab: { color: ink(0.5), fontSize: 16, fontWeight: '700', paddingVertical: 6 },
    nobleTabOn: { color: colors.text, borderBottomWidth: 3, borderBottomColor: colors.text },
    emblem: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center' },
    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: dark ? '#1B1A17' : colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, borderColor: '#B8955A', ...(dark ? {} : { boxShadow: '0 -4px 16px rgba(64,20,40,0.08)' }) },
    alBtn: { backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 34, paddingVertical: 12 },
  };
});
