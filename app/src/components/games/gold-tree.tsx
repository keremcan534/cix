// Bereket Ağacı: 3 reels, the middle row pays by combination (lib/gold-tree). playCasino (lib/games) settles the round
// before the reels come to rest; they (components/games/fx/reel) only replay outcome.tree, the last one waited for
// when the first two already match. Oto stops at a big win, the loss limit or any refusal. With its skin
// (fx/slot-skin) the machine is drawn in its own pictures: the cabinet over the reels, the coins and the tree as
// pictures, its win plate and spin button, and the 🌳🌳🌳 / big wins in the skin's show (fx/jackpot-show).
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { GameInfoSheet, InfoButton } from '@/components/games/fx/info-sheet';
import { useJackpotShow } from '@/components/games/fx/jackpot-show';
import { Reel, type ReelHandle } from '@/components/games/fx/reel';
import { ContactShadow, SALON, SalonStage, StageHeader, StageStatus, SymbolPlate, salonScreen, symbolShadow, useBox, type StatusTone } from '@/components/games/fx/salon';
import { SKIN_GAP, SKIN_PAD, SKIN_RIM, SkinCabinet, SkinPlate, fitSkin, slotSkinOf, windowRadius } from '@/components/games/fx/slot-skin';
import { useWinFx } from '@/components/games/fx/win-fx';
import { SpinControls, fmt, sleep } from '@/components/games/slot-kit';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { casinoAccess, useGames, type Entry } from '@/lib/games';
import { playRound } from '@/lib/live/casino';
import { TREE_LABEL, TREE_OPENING, TREE_PAYS, TREE_STRIPS, treeWindow, type TreeSym } from '@/lib/gold-tree';
import { errorHaptic, pressHaptic, tapHaptic } from '@/lib/haptics';
import { REEL_PACE, reelRun, type ReelPace } from '@/lib/reel-plan';
import { winTierOf } from '@/lib/win-tier';
import { useApp } from '@/store';

const BIG_WIN = 10;
const AUTO_SPINS = 25;
const AUTO_LOSS = 25;
const COIN: Partial<Record<TreeSym, [string, string]>> = { red: ['#F87171', '#B91C1C'], blue: ['#60A5FA', '#1D4ED8'], green: ['#4ADE80', '#15803D'] };

/** One stop of a reel: a coin with its square hole, the tree, or a faint bar for an empty stop. `size` is the coin's. */
function TreeCell({ sym, size }: { sym: TreeSym; size: number }) {
  const c = COIN[sym];
  if (c)
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ContactShadow size={size} style={{ bottom: -size * 0.06 }} />
        <LinearGradient colors={c} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[t.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.05) }]}>
          <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={[t.coinGloss, { borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2 }]} />
          <View style={[t.coinHole, { width: size * 0.28, height: size * 0.28 }]} />
        </LinearGradient>
      </View>
    );
  // An empty stop: a faint bar, so a reel that stops between symbols still reads as a reel.
  if (sym === 'blank') return <View style={[t.blank, { width: size * 0.45 }]} />;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ContactShadow size={size} />
      <Text style={[symbolShadow, { fontSize: size * 0.8, lineHeight: size }]}>{TREE_LABEL[sym]}</Text>
    </View>
  );
}

