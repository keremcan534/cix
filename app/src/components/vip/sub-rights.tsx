// The Abonelik tab's section headings ("✦ Abonelik Ayrıcalıkları" between two fading lines) and the white panel of the
// subscription's rights (icon circle, gold title, mauve line), two a row as in the design; the list is the server's
// (levels-live-core subRightsOf), so more rights make more rows.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { perkMetrics, rowsOf } from '@/lib/vip-screen';
import { SUB_ART } from './assets';
import { SUB } from './sub-look';

const LINE = '#C3A2B7';
const LINE_OUT = 'rgba(195,162,183,0)';

/** A heading: the sparkle before it (and after it with `both`, smaller and darker, as "Seviyeyi Gizle" has). */
export function SubHeading({ title, both }: { title: string; both?: boolean }) {
  const star = both ? { size: 9.6, tint: '#AD7205' } : { size: SUB_ART.sparkle.w, tint: '#D39409' };
  const sparkle = <Image source={SUB_ART.sparkle.source} style={{ width: star.size, height: star.size, tintColor: star.tint }} resizeMode="contain" />;
  return (
    <View style={s.heading} accessible accessibilityRole="header" accessibilityLabel={title}>
      <LinearGradient colors={[LINE_OUT, LINE]} locations={[0, 0.7]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.line} />
      <View style={[s.group, { gap: both ? 9.5 : 8.3 }]}>
        {sparkle}
        <Text style={s.headingText} numberOfLines={2}>
          {title}
        </Text>
        {both && <View style={{ marginLeft: 8.3 - 9.5 }}>{sparkle}</View>}
      </View>
      <LinearGradient colors={[LINE, LINE_OUT]} locations={[0.3, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.line} />
    </View>
  );
}

export type SubPerk = { name: string; desc: string; icon: string };

/** The rights panel. `width` is the panel's: under 300 dp each right gets its own row. */
export function SubPerks({ perks, width }: { perks: SubPerk[]; width: number }) {
  const m = perkMetrics(width);
  const cols = m.cols;
  return (
    <View style={s.panel}>
      {rowsOf(perks, cols).map((row, i) => (
        <Fragment key={row.map((r) => r.name).join('|')}>
          {i > 0 && <View style={s.rowLine} />}
          <View style={s.row}>
            {row.map((r, j) => (
              <Fragment key={r.name}>
                {j > 0 && <View style={[s.divider, { width: m.divider }]} />}
                <Perk perk={r} m={m} />
              </Fragment>
            ))}
            {/* An odd last right keeps its half, so it stands where the others do. */}
            {row.length < cols && <View style={{ flex: 1 }} />}
          </View>
        </Fragment>
      ))}
    </View>
  );
}

function Perk({ perk, m }: { perk: SubPerk; m: ReturnType<typeof perkMetrics> }) {
  const icon = (perk.icon in Ionicons.glyphMap ? perk.icon : 'star') as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[s.perk, { paddingLeft: m.padL, paddingRight: m.padR, gap: m.gap }]} accessible accessibilityLabel={`${perk.name}: ${perk.desc}`}>
      <View style={[s.circle, { width: m.circle, height: m.circle, borderRadius: m.circle / 2 }]}>
        <Ionicons name={icon} size={m.icon} color="#9D6206" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={2}>
          {perk.name}
        </Text>
        <Text style={s.desc} numberOfLines={3}>
          {perk.desc}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // The lines' outer ends 23 dp from the screen's edges (the page has 17), 10.5 dp clear of the sparkles.
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10.5, marginHorizontal: 6 },
  line: { flex: 1, minWidth: 12, height: StyleSheet.hairlineWidth },
  group: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  headingText: { color: SUB.heading, fontSize: 14.5, lineHeight: 19, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  panel: { borderRadius: 12.8, backgroundColor: '#FEFCFD', boxShadow: SUB.cardShadow, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 58 },
  rowLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#ECE6EA', marginHorizontal: 15 },
  divider: { height: 29, backgroundColor: '#ECE6EA' },
  perk: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  circle: { backgroundColor: '#FDF4E7', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#8F5301', fontSize: 12.2, lineHeight: 15.5, fontWeight: '800' },
  desc: { color: SUB.plum, fontSize: 10, lineHeight: 12.6, fontWeight: '500', marginTop: 1 },
});
