// Oda Süslemesi and Oda Kapağı of a server room (server/api/room-decor.mjs): the settings read what the room has,
// and each change goes to the server, which charges, stores and tells every phone in the room. The answer's room
// reaches the lists and the open room at once (putRoomAnswer). A charge carries a request id the server keeps
// once (lib/live once), so a request repeated after a lost answer never pays twice.
import * as api from '@/lib/api';
import { applyServerUser, once, putRoomAnswer, refreshWallet } from '@/lib/live';
import { putPhoto, type PickedImage } from '@/lib/live/profile';

const took = (r: { room: api.ServerRoom; decor: api.RoomDecor }) => {
  putRoomAnswer(r.room);
  return r.decor;
};

export const loadRoomDecor = (room: string) => api.roomDecor(room);
/** A free background (`bgId` null: the theme's stage). */
export const pickFreeBackground = async (room: string, bgId: string | null) => took(await api.pickRoomBackground(room, { pick: 'free', bgId }));
/** One of what the owner has: 'custom' (their picture) or a paid background. */
export const pickOwnedBackground = async (room: string, pick: string) => took(await api.pickRoomBackground(room, { pick }));

/** Buys a paid background at the price the shelf showed; the room shows it at once. */
export async function buyBackground(room: string, sku: string, price: number) {
  const r = await once(`roombg:${room}:${sku}`, (ref) => api.buyRoomBackground(room, sku, price, ref));
  applyServerUser(r, 'Oda süslemesi');
  return took(r);
}

/**
 * My own picture (already cut to the stage's shape) as the room's background: uploaded, then set. Outside a paid
 * term the server charges `price` (what the screen showed); inside one it only replaces the picture. Resolves with
 * the decoration and whether coins were taken.
 */
export async function setCustomBackground(room: string, img: PickedImage, price: number) {
  // One request id for the whole try: the upload is repeated on a retry, the charge is not.
  const r = await once(`roombg:${room}:custom`, async (ref) => api.setRoomCustomBackground(room, await putPhoto('roombg', img), price, ref));
  if (r.user) applyServerUser({ user: r.user }, 'Oda süslemesi');
  // No balance in the answer (the picture was only replaced, or an earlier try had already paid): read it.
  else void refreshWallet().catch(() => {});
  return { decor: took(r), charged: r.charged };
}

export const removeCustomBackground = async (room: string) => took(await api.removeRoomCustomBackground(room));

/** Oda Kapağı: the picture (already cut to the lists' square) uploaded and put on the room's card; null takes it
 *  off. Resolves with the uploaded cover's address as the server keeps it (null: none). */
export async function setCover(room: string, img: PickedImage | null) {
  const r = await api.setRoomCover(room, img ? await putPhoto('roomcover', img) : null);
  putRoomAnswer(r);
  return r.coverUrl ?? null;
}
