// Screen for the bet boards (lib/board-games): Gece Yarısı Çarkı's fruit wheel, Lezzet Çarkı and Sihir Destesi. Pick
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
import { Animated, Easing, Image, Pressable, StyleSheet, View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';

import { CasinoLock } from '@/components/games/casino';
import { BetStack, TrayChip, chipLook } from '@/components/games/fx/chips';
import { firstCoinAt, useFlights } from '@/components/games/fx/flights';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { ResultTrail, pushTrail, type TrailItem } from '@/components/games/fx/result-trail';
import { ContactShadow, SALON, SalonStage, SideButton, StageHeader, StageStatus, WideAction, salonScreen, symbolShadow, tabular, useBox, wideInk, type StatusTone } from '@/components/games/fx/salon';
import { OPTION_ART, SalonArt } from '@/components/games/fx/salon-art';
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
  kicker: string;
  /** The stage's panel, top to bottom: each board its own colour inside the shell's gold bezel (no purple). */
  colors: [string, string, string];
  /** The stage's fine lines (an option card's rim when the option has no colour of its own). */
  frame: string;
  ink: string;
  /** The light behind the wheel or the ring. */
  halo: string;
  verb: string;
  hint: string;
  running: string;
};
const LOOKS: Record<BoardId, Look> = {
  slot: { title: 'GECE YARISI ÇARKI', kicker: '20 DİLİM · ÜÇ SEÇENEK', colors: ['#1E3466', '#0F1D42', '#070F24'], frame: '#F6BD60', ink: '#FFE08A', halo: '#7DD3FC', verb: 'Çevir', hint: 'Fişini seç, meyvene koy', running: 'Çark dönüyor…' },
  foodwheel: { title: 'LEZZET ÇARKI', kicker: 'SEKİZ YEMEK · 45 KATA KADAR', colors: ['#6E3818', '#341A10', '#0D1428'], frame: '#F6BD60', ink: '#FFE08A', halo: '#FF9F43', verb: 'Çevir', hint: 'Fişini seç, yemeğine koy', running: 'Işık dolaşıyor…' },
  magiccard: { title: 'SİHİR DESTESİ', kicker: 'SEKİZ BURÇ · 100 KATA KADAR', colors: ['#0F4C5C', '#0B2B42', '#061424'], frame: '#F6BD60', ink: '#FFE08A', halo: '#13D9DF', verb: 'Kartı aç', hint: 'Fişini seç, kartına koy', running: 'Kart çekiliyor…' },
};

/** Each option's own color: its card's rim and its slices on the wheel. Lezzet Çarkı's greens win with Salata, its reds with Pizza. */
const ACCENT: Record<string, string> = {
  melon: '#4ADE80',
  seven: '#F6BD60',
  apple: '#FF6576',
  crab: '#FF6576',
  fish: '#FF6576',
  shrimp: '#FF6576',
  steak: '#FF6576',
  tomato: '#4ADE80',
  pumpkin: '#4ADE80',
  mushroom: '#4ADE80',
  cabbage: '#4ADE80',
};
/** The order the light travels in: round the ring for Lezzet Çarkı, round the two rows of cards for Sihir. */
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

type Status = { text: string; tone?: StatusTone; amount?: number; label?: string };
/** What the last round ended on, kept until the next one lands. */
type Shown = { result: BoardResult; pays: string[] };
/** A light on its way: the time of the run and each ring place's brightness over it. */
type Light = { t: Animated.Value; lit: Animated.AnimatedInterpolation<number>[] };

