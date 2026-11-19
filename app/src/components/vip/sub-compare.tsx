// "Ayrıcalık Karşılaştırması": a real table (rows and columns) of what a member has without and with the subscription,
// as the server gives it (levels-live-core subRightsOf). Each column's tint runs its whole height, the header included,
// as in the design; a tick and a cross say "var" / "yok" to a screen reader, and a row is read as one sentence.
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { compareCellA11y, compareRowA11y } from '@/lib/vip-screen';
import { SUB_ART } from './assets';
import { GoldText } from './gold-text';
import { SUB } from './sub-look';

/** The columns' shares of the width (the design's 152.5 / 99 / 101 dp of 353.5). */
const COLS = [43, 28, 29] as const;
const ROW_LINE = 'rgba(110,60,100,0.10)';

export function SubCompare({ rows }: { rows: [string, string | boolean, string | boolean][] }) {
  return (
    <View style={s.shadow}>
      <View style={s.table}>
        {/* The column tints, under the rows. */}
        <View style={[StyleSheet.absoluteFill, s.row]} pointerEvents="none">
          <View style={{ flex: COLS[0], backgroundColor: '#FEFEFE' }} />
          <View style={{ flex: COLS[1], backgroundColor: '#F5F3F5' }} />
          <View style={{ flex: COLS[2], backgroundColor: '#FEF6EE' }} />
        </View>
        <View style={[s.row, s.head]}>
          <View style={[s.labelCell, { flex: COLS[0] }]}>
            <Text style={s.headLabel} numberOfLines={2}>
              Ayrıcalıklar
            </Text>
          </View>
          <View style={[s.cell, { flex: COLS[1] }]}>
            <Text style={s.headFree} numberOfLines={2}>
              Abone olmayan
            </Text>
          </View>
          <View style={[s.cell, { flex: COLS[2] }]}>
            {/* The design's gold italic "VIP": the app has no italic face loaded, so the letters lean. */}
            <GoldText bands={['#A86A10', '#9A5E08', '#8A5000']} stops={[0.45, 0.6, 1]} shadow="transparent" maxFontSizeMultiplier={1.1} wrap={s.lean} style={s.headSub}>
              Abone
            </GoldText>
          </View>
        </View>
        {rows.map(([name, free, sub]) => (
          <View key={name} style={[s.row, s.line]} accessible accessibilityLabel={compareRowA11y(name, free, sub)}>
            <View style={[s.labelCell, { flex: COLS[0] }]}>
              <Text style={s.rowLabel}>{name}</Text>
            </View>
            <Cell value={free} flex={COLS[1]} />
            <Cell value={sub} flex={COLS[2]} sub />
          </View>
        ))}
      </View>
    </View>
  );
}

function Cell({ value, flex, sub }: { value: string | boolean; flex: number; sub?: boolean }) {
  if (typeof value === 'boolean') {
    const art = value ? SUB_ART.check : SUB_ART.cross;
    return (
      <View style={[s.cell, { flex }]}>
        <Image source={art.source} style={{ width: art.w, height: art.h }} resizeMode="contain" accessible accessibilityLabel={compareCellA11y(value)} />
      </View>
    );
  }
  return (
    <View style={[s.cell, { flex }]}>
      <Text style={[s.cellText, sub && { color: SUB.goldDeep, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // The shadow outside, the clipping inside: a clipped view would cut its own shadow on some phones.
  shadow: { borderRadius: 12, backgroundColor: '#FEFEFE', boxShadow: SUB.cardShadow },
  table: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  head: { minHeight: 30 },
  line: { minHeight: 27, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ROW_LINE },
  labelCell: { justifyContent: 'center', paddingLeft: 20, paddingRight: 6, paddingVertical: 5 },
  cell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 5 },
  headLabel: { color: '#501B44', fontSize: 11.7, lineHeight: 15, fontWeight: '500' },
  headFree: { color: '#663356', fontSize: 11.2, lineHeight: 14.5, fontWeight: '400', textAlign: 'center' },
  lean: { transform: [{ skewX: '-12deg' }] },
  headSub: { fontSize: 14.5, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
  rowLabel: { color: '#3A0A35', fontSize: 11.1, lineHeight: 14.5, fontWeight: '500' },
  cellText: { color: '#3A0A35', fontSize: 11.1, lineHeight: 14.5, textAlign: 'center' },
});
