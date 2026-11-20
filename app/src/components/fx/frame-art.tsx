// Illustrated avatar frames (one generated sheet, cut and cleaned; see docs). Their measurements (data/frame-art):
// `hole` is the radius of the empty centre as a share of the image width, measured when cutting, so any avatar size
// sits exactly inside the ring; `reach` how far the picture goes from its centre. The art is drawn larger than the
// avatar box and overflows it on purpose; on a seat it stays inside the seat's cell (lib/seat-cell).
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type ImageSourcePropType } from 'react-native';

import { cosmeticById } from '@/data/catalog';
import { FRAME_ART_SIZES, type FrameArtSize } from '@/data/frame-art';
import { ART_BREATHE, artFit, seatArt, seatPhotoDisc, type SeatRoom } from '@/lib/seat-cell';
import { useSettings } from '@/store';

/**
 * `motion`: the team's moving frame (an animated WebP, Yönetim › Mağaza) played instead of the still `src`; `at`: where
 * the hole's centre is in the picture when it isn't the middle (a ring under a crown is higher), so the picture is
 * moved to put the hole on the photo.
 */
type Art = FrameArtSize & { src: ImageSourcePropType; glow: string; motion?: ImageSourcePropType; at?: { x: number; y: number } };
/** The smallest photo a moving frame plays round: in a list's small rows the still one is drawn. */
const MOVING_MIN = 48;
const made = (id: string, src: ImageSourcePropType, glow: string): Art => ({ ...FRAME_ART_SIZES[id], src, glow });
const ART: Record<string, Art> = {
  'fr-silver': made('fr-silver', require('../../../assets/frames/fr-silver.png'), '#CBD5E1'),
  'fr-frost': made('fr-frost', require('../../../assets/frames/fr-frost.png'), '#7DD3FC'),
  'fr-rose': made('fr-rose', require('../../../assets/frames/fr-rose.png'), '#FF6576'),
  'fr-laurel': made('fr-laurel', require('../../../assets/frames/fr-laurel.png'), '#F6BD60'),
  'fr-crown-silver': made('fr-crown-silver', require('../../../assets/frames/fr-crown-silver.png'), '#13D9DF'),
  'fr-crown-gold': made('fr-crown-gold', require('../../../assets/frames/fr-crown-gold.png'), '#F6BD60'),
  'fr-wing-rose': made('fr-wing-rose', require('../../../assets/frames/fr-wing-rose.png'), '#FF5FA2'),
  'fr-wing-coral': made('fr-wing-coral', require('../../../assets/frames/fr-wing-coral.png'), '#FF6576'),
  'fr-wing-sky': made('fr-wing-sky', require('../../../assets/frames/fr-wing-sky.png'), '#13D9DF'),
};
/**
 * The team's own frames (Yönetim › Mağaza, data/catalog `remote.art`), made once per picture: reach is the drawn part the
 * server measured (`art.reach`), else the whole picture, from the hole's centre; a moving one has its animated WebP too.
 */
const remote = new Map<string, Art>();
export const frameArtOf = (id?: string): Art | undefined => {
  if (!id) return undefined;
  if (ART[id]) return ART[id];
  const r = cosmeticById(id)?.remote?.art;
  if (!r) return undefined;
  const at = r.at ?? { x: 0.5, y: 0.5 };
  // How far the picture is really drawn (measured by the server, lib/shop-live-core parseFrameReach); a frame measured
  // before it, or that couldn't be measured, counts as the whole square, as before.
  const reach = r.reach ?? { x: Math.max(at.x, 1 - at.x), top: at.y, bottom: 1 - at.y };
  const key = `${r.url}|${r.hole}|${at.x},${at.y}|${r.motion?.url ?? ''}|${reach.x},${reach.top},${reach.bottom}`;
  let art = remote.get(key);
  if (!art) {
    art = {
      hole: r.hole,
      reach,
      src: { uri: r.url },
      glow: '#F6BD60',
      ...(r.at ? { at: r.at } : {}),
      ...(r.motion ? { motion: { uri: r.motion.url } } : {}),
    };
    remote.set(key, art);
  }
  return art;
};

