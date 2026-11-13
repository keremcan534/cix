// Screen for every payline slot (lib/line-slot + lib/slot-configs): Hazine Kulesi, Kızıl Yedi, Vahşi Patika, Konfeti Kutusu,
// Kayıp Parşömen, Neon Bulvar. Each game only brings its theme below; the frame, the controls and the numbers are the
// Salon shell's (fx/salon). playCasino (lib/games) settles the round before the reels come to rest; the reels
// (components/games/fx/reel) only replay outcome.slot: they run while the round is asked for, stop one after another,
// wait on the last ones when a scatter or the JACKPOT is one symbol away, and the win is shown by win-fx. Oto is
// repeated rounds from this screen and stops at the JACKPOT, a big win, the loss limit or any refusal (daily limit,
// balance, pool). The reels take the height the phone leaves them: the cells grow with it, within a reel's shape.
// A machine with a skin (fx/slot-skin: all six) is drawn in its own pictures instead of the shell's stage: the
// cabinet over the reels, picture symbols, the spin button and the win plate, and its own JACKPOT / Büyük Kazanç
// show (fx/jackpot-show); its JACKPOT fund and Kayıp Parşömen's prizes stand over the cabinet. The round, the
// controls and Oto are the same.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { RollingNumber } from '@/components/fx/rolling-number';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { useJackpotShow } from '@/components/games/fx/jackpot-show';
import { Reel, type ReelHandle } from '@/components/games/fx/reel';
import { ContactShadow, FundPlaque, Marquee, SALON, SalonStage, StageHeader, StageStatus, SymbolPlate, plaqueValue, salonScreen, symbolShadow, useBox, type ActionLook, type StatusTone } from '@/components/games/fx/salon';
import { SKIN_GAP, SKIN_PAD, SKIN_RIM, SkinCabinet, SkinPlate, fitSkin, slotSkinOf, windowRadius } from '@/components/games/fx/slot-skin';
import { useWinFx } from '@/components/games/fx/win-fx';
import { SpinControls, fmt, sleep } from '@/components/games/slot-kit';
import type { LineSlotId } from '@/lib/casino-odds';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { playRound } from '@/lib/live/casino';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { slotWindow, stripsOf } from '@/lib/line-slot';
import { REEL_PACE, reelRun, teasedReels, type ReelPace } from '@/lib/reel-plan';
import { winTierOf } from '@/lib/win-tier';
import { SLOT_CONFIGS, SPELL_PRIZES } from '@/lib/slot-configs';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
/** Oto stops when the net loss reaches this many stakes. */
const AUTO_LOSS = 25;

