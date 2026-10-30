// Roket: crash game screen (lib/crash-rocket). Choose the bet and the cash-out multiplier ("kaçış"), then launch. The
// crash point is drawn by playCasino (lib/games) before launch; the climb only replays it: the multiplier rises until
// the rocket reaches your cash-out (you win bet × cash-out) or explodes first. Oto launches again and stops at the
// loss limit or any refusal.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CasinoLock } from '@/components/games/casino';
import { BalancePill, GameBalanceNote, fmt, sleep } from '@/components/games/slot-kit';
import { ROCKET_TARGETS } from '@/lib/crash-rocket';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry } from '@/lib/games';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

const short = (n: number) => (n >= 1_000 ? `${n / 1_000}K` : String(n));
const HEIGHT = 300;
/** The multiplier grows as e^(GROWTH · seconds), like the reference: 2x after ~2.8 s, 10x after ~9 s. */
const GROWTH = 0.25;
const AUTO_LOSS = 20;
const CHIP_COLORS = ['#16A34A', '#2563EB', '#DC2626', '#7C3AED'];

type Phase = { kind: 'idle' } | { kind: 'fly'; x: number } | { kind: 'cashed'; x: number; win: number } | { kind: 'boom'; x: number };

export function RocketPlayer({ entry }: { entry: Entry }) {
  const { wealthLevel } = useApp();
  const { casino } = useGames();
  const game = casino.find((g) => g.id === 'rocket')!;
  const [bet, setBet] = useState(game.bets[0]);
  const [target, setTarget] = useState(2);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [history, setHistory] = useState<number[]>([]);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  const autoOn = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
      autoOn.current = false;
    },
    [],
  );

  const access = casinoAccess(game, entry, wealthLevel);
  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  /** One launch; resolves with the round's net, or null when it was refused. */
  const launch = async (): Promise<number | null> => {
    const r = playCasino('rocket', bet, String(target), entry, newRequestId());
    if (!r.ok) {
      setNote(r.reason);
      errorHaptic();
      return null;
    }
    pressHaptic();
    setNote(null);
    const { crash } = r.outcome.rocket!;
    const stop = crash >= target ? target : crash;
    const t0 = Date.now();
    for (;;) {
      if (!alive.current) return null;
      const x = Math.exp((GROWTH * (Date.now() - t0)) / 1000);
      if (x >= stop || stop < 1) break;
      setPhase({ kind: 'fly', x });
      await sleep(40);
    }
    setHistory((h) => [crash, ...h].slice(0, 8));
    if (crash >= target) {
      setPhase({ kind: 'cashed', x: target, win: r.row.payout });
      successHaptic();
    } else {
      setPhase({ kind: 'boom', x: crash || 1 });
      errorHaptic();
    }
    return r.row.payout - bet;
  };

  const play = async () => {
    if (phase.kind === 'fly') return;
    await launch();
  };
  const toggleAuto = async () => {
    if (autoOn.current) {
      autoOn.current = false;
      setAuto(false);
      return;
    }
    autoOn.current = true;
    setAuto(true);
    let net = 0;
    while (autoOn.current && alive.current) {
      const d = await launch();
      if (d === null) break;
      net += d;
      if (-net >= bet * AUTO_LOSS) {
        setNote(`Oto durdu: kayıp limiti (${fmt(bet * AUTO_LOSS)} jeton)`);
        break;
      }
      await sleep(1200);
    }
    autoOn.current = false;
    setAuto(false);
  };

  const x = phase.kind === 'idle' ? 1 : phase.x;
  // Height on screen: log scale so 1x is the ground and 20x is near the top.
  const lift = Math.min(1, Math.log(x) / Math.log(20));
  const flying = phase.kind === 'fly';

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient colors={['#0B1026', '#1E1B4B', '#312E81']} style={s.scene}>
        {[...Array(18)].map((_, i) => (
          <View key={i} style={[s.star, { left: `${(i * 37) % 100}%`, top: `${(i * 53) % 90}%` }]} />
        ))}
        <View style={s.scale}>
          {[10, 5, 2].map((m) => (
            <Text key={m} style={[s.scaleText, { bottom: (Math.log(m) / Math.log(20)) * (HEIGHT - 90) + 40 }]}>
              {m}x
            </Text>
          ))}
        </View>
        <View style={s.planet} />
        <Text style={[s.rocket, { bottom: 40 + lift * (HEIGHT - 110), left: `${20 + lift * 45}%`, transform: [{ rotate: '-45deg' }] }]}>{phase.kind === 'boom' ? '💥' : '🚀'}</Text>
        <View style={s.readout} accessibilityLiveRegion="polite">
          <Text style={[s.mult, phase.kind === 'boom' && { color: '#F87171' }, phase.kind === 'cashed' && { color: '#4ADE80' }]}>{x.toFixed(2)}x</Text>
          <Text style={s.sub}>
            {phase.kind === 'idle'
              ? `Kaçış ${target}x · bahis ${fmt(bet)}`
              : phase.kind === 'fly'
                ? `Kaçış ${target}x'te`
                : phase.kind === 'cashed'
                  ? `Kaçtın! +${fmt(phase.win)} jeton`
                  : phase.x <= 1
                    ? 'Rampada patladı'
                    : `${phase.x.toFixed(2)}x'te patladı`}
          </Text>
        </View>
      </LinearGradient>

      <View style={s.history}>
        <Text style={s.histLabel}>Geçmiş</Text>
        {history.map((h, i) => (
          <Text key={i} style={[s.histChip, h >= 2 && { borderColor: '#FACC15', color: '#FDE68A' }, h >= 10 && { borderColor: '#C084FC', color: '#E9D5FF' }]}>
            {h ? h.toFixed(2) : '0.00'}
          </Text>
        ))}
      </View>

      <View style={s.panel}>
        <Text style={s.panelLabel}>Bahis</Text>
        <View style={s.row}>
          {game.bets.map((b, i) => (
            <Pressable
              key={b}
              disabled={flying || auto}
              onPress={() => {
                tapHaptic();
                setBet(b);
              }}
              style={[s.can, { backgroundColor: CHIP_COLORS[i % 4] }, bet === b && s.canOn]}
              accessibilityLabel={`Bahis ${b}`}
            >
              <Text style={s.canText}>{short(b)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.panelLabel}>Kaçış çarpanı</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {ROCKET_TARGETS.map((t) => (
            <Pressable key={t} disabled={flying || auto} onPress={() => setTarget(t)} style={[s.target, target === t && s.targetOn]} accessibilityLabel={`Kaçış ${t} kat`}>
              <Text style={s.targetText}>{t}x</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {note && <Text style={s.note}>{note}</Text>}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <BalancePill tint="#1E1B4B" />
        <Pressable onPress={toggleAuto} style={[s.auto, auto && { backgroundColor: '#B91C1C' }]} accessibilityLabel={auto ? 'Otomatik fırlatmayı durdur' : 'Otomatik fırlat'}>
          <Text style={s.autoText}>{auto ? 'DUR' : 'OTO'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={play} disabled={flying || auto} style={[(flying || auto) && { opacity: 0.55 }]} accessibilityLabel={`Fırlat, ${bet} jeton, kaçış ${target} kat`}>
        <LinearGradient colors={['#FACC15', '#EA580C']} style={s.go}>
          <Text style={s.goText}>{flying ? 'Roket uçuyor…' : `🚀 FIRLAT · ${fmt(bet)}`}</Text>
        </LinearGradient>
      </Pressable>
      <GameBalanceNote rules={game.rules} />
    </View>
  );
}

const s = StyleSheet.create({
  scene: { height: HEIGHT, borderRadius: 20, overflow: 'hidden' },
  star: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  scale: { position: 'absolute', right: 10, top: 0, bottom: 0 },
  scaleText: { position: 'absolute', right: 0, color: 'rgba(255,255,255,0.45)', fontWeight: '800', fontSize: 12 },
  planet: { position: 'absolute', left: '15%', right: '15%', bottom: -170, height: 220, borderRadius: 200, backgroundColor: '#FDE68A', opacity: 0.85 },
  rocket: { position: 'absolute', fontSize: 46 },
  readout: { position: 'absolute', left: 0, right: 0, top: 26, alignItems: 'center' },
  mult: { color: '#FACC15', fontSize: 46, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 6 },
  sub: { color: '#E0E7FF', fontWeight: '800' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  histLabel: { color: '#A5B4FC', fontWeight: '800', fontSize: 12 },
  histChip: { color: '#93C5FD', borderWidth: 1.5, borderColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 6, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  panel: { backgroundColor: '#1E1B4B', borderRadius: 16, padding: 12, gap: 8, borderWidth: 2, borderColor: '#FACC15' },
  panelLabel: { color: '#C7D2FE', fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  can: { width: 60, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  canOn: { borderColor: '#FACC15', borderWidth: 3, transform: [{ scale: 1.08 }] },
  canText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  target: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 10, paddingVertical: 5 },
  targetOn: { borderColor: '#FACC15', backgroundColor: 'rgba(250,204,21,0.2)' },
  targetText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  note: { color: '#FDE68A', fontWeight: '700', textAlign: 'center', fontSize: 12 },
  auto: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#CA8A04' },
  autoText: { color: '#fff', fontWeight: '900' },
  go: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  goText: { color: '#1F2937', fontWeight: '900', fontSize: 17, letterSpacing: 1 },
});
