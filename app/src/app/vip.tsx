import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { decayLineOf, subPlansOf, subRightsOf, vipLevelsOf, vipRightsOf } from '@/lib/levels-live-core';
import { useLevels } from '@/lib/live/levels-live';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { openLegal } from '@/lib/legal';
import { useApp } from '@/store';
import { ThemeScope, makeStyles, useTheme } from '@/theme';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { saveExtras } from '@/lib/api';
import { liveMode, message, myServerId } from '@/lib/live';
import { loadPublicProfile } from '@/lib/live/profile';
import { buyVip, openPlaySubscriptions, openVipShop, useVipShop } from '@/lib/live/vip';
import { vipProductOf } from '@/lib/live/vip-core';
import { featureOff } from '@/lib/remote-control';
import { SUB_BUY_TITLE, defaultPlanDays, demoBuyText, rightNote, rightsOpen, startIndex, subStatusText, testBuyText, withSetRights, type VipTint } from '@/lib/vip-screen';
import { VipHeroCarousel } from '@/components/vip/vip-hero';
import { RightsGrid, RightsHeading, VipPointsInfo, tintOfLevel } from '@/components/vip/vip-rights';
import { PrivilegeTopBar, VipSubTabs } from '@/components/vip/vip-tabs';
import { SUB } from '@/components/vip/sub-look';
import { PlanCards, SubBuyButton, SubStatus } from '@/components/vip/sub-plans';
import { SubHeading, SubPerks } from '@/components/vip/sub-rights';
import { SubCompare } from '@/components/vip/sub-compare';
import { SubHideLevels } from '@/components/vip/sub-hide-levels';
import { NoblePage } from '@/components/vip/noble-page';
import { useVipSetPreview } from '@/components/vip/vip-set-preview';

type Tab = 'svip' | 'vip' | 'noble';

export default function PrivilegeCenter() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'vip' || params.tab === 'noble' ? params.tab : 'svip');
  const app = useTheme();
  const focused = useIsFocused();
  // The VIP tab is the client's night-purple design and Abonelik its light-pink one, in both color schemes; Rütbe
  // follows the app's.
  const night = tab === 'svip';
  const pink = tab === 'vip';
  return (
    <ThemeScope scheme={night ? 'dark' : pink ? 'light' : app.scheme}>
      <Center tab={tab} setTab={setTab} />
      {/* A dark tab in the light app keeps a light status bar while this screen is on top, the pink one in the dark
          app a dark one. */}
      {night && !app.dark && focused && <StatusBar style="light" />}
      {pink && app.dark && focused && <StatusBar style="dark" />}
    </ThemeScope>
  );
}

