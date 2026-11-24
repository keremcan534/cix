// Özel albüm (owners, 24 Nov 2026; server/api/private-album.mjs): an approved agency streamer's photos others open
// with coins. The album as the server sends it, read defensively: a malformed answer is "no album", never a crash.

export type PrivatePhoto = { id: number; url: string };
export type PrivateAlbum = {
  /** The album can be opened at all now (Canlı ayarlar' price above 0). */
  on: boolean;
  /** Its price in coins, the same for everyone. */
  price: number;
  /** How many photos it holds (0 for someone else's that can't be opened now). */
  count: number;
  max: number;
  mine: boolean;
  /** Mine: whether I may add photos now (an approved agency streamer, the album open). */
  can: boolean;
  unlocked: boolean;
  /** Only to its owner and to whoever opened it; empty otherwise. */
  photos: PrivatePhoto[];
};

const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);
const url = (v: unknown) => typeof v === 'string' && /^(https?:\/\/|\/)/.test(v) && v.length <= 1000;

/** The server's album, or null when the answer isn't one. */
export function parseAlbum(v: unknown): PrivateAlbum | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const photos = Array.isArray(a.photos)
    ? a.photos
        .filter((p): p is { id: number; url: string } => !!p && typeof p === 'object' && Number.isSafeInteger((p as { id?: unknown }).id) && url((p as { url?: unknown }).url))
        .slice(0, 50)
        .map((p) => ({ id: p.id, url: p.url }))
    : [];
  return {
    on: a.on === true,
    price: num(a.price, 10_000_000),
    count: num(a.count, 1000),
    max: num(a.max, 1000) || 12,
    mine: a.mine === true,
    can: a.can === true,
    unlocked: a.unlocked === true,
    photos,
  };
}

/** What the profile shows of an album: nothing, mine to fill, locked (its price), or open. */
export type AlbumShow = 'none' | 'mine' | 'locked' | 'open';
export function albumShow(a: PrivateAlbum | null): AlbumShow {
  if (!a) return 'none';
  if (a.mine) return a.can || a.count > 0 ? 'mine' : 'none';
  if (a.unlocked) return a.photos.length > 0 ? 'open' : 'none';
  return a.on && a.count > 0 ? 'locked' : 'none';
}

/** The words on the button that opens it: "500 jetonla aç". */
export const unlockLabel = (price: number) => `${price.toLocaleString('tr-TR')} jetonla aç`;
