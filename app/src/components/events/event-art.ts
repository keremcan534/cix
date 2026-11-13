// Etkinlik Merkezi art (docs/GORSEL_URETIM_LISTESI.md § 20, app/assets/events): each theme's cover (on a card
// without its own picture, in the form's theme picker), its room background (behind the stage while the event
// runs) and each event type's sign (the card's tag, the filter). A theme or type without a picture here keeps the
// drawn look (lib/events THEME_LOOK: two colours and an icon).
import { THEME_LOOK } from '@/lib/events';

/** Theme covers, 900 × 600 JPEG (cut to the card's shape). */
const COVER: Record<string, number> = {
  sade: require('../../../assets/events/etkinlik-kapak-sade.jpg'),
  'ilk-selam': require('../../../assets/events/etkinlik-kapak-ilk-selam.jpg'),
  pasta: require('../../../assets/events/etkinlik-kapak-pasta.jpg'),
  sahne: require('../../../assets/events/etkinlik-kapak-sahne.jpg'),
  yildiz: require('../../../assets/events/etkinlik-kapak-yildiz.jpg'),
  kupa: require('../../../assets/events/etkinlik-kapak-kupa.jpg'),
  'iki-kalp': require('../../../assets/events/etkinlik-kapak-iki-kalp.jpg'),
  ocak: require('../../../assets/events/etkinlik-kapak-ocak.jpg'),
  'altin-gala': require('../../../assets/events/etkinlik-kapak-altin-gala.jpg'),
};

/** Room backgrounds while the event runs, 720 × 1080 JPEG. Sade has none: it keeps the room's own look. */
const ROOM: Record<string, number> = {
  'ilk-selam': require('../../../assets/events/etkinlik-oda-ilk-selam.jpg'),
  pasta: require('../../../assets/events/etkinlik-oda-pasta.jpg'),
  sahne: require('../../../assets/events/etkinlik-oda-sahne.jpg'),
  yildiz: require('../../../assets/events/etkinlik-oda-yildiz.jpg'),
  kupa: require('../../../assets/events/etkinlik-oda-kupa.jpg'),
  'iki-kalp': require('../../../assets/events/etkinlik-oda-iki-kalp.jpg'),
  ocak: require('../../../assets/events/etkinlik-oda-ocak.jpg'),
  'altin-gala': require('../../../assets/events/etkinlik-oda-altin-gala.jpg'),
};

/** Event type signs (server event_categories ids), 192 px PNG. A type the management adds later has none yet. */
const TYPE: Record<string, number> = {
  eglence: require('../../../assets/events/etkinlik-tur-eglence.png'),
  muzik: require('../../../assets/events/etkinlik-tur-muzik.png'),
  tanisma: require('../../../assets/events/etkinlik-tur-tanisma.png'),
  yarisma: require('../../../assets/events/etkinlik-tur-yarisma.png'),
  'ozel-gun': require('../../../assets/events/etkinlik-tur-ozel-gun.png'),
  aile: require('../../../assets/events/etkinlik-tur-aile.png'),
  cift: require('../../../assets/events/etkinlik-tur-cift.png'),
  diger: require('../../../assets/events/etkinlik-tur-diger.png'),
};

/** A theme the app doesn't know looks like Sade (as lib/events lookOf). */
const known = (theme: string) => (Object.hasOwn(THEME_LOOK, theme) ? theme : 'sade');

export const themeCoverArt = (theme: string): number | null => COVER[known(theme)] ?? null;
export const themeRoomArt = (theme: string): number | null => ROOM[known(theme)] ?? null;
export const eventTypeArt = (category: string | null | undefined): number | null => (category && Object.hasOwn(TYPE, category) ? TYPE[category] : null);
