// Rüzgâr Gülü (docs/RUZGAR_GULU.md): three tiers, 1 / 10 / 50 spins, a JACKPOT fund per tier, the winners' list,
// today's board and my own spins. The result comes from lib/wheel (the server in live mode); the wheel only turns to
// where it already landed. Drawn with plain views (no SVG): each slice is a border triangle from the hub, the disc
// clips them round.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { CasinoLock } from '@/components/games/casino';
import { userById } from '@/data/mock';
import {
  WHEEL_COUNTS,
  WHEEL_NEED_LEVEL,
  WHEEL_SLICES,
  WHEEL_TIERS,
  WHEEL_TIER_IDS,
  isJackpotSlice,
  prizeOf,
  sliceChance,
  sliceLabel,
  type WheelCount,
  type WheelTierId,
} from '@/data/wheel';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import type { Entry } from '@/lib/games';
import { loadWheel, playWheel, wheelCost, type WheelPlay, type WheelSpin, type WheelView } from '@/lib/wheel';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const SIZE = 272;
const R = SIZE / 2;
const STEP = 360 / WHEEL_SLICES.length;
/** Inside the gold rim (rim width SIZE + 28, border 3). */
const INNER = SIZE + 22;
/** Half the base of a slice triangle whose height is the radius (the disc clips the corners round). */
const HALF = Math.ceil(R * Math.tan(((STEP / 2) * Math.PI) / 180)) + 1;
const n = (x: number) => x.toLocaleString('tr-TR');

/** Slice colors by prize: deep navy for the small ones, sea teal for the middle, gold for the big ones. */
function sliceLook(i: number): { fill: string; ink: string } {
  const m = WHEEL_SLICES[i].milli;
  if (m === null) return { fill: '#C93C4F', ink: '#FFFFFF' };
  if (m >= 100_000) return { fill: '#F6BD60', ink: '#3B2300' };
  if (m >= 10_000) return { fill: '#B7832E', ink: '#FFFFFF' };
  if (m >= 2000) return { fill: '#0A8F95', ink: '#FFFFFF' };
  if (m >= 800) return { fill: '#0E5C78', ink: '#FFFFFF' };
  return { fill: i % 2 ? '#16253C' : '#1F3050', ink: '#C7D2E5' };
}

