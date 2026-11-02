import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { litBeads, type Similarity } from '@/lib/similarity';
import { colors, semantic } from '@/theme';

/** High matches get the brand turquoise, the rest stay neutral so the chip never reads as a warning. */
const tone = (score: number) => (score >= 70 ? semantic.action : score >= 50 ? semantic.tonalText : colors.textDim);

export function SimilarityChip({ score }: { score: number }) {
  return (
    <View style={[s.chip, { borderColor: tone(score) }]} accessibilityLabel={`Yüzde ${score} benzer`}>
      <Text style={[s.chipText, { color: tone(score) }]}>%{score} benzer</Text>
    </View>
  );
}

export function SimilarityCard({ sim, name }: { sim: Similarity; name: string }) {
  return (
    <View style={s.card}>
      <View style={[s.ring, { borderColor: tone(sim.score) }]}>
        <Text style={[s.score, { color: tone(sim.score) }]}>%{sim.score}</Text>
        <Text style={s.caption}>benzer</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.title}>{name} ile ortak noktalarınız</Text>
        {sim.reasons.length ? (
          sim.reasons.map((r) => (
            <Text key={r} style={s.reason}>
              • {r}
            </Text>
          ))
        ) : (
          <Text style={s.reason}>Henüz ortak ilgi alanınız yok; farklı bakış açıları da güzel sohbet çıkarır.</Text>
        )}
      </View>
    </View>
  );
}

const BEADS = 12;

/**
 * A bead necklace around a seat's avatar: the more the person has in common with you, the more beads light up,
 * clockwise from the top (lib/similarity litBeads). Plain Views, no SVG; static, so motion settings don't apply.
 */
export const SimilarityRing = memo(function SimilarityRing({ score, size }: { score: number; size: number }) {
  const bead = Math.max(4, Math.round(size * 0.085));
  const r = size / 2 + bead * 0.9;
  const lit = litBeads(score, BEADS);
  const on = tone(score);
  return (
    <View pointerEvents="none" style={[s.ringLayer, { width: size, height: size }]}>
      {Array.from({ length: BEADS }, (_, i) => {
        const a = (i / BEADS) * 2 * Math.PI;
        return (
          <View
            key={i}
            style={[
              s.bead,
              {
                width: bead,
                height: bead,
                borderRadius: bead / 2,
                left: size / 2 + r * Math.sin(a) - bead / 2,
                top: size / 2 - r * Math.cos(a) - bead / 2,
                backgroundColor: i < lit ? on : 'rgba(255,255,255,0.16)',
              },
            ]}
          />
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  ringLayer: { position: 'absolute', left: 0, top: 0 },
  bead: { position: 'absolute' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontSize: 11, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 20, fontWeight: '900' },
  caption: { color: colors.textDim, fontSize: 11, marginTop: -2 },
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  reason: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
});
