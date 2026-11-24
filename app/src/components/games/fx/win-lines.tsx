// The winning paylines drawn over the reels, as a slot machine shows them: every winning line lights at once for a
// moment, then each one in turn, a glowing line through its symbols with what that line paid written on it, a click
// for each. It keeps cycling while the win stands (the next round clears it). Decoration only: the round is settled
// and paid before anything here moves; never takes a touch. With motion reduced every line stays lit, still.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { fonts } from '@/theme';

export type WinLine = {
  /** The centres of the line's winning cells, left to right (px, in the overlay's box). */
  points: [number, number][];
  /** What this line paid (coins), written on it; 0 writes nothing (a JACKPOT line: the show says it). */
  amount: number;
};

/** How long all lines stay lit together, then each line alone (ms). */
const ALL_MS = 900;
const EACH_MS = 1100;

export function WinLines({ lines, color = '#FFE08A', still }: { lines: WinLine[]; color?: string; still?: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  // The parent works the points out on every render: the cycle restarts only for other lines.
  const sig = lines.map((l) => `${l.points.join(';')}=${l.amount}`).join('|');
  // Which line is alone for these lines: -1 every line (also before the first step, and for new lines).
  const [step, setStep] = useState({ sig: '', i: -1 });
  const shown = step.sig === sig ? step.i : -1;
  useEffect(() => {
    if (!lines.length || still) {
      v.setValue(1);
      return;
    }
    let i = -1;
    let timer: ReturnType<typeof setTimeout>;
    const draw = () => {
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };
    const next = () => {
      // A single line is already shown by the "all" step: it just stays.
      if (lines.length < 2 && i >= 0) return;
      i = i + 1 >= lines.length ? 0 : i + 1;
      setStep({ sig, i });
      draw();
      playSfx('tick', 0.55);
      timer = setTimeout(next, EACH_MS);
    };
    draw();
    timer = setTimeout(next, ALL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, still, v]);
  if (!lines.length) return null;
  const pick = shown < 0 ? lines : [lines[shown]].filter(Boolean);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: v }]}>
      {pick.map((l, k) => (
        <Line key={`${shown}-${k}`} line={l} color={color} label={shown >= 0 || lines.length === 1} />
      ))}
    </Animated.View>
  );
}

function Line({ line, color, label }: { line: WinLine; color: string; label: boolean }) {
  const pts = line.points;
  const mid = pts[Math.floor((pts.length - 1) / 2)];
  return (
    <>
      {pts.slice(1).map(([x2, y2], i) => {
        const [x1, y1] = pts[i];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        return (
          <View key={`s${i}`} style={[s.seg, { left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 2.5, width: len, backgroundColor: color, boxShadow: `0 0 10px 2px ${color}`, transform: [{ rotate: `${deg}deg` }] }]}>
            <View style={s.core} />
          </View>
        );
      })}
      {pts.map(([x, y], i) => (
        <View key={`d${i}`} style={[s.dot, { left: x - 4, top: y - 4, boxShadow: `0 0 10px 3px ${color}` }]} />
      ))}
      {label && mid && line.amount > 0 && (
        // Centred on the line's middle cell whatever its width: a wide box, the pill as wide as its number.
        <View style={[s.label, { left: mid[0] - 100, top: mid[1] - 13 }]}>
          <View style={[s.pill, { borderColor: color, boxShadow: `0 0 14px 1px ${color}` }]}>
            <Text style={s.amount} numberOfLines={1}>
              +{Math.floor(line.amount).toLocaleString('tr-TR')}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  seg: { position: 'absolute', height: 5, borderRadius: 3, opacity: 0.95, justifyContent: 'center' },
  // A white-hot thread down the middle of the line.
  core: { height: 1.5, marginHorizontal: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.9)' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  label: { position: 'absolute', width: 200, height: 26, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1.5, backgroundColor: 'rgba(10,14,32,0.78)', alignItems: 'center', justifyContent: 'center' },
  amount: { color: '#FFF3C4', fontFamily: fonts.display, fontSize: 15, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(255,196,60,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
});
