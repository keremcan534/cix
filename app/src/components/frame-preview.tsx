// Çarşı's frame preview (Güncelleme 7): before buying a frame, the person sees it round their own photo in one sheet,
// three ways (sizes: lib/frame-preview):
// - large, the frame playing as it does everywhere (a moving one moves);
// - on a room seat, exactly as a room draws it (components/ui FramedAvatar with the seat's cell, lib/seat-cell), its
//   name in the dark capsule a framed face's name sits in, the empty mics of the row beside it, on a room's stage;
// - on their profile, at the profile header's size.
// Every kind of frame is drawn the way the rest of the app draws it (FramedAvatar): the app's pictures and the team's
// own (Yönetim › Mağaza, components/fx/frame-art frameArtOf), the code-drawn ones and the colour rings, with my VIP
// badge where it shows. "Hareketi azalt" and "Düşük veri modu" keep it still, as in a room. Local only: nothing is worn,
// bought or sent from here; the button under it is Çarşı's own (buy with its confirmation, wear, or the VIP lock).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { frameArtOf } from '@/components/fx/frame-art';
import { themeStagePhoto } from '@/components/room/stage-backdrop';
import { SeatPouf } from '@/components/room/seat-pouf';
import { FramedAvatar } from '@/components/ui';
import type { Cosmetic } from '@/data/catalog';
import { seatColorOf } from '@/data/seat-colors';
import { framePreviewSizes } from '@/lib/frame-preview';
import { NAME_GAP, artFit } from '@/lib/seat-cell';
import { useApp } from '@/store';
import { SCRIM, fonts, glass, makeStyles, useTheme } from '@/theme';

/** `footer`: Çarşı's button for this frame (price, Kullan / Çıkar, or the VIP lock). */
export function FramePreviewSheet({ item, onClose, footer }: { item: Cosmetic | null; onClose: () => void; footer?: ReactNode }) {
  const { me, vipLevel } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const sizes = framePreviewSizes(width);
  if (!item) return null;
  const { large, seat, profile } = sizes;
  // A picture frame's name sits in a dark capsule on a seat, its gems hanging behind it (components/room/parts Seat).
  const art = frameArtOf(item.id);
  const capsule = !!art;
  // The square a framed photo of `size` takes: a picture frame's side (components/fx/frame-art), else the photo with
  // the room a code-drawn frame's glow and sparks take round it.
  const spread = (size: number, scale: number) => Math.ceil(art ? artFit(art, size, scale).frame : size * 1.35);
  const empty = seatColorOf(null).color;
  const meta = [item.days ? `${item.days} gün` : 'Kalıcı', item.minVip ? `VIP ${item.minVip}+` : null].filter(Boolean).join(' · ');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { maxHeight: Math.round(height * 0.9), paddingBottom: Math.max(16, bottom + 8) }]}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={[styles.large, { height: spread(large.size, large.artScale) + 16 }]} accessibilityLabel={`${item.name}, senin fotoğrafınla`}>
            <FramedAvatar uri={me.avatar} size={large.size} vipLevel={vipLevel} frameId={item.id} artScale={large.artScale} />
          </View>

          <Text style={styles.label}>Odada mikrofonda böyle görünür</Text>
          <View style={[styles.stage, { paddingTop: seat.top + 6 }]} accessibilityLabel={`Odada mikrofonda ${item.name}`}>
            <Image source={themeStagePhoto('chat')} resizeMode="cover" style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(22,14,18,0.35)', 'rgba(22,14,18,0.6)']} style={StyleSheet.absoluteFill} />
            <View style={styles.seatRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: seat.slot, alignItems: 'center', gap: NAME_GAP }}>
                  {i === 1 ? (
                    <FramedAvatar uri={me.avatar} size={seat.face} vipLevel={vipLevel} frameId={item.id} room={seat.room} />
                  ) : (
                    <SeatPouf color={empty} size={seat.face} />
                  )}
                  <View style={[styles.nameLine, i === 1 && capsule && styles.capsule]}>
                    <Text
                      style={[styles.seatName, { fontSize: seat.nameSize, lineHeight: seat.nameLine, maxWidth: seat.slot - (i === 1 && capsule ? 8 : 6) }, i !== 1 && styles.seatEmpty]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1}
                    >
                      {i === 1 ? me.name : String(i + 2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.label}>Profilinde böyle görünür</Text>
          <View style={styles.profile} accessibilityLabel={`Profilinde ${item.name}`}>
            <View style={{ width: spread(profile.size, profile.artScale), height: spread(profile.size, profile.artScale), alignItems: 'center', justifyContent: 'center' }}>
              <FramedAvatar uri={me.avatar} size={profile.size} vipLevel={vipLevel} frameId={item.id} artScale={profile.artScale} />
            </View>
            <View style={styles.namePill}>
              <Text style={styles.profileName} numberOfLines={1}>
                {me.name}
              </Text>
            </View>
          </View>
          <Text style={styles.note}>Önizleme yalnız sende görünür; satın alıp takınca herkes görür.</Text>
        </ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, edge }) => ({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, ...edge.sheet },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  meta: { color: colors.textDim, fontSize: 12 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  large: { alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 4 },
  stage: { borderRadius: 18, overflow: 'hidden', paddingBottom: 12, alignItems: 'center' },
  seatRow: { flexDirection: 'row', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  capsule: { backgroundColor: 'rgba(10,6,20,0.55)', borderRadius: 8, paddingHorizontal: 3 },
  seatName: { color: '#fff', fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
  seatEmpty: { color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  profile: { alignItems: 'center', gap: 6, borderRadius: 18, backgroundColor: glass.fill, borderWidth: 1, borderColor: glass.rim, paddingTop: 8, paddingBottom: 14, paddingHorizontal: 12 },
  namePill: { maxWidth: '100%', backgroundColor: glass.white, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1.5, borderColor: glass.rim },
  profileName: { color: glass.ink, fontSize: 20, fontFamily: fonts.display },
  note: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 10, alignItems: 'center' },
}));
