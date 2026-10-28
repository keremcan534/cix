// Room menu: grid sections (interactive games, coin games, room tools/settings).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, gradientDeep, semantic } from '@/theme';
import { Icon3D, icon3dFor } from '@/components/Icon3D';

export type MenuItem = {
  key: string;
  label: string;
  onPress: () => void;
  emoji?: string;
  /** 3D picture (components/RoomArt), drawn instead of the emoji. */
  art?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  colors?: [string, string];
  /** small corner tag: on/off state or a ribbon */
  badge?: 'on' | 'off' | 'HOT' | 'NEW' | number;
};
export type MenuSection = { title: string; variant: 'round' | 'tile' | 'tool'; items: MenuItem[]; note?: string };

export function RoomMenuSheet({ visible, onClose, sections }: { visible: boolean; onClose: () => void; sections: MenuSection[] }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Menüyü kapat" />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {sections.map((s) => (
            <View key={s.title} style={{ marginBottom: 6 }}>
              <Text style={styles.title}>{s.title}</Text>
              {s.note && <Text style={styles.note}>{s.note}</Text>}
              <View style={styles.grid}>
                {s.items.map((it) => (
                  <Pressable
                    key={it.key}
                    style={styles.cell}
                    accessibilityLabel={it.label}
                    onPress={() => {
                      onClose();
                      it.onPress();
                    }}>
                    <Icon item={it} variant={s.variant} />
                    <Text style={styles.label} numberOfLines={2}>
                      {it.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Icon({ item, variant }: { item: MenuItem; variant: MenuSection['variant'] }) {
  const size = variant === 'tile' ? 76 : 62;
  const radius = variant === 'tile' ? 18 : size / 2;
  const badge = item.badge;
  return (
    <View style={{ width: size, height: size }}>
      {variant === 'tool' ? (
        <View style={[styles.tool, { width: size, height: size, borderRadius: radius }]}>
          {item.icon ? <Ionicons name={item.icon} size={28} color="#fff" /> : <Text style={{ fontSize: 26 }}>{item.emoji}</Text>}
        </View>
      ) : item.art || icon3dFor(item.emoji) ? (
        <View style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }}>
          {item.art ? (
            <Image source={item.art} style={{ width: variant === 'tile' ? 50 : 40, height: variant === 'tile' ? 50 : 40 }} />
          ) : (
            <Icon3D name={icon3dFor(item.emoji)!} size={variant === 'tile' ? 50 : 40} />
          )}
        </View>
      ) : (
        <LinearGradient colors={item.colors ?? gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: variant === 'tile' ? 38 : 30 }}>{item.emoji}</Text>
        </LinearGradient>
      )}
      {badge === 'on' && (
        <View style={[styles.state, { backgroundColor: colors.green }]}>
          <Ionicons name="checkmark" size={12} color={semantic.successInk} />
        </View>
      )}
      {badge === 'off' && (
        <View style={[styles.state, { backgroundColor: '#555' }]}>
          <Ionicons name="close" size={12} color="#fff" />
        </View>
      )}
      {(badge === 'HOT' || badge === 'NEW') && (
        <Text style={[styles.ribbon, { backgroundColor: badge === 'HOT' ? colors.red : '#2563EB' }]}>{badge}</Text>
      )}
      {typeof badge === 'number' && badge > 0 && <Text style={[styles.ribbon, { backgroundColor: colors.red, left: undefined, right: -4 }]}>{badge}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#24232B', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 12, paddingTop: 18, maxHeight: '78%' },
  title: { color: '#fff', fontWeight: '800', fontSize: 18, marginLeft: 8, marginBottom: 6 },
  note: { color: colors.textDim, fontSize: 12, marginLeft: 8, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '25%', alignItems: 'center', gap: 6, paddingVertical: 10 },
  label: { color: '#fff', fontSize: 12, textAlign: 'center', maxWidth: 84 },
  tool: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  state: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#24232B' },
  ribbon: { position: 'absolute', top: -6, left: -4, color: '#fff', fontSize: 11, fontWeight: '900', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
});
