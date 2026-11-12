// Rüzgâr Gülü (docs/RUZGAR_GULU.md): three tiers, 1 / 10 / 50 spins, a JACKPOT fund per tier, the winners' list,
// today's board and my own spins. The result comes from lib/wheel (the server in live mode); the wheel only turns to
// where it already landed (fx/wheel-stage: pulled back, let go, a tick for every peg, the slice it stops on lit).
// A request of ten or fifty spins is one turn of the wheel: its results count up while it runs, it stops on the
// best of them and a summary says what the whole request did. Every slice pays something, so a spin is only
// celebrated when it paid more than it cost (or won the JACKPOT); the rest lands quietly. Drawn with plain views
// (no SVG): each slice is a border triangle from the hub, the disc clips them round.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { RollingNumber } from '@/components/fx/rolling-number';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { ResultTrail, type TrailItem } from '@/components/games/fx/result-trail';
import { SalonStage, glowNumber } from '@/components/games/fx/salon';
import { SalonArt } from '@/components/games/fx/salon-art';
import { tally } from '@/components/games/fx/spin-plan';
import { RimBulbs, SpinBlur, WheelPointer, useWheelSpin, type WheelSpin as SpinHandle } from '@/components/games/fx/wheel-stage';
import { useWinFx } from '@/components/games/fx/win-fx';
import { BalancePill } from '@/components/games/slot-kit';
import { userById } from '@/data/mock';
import {
  WHEEL_BIG_MILLI,
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
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import type { Entry } from '@/lib/games';
import { loadWheel, playWheel, wheelCost, type WheelSpin, type WheelView } from '@/lib/wheel';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const STEP = 360 / WHEEL_SLICES.length;
const n = (x: number) => x.toLocaleString('tr-TR');
const IDLE = 'Alanını seç, çarkı çevir';
/** How long the wheel turns for a request of that many spins (ms): a longer request counts its results meanwhile. */
const TURN_MS: Record<WheelCount, number> = { 1: 4400, 10: 4800, 50: 5600 };

/** Slice colors by prize: deep navy for the small ones, teal for the middle, gold for the big ones. */
function sliceLook(i: number): { fill: string; ink: string } {
  const m = WHEEL_SLICES[i].milli;
  if (m === null) return { fill: '#C93C4F', ink: '#FFFFFF' };
  if (m >= 100_000) return { fill: '#F6BD60', ink: '#3B2300' };
  if (m >= 10_000) return { fill: '#B7832E', ink: '#FFFFFF' };
  if (m >= 2000) return { fill: '#0A8F95', ink: '#FFFFFF' };
  if (m >= 800) return { fill: '#0E5C78', ink: '#FFFFFF' };
  return { fill: i % 2 ? '#16253C' : '#1F3050', ink: '#C7D2E5' };
}
/** JACKPOT first, then the biggest prize. */
const rank = (s: number) => (isJackpotSlice(s) ? Infinity : (WHEEL_SLICES[s].milli ?? 0));
/** A slice among the last results: marked when it is rare and high, or paid more than the spin cost. */
const trailTone = (s: number): TrailItem['tone'] => (rank(s) >= WHEEL_BIG_MILLI ? 'hot' : rank(s) > 1000 ? 'win' : undefined);

type Tab = 'winners' | 'board' | 'mine';
type Status = { text: string; tone?: 'win' | 'err' };
const ago = (at: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  return m < 1 ? 'şimdi' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.floor(m / 60)} sa önce` : `${Math.floor(m / 1440)} gün önce`;
};

export function WheelPlayer({ entry }: { entry: Entry }) {
  const app = useApp();
  const { wealthLevel, coins, gameCoins, settings } = app;
  const still = settings.reduceMotion;
  const dims = useWindowDimensions();
  const [tier, setTier] = useState<WheelTierId>('kiyi');
  const [view, setView] = useState<WheelView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<WheelCount | null>(null);
  const [status, setStatus] = useState<Status>({ text: IDLE });
  // A request of several spins while the wheel turns: its results count up in the status bar.
  const [counting, setCounting] = useState<{ spin: WheelSpin; ms: number } | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const [summary, setSummary] = useState<WheelSpin | null>(null);
  const [trail, setTrail] = useState<TrailItem[]>([]);
  // While the wheel turns the pill shows the balance with the price taken; the prize joins it when the wheel rests.
  const [held, setHeld] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('winners');
  const [info, setInfo] = useState(false);
  const [width, setWidth] = useState(0);
  // A spin that paid more than it cost sends a shine across the stage.
  const [shine, setShine] = useState(0);
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const spin = useWheelSpin(WHEEL_SLICES.length);
  const win = useWinFx();

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'tick', 'stop', 'coin', 'win']);
    return () => {
      alive.current = false;
    };
  }, []);
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

  const left = Math.max(0, view.dailyLimit - view.playedToday);
  // The wheel takes what the stage's other rows and the controls leave of the phone's height (in a room the panel
  // is a sheet over the lower part), within the stage's width.
  const inner = (width || dims.width - 28) - 20;
  const room = Math.round(entry.from === 'room' ? dims.height * 0.78 - 112 : dims.height - 140);
  const size = Math.max(208, Math.min(272, inner - 48, room - 372));

  const play = async (count: WheelCount) => {
    if (busy) return;
    setBusy(count);
    setSummary(null);
    setStatus({ text: 'Tur başlıyor…' });
    pressHaptic();
    setHeld(Math.max(0, balance.current - wheelCost(tier, count)));
    const r = await playWheel(tier, count, view, { wealthLevel, gameCoins, spendGameCoins: app.spendGameCoins, spendCoins: app.spendCoins, spendBlock: app.spendBlock, addGameCoins: app.addGameCoins });
    if (!alive.current) return;
    if (!r.ok) {
      errorHaptic();
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      setBusy(null);
      return;
    }
    const sp = r.spin;
    // Stop on the JACKPOT if it came, else on the best slice of the request.
    const best = sp.slices.reduce((a, b) => (rank(b) > rank(a) ? b : a), sp.slices[0]);
    // The same request answered again (nothing was taken twice) is shown at once, without the long turn.
    const ms = r.replay ? 900 : TURN_MS[count];
    setLanded(null);
    if (sp.count > 1 && !still && !r.replay) setCounting({ spin: sp, ms });
    else setStatus({ text: 'Çark dönüyor…' });
    await spin.spinTo(best, { ms, turns: r.replay ? 1 : count === 1 ? 4 : 5 });
    if (!alive.current) return;

    setCounting(null);
    setLanded(best);
    setHeld(null);
    setTrail((t) => [...sp.slices.map((s, i) => ({ key: `${sp.id}-${i}`, label: sliceLabel(s), tone: trailTone(s) })).reverse(), ...t].slice(0, 14));
    const again = r.replay ? ' · aynı istek, ikinci kez düşülmedi' : '';
    const gain = sp.payout > sp.cost;
    if (sp.jackpot > 0) setStatus({ text: `JACKPOT! +${n(sp.jackpot)} oyun jetonu${again}`, tone: 'win' });
    else if (sp.count > 1) setStatus({ text: `${sp.count} tur · +${n(sp.payout)} oyun jetonu${again}`, tone: gain ? 'win' : undefined });
    else setStatus({ text: `${sliceLabel(best)} · +${n(sp.payout)} oyun jetonu${again}`, tone: gain ? 'win' : undefined });
    if (sp.jackpot > 0 || gain) setShine((x) => x + 1);
    if (sp.jackpot > 0) await win.celebrate({ amount: sp.payout, bet: sp.cost, jackpot: true });
    else if (gain) await win.celebrate({ amount: sp.payout, bet: sp.cost });
    else if (sp.payout === sp.cost) playSfx('coin', 0.6);
    if (!alive.current) return;
    if (sp.count > 1) setSummary(sp);
    setBusy(null);
    // The fund, the lists and my spins as they are now.
    setReload((x) => x + 1);
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 10 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <SalonStage colors={['#16305A', '#0C3247', '#0A1528']} fill={false} win={shine} inner={w.stage}>
          <View style={w.head}>
            <LinearGradient colors={['#4A1426', '#1B2B4A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={w.jackpot} accessibilityLabel={`JACKPOT ${WHEEL_TIERS[tier].label}, ${n(view.funds[tier])} jeton`}>
              <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={w.jackpotGloss} />
              <Ionicons name="trophy" size={20} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={w.jackpotLabel} numberOfLines={1}>
                  JACKPOT · {WHEEL_TIERS[tier].label}
                </Text>
                <RollingNumber value={view.funds[tier]} style={[w.jackpotValue, glowNumber]} duration={900} numberOfLines={1} />
              </View>
            </LinearGradient>
            <InfoButton onPress={() => setInfo(true)} tint={colors.gold} />
          </View>

          <Wheel tier={tier} size={size} spin={spin} landed={landed} />

          <View style={[w.status, status.tone === 'win' && w.statusWin]} accessibilityLiveRegion="polite">
            {counting ? (
              <Counting spin={counting.spin} ms={counting.ms} />
            ) : (
              <Text style={[w.statusText, status.tone === 'err' && w.statusErr]} numberOfLines={2}>
                {status.text}
              </Text>
            )}
          </View>
          <View style={{ alignSelf: 'stretch' }}>
            <ResultTrail items={trail} />
          </View>
          {summary && <Summary spin={summary} onClose={() => setSummary(null)} />}
          {win.layer}
        </SalonStage>

        <View style={w.tiers} accessibilityRole="tablist">
          {WHEEL_TIER_IDS.map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                if (busy || t === tier) return;
                tapHaptic();
                playSfx('tap', 0.6);
                setTier(t);
                setSummary(null);
                setStatus({ text: IDLE });
              }}
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
        <View style={w.counts}>
          {WHEEL_COUNTS.map((c) => {
            const cost = wheelCost(tier, c);
            const on = busy === c;
            const ink = c === 50 ? '#FFFFFF' : c === 1 ? semantic.actionInk : semantic.moneyInk;
            return (
              <Pressable
                key={c}
                onPress={() => play(c)}
                disabled={!!busy}
                style={({ pressed }) => [w.countWrap, (pressed || on) && { transform: [{ scale: 0.97 }] }, busy && !on && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`${c} kez çevir, ${n(cost)} jeton`}
              >
                <LinearGradient colors={c === 1 ? ['#6FF1F5', '#0FB8BE'] : c === 10 ? ['#FFD98A', '#F2A93B'] : ['#FF8E9A', '#C93C4F']} style={w.count}>
                  <Text style={[w.countX, { color: ink }]}>{on ? 'Dönüyor…' : `Çevir ×${c}`}</Text>
                  <Text style={[w.countCost, { color: ink }]}>{n(cost)}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
        <View style={w.wallet}>
          <BalancePill shown={held} />
          <Text style={w.left}>
            Bugün kalan{'\n'}
            <Text style={{ color: colors.text, fontWeight: '800' }}>{n(left)}</Text>
          </Text>
        </View>
      </View>

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

      <GameInfoSheet
        visible={info}
        onClose={() => setInfo(false)}
        title="Rüzgâr Gülü"
        rules={`Bir alan seç (Klasik, Yüksek, Zirve) ve çarkı 1, 10 ya da 50 kez çevir. Çarkta 12 dilim var ve her dilim bir şey öder; dilimler aynı boyda çizilir ama şansları farklıdır. 10 ve 50 turda çark bir kez döner, en iyi dilimde durur ve bütün turların özeti gösterilir. Sonucu sunucu belirler, çark yalnızca sonucu gösterir.`}
      >
        <Odds tier={tier} />
        <View style={{ gap: 5 }}>
          <Text style={r.head}>JACKPOT ve sınırlar</Text>
          <Text style={r.note}>
            {"Her turun %1,5'i o alanın fonuna eklenir; JACKPOT dilimine gelen fonun tamamını alır. Oynanan her 100 jetonun ortalama 40'ı kazanç olarak döner. Tur ücreti önce oyun jetonundan düşer."} Cömertlik Lv.{WHEEL_NEED_LEVEL} ve üstü için açıktır; günlük üst sınır {n(view.dailyLimit)} jeton, bugün kalan {n(left)}.
            {entry.from === 'room' ? ' Oyun açıkken mikrofonun ve koltuğun aynen kalır.' : ''}
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

/** The disc's slices for a tier. Drawn once per tier and size; only its parent turns. */
const Disc = memo(function Disc({ tier, size }: { tier: WheelTierId; size: number }) {
  const r = size / 2;
  // Half the base of a slice triangle whose height is the radius (the disc clips the corners round).
  const half = Math.ceil(r * Math.tan(((STEP / 2) * Math.PI) / 180)) + 1;
  return (
    <>
      {WHEEL_SLICES.map((_, i) => {
        const look = sliceLook(i);
        const prize = prizeOf(tier, i);
        return (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * STEP}deg` }] }]} pointerEvents="none">
            <View style={[w.wedge, { left: r - half, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: r, borderTopColor: look.fill }]} />
            <View style={[w.labelBox, { left: r - 34 }]}>
              {isJackpotSlice(i) ? (
                <Ionicons name="trophy" size={18} color={look.ink} />
              ) : (
                <Text style={[w.sliceText, { color: look.ink }, prize >= 100_000 && { fontSize: 10.5 }]} numberOfLines={1}>
                  {n(prize)}
                </Text>
              )}
              <Text style={[w.sliceSub, { color: look.ink }]} numberOfLines={1}>
                {sliceLabel(i)}
              </Text>
            </View>
          </View>
        );
      })}
      {WHEEL_SLICES.map((_, i) => (
        <View key={i} style={[w.pegArm, { left: r - 4, height: size, transform: [{ rotate: `${(i + 0.5) * STEP}deg` }] }]} pointerEvents="none">
          <View style={w.peg} />
        </View>
      ))}
    </>
  );
});