type Tab = 'winners' | 'board' | 'mine';
const ago = (at: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  return m < 1 ? 'şimdi' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.floor(m / 60)} sa önce` : `${Math.floor(m / 1440)} gün önce`;
};

export function WheelPlayer({ entry }: { entry: Entry }) {
  const app = useApp();
  const { wealthLevel, coins, gameCoins, settings } = app;
  const [tier, setTier] = useState<WheelTierId>('kiyi');
  const [view, setView] = useState<WheelView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<WheelCount | null>(null);
  const [result, setResult] = useState<WheelPlay | null>(null);
  const [tab, setTab] = useState<Tab>('winners');
  const [rules, setRules] = useState(false);
  const [turn] = useState(() => new Animated.Value(0));
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    let on = true;
    loadWheel(wealthLevel).then(
      (v) => on && (setView(v), setLoadError(null)),
      (e: unknown) => on && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      on = false;
    };
  }, [wealthLevel, reload]);

  if (wealthLevel < WHEEL_NEED_LEVEL || (view && !view.allowed)) {
    return <CasinoLock reason={`Rüzgâr Gülü, Cömertlik Seviyesi ${WHEEL_NEED_LEVEL} ve üstü üyeler içindir. Senin seviyen: Lv.${wealthLevel}.`} needWealth={WHEEL_NEED_LEVEL} />;
  }
  if (!view) {
    return (
      <View style={w.center}>
        <Text style={w.dim}>{loadError ? `Rüzgâr Gülü açılamadı: ${loadError}` : 'Rüzgâr Gülü yükleniyor…'}</Text>
        {loadError && (
          <Pressable onPress={() => setReload((x) => x + 1)} style={w.ghost} accessibilityLabel="Tekrar dene">
            <Text style={w.ghostText}>Tekrar dene</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const playGame = view.serverGameCoins ?? gameCoins;
  const left = Math.max(0, view.dailyLimit - view.playedToday);

  const spin = async (count: WheelCount) => {
    if (busy) return;
    setBusy(count);
    setResult(null);
    const r = await playWheel(tier, count, view, { wealthLevel, gameCoins, spendGameCoins: app.spendGameCoins, spendCoins: app.spendCoins, spendBlock: app.spendBlock, addGameCoins: app.addGameCoins });
    if (!r.ok) {
      errorHaptic();
      setResult(r);
      setBusy(null);
      return;
    }
    // Stop on the JACKPOT if it came, else on the best slice of the request.
    const land = r.spin.slices.reduce((best, s) => (rank(s) > rank(best) ? s : best), r.spin.slices[0]);
    const target = angle + 360 * (settings.reduceMotion || r.replay ? 1 : 5) + ((((360 - land * STEP - angle) % 360) + 360) % 360);
    Animated.timing(turn, { toValue: target, duration: settings.reduceMotion || r.replay ? 300 : 3600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setAngle(target);
      setResult(r);
      setBusy(null);
      if (r.spin.payout >= r.spin.cost) successHaptic();
      setReload((x) => x + 1);
    });
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={w.tiers} accessibilityRole="tablist">
        {WHEEL_TIER_IDS.map((t) => (
          <Pressable
            key={t}
            onPress={() => !busy && (setTier(t), setResult(null))}
            style={[w.tier, tier === t && w.tierOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tier === t }}
            accessibilityLabel={`${WHEEL_TIERS[t].label}, tur başı ${n(WHEEL_TIERS[t].price)} jeton`}
          >
            <Text style={[w.tierName, tier === t && { color: semantic.moneyInk }]}>{WHEEL_TIERS[t].label}</Text>
            <Text style={[w.tierPrice, tier === t && { color: semantic.moneyInk }]}>{n(WHEEL_TIERS[t].price)}</Text>
          </Pressable>
        ))}
      </View>

      <LinearGradient colors={['#3B1020', '#16253C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={w.jackpot}>
        <Text style={w.jackpotLabel}>JACKPOT · {WHEEL_TIERS[tier].label}</Text>
        <Text style={w.jackpotValue} accessibilityLabel={`JACKPOT ${n(view.funds[tier])} jeton`}>
          {n(view.funds[tier])}
        </Text>
        <Text style={w.jackpotNote}>{"Her turun %1,5'i fona eklenir. JACKPOT dilimine gelen fonun tamamını alır."}</Text>
      </LinearGradient>

      <Wheel tier={tier} turn={turn} />

      <View style={w.counts}>
        {WHEEL_COUNTS.map((c) => {
          const cost = wheelCost(tier, c);
          const on = busy === c;
          return (
            <Pressable
              key={c}
              onPress={() => spin(c)}
              disabled={!!busy}
              style={({ pressed }) => [w.countWrap, (pressed || on) && { transform: [{ scale: 0.97 }] }, busy && !on && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`${c} kez çevir, ${n(cost)} jeton`}
            >
              <LinearGradient colors={c === 1 ? ['#6FF1F5', '#0FB8BE'] : c === 10 ? ['#FFD98A', '#F2A93B'] : ['#FF8E9A', '#C93C4F']} style={w.count}>
                <Text style={[w.countX, { color: c === 50 ? '#FFFFFF' : c === 1 ? semantic.actionInk : semantic.moneyInk }]}>{on ? 'Dönüyor…' : `×${c}`}</Text>
                <Text style={[w.countCost, { color: c === 50 ? '#FFFFFF' : c === 1 ? semantic.actionInk : semantic.moneyInk }]}>{n(cost)}</Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      <View style={w.wallet}>
        <Text style={w.walletText}>
          <Text style={{ color: colors.gold, fontWeight: '900' }}>{n(coins)}</Text> jeton · <Text style={{ color: semantic.actionText, fontWeight: '900' }}>{n(playGame)}</Text> oyun jetonu
        </Text>
        <Text style={w.dim}>Tur ücreti önce oyun jetonundan düşer. Bugün oynayabileceğin: {n(left)} jeton.</Text>
      </View>

      {result && <ResultCard result={result} />}

      <Pressable onPress={() => setRules((x) => !x)} style={w.rulesHead} accessibilityRole="button" accessibilityState={{ expanded: rules }}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
        <Text style={w.rulesHeadText}>Kurallar ve oranlar</Text>
        <Ionicons name={rules ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} />
      </Pressable>
      {rules && <Rules tier={tier} />}

      <View style={w.tabs} accessibilityRole="tablist">
        {(
          [
            ['winners', 'Kazananlar'],
            ['board', 'Bugün'],
            ['mine', 'Geçmişim'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[w.tab, tab === k && w.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[w.tabText, tab === k && { color: semantic.actionInk }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'winners' && <Winners view={view} />}
      {tab === 'board' && <Board view={view} />}
      {tab === 'mine' && <Mine spins={view.mine} />}
      <Text style={w.dim}>
        {entry.from === 'room' ? 'Oyun açıkken mikrofonun ve koltuğun aynen kalır. ' : ''}Oyun jetonu yalnızca oyunlarda kullanılır; hediye edilemez, elmasa ya da paraya çevrilemez.
      </Text>
    </View>
  );
}

/** JACKPOT first, then the biggest prize. */
const rank = (s: number) => (isJackpotSlice(s) ? Infinity : (WHEEL_SLICES[s].milli ?? 0));

function Wheel({ tier, turn }: { tier: WheelTierId; turn: Animated.Value }) {
  const rotate = turn.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  return (
    <View style={w.stage} accessibilityLabel="Rüzgâr Gülü çarkı">
      <View style={w.rim}>
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={[w.bulbArm, { transform: [{ rotate: `${i * 15}deg` }] }]}>
            <View style={[w.bulb, i % 2 ? w.bulbDim : null]} />
          </View>
        ))}
        <Animated.View style={[w.disc, { transform: [{ rotate }] }]}>
          {WHEEL_SLICES.map((_, i) => {
            const look = sliceLook(i);
            return (
              <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * STEP}deg` }] }]} pointerEvents="none">
                <View style={[w.wedge, { borderTopColor: look.fill }]} />
                <View style={w.labelBox}>
                  {isJackpotSlice(i) ? (
                    <Ionicons name="trophy" size={18} color={look.ink} />
                  ) : (
                    <Text style={[w.sliceText, { color: look.ink }]} numberOfLines={1}>
                      {n(prizeOf(tier, i))}
                    </Text>
                  )}
                  <Text style={[w.sliceSub, { color: look.ink }]} numberOfLines={1}>
                    {sliceLabel(i)}
                  </Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
        <LinearGradient colors={['#1F3050', '#080F1E']} style={w.hub}>
          <Ionicons name="compass" size={34} color={colors.gold} />
        </LinearGradient>
      </View>
      <View style={w.pointerRow} pointerEvents="none">
        <View style={w.pointer} />
      </View>
    </View>
  );
}