function Center({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const styles = useStyles();
  const levels = useLevels();
  const { dark } = useTheme();
  const night = tab === 'svip';
  const pink = tab === 'vip';
  // The VIP level picked in the carousel: the page takes its colours (VIP seti).
  const [picked, setPicked] = useState(0);
  const tint = night ? tintOfLevel(picked) : null;
  return (
    <SafeAreaView style={[styles.safe, night && { backgroundColor: tint?.page[1] ?? VIP_BG }, pink && { backgroundColor: SUB.ground }]}>
      {night ? <VipBackdrop tint={tint} /> : pink ? <SubBackdrop /> : <Backdrop scene={SCENES.vip} />}
      <PrivilegeTopBar
        tab={tab}
        onTab={setTab}
        variant={dark ? 'night' : 'light'}
        onBack={() => goBack()}
        onHelp={() =>
          showAlert(
            'Ayrıcalıklar',
            `VIP: yüklediğin her jeton 1 puan${decayLineOf(levels, 'vip') ? '; uzun süre yükleme yapmazsan seviyen düşebilir' : ', seviyen hiç düşmez'}.\nAbonelik: seçtiğin süre kadar geçerli.\nRütbe: jetonla alınır, kademenin süresi kadar geçerli.\nTüm ayrıcalıklar sunucuda doğrulanır.`,
          )
        }
      />
      {tab === 'svip' ? <Svip onLevel={setPicked} /> : tab === 'vip' ? <Vip /> : <Noble />}
    </SafeAreaView>
  );
}

/** The VIP tab's ground: the design's night purple, a little lighter at the top and the bottom. */
const VIP_BG = '#0c071c';
function VipBackdrop({ tint }: { tint: VipTint | null }) {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <LinearGradient colors={tint?.page ?? ['#130829', '#0c061f', '#0b061e', '#140b2a']} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={tint ? [tint.pageTop, 'rgba(0,0,0,0)'] : ['rgba(110,60,190,0.07)', 'rgba(110,60,190,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }} />
    </View>
  );
}

/** The Abonelik tab's ground: the design's almost flat pink. */
function SubBackdrop() {
  return <LinearGradient colors={SUB.page} locations={SUB.pageAt} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />;
}

/** Wider windows (web, tablets) keep the phone layout, centred. */
const VIP_MAX_W = 480;

function Svip({ onLevel }: { onLevel: (level: number) => void }) {
  const { svipXp, svipLevel } = useApp();
  // VIP levels and rights as Seviye ve VIP ayarları have them (the app's own until the server says).
  const levels = useLevels();
  const list = vipLevelsOf(levels);
  // VIP seti: the level's own badge and frame on their cards, and its chat bubble and entry effect added.
  const rights = withSetRights(vipRightsOf(levels));
  const decay = decayLineOf(levels, 'vip');
  const nameOf = (level: number) => list.find((x) => x.level === level)?.name ?? `VIP ${level}`;
  const { width, fontScale } = useWindowDimensions();
  const contentW = Math.min(width, VIP_MAX_W);
  const [index, setIndex] = useState(() => startIndex(svipLevel, list));
  const setPreview = useVipSetPreview();
  const lv = list[Math.min(index, list.length - 1)];
  const picked = lv?.level ?? 0;
  useEffect(() => onLevel(picked), [picked, onLevel]);
  if (!lv) return null;
  return (
    <ScrollView contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingBottom: 28 }}>
      <VipSubTabs onMembers={() => router.push('/magaza')} />
      <View style={{ marginTop: 14 }}>
        <VipHeroCarousel
          levels={list}
          index={index}
          onIndex={setIndex}
          width={contentW}
          myLevel={svipLevel}
          myPoints={svipXp}
          decay={!!decay}
          onLoad={() => router.push('/cuzdan')}
        />
      </View>
      {/* Just under the carousel's dots (not in the design), where the design has the heading; the cards where the
          design has them. */}
      <View style={{ marginTop: 1.5, marginBottom: 18.5 }}>
        <RightsHeading title={`${lv.name} Hakları ${rightsOpen(rights, lv.level)}/${rights.length}`} />
      </View>
      {/* Only the rights the real app gives today (güncelleme 6); each opens at its own level. */}
      <RightsGrid
        rights={rights}
        level={lv.level}
        width={contentW}
        fontScale={fontScale}
        onPress={(r, on) => {
          // The level's frame and entry effect play as a preview (Güncelleme 8); the rest say their note.
          if ((r.set === 'frame' || r.set === 'entry') && setPreview.open(r.set, lv.level)) return;
          showAlert(r.name, rightNote(r, on, lv.name, nameOf(r.level)));
        }}
      />
      {setPreview.view}
      <VipPointsInfo decay={decay} width={contentW} level={lv.level} />
    </ScrollView>
  );
}

/** The Abonelik tab's side margins (the design's 17–18 dp on a 390 dp phone). */
const SUB_MARGIN = 17;