/** Avatar inside an illustrated frame: soft glow pulse behind, the frame breathes slightly. */
/**
 * `maxScale` caps how far the art may spread beyond the avatar box (1.8 = 40% each side). When a large
 * crown or wings would exceed it, the avatar shrinks inside the box instead, so tight layouts (seats,
 * list rows) don't get covered. `room`: a seat's cell around the box (lib/seat-cell); the art stays inside it
 * whatever its shape, so wide wings or a crown never run over the next seat or the row above, and hanging gems stay
 * behind the seat's own name.
 */
export function ArtFrame({ art, size, still, maxScale = 1.8, room, children }: { art: Art; size: number; still?: boolean; maxScale?: number; room?: SeatRoom; children: ReactNode }) {
  const [t] = useState(() => new Animated.Value(0));
  // On a seat the picture keeps to the seat's cell (lib/seat-cell seatArt, its header has the rule): the photo fills
  // the face, or the picture is drawn smaller with its ring over the photo's edge, or the photo shrinks a little under
  // it (`avatar`, centred in the face's box); only as a last resort is the picture cut at the cell's edge. Elsewhere:
  // avatar radius = hole radius (+4% tucked under the ring).
  const seat = room ? seatArt(art, size, room) : null;
  const { frame, avatar } = seat ?? artFit(art, size, maxScale);
  // On a seat the photo shows only inside the picture's hole (lib/seat-cell seatPhotoDisc): a thin ring drawn over a
  // bigger photo would let it show round the ring. Elsewhere the photo is the hole's size already.
  const disc = seat ? seatPhotoDisc(art, frame, avatar) : avatar;
  // A picture that fits only standing still, or is cut, stands still: breathing (or a moving frame's sparkles) would
  // pass the seat's cell or slide the cut edge.
  const calm = !!still || !!seat?.still || !!seat?.clip;
  // A moving frame plays its own animation instead of breathing; "hareketi azalt", "Düşük veri modu" (its file isn't
  // fetched) and a small photo draw the still picture, as an older app does.
  const { lowData } = useSettings();
  const moving = !!art.motion && !calm && !lowData && size >= MOVING_MIN;
  useEffect(() => {
    if (calm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, calm]);
  const inset = (size - avatar) / 2;
  const picture = (
    <Animated.Image
      source={moving ? art.motion! : art.src}
      resizeMode="contain"
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: frame,
        height: frame,
        // The hole's centre on the photo's centre (the picture's middle unless `at` says otherwise).
        left: size / 2 - (art.at?.x ?? 0.5) * frame - (seat?.clip ? seat.box.left : 0),
        top: size / 2 - (art.at?.y ?? 0.5) * frame - (seat?.clip ? seat.box.top : 0),
        transform: [{ scale: calm || moving ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [1, ART_BREATHE] }) }],
      }}
    />
  );
  const glow = disc * 1.16;
  const shown = (size - disc) / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: (size - glow) / 2,
          top: (size - glow) / 2,
          width: glow,
          height: glow,
          borderRadius: size,
          backgroundColor: art.glow,
          opacity: calm ? 0.25 : t.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.4] }),
        }}
      />
      {seat ? (
        // The photo at its size, only its middle (the hole's) showing.
        <View style={{ position: 'absolute', left: shown, top: shown, width: disc, height: disc, borderRadius: disc / 2, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -(avatar - disc) / 2, top: -(avatar - disc) / 2, width: avatar, height: avatar }}>{children}</View>
        </View>
      ) : (
        <View style={{ position: 'absolute', left: inset, top: inset, width: avatar, height: avatar, borderRadius: avatar / 2, overflow: 'hidden' }}>{children}</View>
      )}
      {seat?.clip ? (
        <View pointerEvents="none" style={{ position: 'absolute', ...seat.box, overflow: 'hidden' }}>
          {picture}
        </View>
      ) : (
        picture
      )}
    </View>
  );
}
