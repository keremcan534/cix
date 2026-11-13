// Pachinko: the marble board (lib/bilye). Pick the launch strength and the stake, then launch. Where the ball
// ends is drawn by playRound before anything moves (the server in a live build); the ball then flies a real path of
// the board's simulation into that target (lib/bilye/path): up the channel, over the rail, bouncing off the pegs
// into a pocket or a cup. Oto launches again and stops at the loss limit or any refusal. No tilt or shake control.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { ResultTrail, pushTrail, type TrailItem } from '@/components/games/fx/result-trail';
import { ChoiceChip, SALON, SalonStage, SideButton, StageHeader, StageStatus, WideAction, choiceInk, salonScreen, tabular, useBox, wideInk, type StatusTone } from '@/components/games/fx/salon';
import { salonArt, type SalonArtName } from '@/components/games/fx/salon-art';
import { useWinFx } from '@/components/games/fx/win-fx';
import { WalletRow, fmt, sleep } from '@/components/games/slot-kit';
import { BALL_R, CUPS, CUP_DEPTH, FIELD, HEIGHT, LANES, LANE_NAME, PEGS, POCKETS, POCKET_W, POCKET_Y, RAIL_Y, TARGETS, WIDTH, type Lane } from '@/lib/bilye/board';
import { CHANNEL_X, bilyePath, launchX, type BilyePath } from '@/lib/bilye/path';
import { FRAME_MS } from '@/lib/bilye/physics';
import { bilyeChances, multText } from '@/lib/bilye/rules';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { playRound } from '@/lib/live/casino';
import { winTierOf } from '@/lib/win-tier';
import { useApp, useSettings } from '@/store';

const AUTO_LAUNCHES = 10;
/** Oto stops when the net loss reaches this many stakes. */
const AUTO_LOSS = 20;
const CUP_TINT: Record<string, [string, string]> = { yakut: ['#FF8E9A', '#9F1239'], altin: ['#FFE7B0', '#B7832E'], zumrut: ['#6EE7B7', '#047857'] };
// The board's pictures once delivered (fx/salon-art): drawn instead of the code shapes, which stay as the fallback.
const CUP_ART: Record<string, SalonArtName> = { yakut: 'bilye-kupa-yakut', altin: 'bilye-kupa-altin', zumrut: 'bilye-kupa-zumrut' };
const BALL_ART = salonArt('bilye-top');
const BOARD_ART = salonArt('bilye-tahta');
/** The ball: its picture, or a lit silver sphere. */
function Ball({ d }: { d: number }) {
  if (BALL_ART !== undefined) return <Image source={BALL_ART} style={{ width: d, height: d }} />;
  return (
    <>
      <LinearGradient colors={['#FFFFFF', '#CBD5E1', '#64748B']} start={{ x: 0.25, y: 0.15 }} end={{ x: 0.85, y: 0.95 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: d * 0.22, top: d * 0.16, width: d * 0.3, height: d * 0.22, borderRadius: d, backgroundColor: 'rgba(255,255,255,0.85)' }} />
    </>
  );
}
const LANE_ICON: Record<Lane, keyof typeof Ionicons.glyphMap> = { hafif: 'arrow-up', orta: 'arrow-up-circle', guclu: 'rocket' };
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));
const percent = (p: number) => `%${(p * 100).toLocaleString('tr-TR', { maximumFractionDigits: p < 0.01 ? 2 : 1 })}`;

