// A sheet opened from the bottom over the room rises at most to the Balkon line (lib/room-split): the room's top, its
// header, boards and mics, stays in sight. live-room measures the line and provides the height from the screen's
// bottom up to it; every bottom sheet takes its maxHeight from useSheetMax, with its content between a fixed head
// and foot in a ScrollView or list, so a shorter sheet scrolls rather than cuts. Outside a room, or before the room
// is measured, a sheet keeps its own share of the screen.
import { createContext, useContext } from 'react';
import { useWindowDimensions, type DimensionValue } from 'react-native';

import { sheetMax } from '@/lib/room-split';

/** The height from the screen's bottom up to the room's Balkon line; null outside a room. */
export const RoomSheetSpace = createContext<number | null>(null);

/** The room's sheet space (null outside a room or before it is measured). */
export const useRoomSheetSpace = () => useContext(RoomSheetSpace);

/** A bottom sheet's maxHeight: `share` of the screen, and over a room never above its Balkon line. */
export function useSheetMax(share: number): DimensionValue {
  const space = useContext(RoomSheetSpace);
  const { height } = useWindowDimensions();
  return sheetMax(share, height, space);
}

/** A sheet's least height, never more than the room leaves it under the Balkon line. */
export function useSheetMin(min: number): number {
  const space = useContext(RoomSheetSpace);
  return space ? Math.min(min, space) : min;
}