type Theme = {
  title: string;
  /** The stage's panel, top to bottom. */
  colors: [string, string, string];
  /** The reels' box and its rim. */
  reels: string;
  frame: string;
  /** The plate under each symbol. */
  plate: readonly [string, string, ...string[]];
  ink: string;
  status: string;
  /** The action button's core. */
  look: ActionLook;
  /** Pictures for some symbols (else the label is drawn). */
  art?: Record<string, ArtName>;
  /** Colors of letter/number symbols. */
  letters?: Record<string, string>;
};
// Each machine keeps its own colour inside the shell's gold bezel, within the app's palette (navy, turquoise, gold,
// coral): no purple.
const THEMES: Record<LineSlotId, Theme> = {
  jackpot: {
    title: 'HAZİNE KULESİ',
    colors: ['#24447A', '#132A4E', '#0A1530'],
    reels: '#060D1C',
    frame: '#F6BD60',
    plate: ['#2F4D80', '#1A3058', '#0E1B38'],
    ink: '#FFE08A',
    status: 'İYİ ŞANSLAR',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#24447A', '#0A1530'], ink: '#FFE08A' },
    art: { cherry: 'slot-kiraz', bell: 'slot-can' },
    letters: { seven: '#FF5A6A', wild: '#FF9F43', dollar: '#FFD34D' },
  },
  super777: {
    title: 'KIZIL YEDİ',
    colors: ['#93253A', '#521224', '#1C0A14'],
    reels: '#2A0A12',
    frame: '#F6BD60',
    plate: ['#FFFBEF', '#F5E6C4', '#D8BE88'],
    ink: '#FFE08A',
    status: 'BOL ŞANS',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#93253A', '#3A0C18'], ink: '#FFE08A' },
    art: { cherry: 'slot-kiraz', lemon: 'slot-limon', grape: 'slot-uzum' },
    letters: { seven: '#D93A45' },
  },
  jungle: {
    title: 'VAHŞİ PATİKA',
    colors: ['#2F6326', '#1B3F1C', '#0B1C12'],
    reels: '#0A1A0E',
    frame: '#C6E86B',
    plate: ['#3F6A30', '#26461F', '#132813'],
    ink: '#FFE08A',
    status: 'KAZANÇ',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#2F6326', '#0B1C12'], ink: '#FFE08A' },
    letters: { ten: '#F6BD60', j: '#13D9DF', q: '#FF8E9A', k: '#FF6576', a: '#FF9F43' },
  },
  pinata: {
    title: 'KONFETİ KUTUSU',
    colors: ['#0F6C78', '#0C3F5C', '#0A1D38'],
    reels: '#061426',
    frame: '#FF8E9A',
    plate: ['#1D6280', '#13405E', '#0A2442'],
    ink: '#FFE08A',
    status: 'FIESTA!',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#0F6C78', '#0A1D38'], ink: '#FFE08A' },
    letters: { j: '#7DD3FC', q: '#FF9F43', k: '#13D9DF', a: '#FF6576' },
  },
  spellbook: {
    title: 'KAYIP PARŞÖMEN',
    colors: ['#1C4655', '#102C3B', '#071722'],
    reels: '#0A0F14',
    frame: '#E9C98B',
    plate: ['#564029', '#35271A', '#1B140D'],
    ink: '#FFE08A',
    status: 'BÜYÜ BAŞLASIN',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#1C4655', '#071722'], ink: '#FFE08A' },
  },
  neon: {
    title: 'NEON BULVAR',
    colors: ['#0D2550', '#0A1735', '#050B1E'],
    reels: '#030814',
    frame: '#13D9DF',
    plate: ['#143664', '#0C2143', '#061229'],
    ink: '#FFE08A',
    status: 'İYİ ŞANSLAR',
    look: { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#0D2550', '#050B1E'], ink: '#6FF1F5' },
    letters: { j: '#7DD3FC', q: '#FFD34D', k: '#FF9F43', wild: '#FF6576' },
  },
};

/** One reel symbol: a picture, a BAR plate, a coloured letter or the emoji, standing on its contact shadow. */
function Symbol({ label, sym, theme, dim, size }: { label: string; sym: string; theme: Theme; dim?: boolean; size: number }) {
  const o = dim ? { opacity: 0.45 } : null;
  const art = theme.art?.[sym];
  let face: React.JSX.Element;
  if (art) face = <Art name={art} size={size} style={o ?? undefined} />;
  else if (label === 'BAR' || label === 'BAR BAR')
    face = (
      <View style={[s.barWrap, o]}>
        {(label === 'BAR BAR' ? [0, 1] : [0]).map((i) => (
          <Text key={i} style={[s.bar, { fontSize: Math.round(size * (label === 'BAR BAR' ? 0.26 : 0.33)), paddingHorizontal: Math.round(size * 0.1) }]}>
            BAR
          </Text>
        ))}
      </View>
    );
  else if (/^[\x20-\x7E]+$/.test(label)) {
    const color = theme.letters?.[sym] ?? theme.ink;
    face = (
      <Text style={[s.letter, { color, fontSize: label.length > 2 ? size * 0.4 : size * 0.76, lineHeight: size * 0.95 }, label === '77' && { letterSpacing: -3 }, o]} numberOfLines={1}>
        {label}
      </Text>
    );
  } else face = <Text style={[symbolShadow, { fontSize: size * 0.72, lineHeight: size * 0.9 }, o]}>{label}</Text>;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ContactShadow size={size} />
      {face}
    </View>
  );
}