/** The pegs, cups, pockets, rails and channel: drawn once per size, nothing in them moves. */
const BoardArt = memo(function BoardArt({ k }: { k: number }) {
  return (
    <>
      {/* The launch channel and the rail over the top. */}
      <View style={[b.channel, { left: FIELD * k, width: (WIDTH - FIELD) * k, height: HEIGHT * k }]} />
      <View style={[b.rail, { left: 6 * k, top: (RAIL_Y - BALL_R - 5) * k, width: (WIDTH - 12) * k, height: 3 * k }]} />
      {/* The pockets' floor and what each pays. */}
      {Array.from({ length: POCKETS }, (_, p) => {
        const m = TARGETS[p].mult;
        return (
          <View key={p} style={[b.pocket, m ? b.pocketPays : null, { left: p * POCKET_W * k, top: (POCKET_Y - 46) * k, width: POCKET_W * k, height: (HEIGHT - POCKET_Y + 46) * k }]}>
            <Text style={[b.pocketText, { fontSize: Math.max(9, 10.5 * k) }, !m && { opacity: 0.4 }]} numberOfLines={1}>
              {m ? multText(m) : '—'}
            </Text>
          </View>
        );
      })}
      {PEGS.map((p, i) => (
        <View key={i} style={[p.post ? b.post : b.peg, { left: (p.x - p.r) * k, top: (p.y - p.r) * k, width: p.r * 2 * k, height: p.r * 2 * k, borderRadius: p.r * k }]} />
      ))}
      {CUPS.map((c) => (
        <View key={c.id} style={{ position: 'absolute', left: (c.x - c.w / 2 - 6) * k, top: (c.y - 2) * k, width: (c.w + 12) * k, alignItems: 'center' }} pointerEvents="none">
          {salonArt(CUP_ART[c.id]) !== undefined ? (
            <Image source={salonArt(CUP_ART[c.id])} style={{ width: (c.w + 8) * k, height: (CUP_DEPTH + 9) * k }} resizeMode="contain" />
          ) : (
            <LinearGradient colors={CUP_TINT[c.id]} style={[b.cup, { width: (c.w + 4) * k, height: (CUP_DEPTH + 5) * k, borderBottomLeftRadius: 8 * k, borderBottomRightRadius: 8 * k }]}>
              <View style={[b.cupGloss, { borderBottomLeftRadius: 6 * k }]} />
            </LinearGradient>
          )}
          <Text style={[b.cupText, { fontSize: Math.max(9, 10 * k) }]}>{multText(c.mult)}</Text>
        </View>
      ))}
    </>
  );
});

