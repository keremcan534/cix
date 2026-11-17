import { View } from 'react-native';

import { Text } from '@/components/text';
import type { Similarity } from '@/lib/similarity';
import { glass, makeStyles, themes, useTheme, type Theme } from '@/theme';

/** High matches get the brand turquoise, the rest stay neutral so the chip never reads as a warning. */
const tone = ({ semantic, colors }: Theme, score: number) => (score >= 70 ? semantic.actionText : score >= 50 ? semantic.tonalText : colors.textDim);

export function SimilarityChip({ score }: { score: number }) {
  const t = useTheme();
  const s = useStyles();
  const c = tone(t, score);
  return (
    <View style={[s.chip, { borderColor: c }]} accessibilityLabel={`Yüzde ${score} benzer`}>
      <Text style={[s.chipText, { color: c }]}>%{score} benzer</Text>
    </View>
  );
}

/** `glassy`: on the profile's light glass (the same in either scheme), toned by the light scheme's colours. */
export function SimilarityCard({ sim, name, glassy }: { sim: Similarity; name: string; glassy?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const c = tone(glassy ? themes.light : t, sim.score);
  return (
    <View style={[s.card, glassy && s.glassCard]}>
      <View style={[s.ring, { borderColor: c }]}>
        <Text style={[s.score, { color: c }]}>%{sim.score}</Text>
        <Text style={[s.caption, glassy && { color: glass.plum }]}>benzer</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.title, glassy && { color: glass.ink }]}>{name} ile ortak noktalarınız</Text>
        {sim.reasons.length ? (
          sim.reasons.map((r) => (
            <Text key={r} style={[s.reason, glassy && { color: glass.plum }]}>
              • {r}
            </Text>
          ))
        ) : (
          <Text style={[s.reason, glassy && { color: glass.plum }]}>Henüz ortak ilgi alanınız yok; farklı bakış açıları da güzel sohbet çıkarır.</Text>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, lift, dark }) => ({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontSize: 11, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  glassCard: { backgroundColor: glass.white, borderRadius: 18, borderColor: glass.line, boxShadow: glass.shadow },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 20, fontWeight: '900' },
  caption: { color: colors.textDim, fontSize: 11, marginTop: -2 },
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  reason: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
}));
