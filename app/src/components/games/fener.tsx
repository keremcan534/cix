// Yıldız Avı: stars come out on a night sky, the searchlight beam sweeps the rows and stops on one, and the stars in
// the light are collected at the tower (lib/fener-slot). playRound settles the whole round, Yıldız Yağmuru included,
// before anything moves; the board, the beam and the collected count only replay outcome.fener. What the stage is
// made of is in fener-stage. Oto stops at Yıldız Yağmuru, a big win, the loss limit or any refusal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { RollingNumber } from '@/components/fx/rolling-number';
import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { Beam, BrightLadder, LIGHT, SKY, ShowerSky, SkyCell, TOWER, TOWER_GAP, Tower, fallOf, landedAt, starLook } from '@/components/games/fener-stage';
import { GameInfoSheet } from '@/components/games/fx/info-sheet';
import { SalonArt } from '@/components/games/fx/salon-art';
import { SalonStage, StageHeader, StageStatus, glowNumber, salonScreen, useBox, type StatusTone } from '@/components/games/fx/salon';
import { useWinFx } from '@/components/games/fx/win-fx';
import { SpinControls, fmt, sleep } from '@/components/games/slot-kit';
import { BRIGHTNESS, CARGO, COLS, FENER_MAX, ROWS, STORM_SPINS, STORM_TRIGGER, cargoLabel, type FCell, type FSpin } from '@/lib/fener-slot';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { playRound } from '@/lib/live/casino';
import { winTierOf } from '@/lib/win-tier';
import { useApp, useSettings } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
/** Between two rows of the sky (px). */
const GAP = 4;
/** A row carrying this much (tenths of the stake) or more is a rich one: the light lingers when it comes close. */
const RICH = 20;
const BRIGHT_TOTAL = BRIGHTNESS.reduce((n, b) => n + b.weight, 0);

const sea: FCell = { kind: 'sea' };
const ship = (cargo: number): FCell => ({ kind: 'ship', cargo });
// The board before the first spin: a quiet sky with a few small stars, nothing lit. ('sea' is empty sky and 'ship' a
// star: the cell kinds keep the game's first names, which the server and the history use.)
const INITIAL: FCell[][] = [
  [sea, ship(2), sea, sea, sea],
  [sea, sea, sea, ship(10), sea],
  [ship(5), sea, sea, sea, sea],
  [sea, sea, ship(1), sea, sea],
];

/** Ping-pong path of the beam over the rows that ends on `target`: 0,1,2,3,2,1,0,1… */
function sweepPath(target: number, minSteps: number): number[] {
  const path: number[] = [];
  let row = 0;
  let dir = 1;
  while (path.length < minSteps || row !== target) {
    path.push(row);
    if (row + dir < 0 || row + dir >= ROWS) dir = -dir;
    row += dir;
  }
  path.push(target);
  return path;
}
const rowTenths = (grid: FCell[][], r: number) => grid[r].reduce((n, c) => n + (c.kind === 'ship' ? c.cargo : 0), 0);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

