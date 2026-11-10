// The gift sheet on someone's profile (kullanici/[id]): the room gift sheet's catalog grid (art, name, price with
// the coin icon and Turkish thousands separators, İnci locks) for one person and one gift at a time.
// Product rule: no gift asks for a confirmation; the button sends it. A short balance turns the button into
// "Jeton yükle" before the tap instead of failing after it. The sender (onSend) does the real check and the
// sending (the server in live mode) and says whether it went; the sheet closes once it did.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { Icon3D } from '@/components/Icon3D';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { GIFTS, type Gift } from '@/data/mock';
import { makeStyles, radius, space, type, useTheme } from '@/theme';
import { RollingNumber } from '@/components/fx/rolling-number';

const fmt = (n: number) => n.toLocaleString('tr-TR');

export function ProfileGiftSheet({
  visible,
  name,
  gifts = GIFTS,
  coins,
  svipLevel,
  onClose,
  onSend,
}: {
  visible: boolean;
  /** Who gets it (shown in the title). */
  name: string;
  /** The gifts to offer: in a live build the ones the server still offers (visibleGifts). */
  gifts?: Gift[];
  coins: number;
  svipLevel: number;
  onClose: () => void;
  /** Sends one of the gift; true once it went (any refusal is shown by the sender). */
  onSend: (gift: Gift) => Promise<boolean> | boolean;
}) {
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const { bottom } = useSafeAreaInsets();
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const gift = gifts.find((g) => g.id === picked) ?? null;
  const locked = !!gift && (gift.minSvip ?? 0) > svipLevel;
  const short = !!gift && !locked && gift.price > coins;

  const close = () => {
    setPicked(null);
    onClose();
  };
  const goWallet = () => {
    close();
    router.push('/cuzdan');
  };
  const send = async () => {
    if (!gift || sending) return;
    setSending(true);
    const sent = await onSend(gift);
    setSending(false);
    if (sent) close();
  };
  const action = sending
    ? { title: 'Gönderiliyor…', disabled: true }
    : !gift
      ? { title: 'Bir hediye seç', disabled: true }
      : locked
        ? { title: `İnci ${gift.minSvip} gerekli`, disabled: true }
        : short
          ? { title: 'Jeton yükle', onPress: goWallet }
          : { title: `Gönder · ${fmt(gift.price)}`, onPress: send };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.scrim} onPress={close} accessibilityLabel="Hediye panelini kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(space.lg, bottom + 8) }]}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={2}>
            {name} kişisine hediye
          </Text>
          <Pressable onPress={goWallet} style={s.balance} accessibilityRole="button" accessibilityLabel={`Bakiye ${fmt(coins)} jeton, jeton yükle`}>
            <Icon3D name="coin" size={20} />
            <RollingNumber value={coins} style={s.balanceText} />
            <Ionicons name="add-circle" size={18} color={semantic.money} />
          </Pressable>
          <Pressable onPress={close} hitSlop={10} style={s.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={s.gridScroll} contentContainerStyle={s.grid}>
          {gifts.map((g) => {
            const on = g.id === picked;
            const lock = (g.minSvip ?? 0) > svipLevel;
            return (
              <Pressable
                key={g.id}
                onPress={() => setPicked(g.id)}
                style={s.tileWrap}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${g.name}, ${fmt(g.price)} jeton${lock ? `, İnci ${g.minSvip} gerekli` : ''}`}
              >
                <View style={[s.tile, on && s.tileOn]}>
                  <GiftArt giftId={g.id} emoji={g.emoji} size={42} style={lock && { opacity: 0.4 }} textStyle={[s.tileArt, lock && { opacity: 0.4 }]} />
                  <Text style={[s.tileName, lock && { color: colors.textDim }]} numberOfLines={2}>
                    {g.name}
                  </Text>
                  {lock ? (
                    <View style={s.lockPill}>
                      <Ionicons name="lock-closed" size={10} color={colors.gold} />
                      <Text style={s.lockText}>İnci {g.minSvip}</Text>
                    </View>
                  ) : (
                    <View style={s.priceRow}>
                      <Icon3D name="coin" size={13} />
                      <Text style={s.tilePrice}>{fmt(g.price)}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.footer}>
          {short && gift && (
            <Text style={s.note}>
              Bakiyen {fmt(coins)} jeton. Bu hediye için {fmt(gift.price - coins)} jeton eksik.
            </Text>
          )}
          <Button title={action.title} variant="money" disabled={'disabled' in action && action.disabled} onPress={'onPress' in action ? action.onPress : undefined} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark, ink }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '80%', backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  title: { flex: 1, color: colors.text, fontSize: type.title, fontWeight: '800' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: radius.pill, paddingHorizontal: space.md, height: 36 },
  balanceText: { color: semantic.moneyText, fontWeight: '800', fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  gridScroll: { flexGrow: 0, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md, paddingBottom: space.sm },
  tileWrap: { width: '25%', padding: 4 },
  tile: { flexGrow: 1, alignItems: 'center', gap: 2, paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: dark ? 'rgba(255,255,255,0.03)' : ink(0.04) },
  tileOn: { borderColor: colors.primaryText, backgroundColor: semantic.tonal },
  tileArt: { fontSize: 34, lineHeight: 42 },
  // Two lines, broken between words ("Şans / Yoncası"), instead of "Şans Yon…".
  tileName: { color: colors.text, fontSize: type.caption, fontWeight: '600', maxWidth: '100%', textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tilePrice: { color: colors.textDim, fontSize: type.caption, fontVariant: ['tabular-nums'] },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  lockText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  note: { color: colors.gold, fontSize: type.caption },
}));