function ResultCard({ result }: { result: WheelPlay }) {
  if (!result.ok) {
    return (
      <View style={[w.result, { borderColor: colors.gold }]} accessibilityLiveRegion="polite">
        <Text style={w.err}>{result.reason}</Text>
      </View>
    );
  }
  const s = result.spin;
  // How many times each slice came up, biggest prize first.
  const tally = [...new Set(s.slices)].sort((a, b) => rank(b) - rank(a)).map((i) => [i, s.slices.filter((x) => x === i).length] as const);
  const net = s.payout - s.cost;
  return (
    <View style={[w.result, (s.jackpot > 0 || net > 0) && { borderColor: semantic.money }]} accessibilityLiveRegion="polite">
      {s.jackpot > 0 && <Text style={w.resultJackpot}>JACKPOT! +{n(s.jackpot)}</Text>}
      <Text style={w.resultMain}>+{n(s.payout)} oyun jetonu</Text>
      <Text style={w.dim}>
        {s.count} tur · {n(s.cost)} jeton{s.fromGame ? ` (${n(s.fromGame)} oyun jetonundan)` : ''}
        {result.replay ? ' · aynı istek tekrar geldi, ikinci kez düşülmedi' : ''}
      </Text>
      <View style={w.tally}>
        {tally.map(([i, k]) => (
          <View key={i} style={[w.tallyChip, { backgroundColor: sliceLook(i).fill }]}>
            <Text style={[w.tallyText, { color: sliceLook(i).ink }]}>
              {sliceLabel(i)}
              {k > 1 ? `  ×${k}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Rules({ tier }: { tier: WheelTierId }) {
  const order = WHEEL_SLICES.map((_, i) => i).sort((a, b) => rank(a) - rank(b));
  return (
    <View style={w.rules}>
      <Text style={w.rulesText}>
        Çarkta 12 dilim var ve her dilim bir şey öder; dilimler aynı boyda çizilir ama şansları farklıdır. Oynanan her 100 jetonun ortalama 40{"'"}ı kazanç olarak döner. Kazanç oyun jetonudur. Sonucu sunucu belirler, çark yalnızca sonucu gösterir. Cömertlik Lv.{WHEEL_NEED_LEVEL} ve üstü için açıktır, günlük üst sınırı vardır.
      </Text>
      <View style={w.oddsHead}>
        <Text style={[w.oddsCell, w.oddsHeadText]}>Dilim</Text>
        <Text style={[w.oddsCell, w.oddsHeadText, { textAlign: 'right' }]}>Kazanç ({WHEEL_TIERS[tier].label})</Text>
        <Text style={[w.oddsCell, w.oddsHeadText, { textAlign: 'right' }]}>Şans</Text>
      </View>
      {order.map((i) => (
        <View key={i} style={w.oddsRow}>
          <View style={[w.oddsCell, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <View style={[w.dot, { backgroundColor: sliceLook(i).fill }]} />
            <Text style={w.oddsText}>{sliceLabel(i)}</Text>
          </View>
          <Text style={[w.oddsCell, w.oddsText, { textAlign: 'right' }]}>{isJackpotSlice(i) ? 'Fonun tamamı' : n(prizeOf(tier, i))}</Text>
          <Text style={[w.oddsCell, w.oddsText, { textAlign: 'right' }]}>{sliceChance(i)}</Text>
        </View>
      ))}
    </View>
  );
}

function Person({ id, name, right, sub, place }: { id: string; name: string; right: string; sub?: string; place?: number }) {
  const u = userById(id);
  return (
    <View style={w.person}>
      {place !== undefined && <Text style={[w.place, place <= 3 && { color: colors.gold }]}>{place}</Text>}
      <Avatar uri={u.id === id ? u.avatar : undefined} size={34} name={name} />
      <View style={{ flex: 1 }}>
        <Text style={w.personName} numberOfLines={1}>
          {id === 'me' ? 'Sen' : name}
        </Text>
        {sub && <Text style={w.personSub}>{sub}</Text>}
      </View>
      <Text style={w.personRight}>{right}</Text>
    </View>
  );
}

function Winners({ view }: { view: WheelView }) {
  if (!view.winners.length) return <Text style={w.dim}>Henüz büyük kazanç yok. ×10 ve üstü dilimler ile JACKPOT burada görünür.</Text>;
  return (
    <View style={w.list}>
      {view.winners.slice(0, 15).map((x, i) => (
        <Person key={`${x.id}-${x.at}-${i}`} id={x.id} name={x.name} right={`+${n(x.payout)}`} sub={`${x.jackpot ? 'JACKPOT · ' : ''}${WHEEL_TIERS[x.tier].label} · ${ago(x.at)}`} />
      ))}
    </View>
  );
}

function Board({ view }: { view: WheelView }) {
  if (!view.board.length) return <Text style={w.dim}>Bugün henüz kimse çevirmedi.</Text>;
  return (
    <View style={w.list}>
      {view.board.map((x, i) => (
        <Person key={x.id} id={x.id} name={x.name} place={i + 1} right={n(x.total)} sub="bugün kazanılan" />
      ))}
      <Text style={w.dim}>Gün İstanbul saatiyle gece yarısı yenilenir.</Text>
    </View>
  );
}

function Mine({ spins }: { spins: WheelSpin[] }) {
  if (!spins.length) return <Text style={w.dim}>Henüz çevirmedin.</Text>;
  return (
    <View style={w.list}>
      {spins.map((s) => (
        <View key={s.id} style={w.person}>
          <View style={{ flex: 1 }}>
            <Text style={w.personName}>
              {WHEEL_TIERS[s.tier].label} ×{s.count}
              {s.jackpot ? ' · JACKPOT' : ''}
            </Text>
            <Text style={w.personSub}>
              {n(s.cost)} jeton · {ago(s.at)}
            </Text>
          </View>
          <Text style={[w.personRight, { color: s.payout >= s.cost ? colors.green : colors.text }]}>+{n(s.payout)}</Text>
        </View>
      ))}
    </View>
  );
}

const w = StyleSheet.create({
  center: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  ghost: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 8 },
  ghostText: { color: colors.text, fontWeight: '800', fontSize: 13 },

  tiers: { flexDirection: 'row', gap: 6, backgroundColor: colors.bg, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.border },
  tier: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 1 },
  tierOn: { backgroundColor: semantic.money },
  tierName: { color: colors.text, fontWeight: '900', fontSize: 13 },
  tierPrice: { color: colors.textDim, fontWeight: '800', fontSize: 11 },

  jackpot: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,101,118,0.45)' },
  jackpotLabel: { color: '#FFB3BC', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  jackpotValue: { color: colors.gold, fontWeight: '900', fontSize: 34, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  jackpotNote: { color: colors.textDim, fontSize: 11, textAlign: 'center' },

  stage: { alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  rim: { width: SIZE + 28, height: SIZE + 28, borderRadius: (SIZE + 28) / 2, backgroundColor: '#3B2300', borderWidth: 3, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 24px rgba(246,189,96,0.25)' },
  bulbArm: { position: 'absolute', top: 0, left: INNER / 2 - 5, height: INNER, width: 10, alignItems: 'center' },
  bulb: { width: 7, height: 7, borderRadius: 4, marginTop: 4, backgroundColor: '#FFE7B0', boxShadow: '0 0 6px rgba(255,231,176,0.9)' },
  bulbDim: { backgroundColor: '#B7832E', boxShadow: 'none' },
  disc: { width: SIZE, height: SIZE, borderRadius: R, overflow: 'hidden', backgroundColor: '#16253C' },
  wedge: { position: 'absolute', left: R - HALF, top: 0, width: 0, height: 0, borderLeftWidth: HALF, borderRightWidth: HALF, borderTopWidth: R, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  labelBox: { position: 'absolute', top: 12, left: R - 34, width: 68, alignItems: 'center' },
  sliceText: { fontWeight: '900', fontSize: 12, fontVariant: ['tabular-nums'] },
  sliceSub: { fontWeight: '700', fontSize: 9, opacity: 0.85 },
  hub: { position: 'absolute', left: INNER / 2 - 33, top: INNER / 2 - 33, width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.gold, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },
  pointerRow: { position: 'absolute', top: 2, left: 0, right: 0, alignItems: 'center' },
  pointer: { width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 26, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FF6576' },

  counts: { flexDirection: 'row', gap: 8 },
  countWrap: { flex: 1 },
  count: { borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  countX: { fontWeight: '900', fontSize: 18 },
  countCost: { fontWeight: '800', fontSize: 12 },

  wallet: { gap: 2, alignItems: 'center' },
  walletText: { color: colors.text, fontSize: 13 },

  result: { backgroundColor: colors.cardAlt, borderRadius: 16, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  resultJackpot: { color: '#FF8E9A', fontWeight: '900', fontSize: 20, letterSpacing: 1 },
  resultMain: { color: colors.text, fontWeight: '900', fontSize: 20 },
  err: { color: colors.gold, textAlign: 'center', fontWeight: '700' },
  tally: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  tallyChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tallyText: { fontWeight: '800', fontSize: 12 },

  rulesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  rulesHeadText: { color: colors.textDim, fontWeight: '800', fontSize: 13 },
  rules: { backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  rulesText: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  oddsHead: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 4, marginTop: 4 },
  oddsHeadText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  oddsRow: { flexDirection: 'row', paddingVertical: 3 },
  oddsCell: { flex: 1 },
  oddsText: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 10, height: 10, borderRadius: 5 },

  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 7, alignItems: 'center' },
  tabOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  tabText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  list: { gap: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  place: { color: colors.textDim, fontWeight: '900', width: 18, textAlign: 'center' },
  personName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  personSub: { color: colors.textDim, fontSize: 11 },
  personRight: { color: colors.gold, fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
});
