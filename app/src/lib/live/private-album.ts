// Özel albüm on the server (server/api/private-album.mjs): someone's album as I may see it, and mine to fill: a
// photo made smaller and put in the storage as kind 'private', then added (the server reads it back and refuses a
// file that isn't a photo). Opening someone's album is a money request: lib/live liveUnlockPrivateAlbum.
import * as api from '@/lib/api';
import { uploadPhoto, type PickedImage } from '@/lib/live/profile';
import { parseAlbum, type PrivateAlbum } from '@/lib/private-album-core';

const readOrThrow = (v: unknown): PrivateAlbum => {
  const a = parseAlbum(v);
  if (!a) throw new Error('Özel albüm okunamadı. Tekrar dene.');
  return a;
};

/** `id`'s album as I may see it (mine with its photos; someone else's photos only once I opened it). */
export const loadPrivateAlbum = async (id: string) => readOrThrow(await api.privateAlbum(id));
/** A picked photo into my album; resolves with my album. */
export const addPrivatePhoto = async (img: PickedImage) => readOrThrow(await api.addPrivatePhoto(await uploadPhoto('private', img)));
/** Takes a photo out of my album; resolves with my album. */
export const removePrivatePhoto = async (id: number) => readOrThrow(await api.removePrivatePhoto(id));