function Vip() {
  const { vipDays, buyVipPlan, me, wealthLevel, charmLevel, settings, setSetting } = useApp();
  // The plans and rights shown, as Seviye ve VIP ayarları have them (the price paid is the store's).
  const levels = useLevels();
  const plans = subPlansOf(levels);
  const { compare, perks } = subRightsOf(levels);
  const { width, fontScale } = useWindowDimensions();
  const contentW = Math.min(width, VIP_MAX_W) - 2 * SUB_MARGIN;
  // The month opens selected, as it always did; without it (hidden in the panel) the first plan shown.
  const [plan, setPlan] = useState(() => defaultPlanDays(plans));
  const p = plans.find((x) => x.days === plan) ?? plans[0];
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
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
      return showAlert(SUB_BUY_TITLE, testBuyText(p), [
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
      : showAlert(SUB_BUY_TITLE, demoBuyText(p, store), [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Satın al', onPress: () => buyVipPlan(p.days) && showAlert('Abonelik aktif 🎉', `${p.days} gün eklendi.`) },
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
      return showAlert('Abonelik ayrıcalığı', 'Seviyeleri gizlemek abonelik ayrıcalığıdır.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Abonelik Satın Al', onPress: buy },
      ]);
    setSetting(k, v);
  };
  const mayHide = live || vipDays > 0;
  const status = subStatusText(vipDays);
  const hint = p ? `${p.label} planı seçili` : undefined;
  return (
    <ScrollView contentContainerStyle={{ width: contentW + 2 * SUB_MARGIN, alignSelf: 'center', paddingHorizontal: SUB_MARGIN, paddingBottom: 28 }}>
      {status && (
        <View style={{ marginTop: 2.5 }}>
          <SubStatus text={status} />
        </View>
      )}
      {live && sale.renewing?.platform === 'android' && (
        <Pressable onPress={() => openPlaySubscriptions(sale.renewing?.productId)} accessibilityRole="link" style={sub.manage}>
          <Text style={sub.link}>Aboneliği Google Play&apos;de yönet</Text>
        </Pressable>
      )}
      <View style={{ marginTop: status ? 11.5 : 14 }}>
        <PlanCards plans={plans} selected={p?.days ?? 0} onSelect={setPlan} width={contentW} fontScale={fontScale} />
      </View>
      <View style={{ marginTop: 11.5 }}>
        <SubBuyButton onPress={buy} busy={buying} hint={hint} />
      </View>

      {perks.length > 0 && (
        <>
          <View style={sub.heading}>
            <SubHeading title="Abonelik Ayrıcalıkları" />
          </View>
          <SubPerks perks={perks} width={contentW} />
        </>
      )}

      {compare.length > 0 && (
        <>
          <View style={sub.heading}>
            <SubHeading title="Ayrıcalık Karşılaştırması" />
          </View>
          <SubCompare rows={compare} />
        </>
      )}

      <View style={sub.heading}>
        <SubHeading title="Seviyeyi Gizle" both />
      </View>
      <SubHideLevels
        avatar={me.avatar}
        name={me.name}
        wealth={wealthLevel}
        charm={charmLevel}
        hidden={{ hideWealth: mayHide && settings.hideWealth, hideCharm: mayHide && settings.hideCharm }}
        onToggle={toggleHide}
      />

      {live && sale.mode === 'test' && <Text style={[sub.note, { marginTop: 14, textAlign: 'center' }]}>Test sürümü · abonelik ücretsiz, gerçek ödeme alınmaz</Text>}
      <Text style={[sub.note, { marginTop: 12 }]}>
        Ödeme {store} hesabından, hesabındaki ödeme yöntemiyle ve yerel para biriminde alınır. Ülkene göre vergi eklenebilir; son fiyatı {store} ödeme sayfasında
        görürsün. Abonelik, süresi bitmeden 24 saat önce kendiliğinden yenilenir ve ücretlendirilir. İstediğin zaman {store} üzerinden iptal edebilirsin. Satın alarak
        şunları kabul edersin:{' '}
        <Text style={sub.link} onPress={() => openLegal('subscription')} accessibilityRole="link">
          Abonelik Koşulları
        </Text>{' '}
        ve{' '}
        <Text style={sub.link} onPress={() => openLegal('privacy')} accessibilityRole="link">
          Gizlilik Politikası
        </Text>
        .
      </Text>
      <View style={{ marginTop: 14 }}>
        <SubBuyButton onPress={buy} busy={buying} hint={hint} />
      </View>
    </ScrollView>
  );
}

/** The Abonelik tab's own text styles (always the light design). */
const sub = StyleSheet.create({
  // Above a heading 12.5 dp, under it 5.5 (the design's line-to-card 13.7–16 dp from the heading's middle).
  heading: { marginTop: 12.5, marginBottom: 5.5 },
  note: { color: SUB.mauveSoft, fontSize: 11, lineHeight: 15.5, paddingHorizontal: 6 },
  link: { color: SUB.goldDeep, fontWeight: '700', textDecorationLine: 'underline' },
  // A 44 dp tall touch area round the one-line link.
  manage: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginVertical: -6 },
});

/** Rütbe: components/vip/noble-page (the owners' sample screens, 21 Nov 2026). */
function Noble() {
  return <NoblePage />;
}

// The page's ground (the tabs draw their own designs: components/vip).
const useStyles = makeStyles(({ colors, dark }) => ({
  safe: { flex: 1, backgroundColor: dark ? '#0B0A0F' : colors.bg },
}));