export function BoardPlayer({ id, entry }: { id: BoardId; entry: Entry }) {
  const board = BOARDS[id];
  const look = LOOKS[id];
  const { wealthLevel, settings, coins, gameCoins } = useApp();
  const still = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === id)!;
  // The middle of the stage (the wheel, the ring, the cards) takes the height the phone leaves it.
  const mid = useBox();
  const [shine, setShine] = useState(0);
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
  // The screen's width (for the chip tray) and the middle area's size, as laid out.
  const inner = (width || 360) - 26;
  const midW = mid.w || inner;
  const midH = mid.h;

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
    setStatus(payout > 0 ? { text: `${came} · +${fmt(payout)} jeton`, tone: 'win', amount: payout, label: (r.name || came).toLocaleUpperCase('tr-TR') } : { text: `${came} · bu tur kazanç yok` });
    if (payout > stake) setShine((x) => x + 1);
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
  const card = (o: BoardOption, variant: Variant, style: StyleProp<ViewStyle>, size: number) => {
    const paid = !!shown && shown.pays.includes(o.id);
    return (
      <OptionCard
        key={o.id}
        option={o}
        label={glyph(id, o.label)}
        variant={variant}
        size={size}
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
  // Each is as big as the middle area allows (it is measured; nothing is drawn until it is).
  let middleOfStage: React.JSX.Element | null = null;
  if (!midH) middleOfStage = null;
  else if (id === 'slot') {
    // The three option cards under the wheel are this tall.
    const cardsH = Math.round(Math.max(66, Math.min(92, midH * 0.2)));
    const size = Math.round(Math.max(170, Math.min(midW - 30, midH - cardsH - 30, 360)));
    middleOfStage = (
      <>
        <FruitWheel size={size} spin={spin} halo={look.halo} slice={running ? null : slice} result={running ? null : (shown?.result ?? null)} />
        <View style={[s.wide, { height: cardsH }]}>{board.options.map((o) => card(o, 'wide', { flex: 1 }, Math.round(cardsH * 0.4)))}</View>
      </>
    );
  } else if (id === 'foodwheel') {
    const box = Math.round(Math.max(236, Math.min(midW, midH - 8, 420)));
    const cell = Math.round(box * 0.25);
    const radius = (box - cell) / 2 - 2;
    const result = running ? null : (shown?.result ?? null);
    middleOfStage = (
      <View style={{ width: box, height: box }}>
        <Image source={GLOW} style={{ position: 'absolute', left: -box * 0.2, top: -box * 0.2, width: box * 1.4, height: box * 1.4, opacity: 0.4, tintColor: look.halo }} />
        {/* A dark round table the dishes stand round, with a gold rail. */}
        <View style={[s.table, { left: box / 2 - radius - cell * 0.32, top: box / 2 - radius - cell * 0.32, width: (radius + cell * 0.32) * 2, height: (radius + cell * 0.32) * 2, borderRadius: radius + cell * 0.32 }]} />
        <View style={[s.ringLine, { left: box / 2 - radius, top: box / 2 - radius, width: radius * 2, height: radius * 2, borderRadius: radius }]} />
        {[0, 45, 90, 135].map((deg) => (
          <View key={deg} style={[s.spoke, { left: box / 2 - 1, top: box / 2 - radius, height: radius * 2, transform: [{ rotate: `${deg}deg` }] }]} />
        ))}
        {board.options.map((o, i) => {
          const a = (i / board.options.length) * Math.PI * 2 - Math.PI / 2;
          return card(o, 'round', { position: 'absolute', left: box / 2 + Math.cos(a) * radius - cell / 2, top: box / 2 + Math.sin(a) * radius - cell / 2, width: cell, height: cell }, Math.round(cell * 0.36));
        })}
        <Plate size={Math.round(box * 0.34)} box={box} middle={middle} running={running} result={result} wins={!!result && result.pays.length > 0} />
      </View>
    );
  } else {
    const cardW = (midW - 18) / 4;
    const deckH = Math.round(Math.max(84, Math.min(130, midH * 0.26)));
    const cardH = Math.round(Math.max(74, Math.min(cardW * 1.5, (midH - deckH - 8 - 12 - 8) / 2)));
    const result = shown?.result ?? null;
    middleOfStage = (
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Deck height={deckH} middle={middle} result={result} label={result ? glyph(id, result.label) : ''} mult={result ? board.options.find((o) => o.id === result.id)?.mult : undefined} running={running} ink={look.ink} />
        <View style={s.grid}>{board.options.map((o) => card(o, 'tall', { width: cardW, height: cardH }, Math.round(Math.min(cardW * 0.5, cardH * 0.36))))}</View>
      </View>
    );
  }

  return (
    <View ref={root} collapsable={false} style={salonScreen} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <SalonStage colors={look.colors} accent={look.frame} win={shine} minHeight={id === 'magiccard' ? 340 : 360} inner={{ alignItems: 'center' }}>
        <StageHeader title={look.title} kicker={look.kicker} onInfo={() => setInfo(true)} style={{ alignSelf: 'stretch' }} />
        <View style={s.middle} onLayout={mid.onLayout}>
          {middleOfStage}
        </View>
        <StageStatus text={status.text} tone={status.tone} amount={status.amount} label={status.label} />
        <View style={{ alignSelf: 'stretch' }}>
          <ResultTrail items={trail} />
        </View>
        {win.layer}
      </SalonStage>

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
            <BalancePill shown={held} />
          </View>
        </Animated.View>
        <SideButton compact onPress={clear} disabled={busy || !total} icon="trash-outline" a11y="Bahisleri temizle" />
        <SideButton onPress={() => start(last, true)} disabled={busy || !lastTotal} icon="refresh" label="Tekrar" sub={lastTotal > 0 ? shortCoins(lastTotal) : undefined} a11y={lastTotal ? `Son bahisleri tekrarla, ${lastTotal} jeton` : 'Son bahisleri tekrarla'} style={{ flex: 0, minWidth: 96 }} />
      </View>
      <WideAction onPress={() => start(bets)} disabled={busy || !total} off={!busy && !total} label={`${look.verb}, toplam ${total} jeton`}>
        {busy ? (
          <Text style={[s.playText, wideInk()]}>{running ? look.running : paying ? look.verb : 'Tur başlıyor…'}</Text>
        ) : total ? (
          <>
            <Ionicons name={id === 'magiccard' ? 'sparkles' : 'sync'} size={20} color={SALON.goldInk} />
            <Text style={[s.playText, tabular, wideInk()]} numberOfLines={1}>
              {look.verb} · {fmt(total)}
            </Text>
          </>
        ) : (
          <Text style={[s.playText, s.playIdle, wideInk(true)]}>Önce fişini koy</Text>
        )}
      </WideAction>
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
  size,
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
  /** The picture's size (px): the card grows with the stage and its picture with it. */
  size: number;
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
  const round = variant === 'round';
  const rad = round ? 999 : 14;
  // The glyph: its picture once delivered (fx/salon-art), else the emoji, the zodiac sign or the gold "77".
  const glyphText = seven ? (
    <Text style={[c.seven, { fontSize: size * 0.82, lineHeight: size * 1.1 }]}>{label}</Text>
  ) : variant === 'tall' ? (
    <Text style={[c.sign, symbolShadow, { color: ink, fontSize: size, lineHeight: size * 1.22 }]}>{label}</Text>
  ) : (
    <Text style={[symbolShadow, { fontSize: size, lineHeight: size * 1.2 }]}>{label}</Text>
  );
  const art = OPTION_ART[option.id];
  return (
    <Animated.View style={[style, { opacity: v.opacity, transform: [{ scale: v.scale }] }]}>
      <Pressable
        ref={(n) => setNode(option.id, n)}
        collapsable={false}
        onPress={() => onPress(option.id)}
        disabled={disabled}
        style={({ pressed }) => [c.card, round && c.round, variant === 'tall' && c.tall, { borderColor: `${accent}B3`, borderTopColor: `${accent}` }, pressed && c.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${option.name}, ${option.mult} kat${bet ? `, bahsin ${bet}` : ''}`}
      >
        {/* A glossy plate in the option's own colour, lit from the top. */}
        <LinearGradient colors={[`${accent}55`, '#17284A', '#0A1428']} locations={[0, 0.48, 1]} style={[StyleSheet.absoluteFill, { borderRadius: rad }]} />
        <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.02)']} style={[c.gloss, { borderTopLeftRadius: rad, borderTopRightRadius: rad }]} />
        {variant === 'tall' && <View style={c.inset} />}
        <Animated.View style={[c.light, round && c.round, { opacity: lit ?? (on ? 1 : 0) }]} pointerEvents="none" />
        {v.beat && <Animated.View style={[c.light, c.winLight, round && c.round, { opacity: v.beat }]} pointerEvents="none" />}
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {!seven && <ContactShadow size={size} style={{ bottom: size * 0.02 }} />}
          {art ? <SalonArt name={art} size={size * 1.1} fallback={glyphText} /> : glyphText}
        </View>
        {variant === 'tall' && (
          <Text style={[c.name, { fontSize: Math.max(10.5, size * 0.3) }]} numberOfLines={1}>
            {option.name}
          </Text>
        )}
        <Text style={[c.mult, { color: variant === 'tall' ? ink : accent, fontSize: Math.max(13, size * (round ? 0.46 : 0.5)), lineHeight: Math.max(15, size * (round ? 0.56 : 0.6)) }]}>×{option.mult}</Text>
        {variant !== 'tall' && (
          <Text style={[c.name, { fontSize: Math.max(9, size * (round ? 0.32 : 0.36)), lineHeight: Math.max(11, size * (round ? 0.4 : 0.44)) }]} numberOfLines={1}>
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
              <SalonArt name={OPTION_ART[x]} size={small ? 17 : 22} fallback={<Text style={[x === 'seven' ? f.seven : f.fruit, small && { fontSize: x === 'seven' ? 12 : 15, lineHeight: 19 }]}>{res.label}</Text>} />
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
  const band = Math.round(Math.min(46, disc * 0.2));
  const sky = disc - band * 2;
  const hub = Math.round(Math.min(78, sky * 0.5));
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
          <SpinBlur spin={spin} size={disc} band={band - 2} tint="rgba(8,18,44,0.5)" />
          {/* The night sky in the middle doesn't turn: the fruit ring runs round it. */}
          <LinearGradient colors={['#22396E', '#0A1430', '#050A1A']} style={[f.sky, { left: band, top: band, width: sky, height: sky, borderRadius: sky / 2 }]}>
            {STARS.map(([x, y, d], i) => (
              <View key={i} style={{ position: 'absolute', left: x * sky, top: y * sky, width: d, height: d, borderRadius: d / 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />
            ))}
          </LinearGradient>
        </View>
        <LinearGradient colors={['#2A4478', '#0B1730']} style={[f.hub, { left: size / 2 - hub / 2, top: size / 2 - hub / 2, width: hub, height: hub, borderRadius: hub / 2 }]}>
          {result ? (
            <SalonArt name={OPTION_ART[result.id]} size={hub * 0.6} fallback={<Text style={result.label === '77' ? [f.hubSeven, { fontSize: hub * 0.39 }] : [symbolShadow, { fontSize: hub * 0.48 }]}>{result.label}</Text>} />
          ) : (
            <SalonArt name="gece-carki-gobek" size={hub - 6} fallback={<Ionicons name="moon" size={Math.round(hub * 0.45)} color={SALON.win} />} />
          )}
        </LinearGradient>
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

/** The plate in the middle of Lezzet Çarkı's ring: what the round served (a dish, Salata, Pizza or the empty plate). */
function Plate({ size, box, middle, running, result, wins }: { size: number; box: number; middle: Animated.Value; running: boolean; result: BoardResult | null; wins: boolean }) {
  return (
    <Animated.View
      style={[p.plate, { left: box / 2 - size / 2, top: box / 2 - size / 2, width: size, height: size, borderRadius: size / 2 }, result && wins && p.plateWin, { transform: [{ scale: middle.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
      accessibilityLabel={result ? `Tabakta ${result.name}` : 'Tabak'}
    >
      {/* A porcelain plate: a white rim round a soft well, lit from the top. */}
      <LinearGradient colors={['#FFFFFF', '#E3E8F0', '#B9C2D0']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      <LinearGradient colors={['#D7DEE8', '#F7F9FC']} style={[p.well, { left: size * 0.12, top: size * 0.12, width: size * 0.76, height: size * 0.76, borderRadius: size * 0.38 }]} />
      {result ? (
        <>
          <SalonArt name={OPTION_ART[result.id]} size={Math.round(size * 0.46)} fallback={<Text style={[symbolShadow, { fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.48) }]}>{result.label}</Text>} />
          <Text style={[p.name, { fontSize: Math.max(11, size * 0.11) }]} numberOfLines={1}>
            {result.name}
          </Text>
        </>
      ) : (
        <>
          <SalonArt name="lezzet-tabak" size={Math.round(size * 0.5)} fallback={<Ionicons name="restaurant" size={Math.round(size * 0.3)} color={running ? '#B7832E' : '#8C97AB'} />} />
          <Text style={p.wait}>{running ? 'Geliyor…' : 'Servis bekliyor'}</Text>
        </>
      )}
    </Animated.View>
  );
}

/** Sihir's deck: the top card lies face down and turns over to show what was drawn. */
function Deck({ height, middle, result, label, mult, running, ink }: { height: number; middle: Animated.Value; result: BoardResult | null; label: string; mult?: number; running: boolean; ink: string }) {
  const back = middle.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const face = middle.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  const turn = middle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.04, 1] });
  const joker = !!result && !mult;
  // A playing card (2:3) as tall as the row allows, with room for the two under it.
  const cardH = height - 10;
  const cardW = Math.round(cardH * 0.7);
  const glyph = Math.round(cardH * 0.42);
  const card = { width: cardW, height: cardH, borderRadius: Math.round(cardW * 0.14) };
  return (
    <View style={[d.row, { height }]} accessibilityLabel={result && !running ? `Açılan kart ${result.name}` : 'Deste'}>
      <View style={d.side}>
        <Text style={d.caption}>AÇILAN KART</Text>
        <Text style={[d.what, { color: ink }]} numberOfLines={1}>
          {running || !result ? '?' : result.name}
        </Text>
      </View>
      <View style={{ width: cardW + 8, height, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[d.card, card, d.under2]} />
        <View style={[d.card, card, d.under1]} />
        <Animated.View style={[d.card, card, { transform: [{ scaleX: turn }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, d.center, { opacity: back }]}>
            <SalonArt
              name="sihir-kart-arkasi"
              size={cardW}
              h={cardH}
              fallback={
                <>
                  <LinearGradient colors={['#14506A', '#0B2B42', '#061424']} style={StyleSheet.absoluteFill} />
                  <View style={d.backInset} />
                  <Ionicons name="sparkles" size={Math.round(cardW * 0.42)} color={SALON.win} />
                </>
              }
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, d.center, d.face, { opacity: face }]}>
            {result && OPTION_ART[result.id] ? (
              <SalonArt name={OPTION_ART[result.id]} size={glyph * 1.1} fallback={<Text style={[joker ? d.joker : d.sign, { fontSize: glyph, lineHeight: glyph * 1.22 }]}>{label}</Text>} />
            ) : (
              <Text style={[joker ? d.joker : d.sign, { fontSize: glyph, lineHeight: glyph * 1.22 }]}>{label}</Text>
            )}
          </Animated.View>
        </Animated.View>
      </View>
      <View style={[d.side, { alignItems: 'flex-end' }]}>
        <Text style={d.caption}>ÖDER</Text>
        <Text style={[d.what, tabular, { color: ink }]} numberOfLines={1}>
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
  // The middle of the stage takes its free height; what it holds sits in its middle.
  middle: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  wide: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 12, justifyContent: 'center', marginTop: 4 },
  table: { position: 'absolute', backgroundColor: 'rgba(4,8,18,0.5)', borderWidth: 2, borderColor: 'rgba(246,189,96,0.35)', boxShadow: 'inset 0 4px 18px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,231,176,0.08)' },
  ringLine: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  spoke: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  tray: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SALON.row },
  playText: { fontWeight: '900', fontSize: 18, letterSpacing: 0.5 },
  playIdle: { fontSize: 15, letterSpacing: 0 },
});

const c = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1.5, paddingVertical: 4, minHeight: 62, boxShadow: '0 5px 12px rgba(0,0,0,0.5)' },
  round: { borderRadius: 999, minHeight: 0, paddingVertical: 0 },
  tall: { paddingVertical: 4 },
  pressed: { transform: [{ scale: 0.95 }] },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  inset: { position: 'absolute', left: 3, right: 3, top: 3, bottom: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(246,189,96,0.25)' },
  light: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: 15, borderWidth: 2.5, borderColor: '#FFE08A', backgroundColor: 'rgba(255,224,138,0.22)', boxShadow: '0 0 16px rgba(255,224,138,0.8)' },
  winLight: { backgroundColor: 'rgba(255,224,138,0.34)' },
  fruit: { fontSize: 26, lineHeight: 32 },
  sign: { fontSize: 28, lineHeight: 34 },
  seven: { fontWeight: '900', fontStyle: 'italic', color: '#FFE08A', textShadowColor: '#8A5A12', textShadowOffset: { width: 1, height: 3 }, textShadowRadius: 3 },
  mult: { fontWeight: '900', fontSize: 15, lineHeight: 18, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  name: { color: 'rgba(255,255,255,0.82)', fontWeight: '700', fontSize: 10.5, lineHeight: 13 },
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
  sky: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(253,230,138,0.55)', boxShadow: 'inset 0 3px 12px rgba(0,0,0,0.7)' },
  hub: { position: 'absolute', borderWidth: 3, borderColor: SALON.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.6), 0 0 14px rgba(246,189,96,0.35)' },
  hubSeven: { fontWeight: '900', fontStyle: 'italic', color: '#FFE08A' },
});

const p = StyleSheet.create({
  plate: { position: 'absolute', borderWidth: 2.5, borderColor: '#D9B061', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(0,0,0,0.55)' },
  plateWin: { borderColor: '#FFE08A', boxShadow: '0 0 22px rgba(255,224,138,0.85)' },
  well: { position: 'absolute', boxShadow: 'inset 0 3px 8px rgba(70,85,110,0.45)' },
  name: { color: '#2A1A0A', fontWeight: '900', marginTop: -2 },
  wait: { color: '#6B7690', fontSize: 10, fontWeight: '800', marginTop: 2 },
});

const d = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6 },
  side: { flex: 1, gap: 2 },
  caption: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  what: { fontSize: 20, fontWeight: '900' },
  card: { position: 'absolute', backgroundColor: '#0B2B42', borderWidth: 2, borderColor: SALON.gold, overflow: 'hidden', boxShadow: '0 6px 14px rgba(0,0,0,0.55)' },
  under1: { transform: [{ translateX: 3 }, { translateY: 3 }], opacity: 0.75 },
  under2: { transform: [{ translateX: 6 }, { translateY: 6 }], opacity: 0.5 },
  center: { alignItems: 'center', justifyContent: 'center' },
  backInset: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(253,230,138,0.5)' },
  face: { backgroundColor: '#FFF7E0' },
  sign: { color: '#0B2B42' },
  joker: {},
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
