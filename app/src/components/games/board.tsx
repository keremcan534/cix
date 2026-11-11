// Screen for the bet boards (lib/board-games): Gece Yarısı Çarkı's fruit wheel, Liman Pazarı and Sihir Destesi. Pick
// a chip, tap options to put it on them (several options a round), then play: playBoardRound draws one result and
// settles every bet before anything moves; the wheel, the running light and the card only show that result.
// Tekrar plays the last round's bets again. Every option returns at most 40 % on its own (house rule).
//
// What moves is native-driven and changes no state while it runs: the wheel (fx/wheel-stage), the light (one value
// over the options' brightness, fx/spin-plan), the chips and coins in the air (fx/flights). A lost round is quiet;
// a paid one sends its coins to the balance, and only a round that paid more than it cost is celebrated (fx/win-fx).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, useWindowDimensions, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';

import { Shine } from '@/components/fx/surface';
import { CasinoLock } from '@/components/games/casino';
import { BetStack, TrayChip, chipLook } from '@/components/games/fx/chips';
import { firstCoinAt, useFlights } from '@/components/games/fx/flights';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { ResultTrail, pushTrail, type TrailItem } from '@/components/games/fx/result-trail';
import { chipOf, isHotResult, litRange, optionShare, percentText, planLight, resultShare, shortCoins } from '@/components/games/fx/spin-plan';
import { RimBulbs, SpinBlur, WheelPointer, useWheelSpin, type WheelSpin } from '@/components/games/fx/wheel-stage';
import { useWinFx } from '@/components/games/fx/win-fx';
import { BalancePill, fmt, sleep } from '@/components/games/slot-kit';
import { Text } from '@/components/text';
import { BOARDS, LUCKY_WHEEL, type Board, type BoardOption, type BoardResult } from '@/lib/board-games';
import type { BoardId } from '@/lib/casino-odds';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { playBoardRound } from '@/lib/live/casino';
import { useApp } from '@/store';

const GLOW = require('../../../assets/fx/glow.png');
const SLICE = 360 / LUCKY_WHEEL.length;
/** How long a chip is in the air from the tray to its option (ms). */
const CHIP_MS = 230;
const COINS_MS = 660;

type Look = {
  title: string;
  colors: [string, string, string];
  /** The stage's fine lines: its buttons' rims and the status bar's border. */
  frame: string;
  ink: string;
  /** Under the title, and the status bar's fill. */
  deep: string;
  halo: string;
  play: [string, string];
  verb: string;
  hint: string;
  running: string;
};
const LOOKS: Record<BoardId, Look> = {
  slot: { title: 'Gece Yarısı Çarkı', colors: ['#2B1065', '#4C1D95', '#1E0B45'], frame: '#FACC15', ink: '#FDE68A', deep: '#1E0B45', halo: '#A78BFA', play: ['#C026D3', '#7E22CE'], verb: 'Çevir', hint: 'Fişini seç, meyvene koy', running: 'Çark dönüyor…' },
  foodwheel: { title: 'Liman Pazarı', colors: ['#4C1D95', '#7E22CE', '#312E81'], frame: '#F0ABFC', ink: '#FDE68A', deep: '#3B0764', halo: '#F0ABFC', play: ['#DB2777', '#9D174D'], verb: 'Çevir', hint: 'Fişini seç, yemeğine koy', running: 'Işık dolaşıyor…' },
  magiccard: { title: 'Sihir Destesi', colors: ['#3B0764', '#581C87', '#1E1B4B'], frame: '#FACC15', ink: '#FDE68A', deep: '#1E1B4B', halo: '#C084FC', play: ['#A16207', '#713F12'], verb: 'Kartı aç', hint: 'Fişini seç, kartına koy', running: 'Kart çekiliyor…' },
};

/** Each option's own color: its card's rim and its slices on the wheel. Liman's greens win with Salata, its reds with Pizza. */
const ACCENT: Record<string, string> = {
  melon: '#4ADE80',
  seven: '#FACC15',
  apple: '#FB7185',
  crab: '#FB7185',
  fish: '#FB7185',
  shrimp: '#FB7185',
  steak: '#FB7185',
  tomato: '#4ADE80',
  pumpkin: '#4ADE80',
  mushroom: '#4ADE80',
  cabbage: '#4ADE80',
};
/** The order the light travels in: round the ring for Liman, round the two rows of cards for Sihir. */
const RING: Record<Exclude<BoardId, 'slot'>, string[]> = {
  foodwheel: BOARDS.foodwheel.options.map((o) => o.id),
  magiccard: [0, 1, 2, 3, 7, 6, 5, 4].map((i) => BOARDS.magiccard.options[i].id),
};
/** The fruit wheel's slices by what lands on them: the three you can bet on in their own color, the rest dark. */
const SLICE_FILL: Record<string, [string, string]> = {
  seven: ['#FBBF24', '#FBBF24'],
  apple: ['#BE123C', '#BE123C'],
  melon: ['#15803D', '#15803D'],
  lemon: ['#1E3A8A', '#172554'],
  grape: ['#1E3A8A', '#172554'],
};
/** One of the wheel's slices that show `result` (several do; which one it stops on is only for show). */
const sliceFor = (result: string) => {
  const slices = LUCKY_WHEEL.flatMap((x, i) => (x === result ? [i] : []));
  return slices[Math.floor(Math.random() * slices.length)];
};
/** A zodiac sign as a plain glyph in the card's own ink where the phone has one (the emoji otherwise). */
const glyph = (id: BoardId, label: string) => (id === 'magiccard' && label.length === 1 ? `${label}︎` : label);

