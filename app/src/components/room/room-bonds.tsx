// Bağlar in a room (docs/BAGLAR.md): from Lv1 a line and the bond's mark between two bonded people sitting side by side
// on the mics, Lv8 a joint entrance banner, Lv10 a special chat bubble. The bonds come from the server for server rooms
// (the bonds between two people in the room, and each one's best Lv10 bond with the partner anywhere; hidden bonds left
// out) and from the demo data for demo rooms. A bond gift sent again to a bonded person goes as an ordinary gift
// (gift-sheet bondGiftMode); if the server says the bond is gone, it is offered as a request (bondGiftRefused).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { BondMark } from '@/components/bond-mark';
import { Text } from '@/components/text';
import { BOND_KINDS, bondKindOfGift, bondTint, demoRoomBonds, type RoomBond } from '@/data/bonds';
import type { Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { liveMode } from '@/lib/live';
import { knotBox, lineBox, markSize } from '@/lib/bond-link';
import { bondRefusal, loadRoomBonds } from '@/lib/live/bonds';

/** Wait after the last join or leave before asking the server again (people come in waves). */
const SETTLE_MS = 1200;

// The room's bonds read again on demand (a bond gift the server refused: the bond changed meanwhile).
let round = 0;
const rounds = new Set<() => void>();
/** Reads the open room's bonds again. */
export function refreshRoomBonds() {
  round++;
  rounds.forEach((l) => l());
}
const useRound = () =>
  useSyncExternalStore(
    (l) => (rounds.add(l), () => void rounds.delete(l)),
    () => round,
  );

/**
 * A room gift that failed: when it was a bond gift the server refused because of the bond (none now, or another kind),
 * the room's bonds are read again; with none, it is offered as a bond request (`ask`). True when handled here.
 */
export function bondGiftRefused(e: unknown, gift: Gift, to: string, toName: string, ask: (g: Gift, to: string) => void): boolean {
  const why = bondRefusal(e);
  const kind = bondKindOfGift(gift.id);
  if (!why || !kind) return false;
  refreshRoomBonds();
  if (why.code !== 'bond_needed') return false;
  showAlert('Bağınız yok', `${toName} ile ${BOND_KINDS[kind].label} bağın yok artık. ${gift.name} bağ isteği olarak gitsin mi? Kabul edilmezse jetonun geri döner.`, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'İstek gönder', onPress: () => ask(gift, to) },
  ]);
  return true;
}

/** The room's bonds; null until a server room's first answer (so the joint entrance knows who was here first). */
export function useRoomBonds(members: readonly string[], real: boolean): RoomBond[] | null {
  const key = [...new Set(members)].sort().join(',');
  const [now] = useState(() => Date.now());
  const again = useRound();
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
  }, [real, key, again]);
  return real ? server : demo;
}

/**
 * The line from this seat's avatar to the next seat's avatar in the row. Drawn inside the seat (absolute, past its
 * right edge by half a seat plus the row gap), so the mic layout never moves or wraps because of it. The seat draws it
 * before its own face, so it passes behind both frames (lib/bond-link); the mark is the next seat's (BondKnot).
 */
export function BondLine({ bond, size, gap }: { bond: RoomBond; size: number; gap: number }) {
  const [c1, c2] = bondTint(bond.kind);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[st.link, lineBox(size, gap)]}>
      <LinearGradient colors={[c1, c2, c1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={st.line} />
    </View>
  );
}

/**
 * The bond's mark (components/bond-mark: the kind's picture in its level's ring, "Lv" under it), drawn by the RIGHT
 * seat of the pair after its own face, in the middle of the gap: over both frames (lib/bond-link).
 */
export function BondKnot({ bond, size, gap }: { bond: RoomBond; size: number; gap: number }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[st.knot, knotBox(size, gap)]}>
      <BondMark kind={bond.kind} level={bond.level} size={markSize(size)} />
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
  link: { position: 'absolute' },
  line: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2, boxShadow: '0 0 6px rgba(255,140,170,0.8)' },
  knot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
