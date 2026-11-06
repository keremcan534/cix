import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadError } from '@/components/load-error';
import { Text } from '@/components/text';
import { RECHARGE_PACKS, type RechargePack } from '@/data/status';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Icon3D } from '@/components/Icon3D';
import { IS_DEMO } from '@/lib/build';
import { liveMode, liveTopup, message, refreshWallet, TEST_PACKS } from '@/lib/live';
import { LEDGER_PAGE, useLiveLedger } from '@/lib/live/earnings';
import { coinsAddedOn, ledgerTime } from '@/lib/ledger-view';
import { buyCoins, openShop, useShop } from '@/lib/live/billing';
import { activeCampaign, campaignCoins, useLiveCatalog } from '@/lib/live/catalog-live';
import { fmtIstanbul } from '@/lib/live-settings-format';
import { outcomeAlert, SHOP_NOTICE } from '@/lib/live/billing-core';
import { openLegal } from '@/lib/legal';
import { blockedFeature } from '@/lib/remote-control';
import { today } from '@/lib/persist';
import { stampLabel } from '@/lib/tr';

export default function WalletScreen() {
  const { coins, buyPack, firstBuys, ledger, spentToday, settings, svipLevel, svipXp, addCoins } = useApp();
  const [tab, setTab] = useState<'buy' | 'history'>('buy');
  const [filter, setFilter] = useState<'coin' | 'diamond'>('coin');
  const [processing, setProcessing] = useState<string | null>(null);
  // Live mode: the real packs through Google Play (lib/live/billing), and the server's free test packs only
  // while the server allows them (ALLOW_TEST_TOPUP=1, at most 50.000 coins a day).
  const live = liveMode();
  const shop = useShop();
  const testPacks = RECHARGE_PACKS.filter((p) => TEST_PACKS.includes(p.coins));
  // Live mode: the campaign the owner runs from Canlı ayarlar (extra coins on every store pack, credited by the
  // server at the store's purchase time; test packs never get it). Shown only while it runs.
  const liveCat = useLiveCatalog();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    // A minute is enough: the badge goes away soon after the campaign ends (the server decides either way).
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [live]);
  const campaign = live ? activeCampaign(now, liveCat) : null;
  useEffect(() => {
    if (live) void openShop();
  }, [live]);
  // Live mode: the history is the server's ledger (its refs), read when the tab opens; the balance is re-read here
  // so a failed read says so instead of showing the last number as if it were current.
  const history = useLiveLedger(live && tab === 'history');
  const [walletError, setWalletError] = useState(false);
  const readWallet = () => void refreshWallet().then(() => setWalletError(false), () => setWalletError(true));
  useEffect(() => {
    if (live) readWallet();
  }, [live]);
  const { colors, semantic } = useTheme();
  const styles = useStyles();

  // Live mode: Google Play takes the payment; the coins arrive only with the server's answer.
  const buyLive = (productId: string) => {
    if (processing || blockedFeature('purchases')) return;
    setProcessing(productId);
    buyCoins(productId)
      .then((o) => {
        const a = outcomeAlert(o);
        if (a) showAlert(a.title, a.body);
      })
      .finally(() => setProcessing(null));
  };

  const buy = (pack: RechargePack) => {
    // A second tap while the store payment is pending must not charge twice.
    if (processing || blockedFeature('topup')) return;
    setProcessing(pack.id);
    // Live mode, test packs: the server credits a free test pack, so every phone sees the same balance.
    if (liveMode()) {
      liveTopup(pack.coins)
        .then(() => showAlert('Jeton yüklendi', `${pack.coins.toLocaleString('tr-TR')} test jetonu hesabına eklendi. Gerçek ödeme alınmadı.`))
        .catch((e) => showAlert('Yüklenemedi', message(e)))
        .finally(() => setProcessing(null));
      return;
    }
    // Prototype: no real payment; simulate the store confirmation delay, then credit.
    setTimeout(() => {
      const total = buyPack(pack.id);
      setProcessing(null);
      showAlert('Başarılı 🎉', `${total.toLocaleString('tr-TR')} jeton hesabına eklendi. +${pack.coins.toLocaleString('tr-TR')} İnci puanı. (Demo – gerçek ödeme alınmadı)`);
    }, 1200);
  };
  const rows = ledger.filter((r) => r.currency === filter);
  const day = today();
  const loadedToday = live ? coinsAddedOn(history.rows) : ledger.filter((r) => r.currency === 'coin' && r.amount > 0 && r.day === day).reduce((x, r) => x + r.amount, 0);
  const serverRows = history.rows.filter((r) => r.currency === filter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.wallet} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { flex: 1, marginLeft: 12 }]}>{tab === 'buy' ? 'Jeton Yükle' : 'Hareketler'}</Text>
        <Pressable onPress={() => setTab(tab === 'buy' ? 'history' : 'buy')} hitSlop={8} accessibilityLabel="Hareketler" style={{ marginRight: 16 }}>
          <Ionicons name={tab === 'buy' ? 'document-text-outline' : 'wallet-outline'} size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Ödeme' } })} hitSlop={8} accessibilityLabel="Destek">
          <Ionicons name="headset-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      {tab === 'history' ? (
        <>
          <Text style={[styles.note, { marginBottom: 8 }]}>
            Bugün: 🪙 {spentToday.toLocaleString('tr-TR')} harcandı · 🪙 {loadedToday.toLocaleString('tr-TR')} eklendi
            {settings.dailySpendLimit ? ` · Limit ${settings.dailySpendLimit.toLocaleString('tr-TR')}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
            {(
              [
                ['coin', '🪙 Jeton'],
                ['diamond', '💎 Elmas'],
              ] as const
            ).map(([k, l]) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && { backgroundColor: colors.primary }]}>
                <Text style={{ color: filter === k ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {live ? (
            history.status === 'error' ? (
              <LoadError text="Hareketler sunucudan okunamadı." onRetry={history.reload} style={{ marginHorizontal: 16 }} />
            ) : (
              <FlatList
                data={serverRows}
                keyExtractor={(r) => String(r.id)}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
                ListEmptyComponent={<Text style={[styles.note, { marginTop: 30 }]}>{history.status === 'ready' ? 'Henüz hareket yok.' : 'Yükleniyor…'}</Text>}
                ListFooterComponent={history.rows.length >= LEDGER_PAGE ? <Text style={[styles.note, { marginTop: 12 }]}>Son {LEDGER_PAGE} hareket gösteriliyor.</Text> : undefined}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text }}>{item.reason}</Text>
                      <Text style={{ color: colors.textDim, fontSize: 12 }}>
                        {ledgerTime(item.createdAt)} · {item.ref}
                      </Text>
                    </View>
                    <Text style={{ color: item.amount < 0 ? colors.red : colors.green, fontWeight: '800' }}>
                      {item.amount > 0 ? '+' : ''}
                      {item.amount.toLocaleString('tr-TR')}
                    </Text>
                  </View>
                )}
              />
            )
          ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            ListEmptyComponent={<Text style={[styles.note, { marginTop: 30 }]}>Henüz hareket yok.</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text }}>{item.reason}</Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>
                    {stampLabel(item.day, item.time)} · {item.status} · {item.ref}
                  </Text>
                </View>
                <Text style={{ color: item.amount < 0 ? colors.red : colors.green, fontWeight: '800' }}>
                  {item.amount > 0 ? '+' : ''}
                  {item.amount.toLocaleString('tr-TR')}
                </Text>
              </View>
            )}
          />
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ color: colors.textDim, fontSize: 15, fontWeight: '500' }}>Jeton bakiyem</Text>
              <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
            </View>
            <Text style={styles.balanceN}>{coins.toLocaleString('tr-TR')}</Text>
            {live && walletError && <LoadError text="Bakiyen sunucudan güncellenemedi; son bilinen bakiye gösteriliyor." onRetry={readWallet} style={{ marginTop: 8 }} />}
            {IS_DEMO && !live && (
              <Pressable
                onPress={() => {
                  addCoins(1_000_000, 'Demo test bakiyesi');
                  showAlert('Test jetonu eklendi', '1.000.000 jeton eklendi. (Demo – gerçek ödeme yok, İnci puanı vermez)');
                }}
                style={styles.testBtn}
                accessibilityRole="button"
                accessibilityLabel="Demo: 1.000.000 test jetonu ekle"
              >
                <Ionicons name="flask-outline" size={14} color={colors.primaryText} />
                <Text style={styles.testText}>Demo: +1.000.000 test jetonu</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.packHead}>
            <Text style={[styles.title, { flex: 1, fontSize: 20 }]}>Paket seç</Text>
            <Text style={styles.currency}>{!live ? 'Fiyatlar TL' : shop.status === 'ready' ? 'Google Play ile' : ''}</Text>
          </View>
          {campaign && (
            <View style={styles.campaign} accessibilityRole="summary">
              <Ionicons name="gift" size={22} color={semantic.moneyText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.campaignTitle}>
                  {campaign.label} · +%{campaign.percent} ek jeton
                </Text>
                <Text style={styles.campaignText}>
                  Google Play ile aldığın her pakete %{campaign.percent} fazla jeton eklenir. Bitiş: {fmtIstanbul(campaign.endsAt)} (İstanbul)
                </Text>
              </View>
            </View>
          )}
          {live ? (
            shop.status === 'ready' ? (
              <View style={styles.grid}>
                {shop.packs.map((p) => (
                  <PackTile
                    key={p.productId}
                    coins={p.coins}
                    price={p.price}
                    busy={processing === p.productId}
                    onPress={() => buyLive(p.productId)}
                    campaign={campaign ? { percent: campaign.percent, extra: campaignCoins(p.coins, campaign.percent) } : undefined}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.shopNotice}>{SHOP_NOTICE[shop.status]}</Text>
            )
          ) : (
            <View style={styles.grid}>
              {RECHARGE_PACKS.map((p: RechargePack) => {
                const first = !!p.firstBonus && !firstBuys.has(p.id);
                return <PackTile key={p.id} coins={p.coins} bonus={first ? p.firstBonus : p.bonus} first={first} price={p.price} busy={processing === p.id} onPress={() => buy(p)} />;
              })}
            </View>
          )}
          {live && shop.testTopup && (
            <>
              <View style={styles.packHead}>
                <Text style={[styles.title, { flex: 1, fontSize: 17 }]}>Test yüklemesi</Text>
                <Text style={styles.currency}>Test sürümü · ücretsiz</Text>
              </View>
              <View style={styles.grid}>
                {testPacks.map((p) => (
                  <PackTile key={p.id} coins={p.coins} price="Ücretsiz" busy={processing === p.id} onPress={() => buy(p)} />
                ))}
              </View>
            </>
          )}
          <Pressable onPress={() => router.push('/vip')} style={styles.svipLink} accessibilityRole="link" accessibilityLabel="İnci seviyelerine bak">
            <Text style={styles.svipLinkText}>İnci seviyelerine bak →</Text>
            <Text style={styles.svipLinkSub}>{svipLevel ? `İnci ${svipLevel} · ${svipXp.toLocaleString('tr-TR')} puan` : 'Yüklediğin her jeton 1 puan'}</Text>
          </Pressable>
          <Text style={styles.note}>
            Yüklemeye devam ederek{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('terms')} accessibilityRole="link">
              Kullanım Koşulları
            </Text>{' '}
            ve{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('payment')} accessibilityRole="link">
              Ödeme Sözleşmesi
            </Text>
            &apos;ni okuduğunu ve kabul ettiğini onaylarsın. {IS_DEMO && !live ? 'Prototip: ödeme simüle edilir; ' : ''}İade ve itiraz için Destek&apos;e yazabilirsin.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** One pack in the grid: coins, an optional bonus, and its price (the store's, in a live build). `campaign`: the
 *  running campaign's tag and this pack's extra coins (live store packs only). */
function PackTile({
  coins,
  bonus,
  first,
  price,
  busy,
  onPress,
  campaign,
}: {
  coins: number;
  bonus?: number;
  first?: boolean;
  price: string;
  busy: boolean;
  onPress: () => void;
  campaign?: { percent: number; extra: number };
}) {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${coins.toLocaleString('tr-TR')} jeton${campaign?.extra ? `, artı ${campaign.extra.toLocaleString('tr-TR')} kampanya jetonu` : ''}, ${price}`}
      style={{ width: '31.3%', margin: '1%' }}
    >
      <LinearGradient
        colors={first ? ['rgba(246,189,96,0.30)', dark ? 'rgba(22,37,60,0.96)' : 'rgba(255,255,255,0.96)'] : [colors.cardAlt, colors.card]}
        style={[styles.pack, (first || !!campaign?.extra) && styles.packFirst, busy && { opacity: 0.5 }]}
      >
        {first ? (
          <View style={styles.firstTag}>
            <Text style={styles.firstTagText}>Hoş geldin paketi</Text>
          </View>
        ) : campaign?.extra ? (
          <View style={styles.firstTag}>
            <Text style={styles.firstTagText}>+%{campaign.percent} kampanya</Text>
          </View>
        ) : null}
        <Icon3D name="coin" size={40} />
        <Text style={styles.packCoins}>{coins.toLocaleString('tr-TR')}</Text>
        {bonus || campaign?.extra ? (
          <Text style={styles.packBonus}>+{((bonus ?? 0) + (campaign?.extra ?? 0)).toLocaleString('tr-TR')}</Text>
        ) : (
          <View style={{ height: 18 }} />
        )}
        <Text style={[styles.packPrice, first && { color: colors.text }]}>{busy ? 'Bekleniyor…' : price}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface, lift, ink, dark }) => ({
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: dark ? 'rgba(19,217,223,0.18)' : 'rgba(0,140,148,0.11)' },
  testText: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 12 },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.text, fontWeight: '700' },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, ...lift },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  balance: { margin: 16, borderRadius: 20, padding: 20, gap: 6 },
  balanceLabel: { color: ink(0.85) },
  balanceN: { color: colors.text, fontSize: 32, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  packHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 18, marginBottom: 8 },
  shopNotice: { color: colors.text, fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingVertical: 18 },
  pack: { flex: 1, alignItems: 'center', gap: 6, paddingTop: 26, paddingBottom: 16, borderRadius: 16, minHeight: 130, borderWidth: 1, borderColor: surface.rim, ...(dark ? {} : { boxShadow: '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)' }) },
  packFirst: { borderColor: 'rgba(246,189,96,0.75)', paddingTop: 12 },
  svipLink: { alignItems: 'center', gap: 2, marginTop: 14, paddingVertical: 8 },
  svipLinkText: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  svipLinkSub: { color: colors.textDim, fontSize: 12 },
  currency: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  firstTag: { alignSelf: 'center', backgroundColor: semantic.money, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  firstTagText: { color: semantic.moneyInk, fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  packBonus: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  campaign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: semantic.money,
    // Solid: a see-through tint lets the sea photo behind wash the text out in the dark scheme.
    backgroundColor: colors.card,
  },
  campaignTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  campaignText: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  packSelected: { borderColor: colors.primaryText },
  bonus: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bonusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  packCoins: { color: colors.text, fontSize: 18, fontWeight: '800' },
  packPrice: { color: colors.textDim },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  legalLink: { color: colors.text, fontWeight: '700', textDecorationLine: 'underline' },
}));
