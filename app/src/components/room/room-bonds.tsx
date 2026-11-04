// Bağlar in a room (docs/BAGLAR.md): Lv4 a line between two bonded people sitting side by side on the mics, Lv8
// a joint entrance banner, Lv10 a special chat bubble. The bonds come from the server for server rooms (people in
// the room, partners anywhere; hidden bonds left out) and from the demo data for demo rooms.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { BOND_KINDS, bondTint, demoRoomBonds, type RoomBond } from '@/data/bonds';
import { liveMode } from '@/lib/live';
import { loadRoomBonds } from '@/lib/live/bonds';

/** Wait after the last join or leave before asking the server again (people come in waves). */
const SETTLE_MS = 1200;

/** The room's bonds; null until a server room's first answer (so the joint entrance knows who was here first). */
export function useRoomBonds(members: readonly string[], real: boolean): RoomBond[] | null {
  const key = [...new Set(members)].sort().join(',');
  const [now] = useState(() => Date.now());
  // Demo rooms: my own bonds live on the server once I am signed in, so the demo ones are left out then.
  const demo = useMemo(() => (real || !key ? [] : demoRoomBonds(key.split(',').filter((id) => !(id === 'me' && liveMode())), now)), [real, key, now]);
  const [server, setServer] = useState<RoomBond[] | null>(null);
  useEffect(() => {
    if (!real || !key || !liveMode()) return;
    let alive = true;
    const t = setTimeout(() => {
      loadRoomBonds(key.split(','))
        .then((l) => {
          if (alive) setServer(l);
        })
        .catch(() => {});
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [real, key]);
  return real ? server : demo;
}

/**
 * Lv4 line from this seat's avatar to the next seat's avatar in the row. Drawn inside the seat (absolute, past its
 * right edge by half a seat plus the row gap), so the mic layout never moves or wraps because of it.
 */
export function BondLink({ bond, size, gap }: { bond: RoomBond; size: number; gap: number }) {
  const [c1, c2] = bondTint(bond.kind);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[st.link, { top: size / 2 - 1.5, marginLeft: size / 2 - 1, marginRight: size / 2 - 1 - gap }]}
    >
      <LinearGradient colors={[c1, c2, c1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={st.line} />
      <View style={[st.knot, { backgroundColor: c2 }]}>
        <Ionicons name={BOND_KINDS[bond.kind].icon} size={9} color="#fff" />
      </View>
    </View>
  );
}

/** Lv10 chat bubble, in the bond's colors. */
export function BondBubble({ bond, children }: { bond: RoomBond; children: React.ReactNode }) {
  const [c1, c2] = bondTint(bond.kind);
  return (
    <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.bubble}>
      {children}
    </LinearGradient>
  );
}

/** Small "Çift Lv10" chip next to the name in the chat. */
export function BondChip({ bond }: { bond: RoomBond }) {
  const [, c2] = bondTint(bond.kind);
  return (
    <View style={[st.chip, { backgroundColor: c2 }]} accessibilityLabel={`${BOND_KINDS[bond.kind].label} bağı, seviye ${bond.level}`}>
      <Ionicons name={BOND_KINDS[bond.kind].icon} size={9} color="#fff" />
      <Text style={st.chipText}>
        {BOND_KINDS[bond.kind].label} Lv{bond.level}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  link: { position: 'absolute', left: '50%', right: '-50%', height: 3, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2, boxShadow: '0 0 6px rgba(255,140,170,0.8)' },
  knot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', boxShadow: '0 0 8px rgba(255,255,255,0.35)' },
  bubble: { borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
