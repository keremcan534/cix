// The mark between two bonded people (Güncelleme 7, docs/BAGLAR.md "İşaretler"): the bond kind's picture inside a ring
// that grows with the level, every five levels (data/bonds tierLook: Lv1–5 thin, Lv6–10 the kind's colour with a glow,
// Lv11–15 gold, Lv16–20 a bright diamond ring with a sparkle), and a small "Lv" label under it. The same mark is drawn
// between the two faces on the profile's Bağlar row, between two seats on the mics, and (small, without the label) in
// the badge by the name.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { BOND_KINDS, bondTier, tierLook, type BondKind } from '@/data/bonds';

/** Bond gift pictures (docs/BAGLAR.md "Görsel listesi", app/assets/bonds). A kind without one keeps its sign. */
export const BOND_ART: Partial<Record<BondKind, number>> = {
  cift: require('../../assets/bonds/bag-cift.png'),
  kardes: require('../../assets/bonds/bag-kardes.png'),
  baci: require('../../assets/bonds/bag-baci.png'),
  agabey: require('../../assets/bonds/bag-agabey.png'),
  abla: require('../../assets/bonds/bag-abla.png'),
  yenge: require('../../assets/bonds/bag-yenge.png'),
  enishte: require('../../assets/bonds/bag-enishte.png'),
  kanka: require('../../assets/bonds/bag-kanka.png'),
};

/** The "Lv" label's text size for a mark `size` px wide: readable on every phone (never under 9 px, never scaled). */
export const markLabelSize = (size: number) => Math.max(9, Math.min(13, Math.round(size * 0.3)));

/**
 * The kind's picture in its tier's ring, `size` px across. `label`: the "Lv N" pill under it (hanging below the mark's
 * box, so the box stays a circle to place). Not touchable and hidden from screen readers (its row or seat says it).
 */
export function BondMark({ kind, level, size, label = true }: { kind: BondKind; level: number; size: number; label?: boolean }) {
  const look = tierLook(kind, bondTier(level));
  const ring = Math.max(1.5, Math.round(size * look.width * 2) / 2);
  const inner = size - ring * 2;
  const art = BOND_ART[kind];
  const font = markLabelSize(size);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <LinearGradient
        colors={look.ring}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ width: size, height: size, borderRadius: size / 2, padding: ring }, look.glow > 0 && { boxShadow: `0 0 ${look.glow}px ${look.glowColor}` }]}
      >
        <View style={[st.inner, { borderRadius: inner / 2 }]}>
          {art ? (
            <Image source={art} style={{ width: inner * 0.84, height: inner * 0.84 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <Ionicons name={BOND_KINDS[kind].icon} size={Math.round(inner * 0.55)} color="#fff" />
          )}
        </View>
      </LinearGradient>
      {look.sparkle && <Text style={[st.sparkle, { fontSize: Math.max(8, Math.round(size * 0.28)), top: -size * 0.08, right: -size * 0.06 }]} maxFontSizeMultiplier={1}>✦</Text>}
      {label && (
        <View style={[st.label, { bottom: -Math.round(font * 0.9), borderColor: look.ring[1] }]}>
          <Text style={[st.labelText, { fontSize: font, lineHeight: font + 2 }]} numberOfLines={1} maxFontSizeMultiplier={1}>
            Lv{level}
          </Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  inner: { flex: 1, backgroundColor: '#2A1631', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sparkle: { position: 'absolute', color: '#FFE27A', textShadowColor: 'rgba(120,60,200,0.9)', textShadowRadius: 3 },
  label: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 4, borderRadius: 999, backgroundColor: '#1D0F24', borderWidth: 1 },
  labelText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
});
