// Room menu: grid sections (interactive games, coin games, room tools/settings). Icons stand free on their
// own colored light (fx/float) instead of sitting in boxes; game tiles break out of a lit plate.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { FloatIcon, hueAt } from '@/components/fx/float';
import { EdgeLight, PressableScale } from '@/components/fx/surface';
import { icon3dSourceFor } from '@/components/Icon3D';
import { colors, fonts, semantic } from '@/theme';

export type MenuItem = {
  key: string;
  label: string;
  onPress: () => void;
  emoji?: string;
  /** 3D picture (components/RoomArt), drawn instead of the emoji. */
  art?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  colors?: [string, string];
  /** The item's own color (its light and plate); falls back to `colors[0]`, then a color by position. */
  hue?: string;
  /** small corner tag: on/off state or a ribbon */
  badge?: 'on' | 'off' | 'HOT' | 'NEW' | number;
};
export type MenuSection = { title: string; variant: 'round' | 'tile' | 'tool'; items: MenuItem[]; note?: string };

const SHEET = '#111B2E';

export function RoomMenuSheet({ visible, onClose, sections }: { visible: boolean; onClose: () => void; sections: MenuSection[] }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Menüyü kapat" />
      <LinearGradient colors={['#1B2944', SHEET]} locations={[0, 0.35]} style={styles.sheet}>
        <EdgeLight inset={40} strength={0.35} />
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {sections.map((s) => (
            <View key={s.title} style={{ marginBottom: 10 }}>
              <Text style={styles.title}>{s.title}</Text>
              {s.note && <Text style={styles.note}>{s.note}</Text>}
              <View style={styles.grid}>
                {s.items.map((it, i) => {
                  const hue = it.hue ?? it.colors?.[0] ?? hueAt(i);
                  const press = () => {
                    onClose();
                    it.onPress();
                  };
                  return s.variant === 'tile' ? (
                    <Tile key={it.key} item={it} hue={hue} index={i} onPress={press} />
                  ) : (
                    <View key={it.key} style={styles.cellBox}>
                    <PressableScale style={styles.cell} accessibilityLabel={it.label} onPress={press}>
                      <View>
                        {s.variant === 'tool' ? (
                          <View style={[styles.tool, { borderColor: `${hue}38` }]}>
                            <LinearGradient colors={[`${hue}2E`, `${hue}08`]} style={StyleSheet.absoluteFill} />
                            {it.icon ? <Ionicons name={it.icon} size={24} color={hue} /> : it.art ? <Image source={it.art} style={{ width: 28, height: 28 }} /> : <Text style={{ fontSize: 22 }}>{it.emoji}</Text>}
                          </View>
                        ) : (
                          <FloatIcon source={it.art ?? icon3dSourceFor(it.emoji)} emoji={it.emoji} size={46} hue={hue} />
                        )}
                        <Badge badge={it.badge} />
                      </View>
                      <Text style={styles.label} numberOfLines={2}>
                        {it.label}
                      </Text>
                    </PressableScale>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

/** A game: a low plate lit in the game's color, its icon standing on the plate and over its top edge. */
function Tile({ item, hue, index, onPress }: { item: MenuItem; hue: string; index: number; onPress: () => void }) {
  return (
    <View style={styles.tileCell}>
      <PressableScale accessibilityLabel={item.label} onPress={onPress}>
        <LinearGradient colors={[`${hue}50`, `${hue}10`]} style={[styles.plate, { borderColor: `${hue}55`, boxShadow: `0 6px 16px ${hue}26` }]}>
          <EdgeLight inset={12} strength={0.45} />
          <Text style={styles.tileLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </LinearGradient>
        <View style={styles.tileIcon}>
          <FloatIcon source={item.art ?? icon3dSourceFor(item.emoji)} emoji={item.emoji} size={58} hue={hue} bob delay={index * 230} />
        </View>
        <View style={{ position: 'absolute', top: 4, left: 8 }}>
          <Badge badge={item.badge} />
        </View>
      </PressableScale>
    </View>
  );
}

function Badge({ badge }: { badge: MenuItem['badge'] }) {
  if (badge === 'on' || badge === 'off')
    return (
      <View style={[styles.state, { backgroundColor: badge === 'on' ? colors.green : '#555' }]}>
        <Ionicons name={badge === 'on' ? 'checkmark' : 'close'} size={12} color={badge === 'on' ? semantic.successInk : '#fff'} />
      </View>
    );
  if (badge === 'HOT' || badge === 'NEW') return <Text style={[styles.ribbon, { backgroundColor: badge === 'HOT' ? colors.red : '#2563EB' }]}>{badge}</Text>;
  if (typeof badge === 'number' && badge > 0) return <Text style={[styles.ribbon, { backgroundColor: colors.red, left: undefined, right: -4 }]}>{badge}</Text>;
  return null;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 12, paddingTop: 10, maxHeight: '78%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 10 },
  title: { color: '#fff', fontFamily: fonts.display, fontSize: 20, lineHeight: 26, marginLeft: 8, marginBottom: 2 },
  note: { color: colors.textDim, fontSize: 12, marginLeft: 8, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // PressableScale styles its inner view, so the grid width sits on a plain wrapper.
  cellBox: { width: '25%' },
  cell: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  label: { color: '#E6ECF7', fontSize: 12, textAlign: 'center', maxWidth: 84 },
  tool: { width: 52, height: 52, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileCell: { width: '33.33%', padding: 5, paddingTop: 24 },
  plate: { borderRadius: 18, borderWidth: 1, paddingTop: 44, paddingBottom: 10, paddingHorizontal: 6, alignItems: 'center' },
  tileLabel: { color: '#fff', fontFamily: fonts.displayBold, fontSize: 14, lineHeight: 18 },
  tileIcon: { position: 'absolute', top: -24, left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' },
  state: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SHEET },
  ribbon: { position: 'absolute', top: -6, left: -4, color: '#fff', fontSize: 11, fontWeight: '900', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
});
