// Koltuk rengi (room settings, the owner of a server room): the color of the room's empty mics, the same on every
// phone. Each color but the free turquoise is bought once for the room and kept; tapping one the room has switches
// to it for nothing. The server takes the price and checks the coins (server/api/room-seat-color.mjs); the room's
// metadata brings the new color to every phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { SEAT_COLOR_ART } from '@/components/RoomArt';
import { useSheetBottom } from '@/components/room/parts';
import { Text } from '@/components/text';
import { SEAT_COLORS, isSeatColor, type SeatColorId } from '@/data/seat-colors';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { refusalTitle } from '@/lib/contact-filter';
import { liveSetSeatColor, message as errorText } from '@/lib/live';
import { SCRIM, makeStyles, radius, space } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The server room's id. */
  room: string;
  /** The color the room shows now (its metadata); null: turquoise. */
  current: SeatColorId | null;
  /** Said in the room chat after a change. */
  onDone?: (text: string) => void;
};

export function SeatColorSheet({ visible, onClose, room, current, onDone }: Props) {
  const s = useStyles();
  const paddingBottom = useSheetBottom();
  const [owned, setOwned] = useState<SeatColorId[] | null>(null);
  const [busy, setBusy] = useState<SeatColorId | null>(null);
  const [picked, setPicked] = useState<SeatColorId | null>(null);
  const shown = picked ?? current ?? 'turkuaz';

  // Opening the sheet reads which colors the room has.
  useEffect(() => {
    if (!visible) return;
    let on = true;
    api
      .roomSeatColor(room)
      .then((r) => {
        if (!on) return;
        setOwned(r.owned.filter(isSeatColor));
        setPicked(isSeatColor(r.color) ? r.color : null);
      })
      .catch(() => on && setOwned([]));
    return () => {
      on = false;
    };
  }, [visible, room]);

  const apply = async (id: SeatColorId) => {
    setBusy(id);
    try {
      const r = await liveSetSeatColor(room, id);
      setOwned(r.owned.filter(isSeatColor));
      setPicked(id);
      const name = SEAT_COLORS.find((c) => c.id === id)?.name ?? '';
      onDone?.(r.price > 0 ? `Koltuklar artık ${name}` : `Koltuk rengi: ${name}`);
    } catch (e) {
      showAlert(refusalTitle(e, 'Renk değişmedi'), errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const choose = (id: SeatColorId, price: number) => {
    if (busy || id === shown) return;
    if (price === 0 || owned?.includes(id)) return void apply(id);
    const name = SEAT_COLORS.find((c) => c.id === id)?.name ?? '';
    showAlert(`${name} koltuk`, `${fmt(price)} jeton ödenir. Renk bu odanın olur; sonra bu renge ücretsiz dönersin.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Satın al', onPress: () => void apply(id) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom }]}>
        <View style={s.grip} />
        <View style={s.head}>
          <Text style={s.title}>Koltuk rengi</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} style={s.close} />
          </Pressable>
        </View>
        <Text style={s.hint}>Boş mikrofonların rengi, odadaki herkes görür. Bir renk bir kez alınır, oda hep kullanır.</Text>
        {owned === null ? (
          <ActivityIndicator style={{ marginVertical: space.xl }} />
        ) : (
          <ScrollView contentContainerStyle={s.grid}>
            {SEAT_COLORS.map((c) => {
              const on = c.id === shown;
              const have = c.price === 0 || owned.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => choose(c.id, c.price)}
                  style={({ pressed }) => [s.cell, on && s.cellOn, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, busy: busy === c.id }}
                  accessibilityLabel={`${c.name}${on ? ', seçili' : have ? ', odanın' : `, ${fmt(c.price)} jeton`}`}
                >
                  <Image source={SEAT_COLOR_ART[c.id].empty} style={s.pouf} resizeMode="contain" />
                  <Text style={s.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {busy === c.id ? (
                    <ActivityIndicator size="small" />
                  ) : on ? (
                    <Text style={s.tagOn}>Seçili</Text>
                  ) : have ? (
                    <Text style={s.tagHave}>{c.price === 0 ? 'Ücretsiz' : 'Odanın'}</Text>
                  ) : (
                    <View style={s.priceRow}>
                      <Icon3D name="coin" size={14} />
                      <Text style={s.price}>{fmt(c.price)}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
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
    maxHeight: '86%',
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
  pouf: { width: 64, height: 64 },
  name: { color: colors.text, fontSize: 13, fontWeight: '700' },
  tagOn: { color: semantic.actionText, fontSize: 12, fontWeight: '800' },
  tagHave: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  price: { color: colors.gold, fontVariant: ['tabular-nums'], fontSize: 12, fontWeight: '800' },
}));