function Wheel({ tier, size, spin, landed }: { tier: WheelTierId; size: number; spin: SpinHandle; /** The slice the wheel rests on, lit. */ landed: number | null }) {
  const rim = size + 28;
  const r = size / 2;
  const half = Math.ceil(r * Math.tan(((STEP / 2) * Math.PI) / 180)) + 1;
  return (
    <View style={{ width: rim, height: rim + 12, alignItems: 'center' }} accessibilityLabel={landed === null ? 'Rüzgâr Gülü çarkı' : `Rüzgâr Gülü çarkı, ${sliceLabel(landed)} diliminde`}>
      <View style={[w.rim, { marginTop: 12, width: rim, height: rim, borderRadius: rim / 2 }]}>
        <RimBulbs spin={spin} size={rim - 6} count={24} />
        <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: '#16253C' }}>
          <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin.rotate }] }}>
            <Disc tier={tier} size={size} />
            {landed !== null && (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.shine, transform: [{ rotate: `${landed * STEP}deg` }] }]} pointerEvents="none">
                <View style={[w.wedge, { left: r - half, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: r, borderTopColor: 'rgba(255,255,255,0.38)' }]} />
              </Animated.View>
            )}
          </Animated.View>
          <SpinBlur spin={spin} size={size} band={46} tint="rgba(22,37,60,0.5)" />
        </View>
        <LinearGradient colors={['#2A4470', '#080F1E']} style={[w.hub, { left: (rim - 6) / 2 - 33, top: (rim - 6) / 2 - 33 }]}>
          <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={w.hubGloss} />
          <SalonArt name="ruzgar-merkez" size={60} fallback={<Ionicons name="compass" size={34} color={colors.gold} />} />
        </LinearGradient>
      </View>
      <View style={{ position: 'absolute', top: -14, left: rim / 2 - 15 }}>
        <WheelPointer spin={spin} size={30} />
      </View>
    </View>
  );
}

