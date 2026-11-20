// "Seviyeyi Gizle": the member's own photo, name and Cömertlik / Yankı chips (as others see them: a hidden level drops
// out), then the two switches in a grey inset box, as the client's design draws it. What the switches do is the
// screen's (live: the server's profile setting; demo: a subscriber's local setting).
import { StyleSheet, View } from 'react-native';

import { Switch } from '@/components/luxe-switch';
import { Text } from '@/components/text';
import { Avatar, LevelChips } from '@/components/ui';
import { SUB } from './sub-look';

export type HideKey = 'hideWealth' | 'hideCharm';
const ROWS: [HideKey, string][] = [
  ['hideWealth', 'Cömertlik seviyesini gizle'],
  ['hideCharm', 'Yankı seviyesini gizle'],
];

export function SubHideLevels({
  avatar,
  name,
  wealth,
  charm,
  hidden,
  onToggle,
}: {
  avatar?: string;
  name: string;
  wealth: number;
  charm: number;
  /** What the switches show (off unless the member may hide and did). */
  hidden: Record<HideKey, boolean>;
  onToggle: (k: HideKey, v: boolean) => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.user}>
        <Avatar uri={avatar} size={60} name={name} />
        <View style={s.who}>
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          <LevelChips wealth={wealth} charm={charm} hideWealth={hidden.hideWealth} hideCharm={hidden.hideCharm} />
        </View>
      </View>
      <View style={s.box}>
        {ROWS.map(([k, label], i) => (
          <View key={k}>
            {i > 0 && <View style={s.divider} />}
            <View style={s.row}>
              <Text style={s.label}>{label}</Text>
              <Switch size="sm" value={hidden[k]} onValueChange={(v) => onToggle(k, v)} accessibilityLabel={label} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12.4, backgroundColor: '#FEFEFE', boxShadow: SUB.cardShadow, paddingTop: 8, paddingBottom: 9.5, paddingHorizontal: 10.8 },
  // The photo and the name with the chips, centred together.
  user: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  who: { marginLeft: 11.6, gap: 7, flexShrink: 1 },
  name: { color: SUB.goldDeep, fontSize: 15.7, lineHeight: 20, fontWeight: '800' },
  box: { marginTop: 6, borderRadius: 9.2, backgroundColor: '#F6F4F6' },
  // 44 dp rows (the design's 33.6 grown for the finger); the switch's touch area is 44 dp tall too.
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 15.3, paddingRight: 14.5, gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E9E3E8', marginHorizontal: 15 },
  label: { flex: 1, color: '#5F2C51', fontSize: 12.5, lineHeight: 16, fontWeight: '400', paddingVertical: 6 },
});
