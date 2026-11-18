// A shop item's card and its preview, shared by Çarşı (app/magaza) and Çantam (app/canta): the card lit in the item's
// colour, and the item as it shows on a seat, in a room or in a chat (a frame round my photo, an entry banner with its
// picture, a ride, a bubble, a voice wave, a special ID).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { Text } from '@/components/text';
import { ENTRY_LOOKS, type EntryFx } from '@/components/fx/entry';
import { Halo } from '@/components/fx/float';
import { ArtFrame, frameArtOf } from '@/components/fx/frame-art';
import { ShopBubble } from '@/components/fx/shop-bubble';
import { AnimatedFrame, type FrameFx } from '@/components/fx/frames';
import { EdgeLight } from '@/components/fx/surface';
import { SPECIAL_ID_ART, frameBadgeArtOf, storeArtOf } from '@/components/StoreArt';
import { Photo } from '@/components/photo';
import { WavePreview } from '@/components/room/voice-wave';
import type { Cosmetic } from '@/data/catalog';
import { makeStyles, useTheme } from '@/theme';

/** A store item: a card lit in the item's color, its preview standing on a pool of that light. */
// Like the game cards (fx/float BreakoutCard): the item's light over the scheme's card color.
export function Shelf({ hue, on, children }: { hue: string; on?: boolean; children: ReactNode }) {
  const { colors, dark } = useTheme();
  const styles = useItemStyles();
  return (
    <LinearGradient
      colors={[`${hue}38`, `${hue}0A`, dark ? '#101C30' : '#FFFFFF']}
      locations={[0, 0.5, 1]}
      style={[
        styles.item,
        {
          borderColor: on ? colors.primaryText : `${hue}40`,
          boxShadow: `${dark ? '0 8px 20px rgba(0,0,0,0.35)' : '0 1px 2px rgba(64,20,40,0.05), 0 8px 20px rgba(64,20,40,0.08)'}, 0 0 16px ${hue}1F`,
        },
      ]}
    >
      <EdgeLight inset={16} strength={0.4} />
      <View style={styles.halo}>
        <Halo size={90} hue={hue} strength={0.45} />
      </View>
      {on && <Text style={styles.onTag}>Kullanılıyor</Text>}
      {children}
    </LinearGradient>
  );
}