/** A request of several spins while the wheel turns: its spins and what they have paid so far, counting up. */
function Counting({ spin, ms }: { spin: WheelSpin; ms: number }) {
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    const count = spin.slices.length;
    // The results come in between the launch and the last slow turn, evenly.
    const every = Math.max(40, (ms * 0.7) / count);
    const t0 = Date.now() + ms * 0.1;
    let last = 0;
    const t = setInterval(() => {
      const k = Math.max(0, Math.min(count, Math.floor((Date.now() - t0) / every)));
      if (k === last) return;
      // A spin that paid more than it cost is heard as it comes in.
      if (spin.slices.slice(last, k).some((s) => rank(s) >= 2000)) playSfx('coin', 0.45);
      last = k;
      setSeen(k);
      if (k >= count) clearInterval(t);
    }, every);
    return () => clearInterval(t);
  }, [spin, ms]);
  const sum = spin.wins.slice(0, seen).reduce((a, b) => a + b, 0);
  return (
    <Text style={w.statusText} numberOfLines={1}>
      Tur {seen}/{spin.slices.length} · +{n(sum)}
    </Text>
  );
}

/** What a request of several spins did: what it paid against what it cost, and how often each slice came. */
function Summary({ spin, onClose }: { spin: WheelSpin; onClose: () => void }) {
  const net = spin.payout - spin.cost;
  const rows = tally(spin.slices, rank);
  return (
    <Pressable style={w.summary} onPress={onClose} accessibilityRole="button" accessibilityLabel={`${spin.count} tur özeti: ${spin.payout} oyun jetonu kazanıldı, ${spin.cost} jeton harcandı. Kapatmak için dokun`}>
      <View style={w.summaryHead}>
        <Text style={w.summaryTitle}>
          {spin.count} TUR ÖZETİ · {WHEEL_TIERS[spin.tier].label}
        </Text>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
      </View>
      <Text style={[w.summaryMain, net > 0 && { color: '#86EFAC' }]}>+{n(spin.payout)}</Text>
      <Text style={w.summarySub}>
        Harcanan {n(spin.cost)} · Net {net > 0 ? '+' : ''}
        {n(net)}
        {spin.jackpot > 0 ? ` · JACKPOT ${n(spin.jackpot)}` : ''}
      </Text>
      <View style={w.tally}>
        {rows.map(({ item, times }) => (
          <View key={item} style={[w.tallyChip, { backgroundColor: sliceLook(item).fill }]}>
            <Text style={[w.tallyText, { color: sliceLook(item).ink }]}>
              {sliceLabel(item)}
              {times > 1 ? ` · ${times}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** The "?" sheet's table: what each slice pays in this tier and how often it comes. */
function Odds({ tier }: { tier: WheelTierId }) {
  const order = WHEEL_SLICES.map((_, i) => i).sort((a, b) => rank(b) - rank(a));
  return (
    <View style={{ gap: 4 }}>
      <Text style={r.head}>Dilimler · {WHEEL_TIERS[tier].label}</Text>
      <View style={r.row}>
        <Text style={[r.cell, r.dim]}>Dilim</Text>
        <Text style={[r.cell, r.dim, r.right]}>Kazanç</Text>
        <Text style={[r.cell, r.dim, r.right]}>Şans</Text>
      </View>
      {order.map((i) => (
        <View key={i} style={r.row}>
          <View style={[r.cell, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <View style={[r.dot, { backgroundColor: sliceLook(i).fill }]} />
            <Text style={r.text}>{sliceLabel(i)}</Text>
          </View>
          <Text style={[r.cell, r.text, r.right]}>{isJackpotSlice(i) ? 'Fonun tamamı' : n(prizeOf(tier, i))}</Text>
          <Text style={[r.cell, r.text, r.right]}>{sliceChance(i)}</Text>
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

  stage: { alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6 },
  jackpot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1.5, borderColor: 'rgba(255,101,118,0.55)', overflow: 'hidden', boxShadow: '0 6px 14px rgba(0,0,0,0.4)' },
  jackpotGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  jackpotLabel: { color: '#FFB3BC', fontWeight: '900', fontSize: 11, letterSpacing: 1.4 },
  jackpotValue: { fontSize: 24, lineHeight: 28, letterSpacing: 0.5 },

  rim: { backgroundColor: '#3B2300', borderWidth: 3, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 24px rgba(246,189,96,0.25)' },
  wedge: { position: 'absolute', top: 0, width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  labelBox: { position: 'absolute', top: 12, width: 68, alignItems: 'center' },
  sliceText: { fontWeight: '900', fontSize: 12, fontVariant: ['tabular-nums'] },
  sliceSub: { fontWeight: '700', fontSize: 9, opacity: 0.85 },
  pegArm: { position: 'absolute', top: 0, width: 8, alignItems: 'center' },
  peg: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: '#FFE7B0' },
  hub: { position: 'absolute', width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.gold, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.6), 0 0 14px rgba(246,189,96,0.35)' },
  hubGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },

  status: { alignSelf: 'stretch', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(246,189,96,0.55)', backgroundColor: 'rgba(4,9,20,0.55)', paddingVertical: 6, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  statusWin: { backgroundColor: 'rgba(246,189,96,0.2)', borderColor: '#F6BD60', boxShadow: '0 0 14px rgba(246,189,96,0.4)' },
  statusText: { color: '#FFE7B0', fontWeight: '900', fontSize: 14, textAlign: 'center', letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  statusErr: { fontSize: 12, fontWeight: '700', letterSpacing: 0, color: '#FFFFFF' },

  summary: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 16, padding: 12, gap: 2, backgroundColor: 'rgba(8,15,30,0.96)', borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', boxShadow: '0 -6px 24px rgba(0,0,0,0.5)' },
  summaryHead: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between' },
  summaryTitle: { color: '#FFE7B0', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  summaryMain: { color: colors.text, fontWeight: '900', fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] },
  summarySub: { color: colors.textDim, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tally: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 6 },
  tallyChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tallyText: { fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },

  tiers: { flexDirection: 'row', gap: 6, backgroundColor: colors.bg, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.border },
  tier: { flex: 1, borderRadius: 12, paddingVertical: 6, alignItems: 'center', gap: 1 },
  tierOn: { backgroundColor: semantic.money },
  tierName: { color: colors.text, fontWeight: '900', fontSize: 13 },
  tierPrice: { color: colors.textDim, fontWeight: '800', fontSize: 11 },
  counts: { flexDirection: 'row', gap: 8 },
  countWrap: { flex: 1 },
  count: { borderRadius: 16, paddingVertical: 8, alignItems: 'center' },
  countX: { fontWeight: '900', fontSize: 16 },
  countCost: { fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  left: { color: colors.textDim, fontSize: 11, lineHeight: 15, textAlign: 'right', fontVariant: ['tabular-nums'] },

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

const r = StyleSheet.create({
  head: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  cell: { flex: 1 },
  right: { textAlign: 'right' },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' },
  text: { color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  note: { color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 21 },
});
