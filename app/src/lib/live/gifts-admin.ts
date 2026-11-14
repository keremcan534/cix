// Yönetim › Hediyeler (admins): the gifts the admins add without an app update (server/api/custom-gifts.mjs,
// docs/HEDIYE_YONETIMI.md). The files go to the storage first (an upload address, then the bytes PUT there: media.mjs
// kinds gifticon, giftvideo, giftsource); a save names them. A big video goes from the phone's disk as it is
// (expo-file-system uploadAsync), never through memory; on the web the picked file is sent as it is. The rules
// (sizes, prices, shelves) come from the server with the list; the pure parts are in lib/gifts-admin-core.
import * as api from '@/lib/api';
import { contentTypeOf, type AdminGift, type FileKind, type GiftFields, type GiftsAdmin, type PickedFile } from '@/lib/gifts-admin-core';

export * from '@/lib/gifts-admin-core';

export const loadGiftsAdmin = () => api.apiRequest<GiftsAdmin>('GET', '/api/admin/gifts');
export const createGift = (f: GiftFields) => api.apiRequest<{ gift: AdminGift }>('POST', '/api/admin/gifts', f).then((r) => r.gift);
/** Changes only what `f` names; video null takes the video off. */
export const updateGift = (id: string, f: Partial<GiftFields>) => api.apiRequest<{ gift: AdminGift }>('POST', '/api/admin/gifts/update', { id, ...f }).then((r) => r.gift);
export const deleteGift = (id: string) => api.apiRequest<{ deleted: boolean }>('POST', '/api/admin/gifts/delete', { id });
/** A shelf's order: each id's place is its index (lower first). */
export const orderGifts = (ids: string[]) => api.apiRequest<{ gifts: AdminGift[] }>('POST', '/api/admin/gifts/order', { ids }).then((r) => r.gifts);

/**
 * Puts a picked file in the storage as `kind`; resolves with its address for the save. On a phone the file goes from
 * disk (uploadAsync); in a browser the picked file itself. Throws with a Turkish sentence when a step fails.
 */
export async function uploadGiftFile(kind: FileKind, f: PickedFile): Promise<string> {
  const type = contentTypeOf(kind, f);
  if (!type) throw new Error('Bu dosya türü yüklenemez.');
  const { Platform } = await import('react-native');
  let size = f.size;
  let body: Blob | null = f.file ?? null;
  if (Platform.OS === 'web') {
    body ??= await (await fetch(f.uri)).blob();
    size = body.size;
  } else if (size === null) {
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(f.uri);
    size = info.exists ? info.size : null;
  }
  if (!size) throw new Error('Dosya okunamadı. Başka bir dosya seç.');
  const target = await api.uploadUrl(kind, type, size);
  let status: number;
  try {
    if (Platform.OS === 'web') {
      status = (await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body })).status;
    } else {
      const FileSystem = await import('expo-file-system/legacy');
      const r = await FileSystem.uploadAsync(target.uploadUrl, f.uri, { httpMethod: 'PUT', headers: target.headers, uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT });
      status = r.status;
    }
  } catch {
    throw new Error('Dosya yüklenemedi. İnternetini kontrol edip tekrar dene.');
  }
  if (status < 200 || status > 299) throw new Error(`Dosya yüklenemedi (${status}). Tekrar dene.`);
  return target.publicUrl;
}