export function BilyePlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, coins, gameCoins } = useApp();
  const settings = useSettings();
  const calm = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'bilye')!;
  const [bet, setBet] = useState(game.bets[0]);
  const [lane, setLane] = useState<Lane>('orta');
  // The board takes the stage's free height and keeps its shape within it.
  const area = useBox();
  const [shine, setShine] = useState(0);
  const [path, setPath] = useState<BilyePath | null>(null);
  const [lit, setLit] = useState<number[]>([]);
  const [landed, setLanded] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; tone?: StatusTone; amount?: number; label?: string }>({ text: 'Atış gücünü seç, bilyeyi fırlat' });
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const [t] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const win = useWinFx();
  const alive = useRef(true);
  const busy = useRef(false);
  const stopAuto = useRef(false);
  const balance = useRef(coins + gameCoins);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rounds = useRef(0);

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['launch', 'tick', 'coin', 'win', 'stop']);
    const pending = timers.current;
    return () => {
      alive.current = false;
      stopAuto.current = true;
      pending.forEach(clearTimeout);
    };
  }, []);

  // The board keeps its shape: as big as the area allows.
  const k = area.w && area.h ? Math.min(area.w / WIDTH, area.h / HEIGHT) : 0;
  const ball = useMemo(() => {
    if (!path) return null;
    const n = path.points.length / 2;
    const input = Array.from({ length: n }, (_, i) => i);
    const xs = input.map((i) => (path.points[i * 2] - BALL_R) * k);
    const ys = input.map((i) => (path.points[i * 2 + 1] - BALL_R) * k);
    return { n, x: t.interpolate({ inputRange: input, outputRange: xs }), y: t.interpolate({ inputRange: input, outputRange: ys }) };
  }, [path, k, t]);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  /** One launch; resolves with the net (payout − stake), or null when it was refused. */
  const launch = async (): Promise<number | null> => {
    if (busy.current || !k) return null;
    busy.current = true;
    setLanded(null);
    setLit([]);
    setHeld(balance.current - bet);
    setStatus({ text: `${LANE_NAME[lane]} atış…` });
    const r = await playRound('bilye', bet, lane, entry);
    if (!alive.current) return null;
    if (!r.ok) {
      busy.current = false;
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    pressHaptic();
    const round = r.outcome.bilye!;
    const p = bilyePath(round);
    const payout = r.row.payout;
    const id = ++rounds.current;
    t.setValue(calm ? p.points.length / 2 - 1 : 0);
    setPath(p);
    if (!calm) {
      playSfx('launch', 0.6);
      for (const h of p.hits) {
        timers.current.push(
          setTimeout(() => {
            if (!alive.current) return;
            setLit((l) => [...l.slice(-5), h.peg]);
            if (!PEGS[h.peg].post) playSfx('tick', 0.22);
          }, h.frame * FRAME_MS),
        );
      }
      await run(Animated.timing(t, { toValue: p.points.length / 2 - 1, duration: (p.points.length / 2 - 1) * FRAME_MS, easing: Easing.linear, useNativeDriver: true }));
      if (!alive.current) return null;
    }
    // In the target: it glows, and the round is on screen (the balance may show it).
    setLit([]);
    setLanded(round.target);
    glow.setValue(0);
    if (!calm) Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.timing(glow, { toValue: 0.55, duration: 420, useNativeDriver: true })]).start();
    else glow.setValue(0.55);
    setHeld(null);
    busy.current = false;
    const target = TARGETS[round.target];
    setTrail((tr) => pushTrail(tr, { key: `b${id}`, label: target.mult ? multText(target.mult) : '—', tone: payout > bet ? 'win' : target.kind === 'cup' ? 'hot' : undefined }));
    if (payout > bet) {
      playSfx('coin', 0.8);
      setStatus({ text: `${target.name} · +${fmt(payout)}`, tone: 'win', amount: payout, label: target.name.toLocaleUpperCase('tr-TR') });
      setShine((x) => x + 1);
      if (winTierOf(payout, bet)) await win.celebrate({ amount: payout, bet });
    } else if (payout > 0) {
      playSfx('stop', 0.4);
      setStatus({ text: `${target.name} · ÖDEME ${fmt(payout)}` });
    } else {
      playSfx('stop', 0.3);
      setStatus({ text: `${target.name} · boş` });
    }
    return payout - bet;
  };

  const play = () => {
    tapHaptic();
    void launch();
  };
  const toggleAuto = async () => {
    if (auto !== null) {
      stopAuto.current = true;
      return;
    }
    stopAuto.current = false;
    let net = 0;
    for (let left = AUTO_LAUNCHES; left > 0 && !stopAuto.current && alive.current; left--) {
      setAuto(left);
      const d = await launch();
      if (d === null) break;
      net += d;
      if (-net >= bet * AUTO_LOSS) {
        setStatus({ text: `Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)} jeton)` });
        break;
      }
      await sleep(calm ? 500 : 700);
    }
    if (alive.current) setAuto(null);
  };

  const target = landed !== null ? TARGETS[landed] : null;
  const boardW = WIDTH * k;
  const boardH = HEIGHT * k;
  const chances = LANES.map((l) => bilyeChances(l));

  return (
    <View style={salonScreen}>
      <SalonStage colors={['#1E3366', '#111E44', '#081128']} win={shine} minHeight={330}>
        <StageHeader title="PACHINKO" kicker="ÇİVİLER · CEPLER · KUPALAR" onInfo={() => setInfo(true)} />
        <View style={s.area} onLayout={area.onLayout}>
        {k > 0 && (
          <View style={[s.board, { width: boardW, height: boardH }]} accessibilityLabel={target ? `Bilye ${target.name} içinde` : 'Bilye tahtası'}>
            {BOARD_ART !== undefined && <Image source={BOARD_ART} style={StyleSheet.absoluteFill} resizeMode="stretch" />}
            <BoardArt k={k} />
            {/* Where a ball of the chosen strength comes over the rail. */}
            <View style={[s.aim, { left: (launchX(lane) - 6) * k, top: (RAIL_Y + BALL_R) * k }]} pointerEvents="none">
              <Ionicons name="caret-down" size={Math.max(10, 12 * k)} color="#FDE68A" />
            </View>
            {lit.map((i, n) => {
              const p = PEGS[i];
              const r = p.r * 2.4;
              return <View key={`${i}-${n}`} style={[s.spark, { left: (p.x - r) * k, top: (p.y - r) * k, width: r * 2 * k, height: r * 2 * k, borderRadius: r * k }]} pointerEvents="none" />;
            })}
            {target && (
              <Animated.View
                pointerEvents="none"
                style={[
                  s.hit,
                  target.kind === 'cup' ? { left: (target.x - 14) * k, top: (target.y - 16) * k, width: 28 * k, height: 26 * k, borderRadius: 12 * k } : { left: (landed! * POCKET_W + 1) * k, top: (POCKET_Y - 46) * k, width: (POCKET_W - 2) * k, height: (HEIGHT - POCKET_Y + 46) * k, borderRadius: 6 * k },
                  { opacity: glow },
                ]}
              />
            )}
            {ball ? (
              <Animated.View style={[s.ball, { width: BALL_R * 2 * k, height: BALL_R * 2 * k, borderRadius: BALL_R * k, transform: [{ translateX: ball.x }, { translateY: ball.y }] }]} pointerEvents="none">
                <Ball d={BALL_R * 2 * k} />
              </Animated.View>
            ) : (
              <View style={[s.ball, { width: BALL_R * 2 * k, height: BALL_R * 2 * k, borderRadius: BALL_R * k, left: (CHANNEL_X - BALL_R) * k, top: (HEIGHT - BALL_R * 2 - 6) * k }]} pointerEvents="none">
                <Ball d={BALL_R * 2 * k} />
              </View>
            )}
          </View>
        )}
        </View>
        <StageStatus text={status.text} tone={status.tone} amount={status.amount} label={status.label} />
        <ResultTrail items={trail} empty="Son atışlar burada görünür" />
        {win.layer}
      </SalonStage>

      <View style={s.lanes} accessibilityRole="radiogroup" accessibilityLabel="Atış gücü">
        {LANES.map((l) => (
          <ChoiceChip
            key={l}
            on={lane === l}
            onPress={() => {
              tapHaptic();
              setLane(l);
            }}
            disabled={auto !== null}
            style={{ flex: 1 }}
            label={`${LANE_NAME[l]} atış`}
          >
            <Ionicons name={LANE_ICON[l]} size={16} color={lane === l ? SALON.goldInk : SALON.win} />
            <Text style={[s.laneText, choiceInk(lane === l)]}>{LANE_NAME[l]}</Text>
          </ChoiceChip>
        ))}
      </View>
      <WalletRow held={held} bets={game.bets} bet={bet} onBet={setBet} disabled={auto !== null} />
      <View style={s.row}>
        <SideButton onPress={() => void toggleAuto()} on={auto !== null} icon={auto !== null ? 'stop' : 'repeat'} pic={salonArt(auto !== null ? 'dugme-oto-acik' : 'dugme-oto')} label={auto !== null ? `DUR · ${auto}` : 'OTO'} a11y={auto !== null ? 'Otomatik atışı durdur' : `${AUTO_LAUNCHES} kez otomatik fırlat`} style={{ flex: 0, minWidth: 96 }} />
        <WideAction onPress={play} disabled={auto !== null} label={`Fırlat, ${LANE_NAME[lane]} atış, ${bet} jeton`} style={{ flex: 1 }}>
          <Ionicons name="radio-button-on" size={20} color={SALON.goldInk} />
          <Text style={[tabular, s.goText, wideInk()]}>Fırlat · {fmt(bet)}</Text>
        </WideAction>
      </View>

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={{ gap: 6 }}>
          <Text style={s.infoHead}>Düşme şansı · atış gücüne göre</Text>
          <View style={s.infoRow}>
            <Text style={[s.infoName, { fontWeight: '900' }]}>Hedef</Text>
            {LANES.map((l) => (
              <Text key={l} style={[s.infoVal, { fontWeight: '900' }]}>
                {LANE_NAME[l]}
              </Text>
            ))}
          </View>
          {TARGETS.map((x, i) => ({ x, i }))
            .filter(({ x }) => x.mult > 0)
            .sort((a, z) => z.x.mult - a.x.mult)
            .map(({ x, i }) => (
              <View key={i} style={s.infoRow}>
                <Text style={s.infoName} numberOfLines={1}>
                  {x.name} · {multText(x.mult)}
                </Text>
                {chances.map((c, j) => (
                  <Text key={j} style={s.infoVal}>
                    {percent(c[i])}
                  </Text>
                ))}
              </View>
            ))}
          <Text style={s.infoNote}>Kalan atışlar ödemesiz ceplere düşer. Bir atışta en çok bahsin 20 katı kazanılır.</Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

const b = StyleSheet.create({
  channel: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.05)', borderLeftWidth: 1, borderColor: 'rgba(246,189,96,0.3)', borderTopRightRadius: 14 },
  rail: { position: 'absolute', backgroundColor: 'rgba(246,189,96,0.6)', borderRadius: 2, boxShadow: '0 0 6px rgba(246,189,96,0.4)' },
  pocket: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3, backgroundColor: 'rgba(255,255,255,0.03)', borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  pocketPays: { backgroundColor: 'rgba(246,189,96,0.1)' },
  pocketText: { color: '#FFE08A', fontWeight: '900', fontVariant: ['tabular-nums'] },
  // A brass peg head: bright on top, a dark rim, a soft shadow.
  peg: { position: 'absolute', backgroundColor: '#F2D27A', borderWidth: 0.5, borderColor: '#7C5E10', boxShadow: '0 1px 2px rgba(0,0,0,0.6)' },
  post: { position: 'absolute', backgroundColor: '#A7B4C8', boxShadow: '0 1px 2px rgba(0,0,0,0.6)' },
  cup: { borderWidth: 1.5, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', boxShadow: '0 3px 6px rgba(0,0,0,0.5)' },
  cupGloss: { position: 'absolute', left: 2, top: 0, bottom: 2, width: '30%', backgroundColor: 'rgba(255,255,255,0.35)' },
  cupText: { color: '#fff', fontWeight: '900', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, fontVariant: ['tabular-nums'] },
});

const s = StyleSheet.create({
  // The board takes the stage's free height and sits in its middle.
  area: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  board: { borderRadius: 12, backgroundColor: 'rgba(4,9,22,0.45)', boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.6)' },
  aim: { position: 'absolute' },
  spark: { position: 'absolute', backgroundColor: 'rgba(255,224,138,0.6)', boxShadow: '0 0 8px rgba(255,224,138,0.8)' },
  hit: { position: 'absolute', borderWidth: 2, borderColor: '#FFE08A', backgroundColor: 'rgba(255,224,138,0.25)', boxShadow: '0 0 14px rgba(255,224,138,0.75)' },
  ball: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.65)' },
  lanes: { flexDirection: 'row', gap: 8 },
  laneText: { fontWeight: '900', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SALON.row },
  goText: { fontSize: 18 },
  infoHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoName: { flex: 1.6, color: '#fff', fontSize: 13, fontWeight: '700' },
  infoVal: { flex: 1, color: '#E2E8F0', fontSize: 13, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  infoNote: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17, marginTop: 4 },
});