type Status = { text: string; tone?: 'win' | 'err' };
/** What the last round ended on, kept until the next one lands. */
type Shown = { result: BoardResult; pays: string[] };
/** A light on its way: the time of the run and each ring place's brightness over it. */
type Light = { t: Animated.Value; lit: Animated.AnimatedInterpolation<number>[] };

export function BoardPlayer({ id, entry }: { id: BoardId; entry: Entry }) {
  const board = BOARDS[id];
  const look = LOOKS[id];
  const { wealthLevel, settings, setSetting, coins, gameCoins } = useApp();
  const still = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === id)!;
  const dims = useWindowDimensions();
  const [chip, setChip] = useState(game.bets[0]);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [last, setLast] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  // Between the result coming back and the wheel or the light coming to rest.
  const [running, setRunning] = useState(false);
  // From the result being on the board until the round is over (the win is paid and celebrated).
  const [paying, setPaying] = useState(false);
  // While a round plays the pill shows the balance with the stake taken; the win joins it when its coins land.
  const [held, setHeld] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ text: look.hint });
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const [slice, setSlice] = useState<number | null>(null);
  const [light, setLight] = useState<Light | null>(null);
  const [info, setInfo] = useState(false);
  const [width, setWidth] = useState(0);
  const [session, setSession] = useState({ rounds: 0, staked: 0, won: 0 });

  const root = useRef<HostInstance>(null);
  const pill = useRef<HostInstance>(null);
  const optionNodes = useRef<Record<string, HostInstance | null>>({});
  const chipNodes = useRef<Record<number, HostInstance | null>>({});
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const lightAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const spin = useWheelSpin(LUCKY_WHEEL.length);
  const fly = useFlights(root);
  const win = useWinFx();
  // One spring per option (a tap sinks it, a landing chip bumps it), and one value each for what a result does to
  // the whole board: the paid options beat, the others dim, lost chips leave, the middle shows what came.
  const [pops] = useState(() => Object.fromEntries(board.options.map((o) => [o.id, new Animated.Value(1)])) as Record<string, Animated.Value>);
  const [pulse] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [middle] = useState(() => new Animated.Value(0));
  const [pillPop] = useState(() => new Animated.Value(1));

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['chip', 'spin', 'tick', 'stop', 'coin', 'win', 'card']);
    return () => {
      alive.current = false;
      beat.current?.stop();
      if (ticker.current) clearTimeout(ticker.current);
      if (calm.current) clearTimeout(calm.current);
    };
  }, []);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const lastTotal = Object.values(last).reduce((a, b) => a + b, 0);
  const muted = settings.gameVolume === 0;
  // The stage's inner width, and the height a phone leaves the game (the panel's own rows and the safe areas taken
  // off; in a room the panel is a sheet over the lower part). The middle of the stage takes what the rest leaves.
  const inner = (width || dims.width - 28) - 20;
  const room = Math.round(entry.from === 'room' ? dims.height * 0.78 - 112 : dims.height - 140);

  /** A tap sinks the option; `landing` ms later the chip arrives and bumps it. */
  const bump = (opt: string, landing: number) => {
    const v = pops[opt];
    Animated.sequence([
      Animated.timing(v, { toValue: 0.94, duration: 60, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.delay(Math.max(0, landing - 150)),
      Animated.timing(v, { toValue: 1.09, duration: 70, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
  };
  /** The last result stops beating and the board is all bright again. */
  const settle = () => {
    if (calm.current) clearTimeout(calm.current);
    calm.current = null;
    beat.current?.stop();
    beat.current = null;
    Animated.parallel([Animated.timing(pulse, { toValue: 0, duration: 160, useNativeDriver: true }), Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true })]).start();
  };

  const place = (opt: string) => {
    if (busy) return;
    tapHaptic();
    playSfx('chip', 0.85);
    settle();
    if (status.tone) setStatus({ text: look.hint });
    setBets((b) => ({ ...b, [opt]: (b[opt] ?? 0) + chip }));
    if (still) return;
    void fly.chip(chipNodes.current[chip], optionNodes.current[opt], chipLook(game.bets, chip), { ms: CHIP_MS });
    bump(opt, CHIP_MS);
  };
  const clear = () => {
    if (busy || !total) return;
    tapHaptic();
    playSfx('tap', 0.7);
    setBets({});
  };

  /** Gece Yarısı Çarkı turns its wheel; the others run the light round the options and stop on the result. */
  const land = async (r: BoardResult) => {
    if (id === 'slot') {
      const to = sliceFor(r.id);
      await spin.spinTo(to);
      if (alive.current) setSlice(to);
      return;
    }
    const at = RING[id].indexOf(r.id);
    const plan = planLight({ count: RING[id].length, from: lightAt.current, target: at < 0 ? null : at });
    lightAt.current = plan.steps[plan.steps.length - 1].index;
    if (!still) {
      const t = new Animated.Value(0);
      // The light is mounted with its clock at zero, standing where the last one stopped.
      setLight({ t, lit: RING[id].map((_, i) => t.interpolate({ ...litRange(plan, i), extrapolate: 'clamp' })) });
      await new Promise<void>((done) => {
        const t0 = Date.now();
        let k = 1;
        const next = () => {
          if (k >= plan.steps.length) return;
          ticker.current = setTimeout(
            () => {
              const gap = plan.steps[k].at - plan.steps[k - 1].at;
              playSfx('tick', 0.3 + Math.min(0.2, gap / 1500));
              if (gap > 180) tapHaptic();
              k++;
              next();
            },
            Math.max(0, plan.steps[k].at - (Date.now() - t0)),
          );
        };
        next();
        Animated.timing(t, { toValue: plan.ms, duration: plan.ms, easing: Easing.linear, useNativeDriver: true }).start(() => done());
      });
      if (ticker.current) clearTimeout(ticker.current);
      if (!alive.current) return;
    }
    playSfx(id === 'magiccard' ? 'card' : 'stop', 0.8);
    pressHaptic();
  };

  const start = async (placed: Record<string, number>, again = false) => {
    if (busy) return;
    const stake = Object.values(placed).reduce((a, b) => a + b, 0);
    if (!stake) return;
    // Busy while the round is decided (the server's answer in a live build), so a second tap doesn't play twice.
    setBusy(true);
    settle();
    pressHaptic();
    setHeld(Math.max(0, balance.current - stake));
    const res = await playBoardRound(id, placed, entry);
    if (!alive.current) return;
    if (!res.ok) {
      setHeld(null);
      setStatus({ text: res.reason, tone: 'err' });
      errorHaptic();
      setBusy(false);
      return;
    }
    const r = res.outcome.board!;
    const payout = res.row.payout;
    setRunning(true);
    setStatus({ text: look.running });
    Animated.timing(middle, { toValue: 0, duration: still ? 0 : 200, useNativeDriver: true }).start();
    if (again) {
      // Tekrar: the same chips go back onto their options before anything turns.
      setBets(placed);
      if (!still) {
        Object.entries(placed).forEach(([opt, amount], i) => {
          void fly.chip(chipNodes.current[chipOf(game.bets, amount)], optionNodes.current[opt], chipLook(game.bets, chipOf(game.bets, amount)), { ms: CHIP_MS, delay: i * 45 });
          bump(opt, CHIP_MS + i * 45);
        });
        playSfx('chip', 0.85);
        await sleep(CHIP_MS + 120);
        if (!alive.current) return;
      }
    }
    await land(r);
    if (!alive.current) return;

    // The result is on the board now.
    const mine = r.pays.filter((o) => placed[o] > 0);
    setRunning(false);
    setPaying(true);
    setLight(null);
    setShown({ result: r, pays: r.pays });
    setLast(placed);
    setTrail((t) => pushTrail(t, { key: res.row.txId, label: r.label, tone: payout > 0 ? 'win' : isHotResult(board, r) ? 'hot' : undefined }));
    setSession((x) => ({ rounds: x.rounds + 1, staked: x.staked + stake, won: x.won + payout }));
    // "77" is its own picture: said once.
    const came = r.label === r.name ? r.name : `${r.label} ${r.name}`;
    setStatus(payout > 0 ? { text: `${came} · +${fmt(payout)} jeton`, tone: 'win' } : { text: `${came} · bu tur kazanç yok` });
    if (!still) {
      Animated.spring(middle, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
      // Chips on options the result doesn't pay leave the board; the paid options beat and the others dim.
      Animated.timing(sweep, { toValue: 1, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      if (r.pays.length) {
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        beat.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 340, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 340, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        beat.current.start();
      }
    } else middle.setValue(1);

    if (payout > 0 && !still) {
      // The win leaves its options as coins and lands on the balance, which rolls up as the first ones arrive.
      const share = Math.max(3, Math.round(10 / mine.length));
      const flights = mine.map((o) => fly.coins(optionNodes.current[o], pill.current, { count: share, ms: COINS_MS, aim: { x: -30, y: 0 } }));
      await sleep(firstCoinAt(COINS_MS));
      if (!alive.current) return;
      setHeld(null);
      playSfx('coin', 0.7);
      Animated.sequence([Animated.timing(pillPop, { toValue: 1.06, duration: 90, useNativeDriver: true }), Animated.spring(pillPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true })]).start();
      await Promise.all(flights);
      if (!alive.current) return;
      playSfx('coin', 0.5);
    } else {
      setHeld(null);
      if (!still) await sleep(payout > 0 ? 200 : 340);
      if (!alive.current) return;
    }
    // Only a round that paid more than it cost is a win worth a show; less than the stake back is just paid.
    if (payout > stake) await win.celebrate({ amount: payout, bet: stake });
    if (!alive.current) return;
    setBets({});
    sweep.setValue(0);
    setPaying(false);
    setBusy(false);
    calm.current = setTimeout(settle, 2200);
  };

  const setOptionNode = (opt: string, node: HostInstance | null) => {
    optionNodes.current[opt] = node;
  };
  const ringPlace = (opt: string) => (id === 'slot' ? -1 : RING[id].indexOf(opt));
  const card = (o: BoardOption, variant: Variant, style: StyleProp<ViewStyle>) => {
    const paid = !!shown && shown.pays.includes(o.id);
    return (
      <OptionCard
        key={o.id}
        option={o}
        label={glyph(id, o.label)}
        variant={variant}
        accent={ACCENT[o.id] ?? look.frame}
        ink={look.ink}
        bet={bets[o.id] ?? 0}
        chips={game.bets}
        disabled={busy}
        onPress={place}
        setNode={setOptionNode}
        pop={pops[o.id]}
        lit={light?.lit[ringPlace(o.id)]}
        on={!running && !!shown && shown.result.id === o.id && id !== 'slot'}
        wins={paid}
        fades={!!shown && shown.pays.length > 0 && !paid}
        lost={!!shown && !paid}
        pulse={pulse}
        fade={fade}
        sweep={sweep}
        style={style}
      />
    );
  };

  // The part of the stage that differs: the wheel over its three options, the ring of dishes, the rows of cards.
  let middleOfStage: React.JSX.Element;
  if (id === 'slot') {
    const size = Math.max(176, Math.min(248, inner - 44, room - 418));
    middleOfStage = (
      <>
        <FruitWheel size={size} spin={spin} halo={look.halo} slice={running ? null : slice} result={running ? null : (shown?.result ?? null)} />
        <View style={s.wide}>{board.options.map((o) => card(o, 'wide', { flex: 1 }))}</View>
      </>
    );
  } else if (id === 'foodwheel') {
    const box = Math.max(236, Math.min(300, inner, room - 326));
    const cell = Math.round(box * 0.24);
    const radius = (box - cell) / 2 - 2;
    const result = running ? null : (shown?.result ?? null);
    middleOfStage = (
      <View style={{ width: box, height: box }}>
        <Image source={GLOW} style={{ position: 'absolute', left: -box * 0.2, top: -box * 0.2, width: box * 1.4, height: box * 1.4, opacity: 0.45, tintColor: look.halo }} />
        <View style={[s.ringLine, { left: box / 2 - radius, top: box / 2 - radius, width: radius * 2, height: radius * 2, borderRadius: radius }]} />
        {[0, 45, 90, 135].map((deg) => (
          <View key={deg} style={[s.spoke, { left: box / 2 - 1, top: box / 2 - radius, height: radius * 2, transform: [{ rotate: `${deg}deg` }] }]} />
        ))}
        {board.options.map((o, i) => {
          const a = (i / board.options.length) * Math.PI * 2 - Math.PI / 2;
          return card(o, 'round', { position: 'absolute', left: box / 2 + Math.cos(a) * radius - cell / 2, top: box / 2 + Math.sin(a) * radius - cell / 2, width: cell, height: cell });
        })}
        <Plate size={Math.round(box * 0.34)} box={box} middle={middle} running={running} result={result} wins={!!result && result.pays.length > 0} ink={look.ink} />
      </View>
    );
  } else {
    const cardW = (inner - 18) / 4;
    const cardH = Math.round(Math.max(74, Math.min(cardW * 1.28, (room - 424) / 2)));
    const result = shown?.result ?? null;
    middleOfStage = (
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Deck middle={middle} result={result} label={result ? glyph(id, result.label) : ''} mult={result ? board.options.find((o) => o.id === result.id)?.mult : undefined} running={running} ink={look.ink} />
        <View style={s.grid}>{board.options.map((o) => card(o, 'tall', { width: cardW, height: cardH }))}</View>
      </View>
    );
  }

  return (
    <View ref={root} collapsable={false} style={{ gap: 10 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <LinearGradient colors={look.colors} style={s.stage}>
        <View style={s.head}>
          <Text style={[s.title, { color: look.ink, textShadowColor: look.deep }]} numberOfLines={1} accessibilityRole="header">
            {look.title}
          </Text>
          <Pressable style={[s.icon, { borderColor: look.frame }]} onPress={() => setSetting('gameVolume', muted ? 0.4 : 0)} hitSlop={6} accessibilityRole="button" accessibilityLabel={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color="#fff" />
          </Pressable>
          <InfoButton onPress={() => setInfo(true)} tint={look.frame} />
        </View>
        {middleOfStage}
        <View style={[s.status, { borderColor: look.frame, backgroundColor: look.deep }, status.tone === 'win' && s.statusWin]} accessibilityLiveRegion="polite">
          <Text style={[s.statusText, { color: look.ink }, status.tone === 'err' && s.statusErr]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
        <View style={{ alignSelf: 'stretch' }}>
          <ResultTrail items={trail} />
        </View>
        {win.layer}
      </LinearGradient>

      <View style={s.tray}>
        {game.bets.map((b) => (
          <TrayChip
            key={b}
            value={b}
            look={chipLook(game.bets, b)}
            on={chip === b}
            size={Math.min(46, Math.floor((inner + 20 - (game.bets.length - 1) * 6) / game.bets.length) - 8)}
            onPress={() => {
              tapHaptic();
              playSfx('tap', 0.6);
              setChip(b);
            }}
            nodeRef={(n) => {
              chipNodes.current[b] = n;
            }}
          />
        ))}
      </View>
      <View style={s.row}>
        <Animated.View style={{ flex: 1, transform: [{ scale: pillPop }] }}>
          <View ref={pill} collapsable={false} style={{ flexDirection: 'row' }}>
            <BalancePill tint="#2A0F3D" shown={held} />
          </View>
        </Animated.View>
        <Pressable onPress={clear} disabled={busy || !total} style={[s.side, s.sideIcon, (busy || !total) && s.off]} accessibilityRole="button" accessibilityLabel="Bahisleri temizle">
          <Ionicons name="trash-outline" size={19} color="#FDE68A" />
        </Pressable>
        <Pressable onPress={() => start(last, true)} disabled={busy || !lastTotal} style={[s.side, (busy || !lastTotal) && s.off]} accessibilityRole="button" accessibilityLabel={lastTotal ? `Son bahisleri tekrarla, ${lastTotal} jeton` : 'Son bahisleri tekrarla'}>
          <Ionicons name="refresh" size={17} color="#FDE68A" />
          <View>
            <Text style={s.sideText}>Tekrar</Text>
            {lastTotal > 0 && <Text style={s.sideSub}>{shortCoins(lastTotal)}</Text>}
          </View>
        </Pressable>
      </View>
      <Pressable onPress={() => start(bets)} disabled={busy || !total} style={({ pressed }) => [(busy || !total) && s.off, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button" accessibilityLabel={`${look.verb}, toplam ${total} jeton`}>
        <LinearGradient colors={['#FDE68A', '#F59E0B']} style={s.playRing}>
          <LinearGradient colors={look.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.play}>
            {busy ? (
              <Text style={s.playText}>{running ? look.running : paying ? look.verb : 'Tur başlıyor…'}</Text>
            ) : total ? (
              <>
                <Ionicons name={id === 'magiccard' ? 'sparkles' : 'sync'} size={20} color="#FDE68A" />
                <Text style={s.playText} numberOfLines={1}>
                  {look.verb} · {fmt(total)}
                </Text>
              </>
            ) : (
              <Text style={[s.playText, s.playIdle]}>Önce fişini koy</Text>
            )}
            {!busy && total > 0 && <Shine radius={999} every={2600} />}
          </LinearGradient>
        </LinearGradient>
      </Pressable>
      {fly.layer}

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <Odds board={board} id={id} />
        {session.rounds > 0 && (
          <View style={{ gap: 5 }}>
            <Text style={o.head}>Bu oturum</Text>
            <Text style={o.note}>
              {session.rounds} tur · oynanan {fmt(session.staked)} · kazanılan {fmt(session.won)} jeton
            </Text>
          </View>
        )}
      </GameInfoSheet>
    </View>
  );
}

type Variant = 'wide' | 'round' | 'tall';

/** One option of a board: its picture, what it pays, and my chips on it. */
function OptionCard({
  option,
  label,
  variant,
  accent,
  ink,
  bet,
  chips,
  disabled,
  onPress,
  setNode,
  pop,
  lit,
  on,
  wins,
  fades,
  lost,
  pulse,
  fade,
  sweep,
  style,
}: {
  option: BoardOption;
  label: string;
  variant: Variant;
  accent: string;
  ink: string;
  bet: number;
  chips: readonly number[];
  disabled: boolean;
  onPress: (id: string) => void;
  setNode: (id: string, node: HostInstance | null) => void;
  pop: Animated.Value;
  /** The running light's brightness on this option, while it runs. */
  lit?: Animated.AnimatedInterpolation<number>;
  /** The light rests here. */
  on: boolean;
  /** The last result pays this option (it beats with `pulse`), pays others (it dims with `fade`), or doesn't pay it (chips on it leave with `sweep`). */
  wins: boolean;
  fades: boolean;
  lost: boolean;
  pulse: Animated.Value;
  fade: Animated.Value;
  sweep: Animated.Value;
  style: StyleProp<ViewStyle>;
}) {
  const v = useMemo(
    () => ({
      scale: wins ? Animated.multiply(pop, pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })) : pop,
      opacity: fades ? fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0.36] }) : 1,
      beat: wins ? pulse : null,
      chips: lost ? { opacity: sweep.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) }] } : null,
    }),
    [wins, fades, lost, pop, pulse, fade, sweep],
  );
  const seven = option.label === '77';
  return (
    <Animated.View style={[style, { opacity: v.opacity, transform: [{ scale: v.scale }] }]}>
      <Pressable
        ref={(n) => setNode(option.id, n)}
        collapsable={false}
        onPress={() => onPress(option.id)}
        disabled={disabled}
        style={[c.card, variant === 'round' && c.round, variant === 'tall' && c.tall, { borderColor: `${accent}AA` }]}
        accessibilityRole="button"
        accessibilityLabel={`${option.name}, ${option.mult} kat${bet ? `, bahsin ${bet}` : ''}`}
      >
        {variant === 'tall' && <View style={c.inset} />}
        <Animated.View style={[c.light, variant === 'round' && c.round, { opacity: lit ?? (on ? 1 : 0) }]} pointerEvents="none" />
        {v.beat && <Animated.View style={[c.light, c.winLight, variant === 'round' && c.round, { opacity: v.beat }]} pointerEvents="none" />}
        <Text style={seven ? c.seven : variant === 'tall' ? [c.sign, { color: ink }] : variant === 'round' ? c.dish : c.fruit}>{label}</Text>
        {variant === 'tall' && (
          <Text style={c.name} numberOfLines={1}>
            {option.name}
          </Text>
        )}
        <Text style={[c.mult, { color: variant === 'tall' ? ink : accent }, variant === 'round' && c.multSmall]}>×{option.mult}</Text>
        {variant !== 'tall' && (
          <Text style={[c.name, variant === 'round' && c.nameSmall]} numberOfLines={1}>
            {option.name}
          </Text>
        )}
      </Pressable>
      {bet > 0 && (
        <Animated.View style={[c.bet, v.chips]} pointerEvents="none">
          <BetStack amount={bet} chips={chips} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** The fruit wheel's disc: twenty slices, a peg between every two. Drawn once; only its parent turns. */
const FruitDisc = memo(function FruitDisc({ size, small }: { size: number; small: boolean }) {
  const r = size / 2;
  const half = Math.ceil(r * Math.tan(((SLICE / 2) * Math.PI) / 180)) + 1;
  const results = BOARDS.slot.results;
  return (
    <>
      {LUCKY_WHEEL.map((x, i) => {
        const res = results.find((y) => y.id === x)!;
        return (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * SLICE}deg` }] }]} pointerEvents="none">
            <View style={[f.wedge, { left: r - half, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: r, borderTopColor: SLICE_FILL[x][i % 2] }]} />
            <View style={[f.label, { left: r - 18 }, small && { top: 5 }]}>
              <Text style={[x === 'seven' ? f.seven : f.fruit, small && { fontSize: x === 'seven' ? 12 : 15, lineHeight: 19 }]}>{res.label}</Text>
            </View>
          </View>
        );
      })}
      {LUCKY_WHEEL.map((_, i) => (
        <View key={i} style={[f.pegArm, { left: r - 4, height: size, transform: [{ rotate: `${(i + 0.5) * SLICE}deg` }] }]} pointerEvents="none">
          <View style={f.peg} />
        </View>
      ))}
    </>
  );
});

function FruitWheel({ size, spin, halo, slice, result }: { size: number; spin: WheelSpin; halo: string; /** The slice the wheel rests on, lit. */ slice: number | null; result: BoardResult | null }) {
  const disc = size - 26;
  const r = disc / 2;
  const half = Math.ceil(r * Math.tan(((SLICE / 2) * Math.PI) / 180)) + 1;
  // A small wheel (a room's sheet on a small phone) keeps its ring of fruit: the middle gives way.
  const band = Math.round(Math.min(42, disc * 0.2));
  const sky = disc - band * 2;
  const hub = Math.round(Math.min(62, sky * 0.5));
  return (
    <View style={{ width: size, height: size + 12, alignItems: 'center' }} accessibilityLabel={result ? `Meyve çarkı, ${result.name} geldi` : 'Meyve çarkı'}>
      <Image source={GLOW} style={{ position: 'absolute', left: -size * 0.22, top: 12 - size * 0.22, width: size * 1.44, height: size * 1.44, opacity: 0.55, tintColor: halo }} />
      <LinearGradient colors={['#FDE68A', '#B45309', '#FDE68A']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[f.rim, { marginTop: 12, width: size, height: size, borderRadius: size / 2 }]}>
        <RimBulbs spin={spin} size={size} count={20} bulb={6} inset={3} />
        <View style={{ width: disc, height: disc, borderRadius: r, overflow: 'hidden', backgroundColor: '#172554' }}>
          <Animated.View style={{ width: disc, height: disc, transform: [{ rotate: spin.rotate }] }}>
            <FruitDisc size={disc} small={band < 38} />
            {slice !== null && (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.shine, transform: [{ rotate: `${slice * SLICE}deg` }] }]} pointerEvents="none">
                <View style={[f.wedge, { left: r - half, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: r, borderTopColor: 'rgba(255,255,255,0.4)' }]} />
              </Animated.View>
            )}
          </Animated.View>
          <SpinBlur spin={spin} size={disc} band={band - 2} tint="rgba(30,27,75,0.5)" />
          {/* The night sky in the middle doesn't turn: the fruit ring runs round it. */}
          <LinearGradient colors={['#312E81', '#0F0A2E']} style={[f.sky, { left: band, top: band, width: sky, height: sky, borderRadius: sky / 2 }]}>
            {STARS.map(([x, y, d], i) => (
              <View key={i} style={{ position: 'absolute', left: x * sky, top: y * sky, width: d, height: d, borderRadius: d / 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
            ))}
          </LinearGradient>
        </View>
        <View style={[f.hub, { left: size / 2 - hub / 2, top: size / 2 - hub / 2, width: hub, height: hub, borderRadius: hub / 2 }]}>
          {result ? <Text style={result.label === '77' ? [f.hubSeven, { fontSize: hub * 0.39 }] : { fontSize: hub * 0.48 }}>{result.label}</Text> : <Ionicons name="moon" size={Math.round(hub * 0.45)} color="#FDE68A" />}
        </View>
      </LinearGradient>
      <View style={{ position: 'absolute', top: -14, left: size / 2 - 14 }}>
        <WheelPointer spin={spin} size={28} />
      </View>
    </View>
  );
}
/** A few stars of the wheel's sky: place (0…1 of its box) and size. */
const STARS: [number, number, number][] = [
  [0.2, 0.24, 2],
  [0.72, 0.18, 3],
  [0.84, 0.52, 2],
  [0.3, 0.78, 2],
  [0.62, 0.84, 3],
  [0.12, 0.55, 2],
  [0.5, 0.1, 2],
];

/** The plate in the middle of Liman's ring: what the round served (a dish, Salata, Pizza or the empty plate). */
function Plate({ size, box, middle, running, result, wins, ink }: { size: number; box: number; middle: Animated.Value; running: boolean; result: BoardResult | null; wins: boolean; ink: string }) {
  return (
    <Animated.View
      style={[p.plate, { left: box / 2 - size / 2, top: box / 2 - size / 2, width: size, height: size, borderRadius: size / 2 }, result && wins && p.plateWin, { transform: [{ scale: middle.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
      accessibilityLabel={result ? `Tabakta ${result.name}` : 'Tabak'}
    >
      {result ? (
        <>
          <Text style={{ fontSize: Math.round(size * 0.36) }}>{result.label}</Text>
          <Text style={[p.name, { color: ink }]} numberOfLines={1}>
            {result.name}
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="restaurant" size={Math.round(size * 0.3)} color={running ? ink : 'rgba(253,230,138,0.6)'} />
          <Text style={p.wait}>{running ? 'Geliyor…' : 'Servis bekliyor'}</Text>
        </>
      )}
    </Animated.View>
  );
}

/** Sihir's deck: the top card lies face down and turns over to show what was drawn. */
function Deck({ middle, result, label, mult, running, ink }: { middle: Animated.Value; result: BoardResult | null; label: string; mult?: number; running: boolean; ink: string }) {
  const back = middle.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const face = middle.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  const turn = middle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.04, 1] });
  const joker = !!result && !mult;
  return (
    <View style={d.row} accessibilityLabel={result && !running ? `Açılan kart ${result.name}` : 'Deste'}>
      <View style={d.side}>
        <Text style={d.caption}>AÇILAN KART</Text>
        <Text style={[d.what, { color: ink }]} numberOfLines={1}>
          {running || !result ? '?' : result.name}
        </Text>
      </View>
      <View style={d.pile}>
        <View style={[d.card, d.under2]} />
        <View style={[d.card, d.under1]} />
        <Animated.View style={[d.card, { transform: [{ scaleX: turn }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, d.center, { opacity: back }]}>
            <View style={d.backInset} />
            <Ionicons name="sparkles" size={22} color="#FDE68A" />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, d.center, d.face, { opacity: face }]}>
            <Text style={joker ? d.joker : d.sign}>{label}</Text>
          </Animated.View>
        </Animated.View>
      </View>
      <View style={[d.side, { alignItems: 'flex-end' }]}>
        <Text style={d.caption}>ÖDER</Text>
        <Text style={[d.what, { color: ink }]} numberOfLines={1}>
          {running || !result ? '?' : mult ? `×${mult}` : 'yok'}
        </Text>
      </View>
    </View>
  );
}

/** The "?" sheet's table: what each option pays and how often it wins, and the results that are no option. */
function Odds({ board, id }: { board: Board; id: BoardId }) {
  const extra = board.results.filter((r) => !board.options.some((x) => x.id === r.id));
  const nameOf = (opt: string) => board.options.find((x) => x.id === opt)?.name ?? opt;
  return (
    <View style={{ gap: 6 }}>
      <Text style={o.head}>Ödeme ve şans</Text>
      {board.options.map((x) => (
        <View key={x.id} style={o.row}>
          <Text style={o.sym}>{glyph(id, x.label)}</Text>
          <Text style={o.name}>{x.name}</Text>
          <Text style={o.mult}>×{x.mult}</Text>
          <Text style={o.chance}>{percentText(optionShare(board, x.id))}</Text>
        </View>
      ))}
      {extra.map((r) => (
        <View key={r.id} style={o.row}>
          <Text style={o.sym}>{r.label}</Text>
          <Text style={o.name}>
            {r.name}
            <Text style={o.dim}> · {r.pays.length ? `${r.pays.map(nameOf).join(', ')} kazanır` : 'kimse kazanmaz'}</Text>
          </Text>
          <Text style={o.chance}>{percentText(resultShare(board, r))}</Text>
        </View>
      ))}
      <Text style={o.note}>Şans, o seçeneğin bir turda kazanma olasılığıdır (onu ödeyen bütün sonuçlar sayılır). Her seçenekte çarpan × şans %40 eder.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { borderRadius: 22, padding: 10, gap: 8, alignItems: 'center', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6, height: 32 },
  title: { flex: 1, fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1, marginLeft: 4 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  wide: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 12, justifyContent: 'center', marginTop: 4 },
  ringLine: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)' },
  spoke: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  status: { alignSelf: 'stretch', borderRadius: 10, borderWidth: 2, paddingVertical: 5, paddingHorizontal: 8, minHeight: 32, justifyContent: 'center' },
  statusWin: { backgroundColor: '#15803D' },
  statusText: { fontWeight: '900', fontSize: 14, textAlign: 'center', letterSpacing: 0.3 },
  statusErr: { fontSize: 12, fontWeight: '700', letterSpacing: 0, color: '#FFFFFF' },
  tray: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderRadius: 14, borderWidth: 2, borderColor: '#F0ABFC', backgroundColor: '#7C3AED', paddingHorizontal: 12 },
  sideIcon: { width: 46, paddingHorizontal: 0, justifyContent: 'center' },
  sideText: { color: '#FDE68A', fontWeight: '900', fontSize: 13, lineHeight: 16 },
  sideSub: { color: 'rgba(253,230,138,0.8)', fontWeight: '800', fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] },
  off: { opacity: 0.5 },
  playRing: { borderRadius: 999, padding: 3 },
  play: { height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, overflow: 'hidden' },
  playText: { color: '#FDE68A', fontWeight: '900', fontSize: 18, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  playIdle: { fontSize: 15, letterSpacing: 0 },
});

const c = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1.5, backgroundColor: 'rgba(12,6,36,0.6)', paddingVertical: 5, minHeight: 62 },
  round: { borderRadius: 999, minHeight: 0, paddingVertical: 0 },
  tall: { backgroundColor: 'rgba(12,6,36,0.72)', paddingVertical: 4 },
  inset: { position: 'absolute', left: 3, right: 3, top: 3, bottom: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(250,204,21,0.22)' },
  light: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: 15, borderWidth: 2.5, borderColor: '#FDE047', backgroundColor: 'rgba(253,224,71,0.24)', boxShadow: '0 0 14px rgba(253,224,71,0.75)' },
  winLight: { backgroundColor: 'rgba(253,224,71,0.34)' },
  fruit: { fontSize: 26, lineHeight: 32 },
  dish: { fontSize: 23, lineHeight: 28 },
  sign: { fontSize: 28, lineHeight: 34 },
  seven: { fontSize: 23, lineHeight: 32, fontWeight: '900', fontStyle: 'italic', color: '#FDE68A', textShadowColor: '#B45309', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  mult: { fontWeight: '900', fontSize: 15, lineHeight: 18 },
  multSmall: { fontSize: 13, lineHeight: 15 },
  name: { color: 'rgba(255,255,255,0.78)', fontWeight: '700', fontSize: 10.5, lineHeight: 13 },
  nameSmall: { fontSize: 9, lineHeight: 11 },
  bet: { position: 'absolute', left: 0, right: 0, top: -9, alignItems: 'center' },
});

const f = StyleSheet.create({
  rim: { alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(0,0,0,0.45)' },
  wedge: { position: 'absolute', top: 0, width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  label: { position: 'absolute', top: 8, width: 36, alignItems: 'center' },
  fruit: { fontSize: 19, lineHeight: 24 },
  seven: { fontSize: 15, lineHeight: 24, fontWeight: '900', fontStyle: 'italic', color: '#7F1D1D' },
  pegArm: { position: 'absolute', top: 0, width: 8, alignItems: 'center' },
  peg: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: '#FEF3C7' },
  sky: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(253,230,138,0.55)' },
  hub: { position: 'absolute', backgroundColor: '#1E1B4B', borderWidth: 3, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.5)' },
  hubSeven: { fontWeight: '900', fontStyle: 'italic', color: '#FDE68A' },
});

const p = StyleSheet.create({
  plate: { position: 'absolute', backgroundColor: '#1E1B4B', borderWidth: 3, borderColor: 'rgba(240,171,252,0.7)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' },
  plateWin: { borderColor: '#FDE047', boxShadow: '0 0 18px rgba(253,224,71,0.7)' },
  name: { fontSize: 11, fontWeight: '900', marginTop: -2 },
  wait: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', marginTop: 2 },
});

const d = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, height: 84 },
  side: { flex: 1, gap: 2 },
  caption: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  what: { fontSize: 20, fontWeight: '900' },
  pile: { width: 62, height: 84, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: 56, height: 76, borderRadius: 9, backgroundColor: '#4C1D95', borderWidth: 2, borderColor: '#FACC15', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.45)' },
  under1: { transform: [{ translateX: 3 }, { translateY: 3 }], opacity: 0.75 },
  under2: { transform: [{ translateX: 6 }, { translateY: 6 }], opacity: 0.5 },
  center: { alignItems: 'center', justifyContent: 'center' },
  backInset: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(253,230,138,0.5)' },
  face: { backgroundColor: '#FFF7E0' },
  sign: { fontSize: 34, lineHeight: 42, color: '#581C87' },
  joker: { fontSize: 34, lineHeight: 42 },
});

const o = StyleSheet.create({
  head: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  sym: { width: 34, textAlign: 'center', fontSize: 20, color: '#FDE68A', fontWeight: '900' },
  name: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  dim: { color: 'rgba(255,255,255,0.7)', fontWeight: '500', fontSize: 13 },
  mult: { width: 52, textAlign: 'right', color: '#FDE68A', fontWeight: '900', fontVariant: ['tabular-nums'] },
  chance: { width: 58, textAlign: 'right', color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