export function LineSlotPlayer({ id, entry }: { id: LineSlotId; entry: Entry }) {
  const c = SLOT_CONFIGS[id];
  const theme = THEMES[id];
  const skin = slotSkinOf(id);
  const reels = c.counts.length;
  const { wealthLevel, settings, coins, gameCoins } = useApp();
  const { casino, bank } = useGames();
  const game = casino.find((g) => g.id === id)!;
  const still = settings.reduceMotion;
  const [bet, setBet] = useState(game.bets[Math.min(2, game.bets.length - 1)]);
  // The window the machine opens with; after that each reel keeps its own (components/games/fx/reel).
  const [opening] = useState(() => slotWindow(c, c.counts.map((_, r) => r * 4)));
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ text: string; tone?: StatusTone; amount?: number; label?: string }>({ text: theme.status });
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  // Reels still being waited for (the border glows on them).
  const [waiting, setWaiting] = useState<boolean[]>([]);
  // Each win sends a shine across the stage.
  const [shine, setShine] = useState(0);
  // The area the reels may take (cells are sized from it).
  const area = useBox();
  // While the reels run the pill shows the balance with the stake taken; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const handles = useRef<(ReelHandle | null)[]>([]);
  // What the reels show at rest (the reels keep their own columns; this is for a refused round and screen readers).
  const [grid, setGrid] = useState(opening);
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const [pulse] = useState(() => new Animated.Value(0));
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const win = useWinFx();
  const show = useJackpotShow(skin);

  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'stop', 'win', 'coin', 'tick']);
    return () => {
      alive.current = false;
      stopAuto.current = true;
      beat.current?.stop();
    };
  }, []);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const strips = stripsOf(c);
  const fund = bank.jackpots[id];
  // A reel's cell: as wide as the box allows, as tall as the area allows within a reel's shape (a tall 5-reel cell,
  // a near-square 3-reel one). Box: padding 6 + rim 2 a side; a reel: padding 1 + rim 2 a side.
  const FRAME = 2 * (6 + 2);
  const REEL_EDGE = 2 * (1 + 2);
  // With room, the machine wears a row of cabinet bulbs over and under its reels (and the cabinet's own edge).
  const CABINET = area.h > 300 ? 2 * (14 + 6) + 2 * 6 : 0;
  const fitW = area.w ? Math.floor((area.w - FRAME - (CABINET ? 12 : 0) - (reels - 1) * GAP) / reels) - REEL_EDGE : 0;
  const fitH = area.h ? Math.floor((area.h - CABINET - FRAME - REEL_EDGE - (c.rows - 1) * GAP) / c.rows) : 0;
  const shape = reels === 3 ? 1.2 : 1.75;
  const fit = skin && area.w && area.h ? fitSkin(skin, area.w, area.h, reels, c.rows) : null;
  const gap = skin ? SKIN_GAP : GAP;
  const plainH = fitW && fitH ? Math.max(40, Math.min(Math.round(fitW * shape), fitH)) : 0;
  const cellH = skin ? (fit ? Math.max(30, fit.cellH) : 0) : plainH;
  const cellW = fit ? fit.reelW - 2 * SKIN_RIM : cellH ? Math.min(fitW, Math.round(cellH * (reels === 3 ? 1.25 : 1))) : 0;
  const symSize = fit ? fit.symSize : Math.round(Math.min(cellW, cellH) * (reels === 3 ? 0.74 : 0.8));
  // The reels keep the same pace in symbols a second however tall a cell is.
  const paceOf = (p: ReelPace): ReelPace => ({ ...p, speed: p.speed * Math.max(1, cellH / (reels === 3 ? 110 : 62)) });

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const pace = paceOf(REEL_PACE[turbo ? 'turbo' : 'normal']);
    const quick = paceOf(REEL_PACE.turbo);
    beat.current?.stop();
    pulse.setValue(0);
    setLit(new Set());
    setWaiting([]);
    setStatus({ text: theme.status });
    setHeld(balance.current - bet);
    pressHaptic();
    playSfx('spin', 0.7);
    let answered = false;
    const asked = playRound(id, bet, '', entry).then((r) => {
      answered = true;
      return r;
    });
    // The demo answers at once; a server needs a moment, and the reels run meanwhile instead of standing still.
    await sleep(30);
    if (!alive.current) return null;
    if (!answered && !still) handles.current.forEach((h) => h?.spin(pace));
    const r = await asked;
    if (!alive.current) return null;
    if (!r.ok) {
      // Refused (limit, balance, pool): the reels come back to where they stood.
      await Promise.all(handles.current.map((h, i) => h?.land(grid[i], reelRun(i, cellH + gap, c.rows, quick), quick, still)));
      if (!alive.current) return null;
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    const sp = r.outcome.slot!;
    // One symbol from a scatter prize or the JACKPOT: the remaining reels are waited for (never in turbo).
    const waits = turbo || still ? sp.grid.map(() => 0) : teasedReels(sp.grid, { scatter: c.scatter, wild: c.wild, wildLine: !!c.jackpotShare });
    setWaiting(waits.map((w) => w > 0));
    await Promise.all(
      sp.grid.map((col, i) =>
        handles.current[i]?.land(col, reelRun(i, cellH + gap, c.rows, pace, waits[i]), pace, still).then(() => {
          if (!alive.current) return;
          playSfx('stop', 0.75);
          tapHaptic();
          setWaiting((w) => w.map((x, k) => (k === i ? false : x)));
          if (waits[i + 1] && !waits[i]) playSfx('tease', 0.6);
        }),
      ),
    );
    if (!alive.current) return null;
    setGrid(sp.grid);
    setWaiting([]);
    const cells = new Set<string>();
    sp.wins.forEach((w) => c.lines[w.line].slice(0, w.count).forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (c.jackpotShare) sp.jackpotLines.forEach((l) => c.lines[l].forEach((row, reel) => cells.add(`${reel}-${row}`)));
    if (sp.scatters >= 3) sp.grid.forEach((col, reel) => col.forEach((x, row) => x === c.scatter && cells.add(`${reel}-${row}`)));
    setLit(cells);
    const payout = r.row.payout;
    // Less than the stake back is no win: the paying symbols are shown, but nothing beats, rings or rains.
    const won = payout > bet || (!!c.jackpotShare && sp.jackpotLines.length > 0);
    if (cells.size && won && !still) {
      beat.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      beat.current.start();
    }
    // Now the balance may show the win: it rolls up while the celebration runs.
    setHeld(null);
    if (c.jackpotShare && sp.jackpotLines.length) {
      const name = id === 'spellbook' ? 'GRAND' : 'JACKPOT';
      setStatus({ text: `${name}! +${fmt(payout)}`, tone: 'jackpot', amount: payout, label: `${name}!` });
      setShine((x) => x + 1);
      await win.celebrate({ amount: payout, bet, jackpot: true, title: name });
      return { net: payout - bet, stop: 'JACKPOT kazandın' };
    }
    // A skinned machine shows its big wins in its own pictures: the JACKPOT and, lighter, the Büyük Kazanç.
    if (skin && won && payout >= bet * skin.show.jackpotX) {
      setStatus({ text: `JACKPOT! +${fmt(payout)}`, tone: 'jackpot', amount: payout, label: 'JACKPOT' });
      await show.play({ kind: 'jackpot', amount: payout, bet });
      return { net: payout - bet, stop: 'JACKPOT kazandın' };
    }
    if (won) {
      const prize = id === 'spellbook' && sp.scatters >= 3 ? (sp.scatters >= 5 ? 'MAJOR' : sp.scatters === 4 ? 'MINOR' : 'MINI') : '';
      const big = !!skin && payout >= bet * skin.show.bigX;
      setStatus({ text: `KAZANÇ +${fmt(payout)}${prize ? ` · ${prize}` : ''}`, tone: 'win', amount: payout, label: big ? 'BÜYÜK KAZANÇ' : prize || 'KAZANÇ' });
      setShine((x) => x + 1);
      const seen = big ? show.play({ kind: 'big', amount: payout, bet }) : win.celebrate({ amount: payout, bet, smallOnly: !!skin });
      // Turbo doesn't stand still for a small win; everything bigger is watched to the end.
      if (!(turbo && winTierOf(payout, bet) === 'small')) await seen;
    } else if (payout > 0) setStatus({ text: `ÖDEME ${fmt(payout)}` });
    else setStatus({ text: theme.status });
    return { net: payout - bet, stop: payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
  };

  const play = async () => {
    if (busy || !cellH) return;
    setBusy(true);
    await spinOnce();
    if (alive.current) setBusy(false);
  };
  const toggleAuto = async () => {
    if (auto !== null) {
      stopAuto.current = true;
      return;
    }
    if (busy || !cellH) return;
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
    setStatus((st) => (st.tone === 'jackpot' ? st : { text: `${note} · net ${net >= 0 ? '+' : ''}${fmt(net)}`, tone: net > 0 ? 'win' : undefined }));
  };
  const paySyms = Object.keys(c.paytable).reverse();
  const jackpotName = id === 'spellbook' ? 'GRAND' : 'JACKPOT';
  const boxW = cellW ? reels * (cellW + REEL_EDGE) + (reels - 1) * GAP + FRAME : 0;
  // The bulbs run fast while a win is shown.
  const hot = status.tone === 'win' || status.tone === 'jackpot';
  const face = (sym: string, size: number) => {
    const art = skin?.symbols[sym];
    return art !== undefined ? <Image source={art} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors /> : <Symbol label={c.symbols[sym].label} sym={sym} theme={theme} size={size} />;
  };
  const reelsLabel = `Makaralar: ${grid.map((col) => col.map((x) => c.symbols[x].name).join(', ')).join(' | ')}`;
  const columns = () =>
    opening.map((col, reel) => (
      <View key={reel} style={[skin ? [s.skinReel, { width: cellW + 2 * SKIN_RIM }] : [s.reel, { width: cellW + REEL_EDGE }], waiting[reel] && s.reelWait]}>
        {/* The plates stand still: the symbols roll over them and come to rest on them. A skin's symbols need none. */}
        {!skin &&
          col.map((_, row) => {
            // A win lights its plates and dims the others with their symbols.
            const on = lit.has(`${reel}-${row}`);
            return <SymbolPlate key={row} w={cellW} h={cellH} tone={theme.plate} lit={on} style={[s.plate, { top: 1 + row * (cellH + GAP) }, lit.size > 0 && !on && s.plateDim]} />;
          })}
        <Reel
          ref={(h) => {
            handles.current[reel] = h;
          }}
          symbols={col}
          strip={strips[reel]}
          cell={cellH}
          gap={gap}
          pulse={pulse}
          dim={lit.size > 0}
          lit={col.map((_, row) => lit.has(`${reel}-${row}`))}
          shade={skin ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)'}
          litStyle={skin ? s.skinLit : undefined}
          render={(sym) => (skin ? face(sym, symSize) : <Symbol label={c.symbols[sym].label} sym={sym} theme={theme} size={symSize} />)}
        />
      </View>
    ));
  const controls = (
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
      look={theme.look}
      art={skin?.spin.src}
      caption={`${c.lines.length} çizgi × ${fmt(bet / c.lines.length)}`}
    />
  );
  // The JACKPOT fund and Kayıp Parşömen's three prizes, over the reels.
  const fundPlaque = fund !== undefined && (
    <FundPlaque name={jackpotName} style={{ marginHorizontal: 12 }}>
      <View accessibilityLabel={`${jackpotName} ${Math.floor(fund)} jeton`}>
        <RollingNumber value={Math.floor(fund)} style={plaqueValue} duration={900} />
      </View>
    </FundPlaque>
  );
  const prizes = id === 'spellbook' && (
    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch' }}>
      {(['MINI', 'MAJOR', 'MINOR'] as const).map((k) => (
        <View key={k} style={[s.prize, k === 'MAJOR' && s.prizeMajor]}>
          <Text style={s.prizeName}>{k}</Text>
          <Text style={s.prizeVal}>{fmt(SPELL_PRIZES[k] * bet)}</Text>
        </View>
      ))}
    </View>
  );
  const infoSheet = (
    <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
      <View style={s.pays}>
        <Text style={s.paysHead}>
          Bir çizgideki kazanç · {fmt(bet)} jeton bahiste · {reels === 3 ? '3 aynı' : '3 / 4 / 5 aynı'}
        </Text>
        {paySyms.map((x) => (
          <View key={x} style={s.payRow}>
            <View style={{ width: 52, alignItems: 'center' }}>{face(x, 34)}</View>
            <Text style={s.payName}>{c.symbols[x].name}</Text>
            <Text style={s.payVals}>{c.paytable[x].map((p) => fmt((p * bet) / c.lines.length)).join(' / ')}</Text>
          </View>
        ))}
        {c.wild && (
          <Text style={s.paysNote}>
            {c.symbols[c.wild].name} her sembolün yerine geçer{c.jackpotShare ? `; bir çizgide beşi ${jackpotName} fonunun bahis / ${fmt(Math.max(...game.bets))} kadarını kazandırır.` : '.'}
          </Text>
        )}
        <Text style={s.paysNote}>
          Oto {AUTO_SPINS} tur çevirir; {c.jackpotShare ? `${jackpotName}, ` : ''}
          {BIG_WIN} kat kazanç veya {AUTO_LOSS} bahislik kayıpta kendiliğinden durur.
        </Text>
      </View>
    </GameInfoSheet>
  );

  if (skin)
    return (
      <View style={salonScreen}>
        <View style={s.skinStage}>
          {/* The fund and the prizes leave room on the right for the "?" button. */}
          {(fundPlaque || prizes) && (
            <View style={s.skinHead}>
              {fundPlaque}
              {prizes}
            </View>
          )}
          <View style={s.area} onLayout={area.onLayout}>
            {fit && cellH > 0 && (
              <View style={{ width: fit.fw, alignItems: 'center' }}>
                <View style={{ width: fit.fw, height: fit.fh }}>
                  {/* The reels fill the cabinet's window and run a little under its edge; the cabinet is drawn over them. */}
                  <LinearGradient colors={skin.reels} style={[s.skinWindow, { left: fit.win.x - 2, top: fit.win.y - 2, width: fit.win.w + 4, height: fit.win.h + 4, padding: SKIN_PAD + 2, borderRadius: windowRadius(skin), overflow: skin.frame ? 'visible' : 'hidden' }]} accessibilityLabel={reelsLabel}>
                    {columns()}
                  </LinearGradient>
                  <SkinCabinet skin={skin} fit={fit} />
                </View>
                <SkinPlate skin={skin} width={fit.plateW} text={status.text} tone={status.tone} amount={status.amount} label={status.label} style={{ marginTop: -fit.lap }} />
              </View>
            )}
          </View>
          <View style={s.skinInfo}>
            <InfoButton onPress={() => setInfo(true)} tint="rgba(255,231,176,0.7)" />
          </View>
          {win.layer}
        </View>
        {controls}
        {infoSheet}
        {show.layer}
      </View>
    );

  return (
    <View style={salonScreen}>
      <SalonStage colors={theme.colors} win={shine} minHeight={reels === 3 ? 330 : 300}>
        <StageHeader title={theme.title} kicker={`${reels} MAKARA · ${c.lines.length} ÇİZGİ`} onInfo={() => setInfo(true)} />
        {fundPlaque}
        {prizes}
        <View style={s.area} onLayout={area.onLayout}>
          {cellH > 0 && (
          <View style={[CABINET > 0 && s.cabinet, CABINET > 0 && { borderColor: `${theme.frame}55` }]}>
            {CABINET > 0 && <Marquee width={boxW} hot={hot} />}
            <View style={[s.reels, { width: boxW, backgroundColor: theme.reels, borderColor: theme.frame }]} accessibilityLabel={reelsLabel}>
              {columns()}
            </View>
            {CABINET > 0 && <Marquee width={boxW} hot={hot} />}
          </View>
          )}
        </View>
        <StageStatus text={status.text} tone={status.tone} amount={status.amount} label={status.label} />
        {win.layer}
      </SalonStage>

      {controls}
      {infoSheet}
    </View>
  );
}

/** Between two symbols of a reel, and between two reels (px). */
const GAP = 4;

const s = StyleSheet.create({
  prize: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(4,9,20,0.55)', paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(233,201,139,0.55)' },
  prizeMajor: { borderColor: SALON.goldHi, backgroundColor: 'rgba(246,189,96,0.18)' },
  prizeName: { color: SALON.goldHi, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  prizeVal: { color: '#fff', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  // The reels' area takes the stage's free height; the reels sit in its middle.
  area: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  cabinet: { padding: 6, gap: 6, borderRadius: 22, borderWidth: 1, backgroundColor: 'rgba(3,7,16,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' },
  reels: { flexDirection: 'row', gap: GAP, borderRadius: 16, padding: 6, borderWidth: 2, boxShadow: '0 8px 18px rgba(0,0,0,0.5), inset 0 2px 10px rgba(0,0,0,0.7)' },
  reel: { borderRadius: 12, padding: 1, borderWidth: 2, borderColor: 'transparent' },
  plate: { position: 'absolute', left: 1 },
  plateDim: { opacity: 0.4 },
  // A reel being waited for: its frame lights up until it stops.
  reelWait: { borderColor: '#FFE08A', boxShadow: '0 0 14px rgba(255,224,138,0.9)' },
  // A skinned machine: no stage of the shell's, the game panel's picture behind it (fx/slot-skin).
  skinStage: { flex: 1, minHeight: 330 },
  skinWindow: { position: 'absolute', flexDirection: 'row', gap: SKIN_GAP },
  skinHead: { gap: 6, paddingRight: 40, paddingTop: 2 },
  skinReel: { borderRadius: 6, borderWidth: SKIN_RIM, borderColor: 'transparent' },
  skinInfo: { position: 'absolute', top: 0, right: 0 },
  skinLit: { borderColor: 'rgba(255,224,138,0.75)', backgroundColor: 'rgba(255,190,80,0.16)', boxShadow: '0 0 12px rgba(255,200,90,0.55), inset 0 0 10px rgba(255,214,120,0.35)' },
  barWrap: { gap: 2, alignItems: 'center' },
  bar: { color: '#5A2A06', backgroundColor: '#F6BD60', fontWeight: '900', borderRadius: 4, borderWidth: 1.5, borderColor: '#7C3F0E', overflow: 'hidden', textAlign: 'center' },
  letter: { fontWeight: '900', fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 3 }, textShadowRadius: 3 },
  pays: { gap: 8 },
  paysHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payName: { color: '#fff', fontWeight: '700', flex: 1 },
  payVals: { color: '#FDE68A', fontWeight: '800', fontVariant: ['tabular-nums'] },
  paysNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