/** Every preview in one slot of the tallest preview's height, so the names under neighbouring tiles line up. */
export function ItemPreview(props: { item: Cosmetic; avatar: string; voice: string; still?: boolean }) {
  return (
    <View style={{ height: 104, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
      <PreviewBody {...props} />
    </View>
  );
}

function PreviewBody({ item, avatar, voice, still }: { item: Cosmetic; avatar: string; voice: string; still?: boolean }) {
  const { colors } = useTheme();
  const styles = useItemStyles();
  if (item.kind === 'wave')
    return (
      <View style={{ height: 104, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`${item.name} ses dalgası`}>
        <WavePreview wave={item.id} uri={avatar} color={voice} still={still} />
      </View>
    );
  const art = item.kind === 'frame' ? frameArtOf(item.id) : undefined;
  if (art) {
    // Size the avatar so the whole illustrated frame (wings, crown) fits the card.
    const size = Math.round(100 * 2 * art.hole * 1.04);
    return (
      <View style={{ height: 104, justifyContent: 'center', alignItems: 'center' }}>
        <ArtFrame art={art} size={size} still={still} maxScale={3}>
          <Photo uri={avatar} kind="face" style={{ width: '100%', height: '100%' }} />
        </ArtFrame>
      </View>
    );
  }
  if (item.kind === 'frame' && item.fx) {
    const badge = frameBadgeArtOf(item.id);
    return (
      <View style={{ height: 104, justifyContent: 'center', alignItems: 'center' }}>
        <AnimatedFrame fx={item.fx as FrameFx} size={64} still={still}>
          <Photo uri={avatar} kind="face" style={{ width: '100%', height: '100%' }} />
        </AnimatedFrame>
        {badge && <Image source={badge} style={styles.frameBadge} accessibilityLabel={item.name} />}
      </View>
    );
  }
  // The app's own picture, or the icon the team gave its own entry effect (Yönetim › Mağaza).
  const pic = storeArtOf(item.id) ?? (item.kind === 'entry' && item.remote?.icon ? { uri: item.remote.icon.url } : undefined);
  if (item.kind === 'entry') {
    const look = ENTRY_LOOKS[(item.fx as EntryFx | undefined) ?? 'vip'];
    const banner = (
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.entryPreview, !!pic && styles.entryPreviewSmall]}>
        {look.creature && <Text style={{ fontSize: 16 }}>{look.creature}</Text>}
        <Text style={styles.entryPreviewText} numberOfLines={1}>
          Hoş geldin
        </Text>
        {!!look.mark && <Text style={{ fontSize: 14 }}>{look.mark}</Text>}
      </LinearGradient>
    );
    if (!pic) return banner;
    return (
      <View style={styles.artStack}>
        <Image source={pic} style={styles.artIcon} accessibilityLabel={item.name} />
        {banner}
      </View>
    );
  }
  if (item.kind === 'ride' && pic) return <Image source={pic} style={styles.rideArt} accessibilityLabel={item.name} />;
  if (item.kind === 'frame' && item.color) {
    return (
      <LinearGradient colors={item.color} style={styles.framePreview}>
        <View style={styles.frameInner}>
          <Ionicons name="person" size={26} color={colors.textDim} />
        </View>
      </LinearGradient>
    );
  }
  const shopBubble = item.kind === 'bubble' ? item.remote?.bubble : undefined;
  if (shopBubble)
    // One the team added: its colours, or its picture stretched round the message as in a room.
    return (
      <View style={{ height: 104, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`${item.name} sohbet balonu`}>
        <ShopBubble look={shopBubble} style={styles.shopBubblePreview}>
          <Text style={{ color: shopBubble.text, fontSize: 13 }}>Merhaba! 👋</Text>
        </ShopBubble>
      </View>
    );
  if (item.kind === 'bubble' && item.color) {
    const bubble = (
      <LinearGradient colors={item.color} style={[styles.bubblePreview, !!pic && styles.bubblePreviewSmall]}>
        <Text style={{ color: '#fff', fontSize: 12 }}>Merhaba!{pic ? '' : ` ${item.emoji}`}</Text>
      </LinearGradient>
    );
    if (!pic) return bubble;
    return (
      <View style={styles.artStack}>
        <Image source={pic} style={styles.artIcon} accessibilityLabel={item.name} />
        {bubble}
      </View>
    );
  }
  if (item.kind === 'specialId') {
    return (
      <View style={styles.artStack}>
        <Image source={SPECIAL_ID_ART} style={styles.idArt} accessibilityLabel={item.name} />
        <Text style={[styles.idPreview, styles.idPreviewSmall]}>{item.name.replace('ID ', '')}</Text>
      </View>
    );
  }
  return <Text style={{ fontSize: 44, height: 64, textAlignVertical: 'center' }}>{item.emoji}</Text>;
}

const useItemStyles = makeStyles((t) => ({
  entryPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 20, paddingHorizontal: 10, marginVertical: 12, maxWidth: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  entryPreviewSmall: { height: 32, marginVertical: 0 },
  entryPreviewText: { color: '#fff', fontWeight: '800', fontSize: 12, flexShrink: 1 },
  artStack: { alignItems: 'center', gap: 4 },
  artIcon: { width: 56, height: 56 },
  rideArt: { width: 72, height: 72 },
  item: { width: '48.5%', borderRadius: 20, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1.5 },
  halo: { position: 'absolute', top: 14, alignSelf: 'center', width: 90, height: 90 },
  onTag: { position: 'absolute', top: 8, right: 8, color: t.semantic.actionInk, backgroundColor: t.semantic.action, fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', zIndex: 1 },
  framePreview: { width: 64, height: 64, borderRadius: 32, padding: 4 },
  frameInner: { flex: 1, borderRadius: 28, backgroundColor: t.colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  bubblePreview: { height: 64, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, marginVertical: 0 },
  bubblePreviewSmall: { height: 32 },
  // The team's bubble as a room draws it (components/room/parts chatBubble): its own size round the message.
  shopBubblePreview: { maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderTopLeftRadius: 4 },
  idPreview: { color: t.colors.gold, fontSize: 30, fontWeight: '900', height: 64, textAlignVertical: 'center', letterSpacing: 2, paddingTop: 12 },
  idPreviewSmall: { fontSize: 20, height: 26, paddingTop: 0 },
  idArt: { width: 44, height: 44 },
  frameBadge: { position: 'absolute', right: -14, bottom: 0, width: 30, height: 30 },
}));
