// What the free room games' screens share: who plays (`Player`) and the plain styles of the live table's own lines
// and buttons (components/games/room-tables). Each game's screen is in components/games/room/ (Ludo, Renk Kartları,
// XOX, Dört Taş); Okey has its own table (components/games/okey).
import { StyleSheet } from 'react-native';

import type { User } from '@/data/mock';
import { colors, semantic } from '@/theme';

export type Player = Pick<User, 'id' | 'name' | 'avatar'>;

const g = StyleSheet.create({
  log: { color: colors.text, fontSize: 13, textAlign: 'center', minHeight: 18 },
  btn: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  btnOff: { backgroundColor: colors.cardAlt },
  btnText: { color: semantic.actionInk, fontWeight: '900' },
});
export { g as roomGameStyles };
