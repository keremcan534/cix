// Koltuk rengi (room settings, the owner of a server room): the color of the room's empty mics, the same on every
// phone. The colors are the shop's (Yönetim › Mağaza › Koltuk renkleri, data/seat-colors): the default (silver) is
// every room's, free; any other is bought for the room for its days (none: for good), and switching back to one the
// room has is free. The sheet sends the price and days it shows: the server takes its own price and checks the coins
// (server/api/room-seat-color.mjs), a moved one is refused with nothing taken. The room's metadata brings the new
// color to every phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { useSheetBottom } from '@/components/room/parts';
import { SeatPouf } from '@/components/room/seat-pouf';
import { Text } from '@/components/text';
import { SEAT_DEFAULT, isSeatColorId, seatColorOf, seatColors, type SeatColor, type SeatColorId } from '@/data/seat-colors';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { refusalTitle } from '@/lib/contact-filter';
import { liveSetSeatColor, message as errorText } from '@/lib/live';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { daysLeft } from '@/lib/room-decor';
import { useSheetMax } from '@/lib/sheet-space';
import { SCRIM, makeStyles, radius, space } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** When each color the room has runs out, as the server sent it; a malformed entry is left out (for good). */
const untilOf = (v: unknown): Record<SeatColorId, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([id, t]) => isSeatColorId(id) && typeof t === 'string')) : {};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The server room's id. */
  room: string;
  /** The color the room shows now (its metadata); null: the default. */
  current: SeatColorId | null;
  /** Said in the room chat after a change. */
  onDone?: (text: string) => void;
};

export function SeatColorSheet({ visible, onClose, room, current, onDone }: Props) {
  const s = useStyles();
  const paddingBottom = useSheetBottom();
  // It stops at the room's Balkon line (lib/sheet-space): the colors scroll under the hint.
  const maxHeight = useSheetMax(0.86);
  // The shop's list (lib/live/catalog-live): a color the panel changed shows as it is once the catalog is read again.
  useLiveCatalog();
  const [owned, setOwned] = useState<SeatColorId[] | null>(null);
  const [until, setUntil] = useState<Record<SeatColorId, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<SeatColorId | null>(null);
  const [picked, setPicked] = useState<SeatColorId | null>(null);
  const shown = picked ?? current ?? SEAT_DEFAULT;

  const read = (r: api.RoomSeatColors) => {
    setOwned(r.owned.filter(isSeatColorId));
    setUntil(untilOf(r.until));
    setNow(Date.now());
  };

  // Opening the sheet reads which colors the room has, and till when.
  useEffect(() => {
    if (!visible) return;
    let on = true;
    api
      .roomSeatColor(room)
      .then((r) => {
        if (!on) return;
        read(r);
        setPicked(isSeatColorId(r.color) ? r.color : null);
      })
      .catch(() => on && setOwned([]));
    return () => {
      on = false;
    };
  }, [visible, room]);

  const apply = async (c: SeatColor) => {
    setBusy(c.id);
    try {
      const r = await liveSetSeatColor(room, c.id, { price: c.price, days: c.days });
      read(r);
      setPicked(c.id);
      onDone?.(r.price > 0 ? `Koltuklar artık ${c.name}` : `Koltuk rengi: ${c.name}`);
    } catch (e) {
      showAlert(refusalTitle(e, 'Renk değişmedi'), errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const choose = (c: SeatColor) => {
    if (busy || c.id === shown) return;
    if (c.isDefault || owned?.includes(c.id)) return void apply(c);
    showAlert(
      `${c.name} koltuk`,
      c.days
        ? `${fmt(c.price)} jeton ödenir. Renk ${c.days} gün bu odanın olur; o sürede bu renge ücretsiz dönersin.`
        : `${fmt(c.price)} jeton ödenir. Renk süresiz bu odanın olur; sonra bu renge ücretsiz dönersin.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Satın al', onPress: () => void apply(c) },
      ],
    );
  };

  // The colors on sale, and one taken off sale that the room still has or shows.
  const list = seatColors().filter((c) => !c.off || c.isDefault || c.id === shown || owned?.includes(c.id));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { maxHeight, paddingBottom }]}>
        <View style={s.grip} />
        <View style={s.head}>
          <Text style={s.title}>Koltuk rengi</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} style={s.close} />
          </Pressable>
        </View>
        <Text style={s.hint}>
          Boş mikrofonların rengi, odadaki herkes görür. {seatColorOf(SEAT_DEFAULT).name} ücretsiz; alınan renk süresince odanın olur, ona ücretsiz dönersin.
        </Text>
        {owned === null ? (
          <ActivityIndicator style={{ marginVertical: space.xl }} />
        ) : (
          <ScrollView contentContainerStyle={s.grid}>
            {list.map((c) => {
              const on = c.id === shown;
              const have = !!c.isDefault || owned.includes(c.id);
              const left = have ? daysLeft(until[c.id], now) : 0;
              const term = c.days ? ` · ${c.days} gün` : '';
              return (
                <Pressable
                  key={c.id}
                  onPress={() => choose(c)}
                  style={({ pressed }) => [s.cell, on && s.cellOn, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, busy: busy === c.id }}
                  accessibilityLabel={`${c.name}${on ? ', seçili' : ''}${c.isDefault ? ', ücretsiz' : have ? (left ? `, odanın, ${left} gün kaldı` : ', odanın') : `, ${fmt(c.price)} jeton${c.days ? `, ${c.days} gün` : ', süresiz'}`}`}
                >
                  <SeatPouf color={c.color} size={64} />
                  <Text style={s.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {busy === c.id ? (
                    <ActivityIndicator size="small" />
                  ) : on ? (
                    <Text style={s.tagOn}>{left ? `Seçili · ${left} gün` : 'Seçili'}</Text>
                  ) : have ? (
                    <Text style={s.tagHave}>{c.isDefault ? 'Ücretsiz' : left ? `${left} gün kaldı` : 'Odanın'}</Text>
                  ) : (
                    <View style={s.priceRow}>
                      <Icon3D name="coin" size={14} />
                      <Text style={s.price}>
                        {fmt(c.price)}
                        {term}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {/* A short last row stays on the left. */}
            {Array.from({ length: (3 - (list.length % 3)) % 3 }, (_, i) => (
              <View key={`gap${i}`} style={s.spacer} />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, edge, ink }) => ({
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    ...edge.sheet,
  },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ink(0.18), marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  close: { color: colors.textDim },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 2, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md, paddingBottom: space.md },
  cell: { width: '31%', alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', backgroundColor: ink(0.05) },
  cellOn: { borderColor: semantic.action, backgroundColor: ink(0.09) },
  spacer: { width: '31%' },
  name: { color: colors.text, fontSize: 13, fontWeight: '700' },
  tagOn: { color: semantic.actionText, fontSize: 12, fontWeight: '800' },
  tagHave: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  price: { color: colors.gold, fontVariant: ['tabular-nums'], fontSize: 12, fontWeight: '800' },
}));