/** A stop in the skin's pictures; an empty stop is a faint bar on the dark reel. */
function SkinCell({ src, size }: { src: number | undefined; size: number }) {
  if (src === undefined) return <View style={[t.blank, t.skinBlank, { width: size * 0.4 }]} />;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** Between two stops of a reel and between two reels (px). */
const GAP = 4;
/** The reels' box: padding 6 and rim 2 a side; a reel: rim 2 a side. */
const BOX_EDGE = 2 * (6 + 2);
const REEL_EDGE = 2 * 2;

export function GoldTreePlayer({ entry }: { entry: Entry }) {
  const { wealthLevel, settings, coins, gameCoins } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'goldtree')!;
  const still = settings.reduceMotion;
  const [bet, setBet] = useState(game.bets[2] ?? game.bets[0]);
  const [opening] = useState<TreeSym[][]>(() => treeWindow(TREE_OPENING));
  const [grid, setGrid] = useState(opening);
  const [status, setStatus] = useState<{ text: string; tone?: StatusTone; amount?: number; label?: string }>({ text: 'BOL ŞANS' });
  // Each win sends a shine across the stage; the reels take the stage's free height.
  const [shine, setShine] = useState(0);
  const area = useBox();
  const [hit, setHit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // The balance with the stake taken, while the reels run; the win joins it when it is seen.
  const [held, setHeld] = useState<number | null>(null);
  const handles = useRef<(ReelHandle | null)[]>([]);
  const balance = useRef(coins + gameCoins);
  const alive = useRef(true);
  const stopAuto = useRef(false);
  const [pulse] = useState(() => new Animated.Value(0));
  const beat = useRef<Animated.CompositeAnimation | null>(null);
  const win = useWinFx();
  const skin = slotSkinOf('goldtree');
  const show = useJackpotShow(skin);
  useEffect(() => {
    balance.current = coins + gameCoins;
  });
  useEffect(() => {
    warmSfx(['spin', 'stop', 'win', 'coin']);
    return () => {
      alive.current = false;
      stopAuto.current = true;
      beat.current?.stop();
    };
  }, []);

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  // A stop as tall as the area allows, a little wider than tall; the coins grow with it.
  const fitW = area.w ? Math.floor((area.w - BOX_EDGE - 2 * GAP) / 3) - REEL_EDGE : 0;
  const fitH = area.h ? Math.floor((area.h - BOX_EDGE - REEL_EDGE - 2 * GAP) / 3) : 0;
  // A skin's reels fill its cabinet's window instead (fx/slot-skin).
  const fit = skin && area.w && area.h ? fitSkin(skin, area.w, area.h, 3, 3) : null;
  const gap = skin ? SKIN_GAP : GAP;
  const CELL = skin ? (fit ? Math.max(30, fit.cellH) : 70) : fitW && fitH ? Math.max(48, Math.min(Math.round(fitW * 1.1), fitH, 150)) : 70;
  const cellW = skin ? (fit ? fit.reelW - 2 * SKIN_RIM : 0) : fitW ? Math.min(fitW, Math.round(CELL * 1.3)) : 0;
  const coin = fit ? fit.symSize : Math.round(CELL * 0.8);
  // The reels keep the same pace in symbols a second however tall a stop is.
  const paceOf = (p: ReelPace): ReelPace => ({ ...p, speed: p.speed * Math.max(1, CELL / 70) });

  const spinOnce = async (): Promise<{ net: number; stop: string | null } | null> => {
    const pace = paceOf(REEL_PACE[turbo ? 'turbo' : 'normal']);
    beat.current?.stop();
    pulse.setValue(0);
    setHit(null);
    setWaiting(false);
    setStatus({ text: 'BOL ŞANS' });
    setHeld(balance.current - bet);
    pressHaptic();
    playSfx('spin', 0.7);
    let answered = false;
    const asked = playRound('goldtree', bet, '', entry).then((r) => {
      answered = true;
      return r;
    });
    // The demo answers at once; a server needs a moment, and the reels run meanwhile.
    await sleep(30);
    if (!alive.current) return null;
    if (!answered && !still) handles.current.forEach((h) => h?.spin(pace));
    const r = await asked;
    if (!alive.current) return null;
    if (!r.ok) {
      const quick = paceOf(REEL_PACE.turbo);
      await Promise.all(handles.current.map((h, i) => h?.land(grid[i], reelRun(i, CELL + gap, 3, quick), quick, still)));
      if (!alive.current) return null;
      setHeld(null);
      setStatus({ text: r.reason, tone: 'err' });
      errorHaptic();
      return null;
    }
    const sp = r.outcome.tree!;
    // The first two already match on the pay line (two trees, two coins of a colour): the third is waited for.
    const [a, b] = [sp.grid[0][1], sp.grid[1][1]];
    const wait = !turbo && !still && a === b && (a === 'tree' || a in COIN);
    await Promise.all(
      sp.grid.map((col, i) =>
        handles.current[i]?.land(col, reelRun(i, CELL + gap, 3, pace, wait && i === 2 ? 1 : 0), pace, still).then(() => {
          if (!alive.current) return;
          playSfx('stop', 0.75);
          tapHaptic();
          if (wait && i === 1) {
            setWaiting(true);
            playSfx('tease', 0.6);
          }
        }),
      ),
    );
    if (!alive.current) return null;
    setGrid(sp.grid);
    setWaiting(false);
    setHeld(null);
    const payout = r.row.payout;
    if (sp.win) {
      // In the skin's pictures, three trees (188×) are the machine's JACKPOT and three coins of a colour a Büyük Kazanç.
      const kind = skin && payout >= bet * skin.show.jackpotX ? 'jackpot' : skin && payout >= bet * skin.show.bigX ? 'big' : null;
      setHit(sp.win.name);
      setStatus({ text: `${sp.win.name} · +${fmt(payout)}`, tone: kind === 'jackpot' ? 'jackpot' : 'win', amount: payout, label: kind === 'jackpot' ? 'JACKPOT' : kind === 'big' ? 'BÜYÜK KAZANÇ' : sp.win.name.toLocaleUpperCase('tr-TR') });
      setShine((x) => x + 1);
      if (!still) {
        beat.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        beat.current.start();
      }
      const seen = kind ? show.play({ kind, amount: payout, bet }) : win.celebrate({ amount: payout, bet, smallOnly: !!skin });
      if (!(turbo && winTierOf(payout, bet) === 'small')) await seen;
    }
    return { net: payout - bet, stop: payout >= bet * BIG_WIN ? 'büyük kazanç' : null };
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

  const controls = (
    <SpinControls
      held={held}
      bets={game.bets}
      bet={bet}
      onBet={setBet}
      busy={busy}
      turbo={turbo}
      onTurbo={() => setTurbo((v) => !v)}
      auto={auto}
      autoSpins={AUTO_SPINS}
      onAuto={toggleAuto}
      onSpin={play}
      look={{ ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#C93C4F', '#5A1020'], ink: SALON.win }}
      art={skin?.spin.src}
    />
  );
  const infoSheet = (
    <GameInfoSheet visible={info} onClose={() => setInfo(false)} title={game.name} rules={game.rules}>
      <View style={{ gap: 6 }}>
        <Text style={t.infoHead}>Orta çizgi öder · bahsin katı</Text>
        {TREE_PAYS.map((p) => (
          <View key={p.name} style={t.infoRow}>
            <Text style={t.infoName}>{p.name}</Text>
            <Text style={t.infoVal}>
              {p.pay}× · {fmt(p.pay * bet)}
            </Text>
          </View>
        ))}
        <Text style={t.infoNote}>
          Oto {AUTO_SPINS} tur çevirir; {BIG_WIN} kat kazanç veya {AUTO_LOSS} bahislik kayıpta kendiliğinden durur.
        </Text>
      </View>
    </GameInfoSheet>
  );
  const paytable = (
    <View style={t.paytable}>
      {TREE_PAYS.map((p) => (
        <View key={p.name} style={[t.pay, hit === p.name && t.payOn]}>
          <Text style={t.payName}>{p.name}</Text>
          <Text style={t.payVal}>{p.pay}</Text>
        </View>
      ))}
    </View>
  );

  if (skin)
    return (
      <View style={salonScreen}>
        <View style={t.skinStage}>
          {/* The pays leave room on the right for the "?" button. */}
          <View style={t.skinHead}>{paytable}</View>
          <View style={t.area} onLayout={area.onLayout}>
            {fit && cellW > 0 && (
              <View style={{ width: fit.fw, alignItems: 'center' }}>
                <View style={{ width: fit.fw, height: fit.fh }}>
                  {/* The reels fill the cabinet's window and run a little under its edge; the cabinet is drawn over them. */}
                  <LinearGradient colors={skin.reels} style={[t.skinWindow, { left: fit.win.x - 2, top: fit.win.y - 2, width: fit.win.w + 4, height: fit.win.h + 4, padding: SKIN_PAD + 2, borderRadius: windowRadius(skin), overflow: skin.frame ? 'visible' : 'hidden' }]} accessibilityLabel={`Orta çizgi: ${grid.map((c) => c[1]).join(', ')}`}>
                    {opening.map((col, reel) => (
                      <View key={reel} style={[t.skinReel, { width: cellW + 2 * SKIN_RIM }, waiting && reel === 2 && t.reelWait]}>
                        <Reel
                          ref={(h) => {
                            handles.current[reel] = h;
                          }}
                          symbols={col}
                          strip={TREE_STRIPS[reel]}
                          cell={CELL}
                          gap={gap}
                          pulse={pulse}
                          dim={!!hit}
                          lit={[false, !!hit, false]}
                          shade="rgba(0,0,0,0.5)"
                          litStyle={t.skinLit}
                          render={(sym) => <SkinCell src={skin.symbols[sym]} size={coin} />}
                        />
                      </View>
                    ))}
                    {/* Through the middle of the middle row (the window's padding and the reel's rim above it). */}
                    <View style={[t.line, { top: SKIN_PAD + 2 + SKIN_RIM + CELL + gap + CELL / 2 - 1.5 }]} pointerEvents="none" />
                  </LinearGradient>
                  <SkinCabinet skin={skin} fit={fit} />
                </View>
                <SkinPlate skin={skin} width={fit.plateW} text={status.text} tone={status.tone} amount={status.amount} label={status.label} style={{ marginTop: -fit.lap }} />
              </View>
            )}
          </View>
          <View style={t.skinInfo}>
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
      <SalonStage colors={['#2F7038', '#184425', '#0A1E12']} win={shine} minHeight={330}>
        <StageHeader title="BEREKET AĞACI" kicker="3 MAKARA · ORTA ÇİZGİ ÖDER" onInfo={() => setInfo(true)} />
        {paytable}
        <View style={t.area} onLayout={area.onLayout}>
          {cellW > 0 && (
            <View style={t.reels} accessibilityLabel={`Orta çizgi: ${grid.map((c) => c[1]).join(', ')}`}>
              {opening.map((col, reel) => (
                <View key={reel} style={[t.reel, { width: cellW + REEL_EDGE }, waiting && reel === 2 && t.reelWait]}>
                  {col.map((_, row) => (
                    // A win lights the pay line's plates and dims the others with their stops.
                    <SymbolPlate key={row} w={cellW} h={CELL} tone={CREAM} lit={!!hit && row === 1} style={[t.plate, { top: row * (CELL + GAP) }, !!hit && row !== 1 && { opacity: 0.4 }]} />
                  ))}
                  <Reel
                    ref={(h) => {
                      handles.current[reel] = h;
                    }}
                    symbols={col}
                    strip={TREE_STRIPS[reel]}
                    cell={CELL}
                    gap={GAP}
                    pulse={pulse}
                    dim={!!hit}
                    // Only the middle row pays.
                    lit={[false, !!hit, false]}
                    shade="rgba(15,23,42,0.22)"
                    render={(sym) => <TreeCell sym={sym as TreeSym} size={coin} />}
                  />
                </View>
              ))}
              {/* Through the middle of the middle row (the box's padding and the reel's rim above it). */}
              <View style={[t.line, { top: 6 + 2 + CELL + GAP + CELL / 2 - 1.5 }]} pointerEvents="none" />
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

/** The cream plate each stop rests on. */
const CREAM = ['#FFFDF5', '#F4E8CC', '#D9C392'] as const;

const t = StyleSheet.create({
  paytable: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignSelf: 'stretch', backgroundColor: 'rgba(4,14,8,0.55)', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(246,189,96,0.55)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.55)' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  payOn: { backgroundColor: 'rgba(246,189,96,0.35)', boxShadow: '0 0 10px rgba(246,189,96,0.6)' },
  payName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  payVal: { color: SALON.win, fontWeight: '900', fontSize: 16, fontVariant: ['tabular-nums'] },
  // The reels take the stage's free height and sit in its middle.
  area: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 170 },
  reels: { flexDirection: 'row', gap: GAP, backgroundColor: '#0B2414', borderRadius: 16, padding: 6, borderWidth: 2, borderColor: SALON.gold, boxShadow: '0 8px 18px rgba(0,0,0,0.5), inset 0 2px 10px rgba(0,0,0,0.7)' },
  reel: { borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  plate: { position: 'absolute', left: 0 },
  reelWait: { borderColor: '#FFE08A', boxShadow: '0 0 14px rgba(255,224,138,0.9)' },
  coin: { alignItems: 'center', justifyContent: 'center', borderColor: SALON.gold, overflow: 'hidden', boxShadow: '0 3px 6px rgba(0,0,0,0.35)' },
  coinGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  coinHole: { backgroundColor: '#FEF3C7', borderWidth: 2, borderColor: '#92400E' },
  blank: { height: 5, borderRadius: 3, backgroundColor: 'rgba(15,23,42,0.15)' },
  // In the skin's pictures: no stage of the shell's, the game panel's picture behind it (fx/slot-skin).
  skinStage: { flex: 1, minHeight: 330 },
  skinHead: { paddingRight: 40, paddingTop: 2 },
  skinWindow: { position: 'absolute', flexDirection: 'row', gap: SKIN_GAP },
  skinReel: { borderRadius: 6, borderWidth: SKIN_RIM, borderColor: 'transparent' },
  skinInfo: { position: 'absolute', top: 0, right: 0 },
  skinLit: { borderColor: 'rgba(255,224,138,0.75)', backgroundColor: 'rgba(255,190,80,0.16)', boxShadow: '0 0 12px rgba(255,200,90,0.55), inset 0 0 10px rgba(255,214,120,0.35)' },
  skinBlank: { backgroundColor: 'rgba(255,231,176,0.16)' },
  line: { position: 'absolute', left: 2, right: 2, height: 3, borderRadius: 2, backgroundColor: '#FF6576', opacity: 0.9, boxShadow: '0 0 8px rgba(255,101,118,0.8)' },
  infoHead: { color: '#FDE68A', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  infoName: { color: '#fff', fontWeight: '700', flex: 1 },
  infoVal: { color: '#FDE68A', fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
});