export function FenerPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, coins, gameCoins } = useApp();
  const settings = useSettings();
  const calm = settings.reduceMotion;
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'olympus')!;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [grid, setGrid] = useState<FCell[][]>(INITIAL);
  // Where the light has settled (rows and brightness); null while the board lands and the beam sweeps.
  const [lit, setLit] = useState<{ rows: number[]; brightness: number } | null>(null);
  const [status, setStatus] = useState<{ text: string; tone?: StatusTone; amount?: number }>({ text: 'Işığın durduğu sıradaki yıldızlar toplanır' });
  // Each win sends a shine across the stage.
  const [shine, setShine] = useState(0);
  // Yıldız Yağmuru's spin being played (0 while it starts); null outside it.
  const [storm, setStorm] = useState<number | null>(null);
  // What has been collected at the tower in this round so far (coins).
  const [collected, setCollected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  // The sky takes the stage's free height: the rows grow with it.
  const area = useBox();
  // While a round is replayed the pill shows the balance with the stake taken; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const [drop] = useState(() => new Animated.Value(1));
  const [beamRow] = useState(() => new Animated.Value(0));
  const [beamOn] = useState(() => new Animated.Value(0));
  const [beam2Row] = useState(() => new Animated.Value(0));
  const [beam2On] = useState(() => new Animated.Value(0));
  const [flare] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [dark] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  const [meteors] = useState(() => new Animated.Value(0));
  const [title] = useState(() => new Animated.Value(0));
  const [sails] = useState(() => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => new Animated.Value(0))));
  const [falls] = useState(() => Array.from({ length: COLS }, (_, c) => fallOf(drop, c)));
  const win = useWinFx();
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const balance = useRef(coins + gameCoins);
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const falling = useRef<Animated.CompositeAnimation | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'stop', 'tick', 'coin', 'tease', 'win']);
    const pending = timers.current;
    return () => {
      alive.current = false;
      stopAuto.current = true;
      pending.forEach(clearTimeout);
      beat.current?.stop();
      falling.current?.stop();
    };
  }, []);
  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  // The board's inner width (its padding off), a column's width, and a row as tall as the free height allows, never
  // more than twice a column (a star keeps room round it).
  const boardW = area.w ? area.w - 12 : 0;
  const cellW = boardW ? Math.floor((boardW - TOWER - TOWER_GAP) / COLS) : 0;
  const rowH = cellW && area.h ? Math.max(40, Math.min(Math.round(cellW * 1.9), Math.floor((area.h - 12 - (ROWS - 1) * GAP) / ROWS))) : 0;
  // The stars grow with the sky.
  const starScale = rowH ? Math.max(0.85, Math.min(1.75, Math.min(cellW * 1.35, rowH) / 54)) : 1;
  const native = { useNativeDriver: true };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(() => alive.current && fn(), ms));

  /** One flash over the sky; the boom is heard only when Yıldız Yağmuru starts. */
  const strike = (thunder: boolean) => {
    if (thunder) playSfx('boom', 0.45);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 50, ...native }),
      Animated.timing(flash, { toValue: 0.25, duration: 70, ...native }),
      Animated.timing(flash, { toValue: 0.9, duration: 50, ...native }),
      Animated.timing(flash, { toValue: 0, duration: 280, ...native }),
    ]).start();
  };

  /**
   * Replays one spin: the old stars fade, the new board comes down column by column, the beam sweeps the rows,
   * slows and settles, and the lit stars fly to the tower one by one while the collected total counts up.
   */
  const replay = async (s: FSpin, fast: boolean, total: { coins: number; plain: boolean }, stormy: boolean) => {
    beat.current?.stop();
    pulse.setValue(0);
    setLit(null);
    if (calm) {
      beamOn.setValue(0);
      beam2On.setValue(0);
      sails.flat().forEach((v) => v.setValue(0));
      setGrid(s.grid);
      drop.setValue(1);
    } else {
      Animated.timing(beamOn, { toValue: 0, duration: 120, ...native }).start();
      Animated.timing(beam2On, { toValue: 0, duration: 120, ...native }).start();
      await run(Animated.timing(drop, { toValue: 2, duration: fast ? 110 : 180, easing: Easing.in(Easing.quad), ...native }));
      if (!alive.current) return;
      sails.flat().forEach((v) => v.setValue(0));
      setGrid(s.grid);
      drop.setValue(0);
      await frame();
      const ms = fast ? 430 : 800;
      for (let c = 0; c < COLS; c++) later(() => playSfx('stop', 0.45), landedAt(c) * ms - 40);
      await run(Animated.timing(drop, { toValue: 1, duration: ms, easing: Easing.linear, ...native }));
      if (!alive.current) return;
      // One beam sweeps the sky and slows down; Yıldız Yağmuru's second row opens from where it stops.
      const path = sweepPath(s.lit[0], fast ? 5 : 9);
      beamRow.setValue(path[0]);
      Animated.timing(beamOn, { toValue: 0.7, duration: 120, ...native }).start();
      let teased = false;
      for (let i = 1; i < path.length; i++) {
        const left = path.length - 1 - i;
        // Near the end and over a rich row: the light lingers there.
        const rich = !fast && left <= 2 && rowTenths(s.grid, path[i]) >= RICH;
        if (rich && !teased) {
          teased = true;
          playSfx('tease', 0.6);
        }
        await run(Animated.timing(beamRow, { toValue: path[i], duration: (fast ? 40 : 70) + (i / path.length) ** 2 * (fast ? 90 : 260) + (rich ? 150 : 0), easing: Easing.inOut(Easing.quad), ...native }));
        if (!alive.current) return;
        playSfx('tick', 0.4);
      }
    }
    // The light settles: full strength, a flare at the lens, and in Yıldız Yağmuru a second beam opens beside it.
    beamRow.setValue(s.lit[0]);
    if (calm) beamOn.setValue(1);
    else {
      Animated.timing(beamOn, { toValue: 1, duration: 140, ...native }).start();
      flare.setValue(1);
      Animated.timing(flare, { toValue: 0, duration: 420, ...native }).start();
    }
    if (s.lit[1] !== undefined) {
      beam2Row.setValue(calm ? s.lit[1] : s.lit[0]);
      beam2On.setValue(1);
      if (!calm) await run(Animated.timing(beam2Row, { toValue: s.lit[1], duration: 200, easing: Easing.out(Easing.quad), ...native }));
      if (!alive.current) return;
    }
    setLit({ rows: s.lit, brightness: s.brightness });
    tapHaptic();
    const stars = s.lit.flatMap((r) => s.grid[r].flatMap((c, col) => (c.kind === 'ship' ? [{ r, col, tenths: c.cargo }] : [])));
    if (!stars.length) {
      if (!stormy) playSfx('lose', 0.3);
      await sleep(fast ? 180 : 320);
      return;
    }
    if (!calm) {
      beat.current = Animated.loop(
        Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 340, easing: Easing.inOut(Easing.quad), ...native }), Animated.timing(pulse, { toValue: 0, duration: 340, easing: Easing.inOut(Easing.quad), ...native })]),
      );
      beat.current.start();
      if (stormy && s.pay >= 1) strike(false);
      await sleep(fast ? 160 : 320);
    }
    // The stars nearest the tower go first.
    for (const x of stars) {
      if (!alive.current) return;
      // A round that pays back no more than it cost is not a win: its stars are collected without the ring of coins.
      if (total.plain) playSfx('tick', 0.5);
      else playSfx('coin', 0.6);
      total.coins += (x.tenths * s.brightness * bet) / 10;
      setCollected(Math.floor(total.coins));
      // With "Animasyonları azalt" the stars stay in the light with what they pay written on them.
      if (!calm) await run(Animated.timing(sails[x.r][x.col], { toValue: 1, duration: fast ? 210 : 340, easing: Easing.in(Easing.quad), ...native }));
    }
    await sleep(fast ? 200 : 320);
  };

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    setHeld(balance.current - bet);
    pressHaptic();
    playSfx('spin', 0.7);
    setStatus({ text: 'Işık gökyüzünü tarıyor…' });
    const r = await playRound('olympus', bet, '', entry);
    if (!alive.current) return null;
    if (!r.ok) {
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    const round = r.outcome.fener!;
    const total = { coins: 0, plain: r.row.payout <= bet };
    setStorm(null);
    setCollected(0);
    dark.setValue(0);
    await replay(round.base, turbo, total, false);
    if (!alive.current) return null;
    if (round.storm.length) {
      // Yıldız Yağmuru starts: the night comes down, meteors fall, the sky flashes, the title; then its spins, each one step brighter.
      setStorm(0);
      setStatus({ text: `${STORM_SPINS} dönüş · ışık iki sırayı tarar · her dönüş daha parlak`, tone: 'bonus' });
      successHaptic();
      if (calm) {
        dark.setValue(1);
        title.setValue(1);
        await sleep(1200);
        title.setValue(0);
      } else {
        playSfx('fanfare', 0.9);
        falling.current = Animated.loop(Animated.timing(meteors, { toValue: 1, duration: 620, easing: Easing.linear, ...native }));
        falling.current.start();
        Animated.timing(dark, { toValue: 1, duration: 450, ...native }).start();
        Animated.spring(title, { toValue: 1, friction: 5, tension: 70, ...native }).start();
        later(() => strike(true), 280);
        later(() => strike(false), 980);
        await sleep(2000);
        await run(Animated.timing(title, { toValue: 0, duration: 200, ...native }));
      }
      for (let i = 0; i < round.storm.length; i++) {
        if (!alive.current) return null;
        setStorm(i + 1);
        playSfx('chip', 0.7);
        await replay(round.storm[i], true, total, true);
      }
      if (!alive.current) return null;
      falling.current?.stop();
      if (calm) dark.setValue(0);
      else Animated.timing(dark, { toValue: 0, duration: 600, ...native }).start();
    }
    // The round has been seen: the balance may show it, and the collected count holds exactly what was paid.
    const payout = r.row.payout;
    setHeld(null);
    setCollected(payout);
    if (payout > 0) {
      const gain = payout > bet;
      setStatus({ text: `Toplanan yıldızlar +${fmt(payout)}${round.capped ? ' · en yüksek kazanç' : ''}`, tone: gain ? 'win' : undefined, amount: gain ? payout : undefined });
      if (gain) setShine((x) => x + 1);
      const seen = win.celebrate({ amount: payout, bet });
      // Turbo doesn't stand still for a small win; everything bigger is watched to the end.
      if (!(turbo && winTierOf(payout, bet) === 'small')) await seen;
    } else setStatus({ text: 'Işıkta yıldız yok, bir daha dene' });
    return { net: payout - bet, stop: round.storm.length ? 'Yıldız Yağmuru' : payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
  };

  const play = async () => {
    if (busy || !cellW) return;
    setBusy(true);
    await spinOnce();
    if (alive.current) setBusy(false);
  };
  const toggleAuto = async () => {
    if (auto !== null) {
      stopAuto.current = true;
      return;
    }
    if (busy || !cellW) return;
    setBusy(true);
    stopAuto.current = false;
    let net = 0;
    let note = 'Oto bitti';
    for (let left = AUTO_SPINS; left > 0; left--) {
      if (stopAuto.current) {
        note = 'Oto durduruldu';
        break;
      }
      setAuto(left);
      const d = await spinOnce();
      if (!alive.current) return;
      if (!d) {
        note = 'Oto durdu: tur kabul edilmedi';
        break;
      }
      net += d.net;
      if (d.stop) {
        note = `Oto durdu: ${d.stop}`;
        break;
      }
      if (-net >= bet * AUTO_LOSS) {
        note = `Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)})`;
        break;
      }
      await sleep(turbo ? 150 : 400);
    }
    setAuto(null);
    setBusy(false);
    setStatus({ text: `${note} · net ${net >= 0 ? '+' : ''}${fmt(net)}`, tone: net > 0 ? 'win' : undefined });
  };
  const stormy = storm !== null;
  const boardH = ROWS * rowH + (ROWS - 1) * GAP;

  return (
    <View style={salonScreen}>
      <SalonStage colors={['#1D3060', '#0F1B40', '#060A1C']} accent={LIGHT} win={shine} minHeight={330}>
        {/* The night sky behind the title: a few stars. */}
        {[
          [0.48, 10],
          [0.58, 26],
          [0.66, 8],
          [0.36, 30],
          [0.8, 16],
        ].map(([x, y], i) => (
          <View key={i} style={[f.star, { left: `${x * 100}%`, top: y }]} pointerEvents="none" />
        ))}
        <StageHeader title="YILDIZ AVI" ink={LIGHT} kicker={stormy ? (storm ? `YILDIZ YAĞMURU · ${storm}/${STORM_SPINS}` : 'YILDIZ YAĞMURU') : 'IŞIK HUZMESİ · 5 × 4 GÖKYÜZÜ'} kickerInk={stormy ? LIGHT : SKY} onInfo={() => setInfo(true)} />

        <View style={f.area} onLayout={area.onLayout}>
          {rowH > 0 && (
          <View style={[f.board, { height: boardH + 12 }]} accessibilityLabel="Gökyüzü">
            <View style={{ height: boardH }}>
              <View style={{ marginLeft: TOWER + TOWER_GAP, gap: GAP }}>
                {grid.map((row, r) => {
                  const on = lit?.rows.includes(r) ?? false;
                  return (
                    <View key={r} style={[f.lane, { height: rowH }]}>
                      <View style={[StyleSheet.absoluteFill, f.laneDepth]} pointerEvents="none" />
                      {/* A lit row glows, and breathes while its stars are collected. */}
                      {on && <Animated.View style={[StyleSheet.absoluteFill, f.laneLit, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }]} />}
                      {/* A few faint far stars in each row. */}
                      <View style={[f.speck, { left: `${12 + r * 17}%`, top: rowH * 0.3 }]} />
                      <View style={[f.speck, { left: `${58 - r * 9}%`, top: rowH * 0.68 }]} />
                      {row.map((cell, c) => (
                        <SkyCell
                          key={c}
                          cell={cell}
                          w={cellW}
                          h={rowH}
                          scale={starScale}
                          lit={on && cell.kind === 'ship'}
                          amount={on && lit && cell.kind === 'ship' ? (cell.cargo * lit.brightness * bet) / 10 : 0}
                          faint={stormy}
                          fall={falls[c]}
                          sail={sails[r][c]}
                          away={c * cellW + cellW / 2 + TOWER_GAP + TOWER / 2}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
              <Tower rowH={rowH} gap={GAP} />
              <Beam row={beamRow} on={beamOn} flare={flare} width={boardW} rowH={rowH} gap={GAP} />
              <Beam row={beam2Row} on={beam2On} flare={flare} width={boardW} rowH={rowH} gap={GAP} />
              {/* The brightness the light settled with, written on its lens. */}
              {lit &&
                lit.brightness > 1 &&
                lit.rows.map((r) => (
                  <View key={r} style={[f.times, { top: r * (rowH + GAP) + rowH / 2 - 11 }]} pointerEvents="none">
                    <Text style={f.timesText}>×{lit.brightness}</Text>
                  </View>
                ))}
            </View>
          </View>
          )}
        </View>

        <View style={f.hud}>
          {stormy ? (
            <BrightLadder step={storm ?? 0} />
          ) : (
            <View style={[f.meter, !!lit && lit.brightness > 1 && f.meterHot]} accessibilityLabel={lit ? `Parlaklık ${lit.brightness} kat` : 'Parlaklık'}>
              <Ionicons name="telescope" size={13} color={LIGHT} />
              <Text style={f.meterText}>Parlaklık {lit ? `×${lit.brightness}` : '—'}</Text>
            </View>
          )}
          <View style={f.collected} accessibilityLabel={`Toplanan yıldızlar ${collected} jeton`}>
            <Text style={f.collectedHead}>TOPLANAN</Text>
            <RollingNumber value={collected} format={(n) => (n > 0 ? `+${fmt(n)}` : '0')} duration={320} style={[f.collectedValue, collected > 0 && glowNumber]} numberOfLines={1} />
          </View>
        </View>
        <StageStatus text={status.text} tone={status.tone} amount={status.amount} label="TOPLANAN" />

        <ShowerSky dark={dark} flash={flash} fall={meteors} height={(area.h || boardH) + 200} still={calm} />
        {/* Yıldız Yağmuru's title as it starts. */}
        <Animated.View style={[f.banner, { opacity: title, transform: [{ scale: title.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]} pointerEvents="none">
          <Ionicons name="sparkles" size={30} color={LIGHT} />
          <Text style={f.bannerTitle}>YILDIZ YAĞMURU</Text>
          <Text style={f.bannerSub}>
            {STORM_SPINS} dönüş · iki sıra birden · parlaklık ×1’den ×{STORM_SPINS}’ya
          </Text>
        </Animated.View>
        {win.layer}
      </SalonStage>

      <SpinControls
        held={held}
        bets={game.bets}
        bet={bet}
        onBet={setBet}
        busy={busy}
        turbo={turbo}
        onTurbo={() => setTurbo((t) => !t)}
        auto={auto}
        autoSpins={AUTO_SPINS}
        onAuto={toggleAuto}
        onSpin={play}
        look={{ ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#1D3060', '#060A1C'], ink: LIGHT }}
        caption={`Bir turda en çok ${fmt(bet * FENER_MAX)}`}
      />

      <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
        <View style={f.pays}>
          <Text style={f.paysHead}>Yıldız değerleri · {fmt(bet)} jeton bahiste</Text>
          <View style={f.cargoGrid}>
            {CARGO.map((c) => (
              <View key={c.tenths} style={f.cargoItem}>
                <SalonArt name={starLook(c.tenths).art} size={22} fallback={<Text style={{ fontSize: 18 }}>{starLook(c.tenths).emoji}</Text>} />
                <Text style={f.cargoName}>{cargoLabel(c.tenths)}</Text>
                <Text style={f.cargoVal}>{fmt((c.tenths * bet) / 10)}</Text>
              </View>
            ))}
          </View>
          <Text style={f.paysHead}>Parlaklık</Text>
          <View style={f.cargoGrid}>
            {BRIGHTNESS.map((b) => (
              <View key={b.value} style={[f.cargoItem, { width: '22%' }]}>
                <Text style={f.cargoName}>×{b.value}</Text>
                <Text style={f.cargoVal}>%{Math.round((b.weight / BRIGHT_TOTAL) * 100)}</Text>
              </View>
            ))}
          </View>
          <Text style={f.paysNote}>Işığın durduğu sıradaki yıldızların değerleri toplanır ve ışığın parlaklığıyla çarpılır. Işığın hangi sırada duracağı yıldızların yerine bağlı değildir.</Text>
          <Text style={f.paysNote}>
            {STORM_TRIGGER} veya daha fazla kuyruklu yıldız Yıldız Yağmuru’nu başlatır: {STORM_SPINS} dönüş boyunca ışık iki sırayı birden tarar ve her dönüşte bir kat daha parlar (×1’den ×{STORM_SPINS}’ya). Yıldız Yağmuru’nda kuyruklu yıldızlar sayılmaz.
          </Text>
          <Text style={f.paysNote}>
            Oto {AUTO_SPINS} tur çevirir; Yıldız Yağmuru’nda, {BIG_WIN} kat kazançta veya {AUTO_LOSS} bahislik kayıpta kendiliğinden durur.
          </Text>
        </View>
      </GameInfoSheet>
    </View>
  );
}

const f = StyleSheet.create({
  star: { position: 'absolute', width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  // The sky takes the stage's free height; the board sits in its middle.
  area: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', minHeight: 180 },
  board: { alignSelf: 'stretch', backgroundColor: 'rgba(2,8,20,0.62)', borderRadius: 18, padding: 6, borderWidth: 1, borderColor: 'rgba(255,210,122,0.4)', overflow: 'hidden', boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.75), 0 6px 16px rgba(0,0,0,0.4)' },
  lane: { flexDirection: 'row', borderRadius: 12, backgroundColor: 'rgba(125,160,255,0.07)', borderWidth: 1, borderColor: 'rgba(165,190,255,0.14)', overflow: 'hidden' },
  // A lane is a strip of glass: lit along its top edge, deeper at the bottom.
  laneDepth: { borderRadius: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'inset 0 -10px 18px rgba(0,0,0,0.35)' },
  laneLit: { borderRadius: 12, backgroundColor: 'rgba(255,210,122,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,210,122,0.9)', boxShadow: '0 0 16px rgba(255,210,122,0.45)' },
  speck: { position: 'absolute', width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  times: { position: 'absolute', left: -2, width: TOWER + 4, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: LIGHT, borderWidth: 2, borderColor: '#FFF3D0' },
  timesText: { color: '#3A2400', fontSize: 13, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, height: 30, borderWidth: 1, borderColor: 'rgba(255,210,122,0.35)', backgroundColor: 'rgba(255,210,122,0.08)' },
  meterHot: { backgroundColor: 'rgba(255,210,122,0.25)', borderColor: LIGHT },
  meterText: { color: LIGHT, fontWeight: '900', fontSize: 12 },
  collected: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: 36, borderRadius: 12, paddingHorizontal: 12, backgroundColor: 'rgba(2,8,20,0.6)', borderWidth: 1, borderColor: 'rgba(255,210,122,0.3)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)' },
  collectedHead: { color: 'rgba(230,251,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  collectedValue: { color: '#E6FBFF', fontSize: 20, lineHeight: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  banner: { position: 'absolute', left: 16, right: 16, top: '30%', alignItems: 'center', gap: 2, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 10, backgroundColor: 'rgba(4,8,20,0.88)', borderWidth: 2, borderColor: LIGHT },
  bannerTitle: { color: LIGHT, fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1.5 },
  bannerSub: { color: '#E6FBFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  pays: { gap: 8 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  cargoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cargoItem: { width: '31%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(165,180,252,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  cargoName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cargoVal: { color: LIGHT, fontWeight: '800', fontSize: 12, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
