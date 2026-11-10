// A room's pictures before they are used (Oda Süslemesi › Özel, Oda Kapağı): picked from the phone and cut to
// exactly the shape they are drawn in, the stage's portrait 1080 × 1920 or the lists' square 800 × 800
// (data/catalog ROOM_BG_SIZE, ROOM_COVER_SIZE), as a JPEG. Saving it again also drops the file's hidden details
// (where and on which phone it was taken). The demo keeps the result on the phone; a server room uploads it
// (lib/live/room-decor).
import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from '@/lib/live/profile';
import { cropRect } from '@/lib/room-decor';

type Size = { width: number; height: number };

/**
 * `img` cut from its middle to the shape of `size` and brought to exactly that many pixels. Throws (in Turkish)
 * when this phone can't do it: a picture of another shape would be stretched behind the stage, so none is used.
 */
export async function fitPicture(img: PickedImage, size: Size): Promise<PickedImage> {
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    let { width = 0, height = 0 } = img;
    if (!(width > 0 && height > 0)) {
      // The picker gave no size: the picture is read once to learn it.
      const ref = await ImageManipulator.manipulate(img.uri).renderAsync();
      width = ref.width;
      height = ref.height;
    }
    const cut = cropRect(width, height, size);
    const ctx = ImageManipulator.manipulate(img.uri);
    if (cut) ctx.crop(cut);
    ctx.resize({ width: size.width, height: size.height });
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch {
    throw new Error('Görsel hazırlanamadı. Başka bir görsel seç.');
  }
}

/**
 * Lets the person choose a picture and cuts it to `size`; null when they backed out. Where the phone's own crop
 * screen keeps the shape (Android) they frame it themselves; elsewhere the middle is taken.
 */
export async function pickRoomPicture(size: Size): Promise<PickedImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [size.width, size.height], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  return fitPicture(res.assets[0], size);
}
