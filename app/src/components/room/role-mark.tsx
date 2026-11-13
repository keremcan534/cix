// The small mark on a room staff member's avatar, one look per role so they read apart at a glance: the owner's
// crown, a Süper Yönetici's star, a Yönetici's shield and a DJ's headphones. Used on the mics and in the member list.
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { semantic } from '@/theme';

export type StaffMark = 'owner' | 'super' | 'admin' | 'dj';

export const STAFF_MARK: Record<StaffMark, { icon: keyof typeof Ionicons.glyphMap | null; bg: string; fg: string; label: string }> = {
  owner: { icon: null, bg: '#24232B', fg: '#fff', label: 'Oda sahibi' },
  super: { icon: 'star', bg: '#FF8A3D', fg: '#fff', label: 'Süper Yönetici' },
  admin: { icon: 'shield-checkmark', bg: semantic.action, fg: semantic.actionInk, label: 'Yönetici' },
  dj: { icon: 'headset', bg: '#14B8A6', fg: '#fff', label: 'DJ' },
};

/** `edge`: the ring around it, the color of what's behind (so it stands off the avatar). */
export function RoleMark({ mark, edge = '#24232B', style }: { mark: StaffMark | null | undefined; edge?: string; style?: StyleProp<ViewStyle> }) {
  if (!mark) return null;
  const m = STAFF_MARK[mark];
  return (
    <View style={[styles.mark, { backgroundColor: m.bg, borderColor: edge }, mark === 'owner' && { padding: 2 }, style]} accessibilityLabel={m.label}>
      {m.icon ? <Ionicons name={m.icon} size={10} color={m.fg} /> : <Icon3D name="crown" size={13} />}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', left: -3, bottom: -3, borderRadius: 10, padding: 3, borderWidth: 1.5 },
});
